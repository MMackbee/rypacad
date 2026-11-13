#!/usr/bin/env node
/**
 * Cap every Tour event (sessions of type 'tournament') at 20 kids, from
 * today to the season's end (owner 2026-11-13: "Go ahead on tour cap"; the
 * cap was 25). The calendar sync (scripts/sync-calendar-sessions.mjs
 * CAPACITY) and the seed generator (frontend/src/portal/data/schedule.js
 * CAPACITY_BY_TYPE) give a NEW Tour event 20; this one-time run brings the
 * events already in Firestore down to match. A re-sync over the season was
 * not used: it also rewrites status to 'scheduled' and would reopen a
 * session cancelled in the app.
 *
 *   node scripts/cap-tour-sessions.mjs --prod --dry-run
 *   node scripts/cap-tour-sessions.mjs --prod --yes          (the owner runs this one)
 *   node scripts/cap-tour-sessions.mjs --prod --from 2026-11-14 --to 2026-12-31 --dry-run
 *
 * Options: --from (default today in Chicago) and --to (default 2027-02-27,
 * the season's last day) bound the session dates.
 *
 * What it writes: sessions/{id}.capacity = 20 and nothing else - one masked
 * write per Tour event whose capacity is not already 20, each under the
 * updateTime of the read it was planned from, so a booking or a cancel on
 * that event in the meantime fails its batch instead (run again, dry run
 * first). Commits go in batches; each written event is read back. Bookings,
 * `booked`, status and hidden are never written, so a cancelled or hidden
 * Tour event stays as it is.
 *
 * An event already over 20 keeps everyone: it is capped and reported as
 * "kept: N booked > 20". firestore.rules then refuse a new booking on it
 * (a + 1 must stay within capacity) until it drops below 20; a cancel always
 * lands.
 *
 * Production auth is scripts/lib/prod-auth.mjs; the emulator without --prod.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTarget, cmpFilter, andFilter, getDoc, docName, fsFields, fsDecode, commit, PROJECT_ID } from './lib/firestore-rest.mjs';

const USAGE = 'Usage: node scripts/cap-tour-sessions.mjs [--prod] [--from YYYY-MM-DD] [--to YYYY-MM-DD] (--dry-run | --yes)';
export const CAP = 20;
const SEASON_END = '2027-02-27';
const TOUR = 'tournament';
// Firestore's commit limit is 500 writes; a whole season of Tour events fits in one.
const BATCH = 100;

/** True for a real calendar date written YYYY-MM-DD. */
function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const chicagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

/**
 * Pure (pass `today`, Chicago 'YYYY-MM-DD').
 * @return {{prod, from, to, dryRun, yes} | {error}}
 */
export function parseArgs(argv, { today = chicagoToday() } = {}) {
  const out = { prod: false, from: null, to: null, dryRun: false, yes: false };
  const raw = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prod') out.prod = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes') out.yes = true;
    else if (a === '--from' || a === '--to') {
      if (a in raw) return { error: `${a} may be given only once.` };
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) return { error: `${a} needs a value.` };
      raw[a] = v;
    } else return { error: `Unknown argument: ${a}` };
  }
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };
  out.from = raw['--from'] ?? today;
  out.to = raw['--to'] ?? SEASON_END;
  if (!validDate(out.from) || !validDate(out.to)) return { error: 'Pass --from and --to as real dates written YYYY-MM-DD.' };
  if (out.from > out.to) return { error: `--from (${out.from}) is after --to (${out.to}).` };
  return out;
}

/** '10:00 AM' -> 600; anything that is not a clock time sorts first. */
function minutesOf(time) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*$/i.exec(time || '');
  return m ? ((Number(m[1]) % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0)) * 60 + Number(m[2]) : -1;
}

/**
 * Pure: which Tour events change. Any capacity other than `cap` goes to
 * `cap` (the sync writes the same number on its next run); `over` marks an
 * event with more booked than the cap, which keeps everyone. Training, phil
 * and mental sessions are never in it.
 * @return {{change: Array<{id, date, time, from, booked, over}>, same: string[]}}
 */
export function planCaps(sessions, cap = CAP) {
  const tours = sessions
    .filter((s) => s.type === TOUR)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || minutesOf(a.time) - minutesOf(b.time) || a.id.localeCompare(b.id));
  const change = [];
  const same = [];
  for (const s of tours) {
    if (s.capacity === cap) { same.push(s.id); continue; }
    const booked = Number(s.booked ?? 0);
    change.push({ id: s.id, date: s.date, time: s.time, from: s.capacity ?? null, booked, over: booked > cap });
  }
  return { change, same };
}

