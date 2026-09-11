#!/usr/bin/env node
/**
 * Seed the Firestore EMULATOR with the portal's demo data.
 *
 *   node scripts/seed-firestore.mjs --dry-run     # print what would be written
 *   npm run seed:emulator                          # seed a running emulator
 *
 * What it seeds (data contract v1, docs/portal/TEAM.md):
 *   packages    — the 2026-27 catalogue from frontend/src/portal/data/packages.js
 *   sessions    — the generated season (buildSeason() from season.js), PLUS
 *                  contract v1.7 (Sprint 9): hand-seeded specialist 1-on-1
 *                  slots for Phil ('phil') and Yannick ('mental') covering the
 *                  SPECIALIST_BOOKING_WINDOW_DAYS days starting the day this
 *                  script runs (computed off the runtime clock, never
 *                  hardcoded — see SPECIALIST_SLOT_TIMES below). The generator
 *                  never invents these; ids use a new `-s<n>` letter on the
 *                  existing `-x<n>` extras convention (season.js's
 *                  generateSeason() step for holiday tournaments).
 *   households  — the Whitfield demo household from seed.js
 *   athletes    — the three Whitfield athletes with their packageIds and,
 *                  as of contract v1.6 (Sprint 8: age brackets), the
 *                  OWNER-SUPPLIED dobs (2026-09-10), landing the three kids
 *                  in three different brackets as of SEASON_BOUNDS.start —
 *                  see WHITFIELD_DOBS below.
 *   users       — one parent, one athlete, one coach, one owner
 *   contractLogs — Jordan's practice log history for the last ~2 weeks
 *                  (contract v1.3: variable minutes, some below the 45-min
 *                  tier, so the fulfilled/not-fulfilled UI has real contrast
 *                  to render)
 *   bookings    — real bookings for the three Whitfield athletes against real
 *                  generated session ids (contract v1.4: the booking
 *                  transaction, attendance, and parent-linkage rules),
 *                  covering `confirmed` and `attended` so the live-wired
 *                  dashboards have something to render in QA. Reese and
 *                  Nico's bookings are all parent-created (contract v1.5:
 *                  many kids never get their own login), which also exercises
 *                  the parent-linkage path for two athletes who have no
 *                  `users` doc of their own. The referenced sessions'
 *                  `booked` counts are incremented to match, the same
 *                  invariant the real booking transaction maintains. Also
 *                  contract v1.7 (Sprint 9): ONE pre-booked specialist
 *                  booking for jordan against the first hand-seeded Yannick
 *                  ('mental') slot, pool 'specialist', so schedule display,
 *                  the monthly cap, and cancellation all have something real
 *                  to exercise in QA.
 *   tournamentResults — SCORES (strokes) for two real generated Saturday
 *                  tournament blocks (contract v1.6, Sprint 8: coaches enter
 *                  strokes now, not tap-order positions; a write-time age
 *                  `bracket` snapshot is stored alongside). `position` is no
 *                  longer written anywhere — it derives at read time, per
 *                  (sessionId, bracket) group. Points are never stored either
 *                  — see DATA-MODEL.md and `frontend/src/portal/data/tour.js`
 *                  (routing lane) for the derive-at-read TOUR_POINTS table
 *                  and the age-bracket definitions this script mirrors
 *                  locally (see BRACKETS below — this script does not bundle
 *                  tour.js, so the bracket thresholds are a dependency-free
 *                  copy of the pinned contract, not an import).
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
// Age brackets (contract v1.6, TEAM.md "Sprint 8 pins" — coaches enter
// scores, standings split by age). Mirrors the BRACKETS table pinned for
// `frontend/src/portal/data/tour.js` (data-routing lane owns that file and
// lands `bracketFor()` there separately, in its own worktree). Duplicated
// here in plain JS, dependency-free, on purpose: this script does not bundle
// tour.js and must not assume a sibling lane's in-flight work has landed —
// if the pinned thresholds ever change, both copies need the edit (flagged
// in the report as a post-merge follow-up worth a shared helper).
// ---------------------------------------------------------------------------

const BRACKETS = [
  { id: '10U', min: 0, max: 10 },
  { id: '11-13', min: 11, max: 13 },
  { id: '14+', min: 14, max: 999 },
];

/** Whole years old as of `asOfISO` ('YYYY-MM-DD'), plain date math (no
 * date-fns dependency pulled in just for this). */
