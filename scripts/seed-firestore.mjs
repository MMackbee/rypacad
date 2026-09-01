#!/usr/bin/env node
/**
 * Seed the Firestore EMULATOR with the portal's demo data.
 *
 *   node scripts/seed-firestore.mjs --dry-run     # print what would be written
 *   npm run seed:emulator                          # seed a running emulator
 *
 * What it seeds (data contract v1, docs/portal/TEAM.md):
 *   packages    — the 2026-27 catalogue from frontend/src/portal/data/packages.js
 *   sessions    — the generated season (buildSeason() from season.js)
 *   households  — the Whitfield demo household from seed.js
 *   athletes    — the three Whitfield athletes with their packageIds
 *   users       — one parent, one athlete, one coach, one owner
 *   contractLogs — Jordan's practice log history for the last ~2 weeks
 *                  (contract v1.3: variable minutes, some below the 45-min
 *                  tier, so the fulfilled/not-fulfilled UI has real contrast
 *                  to render)
 *   bookings    — a few real bookings for Jordan against real generated
 *                  session ids (contract v1.4: the booking transaction,
 *                  attendance, and parent-linkage rules), covering both
 *                  `confirmed` and `attended` so the live-wired dashboards
 *                  have something to render in QA. The referenced sessions'
 *                  `booked` counts are incremented to match, the same
 *                  invariant the real booking transaction maintains.
 *
 * Two hard guarantees:
 *   1. NEVER touches production. Writes require FIRESTORE_EMULATOR_HOST, and the
 *      host must be local (localhost/127.0.0.1/::1/0.0.0.0) or the script exits.
 *   2. NEVER retypes generated or scaffold data. The season generator and the
 *      catalogue are bundled from frontend source with esbuild and executed —
 *      if season.js changes, the seed changes with it.
 *
 * Policy: no dollar amounts anywhere in seed data — the catalogue's `price`
 * field is deliberately stripped before writing (see DATA-MODEL.md). Stripe
 * fields are ids only, and no real ids exist for a demo household, so they are
 * seeded null. No medical documents are seeded: athletes/{id}/private/medical
 * exists for rules to scope, and inventing medical info for minors would
 * violate data minimization.
 *
 * The script is dependency-free (Node >= 20: global fetch, --env-file). It
 * talks to the emulator over the Firestore REST API, so nothing needs
 * installing at the repo root. esbuild is fetched by npx per the repo pattern.
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ID = 'rypacad';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(repoRoot, 'frontend', 'src', 'portal', 'data');

// ---------------------------------------------------------------------------
// Emulator guard — the only network target this script will ever accept.
// ---------------------------------------------------------------------------

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

function emulatorHost() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) {
    console.error(
      'FIRESTORE_EMULATOR_HOST is not set.\n' +
        'This script only writes to the Firestore emulator, never to production.\n' +
        'Start the emulator (npm run emulator), then either:\n' +
        '  npm run seed:emulator                (sets the variable via scripts/emulator.env)\n' +
        "  $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'; node scripts/seed-firestore.mjs\n" +
        'Or pass --dry-run to print what would be written without an emulator.'
    );
    process.exit(1);
  }
  const name = host.replace(/:\d+$/, '');
  if (!LOCAL_HOSTS.has(name)) {
    console.error(
      `Refusing to seed: FIRESTORE_EMULATOR_HOST="${host}" is not a local address.\n` +
        'This script never writes to a remote Firestore.'
    );
    process.exit(1);
  }
  return host;
}

// ---------------------------------------------------------------------------
// Bundle the frontend data modules so they run under Node. Repo pattern:
//   npx esbuild <entry> --bundle --format=cjs --platform=node --outfile=<tmp>
// The entry re-exports exactly the symbols the seed needs; esbuild follows the
// import graph (schedule.js, tokens.js, packages.js, calendar.js -> date-fns).
// ---------------------------------------------------------------------------

function loadPortalData() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'ryp-seed-'));
  const entry = path.join(tmp, 'entry.js');
  const outfile = path.join(tmp, 'portal-data.cjs');
  const fwd = (p) => p.split(path.sep).join('/');

  writeFileSync(
    entry,
    [
      `export { buildSeason, SEASON_BOUNDS } from '${fwd(path.join(dataDir, 'season.js'))}';`,
      `export { GOLF_PACKAGES, DROP_IN, FITNESS_PACKAGES, ELITE_TIERS, poolFor } from '${fwd(path.join(dataDir, 'packages.js'))}';`,
      `export { HOUSEHOLD, COACH } from '${fwd(path.join(dataDir, 'seed.js'))}';`,
    ].join('\n')
  );

  try {
    execSync(
      `npx esbuild "${entry}" --bundle --format=cjs --platform=node --outfile="${outfile}" --log-level=warning`,
      { stdio: ['ignore', 'inherit', 'inherit'], cwd: repoRoot }
    );
  } catch {
    console.error(
      '\nesbuild bundling failed. If the error above mentions an unresolved package\n' +
        '(e.g. date-fns), install the frontend dependencies first:  cd frontend && npm install\n' +
        '(or point NODE_PATH at an installed frontend/node_modules).'
    );
    process.exit(1);
  }

  const data = createRequire(import.meta.url)(outfile);
  rmSync(tmp, { recursive: true, force: true });
  return data;
}

// ---------------------------------------------------------------------------
// Build the documents. Shapes follow the data contract v1 in TEAM.md; the
// field-by-field spec is docs/portal/DATA-MODEL.md.
// ---------------------------------------------------------------------------

function buildDocs(portal) {
  const { buildSeason, GOLF_PACKAGES, DROP_IN, FITNESS_PACKAGES, ELITE_TIERS, HOUSEHOLD, COACH, poolFor } = portal;

  // packages — price is stripped (no dollar amounts in seed data, policy) and
  // id becomes the doc id rather than a duplicated field.
  const packages = new Map();
  const fields = ({ id, price, ...rest }) => rest;
  for (const p of GOLF_PACKAGES) packages.set(p.id, { ...fields(p), kind: 'golf' });
  packages.set(DROP_IN.id, { ...fields(DROP_IN), kind: 'drop-in' });
  for (const p of FITNESS_PACKAGES) packages.set(p.id, { ...fields(p), kind: 'fitness' });
  for (const p of ELITE_TIERS) packages.set(p.id, { ...fields(p), kind: 'elite' });

  // sessions — straight from the generator; ids stay the generator's
  // `YYYY-MM-DD-<block>`. Normalized only where the generator omits a field on
  // regular sessions (special/label exist on extras alone).
  const sessions = new Map();
  for (const s of buildSeason()) {
    const { id, ...fields } = s;
    sessions.set(id, {
      date: fields.date,
      time: fields.time,
      type: fields.type,
      capacity: fields.capacity,
      booked: fields.booked,
      coachId: fields.coachId ?? null,
      label: fields.label ?? null,
      special: !!fields.special,
      overflow: !!fields.overflow,
    });
  }

  // households — guardian contact from the scaffold (dana@email.com is the
  // parent email seed.js uses). Stripe ids are null: ids only, and a demo
  // household has none.
  const householdId = 'whitfield';
  const households = new Map([
    [
      householdId,
      {
        name: HOUSEHOLD.name,
        guardian: { name: 'Dana', email: 'dana@email.com', phone: null },
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    ],
  ]);

  // athletes — from seed.js HOUSEHOLD. contractMinutes is parsed from the
  // scaffold's ageLine ("45 min tier"), not retyped. dob is null: the scaffold
  // gives ages only and this repo does not invent birthdays. The seed data
  // has exactly one coach account (coach-luke), so all three Whitfield
  // athletes are assigned to him — Sprint 5 turns the coach roster into a
  // real "athletes where coachId == uid" query (TEAM.md), and a roster of
  // one (Jordan only, the v1 behavior) wouldn't exercise that; a roster of
  // three does.
  const coachUid = 'coach-luke';
  const athletes = new Map();
  for (const child of HOUSEHOLD.children) {
    const minutes = child.ageLine && child.ageLine.match(/(\d+)\s*min tier/);
    athletes.set(child.id, {
      name: `${child.name} Whitfield`,
      dob: null,
      householdId,
      packageId: child.packageId,
      contractMinutes: minutes ? Number(minutes[1]) : null,
      coachId: coachUid,
    });
  }
  // athletes/{id}/private/medical is deliberately NOT seeded — see header.

  // bookings — a few REAL bookings for jordan against real seeded session ids
  // (contract v1.4, docs/portal/TEAM.md "Sprint 6 pins"), so the live-wired
  // dashboards (My Schedule, the parent household view, the coach roster)
  // have something real to render in QA instead of an empty state. Doc id is
  // `{athleteId}_{sessionId}` (contract v1.1). Ids below double as the
  // scaffold's practice-mode references (seed.js BOOKED_UPCOMING) where they
  // line up, so the two demo datasets tell one consistent story instead of
  // two unrelated ones:
  //   2026-11-02-1 (Mon 4:00 PM training) — the scaffold's season-opener
  //     "Confirmed" booking; self-booked by the athlete.
  //   2026-11-07-1 (Sat 10:30 AM tournament) — booked by the parent, so this
  //     seed exercises the parent-linkage path (createdBy != athleteId's own
  //     account) as well as the athlete-booked path above; also the other
  //     allowance pool, per the two-pool invariant.
  //   2026-11-09-2 (Mon 5:00 PM training) — already `attended`, so the
  //     coach's roster and any "past sessions" UI have a real history entry
  //     to show, not just upcoming confirmeds.
  // `sessions.booked` on each referenced session is incremented below in the
  // same loop that builds these docs — the transaction's other write (v1.4)
  // — so the seed is internally consistent the way a real booking would
  // leave it: a QA pass checking `booked` against `bookings` sees them agree.
  const JORDAN_BOOKINGS = [
    ['2026-11-02-1', 'confirmed', 'athlete-jordan'],
    ['2026-11-07-1', 'confirmed', 'parent-dana'],
    ['2026-11-09-2', 'attended', 'athlete-jordan'],
  ];
  const bookings = new Map();
  const bookingCreatedAt = new Date();
  for (const [sessionId, status, createdBy] of JORDAN_BOOKINGS) {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(
        `Seed booking references sessions/${sessionId}, which buildSeason() did not generate ` +
          `(the season config in season.js changed under this seed). Update JORDAN_BOOKINGS in ` +
          `scripts/seed-firestore.mjs to reference real generated session ids.`
      );
    }
    bookings.set(`jordan_${sessionId}`, {
      athleteId: 'jordan',
      sessionId,
      date: session.date,
      type: session.type,
      pool: poolFor(session.type),
      status,
      householdId,
      createdBy,
      createdAt: bookingCreatedAt,
    });
    session.booked += 1; // same write the real booking transaction makes
  }

  // contractLogs — Jordan's practice history for the last ~2 weeks (contract
  // v1.3, TEAM.md Sprint 5 pins): variable minutes, some at/above the
  // 45-min tier and some below, plus a couple of skipped days (no doc at
  // all) so "not logged" and "logged short" are visibly different states.
  // contractMinutes is a fixed 45 snapshot, matching Jordan's actual tier —
  // real usage snapshots athletes.contractMinutes at write time, but this
  // seed only ever runs against the current tier, so the snapshot and the
  // live value are the same number here.
  const contractLogs = new Map();
  const jordanContractMinutes = 45;
  // [daysAgo, minutes] — 0 minutes means "skipped that day", no doc written.
  // Includes an exact-tier edge case (45) and a surplus day (90) to prove
  // surplus minutes don't bank an extra fulfilled day.
  const JORDAN_PRACTICE_LOG = [
    [14, 50], [13, 30], [12, 0], [11, 65], [10, 45], [9, 20], [8, 90],
    [7, 0], [6, 40], [5, 45], [4, 15], [3, 70], [2, 35], [1, 55],
  ];
  const isoDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  for (const [daysAgo, minutes] of JORDAN_PRACTICE_LOG) {
    if (minutes <= 0) continue; // skipped day — no log
    const logDate = new Date(today);
    logDate.setDate(logDate.getDate() - daysAgo);
    const dateStr = isoDate(logDate);
    // Logged in the evening of the practice day — a plausible createdAt.
    const createdAt = new Date(logDate);
    createdAt.setHours(19, 30, 0, 0);
    contractLogs.set(`jordan_${dateStr}`, {
      athleteId: 'jordan',
      date: dateStr,
      minutes,
      contractMinutes: jordanContractMinutes,
      createdBy: 'athlete-jordan',
      createdAt,
    });
  }

  // users — one per portal role, ALL SIX (the QA test-account suite,
  // TEAM.md "QA testing": window.__rypTestAuth.signInAs(<doc id>) signs in
  // as any of these against the auth emulator). In production these doc ids
  // are Firebase Auth uids; the emulator seed uses readable slugs. The
  // athlete carries householdId too — the booking write path and its rules
  // require the household linkage, matching production provisioning.
  const users = new Map([
    ['parent-dana', { role: 'parent', householdId, athleteId: null, staff: false, displayName: 'Dana', email: 'dana@email.com' }],
    ['athlete-jordan', { role: 'athlete', athleteId: 'jordan', householdId, staff: false, displayName: 'Jordan Whitfield', email: null }],
    [coachUid, { role: 'coach', athleteId: null, householdId: null, staff: true, displayName: COACH.name, email: null }],
    ['owner', { role: 'owner', athleteId: null, householdId: null, staff: true, displayName: null, email: null }],
    ['mental', { role: 'mental', athleteId: null, householdId: null, staff: true, displayName: 'Yannick', email: null }],
    ['ops', { role: 'ops', athleteId: null, householdId: null, staff: true, displayName: 'Ops', email: null }],
  ]);

  return { packages, sessions, households, athletes, users, bookings, contractLogs };
}

// ---------------------------------------------------------------------------
// Firestore REST encoding — keeps the script dependency-free.
// ---------------------------------------------------------------------------

function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
  if (typeof v === 'object') return { mapValue: { fields: fsFields(v) } };
  throw new Error(`Unsupported value type: ${typeof v}`);
}

function fsFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fsValue(v)]));
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  const host = DRY_RUN ? null : emulatorHost();

  console.log(`Bundling portal data modules with esbuild...`);
  const portal = loadPortalData();
  const collections = buildDocs(portal);

  const sessionDocs = [...collections.sessions.values()];
  const trainingCount = sessionDocs.filter((s) => s.type === 'training').length;
  const tournamentCount = sessionDocs.filter((s) => s.type === 'tournament').length;
  console.log(
    `Season ${portal.SEASON_BOUNDS.start} -> ${portal.SEASON_BOUNDS.end}: ` +
      `${sessionDocs.length} sessions (${trainingCount} training, ${tournamentCount} tournament)\n`
  );

  let total = 0;
  for (const [name, docs] of Object.entries(collections)) {
    total += docs.size;
    console.log(`${name}: ${docs.size} doc${docs.size === 1 ? '' : 's'}`);
    const [sampleId, sampleDoc] = docs.entries().next().value;
    console.log(`  sample ${name}/${sampleId}: ${JSON.stringify(sampleDoc)}`);
  }
  console.log(`total: ${total} docs across ${Object.keys(collections).length} collections`);

  console.log('\nJordan bookings (contract v1.4) and the sessions.booked they drive:');
  for (const [id, doc] of collections.bookings) {
    const session = collections.sessions.get(doc.sessionId);
    console.log(
      `  bookings/${id}: status=${doc.status} pool=${doc.pool} createdBy=${doc.createdBy}` +
        ` -> sessions/${doc.sessionId}.booked=${session.booked}/${session.capacity}`
    );
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] nothing written. Set FIRESTORE_EMULATOR_HOST and re-run to seed the emulator.');
    return;
  }

  console.log(`\nWriting to Firestore emulator at ${host} (project ${PROJECT_ID})...`);
  const writes = [];
  for (const [name, docs] of Object.entries(collections)) {
    for (const [id, doc] of docs) {
      writes.push({
        update: {
          name: `projects/${PROJECT_ID}/databases/(default)/documents/${name}/${id}`,
          fields: fsFields(doc),
        },
      });
    }
  }
  const BATCH = 400; // Firestore commit limit is 500 writes
  for (let i = 0; i < writes.length; i += BATCH) {
    await commit(host, writes.slice(i, i + BATCH));
    console.log(`  committed ${Math.min(i + BATCH, writes.length)}/${writes.length}`);
  }
  console.log(`Done: ${writes.length} documents seeded.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