/** Pure: the one masked write for an event, under the updateTime of its read. */
export function buildWrite({ id, updateTime, cap = CAP }) {
  if (!updateTime) throw new Error(`No updateTime for sessions/${id}; nothing written.`);
  return {
    update: { name: docName('sessions', id), fields: fsFields({ capacity: cap }) },
    updateMask: { fieldPaths: ['capacity'] },
    currentDocument: { updateTime },
  };
}

/** Pure: `date time  booked/old -> 20`, and the kept note for an event over the cap. */
export function capLine(c, cap = CAP) {
  return `  ${c.date} ${c.time}  ${c.booked}/${c.from ?? '?'} -> ${cap}${c.over ? `  kept: ${c.booked} booked > ${cap}` : ''}`;
}

/**
 * Pure: the line for a batch that did not land. A commit is all or nothing,
 * so it names every event in the batch. Only Firestore's own
 * FAILED_PRECONDITION (the updateTime guard) means an event changed since it
 * was read; anything else - an expired login, a network error - is shown as
 * itself, on one line.
 */
export function failureNote(ids, message) {
  const text = String(message ?? '').replace(/\s+/g, ' ').trim();
  const who = ids.join(', ');
  if (/FAILED_PRECONDITION/.test(text)) return `${who}: not written; one of them changed since it was read - run again, dry run first`;
  return `${who}: not written (${text.slice(0, 200) || 'no error text'}) - run again, dry run first`;
}

/** The sessions dated in the window, each with the updateTime of this read (the precondition guards these values). */
async function readSessions(target, from, to) {
  const res = await fetch(`${target.base}/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: target.auth },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'sessions' }],
      where: andFilter(cmpFilter('date', 'GREATER_THAN_OR_EQUAL', from), cmpFilter('date', 'LESS_THAN_OR_EQUAL', to)) } }),
  });
  if (!res.ok) throw new Error(`Query against ${target.label} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const sessions = [];
  const times = new Map();
  for (const row of await res.json()) {
    if (!row.document) continue;
    const id = row.document.name.split('/').pop();
    sessions.push({ id, ...fsDecode(row.document.fields || {}) });
    times.set(id, row.document.updateTime);
  }
  return { sessions, times };
}

export async function main(argv = process.argv.slice(2), { today = chicagoToday() } = {}) {
  const args = parseArgs(argv, { today });
  if (args.error) { console.error(`${args.error}\n${USAGE}`); return 1; }
  const target = await resolveTarget({ prod: args.prod });
  console.log(`Target: ${target.label}${args.dryRun ? ' (dry run, nothing is written)' : ''}`);
  console.log(`Tour events ${args.from} to ${args.to}: capacity -> ${CAP}`);

  const { sessions, times } = await readSessions(target, args.from, args.to);
  const { change, same } = planCaps(sessions);
  const over = change.filter((c) => c.over);
  for (const c of change) console.log(capLine(c));
  const total = change.length + same.length;
  if (!total) { console.log(`No Tour event between ${args.from} and ${args.to}. Nothing to write.`); return 0; }
  console.log(`${total} Tour event(s): ${change.length} to cap at ${CAP}, ${same.length} already at ${CAP}${over.length ? `, ${over.length} over ${CAP} (everyone kept)` : ''}.`);
  if (args.dryRun) { console.log(change.length ? 'Run again with --yes instead of --dry-run to write them.' : 'Nothing to write.'); return 0; }
  if (!change.length) { console.log('Nothing to write.'); return 0; }

  const failed = [];
  const written = [];
  for (let i = 0; i < change.length; i += BATCH) {
    const slice = change.slice(i, i + BATCH);
    try {
      await commit(target, slice.map((c) => buildWrite({ id: c.id, updateTime: times.get(c.id) })));
      written.push(...slice.map((c) => c.id));
    } catch (e) {
      failed.push(failureNote(slice.map((c) => c.id), e.message));
    }
  }
  let readBack = 0;
  for (const id of written) {
    const after = await getDoc(target, 'sessions', id);
    if (after?.capacity === CAP) readBack++;
    else failed.push(`${id}: written, but capacity reads ${after ? after.capacity : '(gone)'} - check it`);
  }
  console.log(`Capped at ${CAP}: ${readBack} of ${change.length}.${over.length ? ` Over ${CAP}, everyone kept (no new booking until below ${CAP}): ${over.map((c) => c.id).join(', ')}.` : ''}`);
  if (failed.length) { console.error(failed.map((f) => `  ${f}`).join('\n')); return 1; }
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