function ageAsOf(dobISO, asOfISO) {
  const [by, bm, bd] = dobISO.split('-').map(Number);
  const [ay, am, ad] = asOfISO.split('-').map(Number);
  let age = ay - by;
  if (am < bm || (am === bm && ad < bd)) age -= 1;
  return age;
}

/** dob -> bracket id, evaluated AS OF `asOfISO` — always SEASON_BOUNDS.start
 * for tournament results (contract v1.6: age is computed as of season start,
 * never the write date, so no kid changes brackets mid-season). No dob ->
 * null; read paths group null under the 'open' bracket display-side, but the
 * stored field itself is only ever one of the three ids or null, matching
 * the rules shape. */
function bracketForDob(dobISO, asOfISO) {
  if (!dobISO) return null;
  const age = ageAsOf(dobISO, asOfISO);
  const b = BRACKETS.find((x) => age >= x.min && age <= x.max);
  return b ? b.id : null;
}

/** 'YYYY-MM-DD' for a local Date, no date-fns dependency. Shared by the
 * specialist-session generator below and the contractLogs builder further
 * down (hoisted here rather than left as a contractLogs-local, now that two
 * call sites need it). */
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Specialist 1-on-1 sessions — Phil (type 'phil') and Yannick (type
// 'mental') — contract v1.7, TEAM.md "Sprint 9 pins". A specialist 1-on-1 IS
// a session with capacity 1 and its own pool ('specialist' on the booking,
// set where the booking is built below); the generator never invents these
// (buildSeason() only knows training/tournament), so this script hand-adds
// them the same way it hand-adds nothing else in `sessions` — everything
// else in that collection comes straight from season.js.
//
// Ids: the existing `-x<n>` extras convention (season.js's generateSeason(),
// used for the holiday tournaments) with a NEW letter, 's' (specialist):
// `YYYY-MM-DD-s0`, `-s1`, ... — 0-based order of that day's specialist slots.
// Documented in DATA-MODEL.md's id-conventions table.
//
// Window: SPECIALIST_BOOKING_WINDOW_DAYS days starting the day this script
// runs — computed off `new Date()` at run time, NEVER hardcoded, so a re-run
// always covers "the next two weeks" relative to whenever it actually runs.
// This mirrors data/specialists.js's SPECIALIST_BOOKING_WINDOW_DAYS (routing
// lane owns that file; the number is named, not imported — this script does
// not bundle data/specialists.js, matching the BRACKETS precedent above) and
// the useSpecialistSlots() seed fallback's "next N days from today" window
// (TEAM.md hook-seam pin).
//
// Pattern: Yannick works Tue/Thu, late afternoon; Phil works Mon/Wed/Fri.
// Both run three 45-minute slots per working day — invented times only, no
// invented people, same call TEAM.md's hook-seam note makes for the live
// hook's own seed fallback.
const SPECIALIST_BOOKING_WINDOW_DAYS = 14;
const SPECIALIST_SLOT_TIMES = {
  phil: ['3:00 PM', '3:45 PM', '4:30 PM'], // Mon/Wed/Fri
  mental: ['4:00 PM', '4:45 PM', '5:30 PM'], // Tue/Thu, late afternoon
};
// JS Date#getDay(): Sun=0, Mon=1, ... Sat=6.
const SPECIALIST_WEEKDAY_TYPE = { 1: 'phil', 3: 'phil', 5: 'phil', 2: 'mental', 4: 'mental' };

/**
 * Generates the hand-seeded specialist session docs and merges them into
 * `sessions` (mutated in place — same map every other session lives in,
 * since a specialist slot is a session like any other). Returns the slot ids
 * in generation order (chronological, then Phil/Yannick's own slot order)
 * for the sanity output and for picking jordan's pre-booked slot below.
 */
function addSpecialistSessions(sessions, runDate = new Date()) {
  const slotIds = [];
  for (let i = 0; i < SPECIALIST_BOOKING_WINDOW_DAYS; i++) {
    const d = new Date(runDate);
    d.setDate(d.getDate() + i);
    const type = SPECIALIST_WEEKDAY_TYPE[d.getDay()];
    if (!type) continue; // weekend, or a weekday neither specialist works
    const dateStr = isoDate(d);
    SPECIALIST_SLOT_TIMES[type].forEach((time, n) => {
      const id = `${dateStr}-s${n}`;
      sessions.set(id, {
        date: dateStr,
        time,
        type,
        capacity: 1, // contract v1.7: a specialist 1-on-1 IS a session with capacity 1
        booked: 0,
        coachId: null,
        label: null,
        special: false,
        overflow: false,
        status: 'scheduled',
        gcalEventId: null, // hand-seeded, never a synced-from-calendar doc
      });
      slotIds.push({ id, type });
    });
  }
  return slotIds;
}

// ---------------------------------------------------------------------------
// Build the documents. Shapes follow the data contract v1 in TEAM.md; the
// field-by-field spec is docs/portal/DATA-MODEL.md.
// ---------------------------------------------------------------------------

function buildDocs(portal) {
  const { buildSeason, SEASON_BOUNDS, GOLF_PACKAGES, DROP_IN, FITNESS_PACKAGES, ELITE_TIERS, HOUSEHOLD, COACH, poolFor } = portal;

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

  // specialist 1-on-1 sessions (contract v1.7, Sprint 9) — hand-added into
  // the same `sessions` map, never from buildSeason(); see
  // addSpecialistSessions() above for the id/window/pattern rationale.
  const specialistSlotIds = addSpecialistSessions(sessions);

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
  // scaffold's ageLine ("45 min tier"), not retyped. The seed data has
  // exactly one coach account (coach-luke), so all three Whitfield athletes
  // are assigned to him — Sprint 5 turns the coach roster into a real
  // "athletes where coachId == uid" query (TEAM.md), and a roster of one
  // (Jordan only, the v1 behavior) wouldn't exercise that; a roster of three
  // does.
  //
  // dob (contract v1.6 + v1.6.1 amendment, TEAM.md): the OWNER-SUPPLIED
  // birthdays (2026-09-10), not invented — they land the three kids in
  // three different brackets as of SEASON_BOUNDS.start (2026-11-02), the
  // date bracket assignment always uses. seed.js's ageLine copy was trued
  // up to match at the same integration pass.
  const WHITFIELD_DOBS = {
    jordan: '2012-06-17', // 14 at season start -> bracket 14+
    reese: '2014-03-02', // 12 at season start -> bracket 11-13
    nico: '2017-09-09', // 9 at season start -> bracket 10U
  };
  const coachUid = 'coach-luke';
  const athletes = new Map();
  for (const child of HOUSEHOLD.children) {
    const minutes = child.ageLine && child.ageLine.match(/(\d+)\s*min tier/);
    athletes.set(child.id, {
      name: `${child.name} Whitfield`,
      dob: WHITFIELD_DOBS[child.id] ?? null,
      householdId,
      packageId: child.packageId,
      contractMinutes: minutes ? Number(minutes[1]) : null,
      coachId: coachUid,
    });
  }
  // athletes/{id}/private/medical is deliberately NOT seeded — see header.

  // bookings — REAL bookings for the three Whitfield athletes against real
  // seeded session ids (contract v1.4, docs/portal/TEAM.md "Sprint 6 pins"),
  // so the live-wired dashboards (My Schedule, the parent household view, the
  // coach roster) have something real to render in QA instead of an empty
  // state. Doc id is `{athleteId}_{sessionId}` (contract v1.1). Jordan's ids
  // double as the scaffold's practice-mode references (seed.js
  // BOOKED_UPCOMING) where they line up, so the two demo datasets tell one
  // consistent story instead of two unrelated ones:
  //   jordan 2026-11-02-1 (Mon 4:00 PM training) — the scaffold's
  //     season-opener "Confirmed" booking; self-booked by the athlete.
  //   jordan 2026-11-07-1 (Sat 10:30 AM tournament) — `attended` (contract
  //     v1.5: flipped from the earlier `confirmed` now that a tournament
  //     result exists for this session below — a result implies the athlete
  //     showed up). Booked by the parent, so this seed exercises the
  //     parent-linkage path (createdBy != athleteId's own account) as well as
  //     the athlete-booked path above; also the other allowance pool, per the
  //     two-pool invariant.
  //   jordan 2026-11-09-2 (Mon 5:00 PM training) — already `attended`, so the
  //     coach's roster and any "past sessions" UI have a real history entry
  //     to show, not just upcoming confirmeds.
  //   jordan 2026-11-14-1 (Sat 10:30 AM tournament) — `attended`, added
  //     alongside the tournamentResults below: this is the second tournament
  //     Jordan places in (3rd), so the attendance story matches the result.
  //   reese / nico 2026-11-07-1 and 2026-11-14-1 — both tournament blocks,
  //     both `attended`, both `createdBy: 'parent-dana'`. Reese and Nico have
  //     no `users` doc of their own (see below), so every one of their
  //     bookings is the parent-books-for-a-kid path Sprint 7 makes
  //     first-class — not an edge case for them, the only case. Each seeded
  //     against exactly their package's `tournaments` allowance (`g-4-2` = 2
  //     tournament entries/month, and each has exactly 2 here), so the
  //     allowance UI reads "2 of 2 used" rather than something that looks
  //     broken.
  // `sessions.booked` on each referenced session is incremented below in the
  // same loop that builds these docs — the transaction's other write (v1.4)
  // — so the seed is internally consistent the way a real booking would
  // leave it: a QA pass checking `booked` against `bookings` sees them agree.
  const WHITFIELD_BOOKINGS = [
    ['jordan', '2026-11-02-1', 'confirmed', 'athlete-jordan'],
    ['jordan', '2026-11-07-1', 'attended', 'parent-dana'],
    ['jordan', '2026-11-09-2', 'attended', 'athlete-jordan'],
    ['jordan', '2026-11-14-1', 'attended', 'parent-dana'],
    ['reese', '2026-11-07-1', 'attended', 'parent-dana'],
    ['reese', '2026-11-14-1', 'attended', 'parent-dana'],
    ['nico', '2026-11-07-1', 'attended', 'parent-dana'],
    ['nico', '2026-11-14-1', 'attended', 'parent-dana'],
  ];
  const bookings = new Map();
  const bookingCreatedAt = new Date();
  for (const [athleteId, sessionId, status, createdBy] of WHITFIELD_BOOKINGS) {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(
        `Seed booking references sessions/${sessionId}, which buildSeason() did not generate ` +
          `(the season config in season.js changed under this seed). Update WHITFIELD_BOOKINGS in ` +
          `scripts/seed-firestore.mjs to reference real generated session ids.`
      );
    }
    bookings.set(`${athleteId}_${sessionId}`, {
      athleteId,
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

  // ONE pre-booked specialist booking for jordan (contract v1.7, TEAM.md
  // "Sprint 9 pins" DB lane bullet: "so schedule display, the cap, and
  // cancel have something real"). Picks the first Yannick ('mental') slot
  // addSpecialistSessions() generated above — deterministic regardless of
  // which weekday the script happens to run on.
  const jordanMentalSlot = specialistSlotIds.find((s) => s.type === 'mental');
  if (!jordanMentalSlot) {
    throw new Error(
      'addSpecialistSessions() produced no Yannick (mental) slot in the ' +
        `${SPECIALIST_BOOKING_WINDOW_DAYS}-day window — cannot seed the pinned pre-booked jordan booking. ` +
        'Widen SPECIALIST_BOOKING_WINDOW_DAYS or check SPECIALIST_WEEKDAY_TYPE.'
    );
  }
  {
    const session = sessions.get(jordanMentalSlot.id);
    bookings.set(`jordan_${jordanMentalSlot.id}`, {
      athleteId: 'jordan',
      sessionId: jordanMentalSlot.id,
      date: session.date,
      type: session.type, // 'mental'
      // pool 'specialist' (contract v1.7) — written as a LITERAL, not via
      // poolFor(session.type). poolFor() in
      // frontend/src/portal/data/packages.js maps phil|mental -> 'specialist'
      // as the ROUTING lane's edit (TEAM.md: "ROUTING lane makes that one
      // edit... db lane consumes it via its existing bundle, edits nothing
      // there"), which lands in a parallel worktree this one doesn't see. As
      // bundled in THIS worktree, poolFor('mental') still falls through to
      // its `=== 'tournament' ? 'tournaments' : 'training'` ternary and
      // silently returns 'training' — wrong for a specialist booking — so
      // the literal is used instead of trusting an import that hasn't landed
      // yet. `pool` is stored, not derived (see the bookings field notes in
      // DATA-MODEL.md), so this doc is correct today and stays correct once
      // poolFor() itself is fixed at merge.
      pool: 'specialist',
      status: 'confirmed',
      householdId,
      createdBy: 'parent-dana',
      createdAt: bookingCreatedAt,
    });
    session.booked += 1; // same invariant as the WHITFIELD_BOOKINGS loop above
  }

  // tournamentResults — SCORES (strokes) for two real generated Saturday
  // tournament blocks (contract v1.6, TEAM.md "Sprint 8 pins": coaches enter
  // strokes now, not tap-order positions; standings split into age
  // brackets). POSITION IS NO LONGER STORED — it derives at read time,
  // ascending score within one (sessionId, bracket) group (competition
  // ranking; ties share). Points are still never written here or anywhere in
  // Firestore — they derive from the TOUR_POINTS table in the frontend's
  // `data/tour.js` (routing lane; this script does not import or duplicate
  // that table), same derive-don't-store rule as before. Doc id stays
  // `{sessionId}_{athleteId}` (contract v1.5, unchanged) — the keyspace
  // gives one result per athlete per tournament; a correction is a same-id
  // update, never a delete.
  //
  // `bracket` is a write-time snapshot computed from the athlete's dob AS OF
  // SEASON_BOUNDS.start (contract v1.6) — never the write date, never a live
  // lookup — via bracketForDob() above, the same rationale as the v1.5.1
  // `name` snapshot: the standings read never needs a cross-family athletes
  // join.
  //
  // The three Whitfields land in three DIFFERENT brackets (jordan 14+, reese
  // 11-13, nico 10U — see WHITFIELD_DOBS above), so each is the lone seeded
  // entrant in their own bracket for both events: the DERIVED position is
  // trivially 1st for all six docs (see the sanity output in main(), which
  // computes and prints it). That is the correct behavior of the
  // derivation, not a mistake — a real season fills in ~20 more kids per
  // bracket that this two-tournament demo seed does not invent. The STROKES
  // themselves still encode the old (pre-bracket) story — lower score =
  // better finish, in the same relative order the dropped `position` values
  // used to record — so the finishing order still reads correctly in the
  // numbers even though three single-entrant brackets can't reproduce
  // head-to-head placement on their own (my judgment call; flagged in the
  // report):
  //   2026-11-07-1 — jordan 41 (was 1st), reese 47 (was 2nd), nico 52 (was 4th)
  //   2026-11-14-1 — reese 44 (was 1st), nico 49 (was 2nd), jordan 53 (was 3rd)
  const TOURNAMENT_RESULTS = [
    ['2026-11-07-1', 'jordan', 41],
    ['2026-11-07-1', 'reese', 47],
    ['2026-11-07-1', 'nico', 52],
    ['2026-11-14-1', 'reese', 44],
    ['2026-11-14-1', 'nico', 49],
    ['2026-11-14-1', 'jordan', 53],
  ];
  const tournamentResults = new Map();
  const resultsCreatedAt = new Date();
  for (const [sessionId, athleteId, score] of TOURNAMENT_RESULTS) {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(
        `Seed tournament result references sessions/${sessionId}, which buildSeason() did not ` +
          `generate (the season config in season.js changed under this seed). Update ` +
          `TOURNAMENT_RESULTS in scripts/seed-firestore.mjs to reference a real generated ` +
          `Saturday tournament session id.`
      );
    }
    if (session.type !== 'tournament') {
      throw new Error(
        `Seed tournament result references sessions/${sessionId}, which is a '${session.type}' ` +
          `block, not a tournament.`
      );
    }
    if (!Number.isInteger(score) || score < 18 || score > 200) {
      throw new Error(
        `Seed tournament result for ${athleteId}@${sessionId} has invalid score ${score} ` +
          `(must be an integer 18..200, strokes).`
      );
    }
    const athlete = athletes.get(athleteId);
    tournamentResults.set(`${sessionId}_${athleteId}`, {
      sessionId,
      athleteId,
      // Write-time display-name snapshot (contract v1.5.1, unchanged by
      // v1.6) — looked up from the athletes map built above, never retyped,
      // so the seed can't drift from the athlete doc it references.
      name: athlete?.name ?? null,
      // Write-time bracket snapshot (contract v1.6) — computed from the
      // athlete's dob as of SEASON_BOUNDS.start, never live. null when the
      // athlete has no dob (none of these three do, post-Sprint-8).
      bracket: bracketForDob(athlete?.dob ?? null, SEASON_BOUNDS.start),
      // Must equal the session's own date (contract v1.5) — read off the
      // session itself so it can never drift from it.
      date: session.date,
      score,
      createdBy: coachUid,
      createdAt: resultsCreatedAt,
    });
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
  // isoDate() is hoisted above (shared with addSpecialistSessions()).
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

  return { packages, sessions, households, athletes, users, bookings, contractLogs, tournamentResults };
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

// Derived (NOT stored) — competition ranking within (sessionId, bracket),
// ascending score, ties share a rank — computed here only so the sanity
// output below can prove the stored score+bracket produce the intended
// story, the same math the routing lane's read-time derivation will apply.
function derivePositions(resultsMap) {
  const groups = new Map(); // `${sessionId}::${bracket}` -> [{ id, score }]
  for (const [id, doc] of resultsMap) {
    const key = `${doc.sessionId}::${doc.bracket}`;
    const list = groups.get(key) || [];
    list.push({ id, score: doc.score });
    groups.set(key, list);
  }
  const positions = new Map();
  for (const list of groups.values()) {
    list.sort((a, b) => a.score - b.score);
    let lastScore = null;
    let lastPos = 0;
    list.forEach((row, i) => {
      const pos = row.score === lastScore ? lastPos : i + 1;
      lastScore = row.score;
      lastPos = pos;
      positions.set(row.id, pos);
    });
  }
  return positions;
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
  const philCount = sessionDocs.filter((s) => s.type === 'phil').length;
  const mentalCount = sessionDocs.filter((s) => s.type === 'mental').length;
  console.log(
    `Season ${portal.SEASON_BOUNDS.start} -> ${portal.SEASON_BOUNDS.end}: ` +
      `${sessionDocs.length} sessions (${trainingCount} training, ${tournamentCount} tournament, ` +
      `${philCount} phil, ${mentalCount} mental)\n`
  );

  let total = 0;
  for (const [name, docs] of Object.entries(collections)) {
    total += docs.size;
    console.log(`${name}: ${docs.size} doc${docs.size === 1 ? '' : 's'}`);
    const [sampleId, sampleDoc] = docs.entries().next().value;
    console.log(`  sample ${name}/${sampleId}: ${JSON.stringify(sampleDoc)}`);
  }
  console.log(`total: ${total} docs across ${Object.keys(collections).length} collections`);

  console.log('\nWhitfield bookings (contract v1.4) and the sessions.booked they drive:');
  for (const [id, doc] of collections.bookings) {
    const session = collections.sessions.get(doc.sessionId);
    console.log(
      `  bookings/${id}: status=${doc.status} pool=${doc.pool} createdBy=${doc.createdBy}` +
        ` -> sessions/${doc.sessionId}.booked=${session.booked}/${session.capacity}`
    );
  }

  console.log('\nSpecialist 1-on-1 sessions (contract v1.7) — hand-seeded, never from buildSeason():');
  for (const [id, doc] of collections.sessions) {
    if (doc.type !== 'phil' && doc.type !== 'mental') continue;
    console.log(
      `  sessions/${id}: type=${doc.type} date=${doc.date} time=${doc.time} status=${doc.status}` +
        ` capacity=${doc.capacity} booked=${doc.booked} gcalEventId=${doc.gcalEventId}`
    );
  }
  console.log('\nPre-booked specialist booking (jordan, contract v1.7):');
  for (const [id, doc] of collections.bookings) {
    if (doc.pool !== 'specialist') continue;
    const session = collections.sessions.get(doc.sessionId);
    console.log(
      `  bookings/${id}: status=${doc.status} pool=${doc.pool} createdBy=${doc.createdBy}` +
        ` -> sessions/${doc.sessionId}.booked=${session.booked}/${session.capacity}`
    );
  }

  console.log(
    '\ntournamentResults (contract v1.6) — score+bracket stored; position is DERIVED at read time ' +
      '(shown below for verification only, never written):'
  );
  const derivedPositions = derivePositions(collections.tournamentResults);
  for (const [id, doc] of collections.tournamentResults) {
    console.log(
      `  tournamentResults/${id}: date=${doc.date} score=${doc.score} bracket=${doc.bracket}` +
        ` name=${doc.name} createdBy=${doc.createdBy}` +
        ` -> derived position (within sessionId+bracket)=${derivedPositions.get(id)}`
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
