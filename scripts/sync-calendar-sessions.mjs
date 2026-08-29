#!/usr/bin/env node
/**
 * Sync Google Calendar events into the portal's `sessions` collection.
 *
 *   node scripts/sync-calendar-sessions.mjs --from 2026-11-02 --to 2026-11-30 --dry-run
 *   npm run sync:emulator -- --from 2026-11-02 --to 2026-11-30
 *   node scripts/sync-calendar-sessions.mjs --from ... --to ... --fixture scripts/fixtures/gcal-sample-events.json
 *
 * The Google Calendar is the session source of truth (Sprint 4 pin,
 * docs/portal/TEAM.md). This script turns its events into bookable Firestore
 * sessions by the pinned title convention:
 *
 *   summary starts with "Training block"  -> bookable, type 'training'
 *   summary starts with "Tournament"      -> bookable, type 'tournament'
 *   anything else, and every all-day event -> skipped (display-only)
 *
 * Bookable events must carry a real start.dateTime; all-day events (start.date
 * only) are never bookable regardless of title. Session id is
 * `YYYY-MM-DD-<n>` where n is the 0-based start-time order of that day's
 * BOOKABLE events. `label` is null for the generic titles ("Training block",
 * "Tournament", "Tournament block") and the full summary otherwise.
 *
 * Upsert semantics against the target Firestore (contract v1.2):
 *   - new event                -> create (booked 0, status 'scheduled')
 *   - existing session, matched by gcalEventId (fallback: by doc id, but only
 *     onto docs with NO gcalEventId — i.e. adopting generator-seeded sessions)
 *     -> update time/type/label/date, set status back to 'scheduled';
 *        `booked` and all bookings are PRESERVED (masked patch)
 *   - synced session in window whose calendar instance no longer exists
 *     -> DELETE if booked === 0, else set status 'cancelled'. A session with
 *        bookings is never deleted: families are told, not ghosted.
 *   - generator-seeded sessions (gcalEventId null) not adopted by id are left
 *     untouched and counted.
 *
 * Production guard (same as seed-firestore.mjs): writes require
 * FIRESTORE_EMULATOR_HOST pointing at a local host, or the script exits.
 * `--dry-run` may READ the real calendar but writes nothing; it also reads
 * the emulator for the diff when FIRESTORE_EMULATOR_HOST is set, and
 * otherwise diffs against an empty target.
 *
 * Credentials: REACT_APP_GCAL_CALENDAR_ID / REACT_APP_GCAL_API_KEY are read
 * from frontend/.env at runtime — never hardcoded here. The key is
 * referer-restricted, so requests send `Referer: http://localhost:3000/`.
 * The key is never printed; error bodies are redacted before logging.
 *
 * Dependency-free (Node >= 20: global fetch), Firestore REST like the seed.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'rypacad';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Capacity per block, replicated from frontend/src/portal/data/schedule.js
// (export const CAPACITY = { training: 14, tournament: 14 }) — replicated with
// this source note rather than bundling the module for one constant. If
// schedule.js changes CAPACITY, change this too.
const CAPACITY = { training: 14, tournament: 14 };

// Titles that mean "a regular block, no event name": label stays null.
const GENERIC_TITLES = new Set(['Training block', 'Tournament', 'Tournament block']);

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
}
const DRY_RUN = process.argv.includes('--dry-run');
const FROM = arg('from');
const TO = arg('to');
const FIXTURE = arg('fixture');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
if (!ISO_DATE.test(FROM || '') || !ISO_DATE.test(TO || '') || FROM > TO) {
  console.error(
    'Usage: node scripts/sync-calendar-sessions.mjs --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run] [--fixture <path>]'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Emulator guard — identical posture to seed-firestore.mjs.
// ---------------------------------------------------------------------------

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

function localEmulatorHost({ required }) {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) {
    if (!required) return null;
    console.error(
      'FIRESTORE_EMULATOR_HOST is not set.\n' +
        'This script only writes to the Firestore emulator, never to production.\n' +
        'Start the emulator (npm run emulator), then either:\n' +
        '  npm run sync:emulator -- --from ... --to ...   (sets the variable via scripts/emulator.env)\n' +
        "  $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; node scripts/sync-calendar-sessions.mjs ...\n" +
        'Or pass --dry-run to print the plan without writing.'
    );
    process.exit(1);
  }
  const name = host.replace(/:\d+$/, '');
  if (!LOCAL_HOSTS.has(name)) {
    console.error(
      `Refusing to run: FIRESTORE_EMULATOR_HOST="${host}" is not a local address.\n` +
        'This script never touches a remote Firestore.'
    );
    process.exit(1);
  }
  return host;
}

// ---------------------------------------------------------------------------
// Calendar fetch — frontend/.env credentials, referer-restricted key,
// paginated events list rendered in the calendar's own timezone.
// ---------------------------------------------------------------------------

function gcalCredentials() {
  const envPath = path.join(repoRoot, 'frontend', '.env');
  let text;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    console.error(`Could not read ${envPath} — it holds REACT_APP_GCAL_CALENDAR_ID / REACT_APP_GCAL_API_KEY.`);
    process.exit(1);
  }
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  const calendarId = env.REACT_APP_GCAL_CALENDAR_ID;
  const apiKey = env.REACT_APP_GCAL_API_KEY;
  if (!calendarId || !apiKey) {
    console.error('frontend/.env is missing REACT_APP_GCAL_CALENDAR_ID or REACT_APP_GCAL_API_KEY.');
    process.exit(1);
  }
  return { calendarId, apiKey };
}

/** Widened UTC window covering [from, to] in America/Chicago (CST/CDT). */
function utcWindow(from, to) {
  const dayAfter = new Date(to + 'T00:00:00Z');
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  // Earliest Chicago midnight is 05:00Z (CDT); latest end-of-day is 06:00Z
  // next day (CST). The mapper filters by local date, so a superset is fine.
  return { timeMin: `${from}T05:00:00Z`, timeMax: `${dayAfter.toISOString().slice(0, 10)}T06:00:00Z` };
}

async function fetchCalendarEvents(from, to) {
  const { calendarId, apiKey } = gcalCredentials();
  const { timeMin, timeMax } = utcWindow(from, to);
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const redact = (s) => s.split(apiKey).join('<redacted>');

  const items = [];
  let pageToken = null;
  let pages = 0;
  do {
    const params = new URLSearchParams({
      key: apiKey,
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      timeZone: 'America/Chicago', // render start.dateTime in the calendar's zone
      maxResults: '250',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`${base}?${params}`, {
      headers: { Referer: 'http://localhost:3000/' }, // key is referer-restricted
    });
    if (!res.ok) {
      console.error(`Calendar API request failed (${res.status}): ${redact(await res.text())}`);
      process.exit(1);
    }
    const body = await res.json();
    items.push(...(body.items || []));
    pageToken = body.nextPageToken || null;
    pages += 1;
  } while (pageToken);

  console.log(`Fetched ${items.length} calendar event instance(s) in ${pages} page(s).`);
  return items;
}

function loadFixture(fixturePath) {
  const abs = path.resolve(process.cwd(), fixturePath);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (e) {
    console.error(`Could not load fixture ${abs}: ${e.message}`);
    process.exit(1);
  }
  const items = Array.isArray(parsed) ? parsed : parsed.items || [];
  console.log(`Fixture ${fixturePath}: ${items.length} event(s).`);
  return items;
}

// ---------------------------------------------------------------------------
// Mapping — events to desired session docs.
// ---------------------------------------------------------------------------

function formatTime(h, m) {
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; // generator style: '3:00 PM'
}

/**
 * @returns {{ sessions: Map<string, object>, counts: object }}
 *   sessions keyed by `YYYY-MM-DD-<n>`; counts of skipped categories.
 */
function mapEvents(items, from, to) {
  const counts = { bookable: 0, allDay: 0, displayOnly: 0, cancelled: 0, outOfWindow: 0 };
  const byDate = new Map(); // date -> [{ minutes, event fields }]

  for (const ev of items) {
    if (ev.status === 'cancelled') {
      counts.cancelled += 1;
      continue;
    }
    const dt = ev.start && ev.start.dateTime;
    if (!dt) {
      counts.allDay += 1; // all-day events are display-only regardless of title
      continue;
    }
    const summary = (ev.summary || '').trim();
    let type = null;
    if (summary.startsWith('Training block')) type = 'training';
    else if (summary.startsWith('Tournament')) type = 'tournament';
    const m = dt.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    if (!type || !m) {
      counts.displayOnly += 1; // not the convention (or unparseable start)
      continue;
    }
    const [, date, hh, mm] = m;
    if (date < from || date > to) {
      counts.outOfWindow += 1; // widened UTC fetch window; local date decides
      continue;
    }
    counts.bookable += 1;
    const list = byDate.get(date) || [];
    list.push({
      minutes: Number(hh) * 60 + Number(mm),
      date,
      time: formatTime(Number(hh), Number(mm)),
      type,
      label: GENERIC_TITLES.has(summary) ? null : summary,
      gcalEventId: ev.id,
    });
    byDate.set(date, list);
  }

  const sessions = new Map();
  for (const date of [...byDate.keys()].sort()) {
    const list = byDate.get(date);
    list.sort((a, b) => a.minutes - b.minutes || String(a.gcalEventId).localeCompare(String(b.gcalEventId)));
    list.forEach(({ minutes, ...s }, i) => {
      sessions.set(`${date}-${i}`, {
        date: s.date,
        time: s.time,
        type: s.type,
        capacity: CAPACITY[s.type],
        booked: 0, // on create; existing sessions keep theirs (masked patch)
        coachId: null,
        label: s.label,
        special: false,
        overflow: false,
        status: 'scheduled',
        gcalEventId: s.gcalEventId,
      });
    });
  }
  return { sessions, counts };
}

// ---------------------------------------------------------------------------
// Firestore REST (emulator only) — encode/decode + query + commit.
// ---------------------------------------------------------------------------

function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  throw new Error(`Unsupported value type: ${typeof v}`);
}
const fsFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fsValue(v)]));

function fsDecode(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('nullValue' in v) out[k] = null;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = v.doubleValue;
    else if ('stringValue' in v) out[k] = v.stringValue;
    else out[k] = v; // maps/arrays/timestamps — not used by sessions
  }
  return out;
}

const docName = (id) => `projects/${PROJECT_ID}/databases/(default)/documents/sessions/${id}`;

async function fetchExistingSessions(host, from, to) {
  const url = `http://${host}/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'sessions' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'date' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: from } } },
              { fieldFilter: { field: { fieldPath: 'date' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: to } } },
            ],
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Emulator query failed (${res.status}): ${await res.text()}`);
  const rows = await res.json();
  const existing = new Map();
  for (const row of rows) {
    if (!row.document) continue;
    const id = row.document.name.split('/').pop();
    existing.set(id, fsDecode(row.document.fields));
  }
  return existing;
}

async function commit(host, writes) {
  const url = `http://${host}/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) throw new Error(`Emulator commit failed (${res.status}): ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Diff — desired vs existing, honoring the preserve/cancel/delete pins.
// ---------------------------------------------------------------------------

const SYNCED_FIELDS = ['date', 'time', 'type', 'label', 'status', 'gcalEventId'];

function planSync(desired, existing) {
  const plan = { creates: [], updates: [], unchanged: [], deletes: [], cancels: [], conflicts: [], seededUntouched: [] };
  const byGcal = new Map();
  for (const [id, doc] of existing) {
    if (doc.gcalEventId) byGcal.set(doc.gcalEventId, id);
  }

  const claimed = new Set();
  for (const [id, doc] of desired) {
    let matchId = byGcal.get(doc.gcalEventId) ?? null;
    // Fallback by doc id only onto docs with no gcalEventId: this adopts
    // generator-seeded sessions (and their bookings) without stealing a doc
    // that belongs to a different calendar instance.
    if (matchId === null && existing.has(id) && !existing.get(id).gcalEventId) matchId = id;

    if (matchId === null) {
      plan.creates.push({ id, doc });
      continue;
    }
    claimed.add(matchId);
    const cur = existing.get(matchId);

    if (matchId !== id) {
      // The instance moved (date or day-order changed) so its pinned id changed.
      if ((cur.booked ?? 0) === 0) {
        plan.deletes.push({ id: matchId, booked: 0, reason: `moved to ${id}` });
        plan.creates.push({ id, doc });
      } else {
        // Never orphan bookings by moving the doc; patch in place and flag it.
        plan.updates.push({ id: matchId, doc, keptId: true });
        plan.conflicts.push(`sessions/${matchId} has ${cur.booked} booking(s) but its event now maps to ${id}; patched in place — id no longer encodes day-order.`);
      }
      continue;
    }

    const dirty = SYNCED_FIELDS.some((f) => (cur[f] ?? null) !== doc[f]);
    if (dirty) plan.updates.push({ id, doc });
    else plan.unchanged.push(id);
  }

  for (const [id, doc] of existing) {
    if (claimed.has(id)) continue;
    if (!doc.gcalEventId) {
      plan.seededUntouched.push(id); // generator-seeded; not this script's to reap
      continue;
    }
    // Synced session whose calendar instance no longer exists in the window.
    if ((doc.booked ?? 0) === 0) plan.deletes.push({ id, booked: 0, reason: 'instance removed' });
    else plan.cancels.push({ id, booked: doc.booked });
  }

  // A create landing on a path being deleted is a clean replace (full-doc
  // write). A create landing on a path being cancelled would repoint that
  // session's bookings at a different event — refuse it and flag.
  const cancelIds = new Set(plan.cancels.map((c) => c.id));
  plan.creates = plan.creates.filter(({ id }) => {
    if (!cancelIds.has(id)) return true;
    plan.conflicts.push(`create ${id} skipped: that id holds a cancelled session with bookings.`);
    return false;
  });
  const createIds = new Set(plan.creates.map((c) => c.id));
  plan.deletes = plan.deletes.filter(({ id }) => !createIds.has(id)); // replaced, not deleted

  return plan;
}

function planWrites(plan) {
  const writes = [];
  for (const { id, doc } of plan.creates) writes.push({ update: { name: docName(id), fields: fsFields(doc) } });
  for (const { id, doc } of plan.updates) {
    // Masked patch: only the synced fields change; booked (and anything else,
    // e.g. coachId assignments made in the portal) is preserved.
    const patch = Object.fromEntries(SYNCED_FIELDS.map((f) => [f, doc[f]]));
    writes.push({ update: { name: docName(id), fields: fsFields(patch) }, updateMask: { fieldPaths: SYNCED_FIELDS } });
  }
  for (const { id } of plan.cancels)
    writes.push({ update: { name: docName(id), fields: fsFields({ status: 'cancelled' }) }, updateMask: { fieldPaths: ['status'] } });
  for (const { id } of plan.deletes) writes.push({ delete: docName(id) });
  return writes;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const host = localEmulatorHost({ required: !DRY_RUN });

  const items = FIXTURE ? loadFixture(FIXTURE) : await fetchCalendarEvents(FROM, TO);
  const { sessions: desired, counts } = mapEvents(items, FROM, TO);

  console.log(
    `Window ${FROM}..${TO}: ${counts.bookable} bookable, ` +
      `${counts.allDay} all-day skipped, ${counts.displayOnly} display-only skipped` +
      (counts.cancelled ? `, ${counts.cancelled} cancelled-instance skipped` : '') +
      (counts.outOfWindow ? `, ${counts.outOfWindow} outside window` : '')
  );
  for (const [id, doc] of desired) console.log(`  session ${id}: ${JSON.stringify(doc)}`);

  const existing = host ? await fetchExistingSessions(host, FROM, TO) : new Map();
  if (!host) console.log('(no emulator host set: diffing against an empty target)');
  else console.log(`Existing sessions in window: ${existing.size}`);

  const plan = planSync(desired, existing);
  console.log(
    `Plan: ${plan.creates.length} create, ${plan.updates.length} update, ${plan.unchanged.length} unchanged, ` +
      `${plan.deletes.length} delete, ${plan.cancels.length} cancel, ${plan.seededUntouched.length} seeded-untouched`
  );
  for (const { id, doc } of plan.creates) console.log(`  create  sessions/${id} ${JSON.stringify(doc)}`);
  for (const { id, doc, keptId } of plan.updates)
    console.log(`  update  sessions/${id}${keptId ? ' (id kept for its bookings)' : ''} <- ${JSON.stringify(Object.fromEntries(SYNCED_FIELDS.map((f) => [f, doc[f]])))}`);
  for (const { id, reason } of plan.deletes) console.log(`  delete  sessions/${id} (booked 0, ${reason})`);
  for (const { id, booked } of plan.cancels) console.log(`  cancel  sessions/${id} (booked ${booked} — never deleted)`);
  for (const c of plan.conflicts) console.log(`  CONFLICT: ${c}`);

  if (DRY_RUN) {
    console.log('\n[dry-run] nothing written.');
    return;
  }

  const writes = planWrites(plan);
  if (writes.length === 0) {
    console.log('\nNothing to write: target already in sync.');
    return;
  }
  console.log(`\nWriting to Firestore emulator at ${host} (project ${PROJECT_ID})...`);
  const BATCH = 400; // Firestore commit limit is 500 writes
  for (let i = 0; i < writes.length; i += BATCH) {
    await commit(host, writes.slice(i, i + BATCH));
    console.log(`  committed ${Math.min(i + BATCH, writes.length)}/${writes.length}`);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
