#!/usr/bin/env node
/**
 * Seed the Firestore EMULATOR with the portal's demo data.
 *
 *   node scripts/seed-firestore.mjs --dry-run     # print what would be written
 *   npm run seed:emulator                          # seed a running emulator
 *
 * CONTRACT v2.0 (Sprint 12 pin, "the token model", TEAM.md, Part 1 only):
 * one fungible token pool replaces the two-pool golf/fitness model.
 *   packages    — SIX docs now (t-6, t-12, t-16, t-20, elite, single) from the
 *                 seam's TOKEN_PACKAGES/ELITE/SINGLE_TOKEN in packages.js —
 *                 the g-*, f-*, drop-in, elite-247 catalogue is GONE. price
 *                 and pending are both stripped before writing (no dollar
 *                 amounts and no invented-price markers in seed data).
 *   athletes    — `fitnessPackageId` is REMOVED (there is one package pointer
 *                 now, `packageId`, into the token catalogue). Whitfield kids
 *                 move off the old g- / f- ids onto token ids — see
 *                 WHITFIELD_PACKAGE_IDS below.
 *   bookings    — `pool` is no longer written (retired, contract v2.0 pin A —
 *                 existing prod docs keep the field harmlessly, this seed just
 *                 stops adding new docs with it). Every booking instead
 *                 carries `periodKey` — the period start (`periodFor()` in the
 *                 seam's packages.js) the booking's session date falls in,
 *                 per the owning household's `periodAnchorDay`.
 *   households  — gains `periodAnchorDay` (int 1-28). Whitfield is anchored on
 *                 1; a second, small demo household (`parker`, below) is
 *                 anchored on 15 so the mid-month cycle is exercised, and
 *                 doubles as this seed's one Elite athlete (see PARKER_* below
 *                 — TEAM.md's DB-lane bullet asks for both facts and does not
 *                 require them to be different households).
 *
 * CONTRACT v2.1 (Sprint 13 pin, "token model Part 2: issuance, grace,
 * waitlist, Stripe", TEAM.md): the four Part 2 collections are now BUILT
 * (v2.0 seeded them empty). Exactly the seed facts the pin lists, no more:
 *   tokenPeriods — jordan_<currentPeriodKey>, granted from her live t-12
 *                 package, source 'stripe', a fake eventId.
 *   graceTokens — one unconsumed doc for reese (reason 'session-cancelled'),
 *                 combined with the cancelled-session/cancelled-booking fact
 *                 below into one coherent minting scenario (pin E's own two
 *                 triggers) rather than two unrelated facts.
 *   sessions/bookings/waitlist — ONE seed-only FULL session (capacity 2 —
 *                 the single exception to the flat 15 cap anywhere in this
 *                 seed, hand-added on a new `-w0` letter), booked by jordan
 *                 and reese, with nico waitlisted.
 *   households.membership — absent on whitfield (active); `past_due` on
 *                 parker, which also gets `stripeCustomerId: 'cus_seed_parker'`.
 *   notifications — three Whitfield ledger rows (contract v2.2, Sprint 14):
 *                 jordan's booking-confirmed on the full -w0 session, reese's
 *                 session-cancelled on 2026-11-11-0, jordan's tokens-expiring
 *                 for the current period — outcomes as the emulator functions
 *                 leave them with no provider configured.
 *   stripeEvents — one `invoice.payment_failed` doc matching parker's
 *                 past_due state (`evt_seed_2`, referenced by
 *                 households.parker.membership.lastEventId).
 *   bookings.cancelledBy/cancelReason — reese's booking on the cancelled
 *                 session above (`cancelledBy: 'system'`,
 *                 `cancelReason: 'session-cancelled'`), so the reason line
 *                 has a real doc to render against.
 * See the dedicated block comments right before the `return` in buildDocs()
 * for the exact ids and the reasoning behind each choice.
 *
 * What it seeds (data contract v1, docs/portal/TEAM.md, updated to v2.0 above):
 *   sessions    — the generated season (buildSeason() from season.js), PLUS
 *                  contract v1.7 (Sprint 9): hand-seeded specialist 1-on-1
 *                  slots for Phil ('phil') and Yannick ('mental') covering the
 *                  SPECIALIST_BOOKING_WINDOW_DAYS days starting the day this
 *                  script runs (computed off the runtime clock, never
 *                  hardcoded — see SPECIALIST_SLOT_TIMES below). The generator
 *                  never invents these; ids use a new `-s<n>` letter on the
 *                  existing `-x<n>` extras convention (season.js's
 *                  generateSeason() step for holiday tournaments).
 *   households  — the Whitfield demo household from seed.js, PLUS the new
 *                  `parker` household (v2.0, anchor 15, Elite) above.
 *   athletes    — the three Whitfield athletes with their (now token)
 *                  packageIds and, as of contract v1.6 (Sprint 8: age
 *                  brackets), the OWNER-SUPPLIED dobs (2026-09-10), landing
 *                  the three kids in three different brackets as of
 *                  SEASON_BOUNDS.start — see WHITFIELD_DOBS below. PLUS the
 *                  new `parker` household's one Elite athlete (v2.0).
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
 *                  ('mental') slot — v2.0: spends an ordinary token like any
 *                  other booking (pin K), no `pool` field written — so
 *                  schedule display and cancellation both have something real
 *                  to exercise in QA. Contract v1.9 (Sprint 11), UPDATED for
 *                  v2.0: TWO PAST 'phil' bookings for jordan against
 *                  hand-seeded past Phil sessions earlier in the current
 *                  calendar month (both 'attended') — under the token model
 *                  these simply count against jordan's t-12 period like any
 *                  other booking (no more separate Phil "used of 8"; pin K
 *                  retires the old fitness-package Phil cap entirely). Plus
 *                  ONE upcoming 'phil' booking for reese against
 *                  the first hand-seeded upcoming Phil slot, so the Family
 *                  Reservations view (pin F) has a specialist row for a
 *                  second household member too. jordan's upcoming
 *                  '2026-11-02-1' training booking also gets a real
 *                  `sessions.coachId` (the generator always leaves it null)
 *                  so Reservations' `instructor` field has a real value for
 *                  at least one training row.
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
 *   enrollmentRequests — ONE pending request (contract v1.8, Sprint 10 pin A)
 *                  keyed `parent-new`, a NEW unprovisioned QA uid — no
 *                  `users` doc exists for it, on purpose, so the intake path
 *                  (NotProvisioned -> /portal/register) has a real
 *                  not-yet-a-family account to route to. Two athletes: one
 *                  with a dob and a chosen tier, one with neither. All three
 *                  consents true.
 *   diagnostics — two `athletes/jordan/diagnostics` captures (contract v1.8,
 *                  Sprint 10 pin C): an older PUBLISHED one with a value for
 *                  every DIAGNOSTIC_SECTIONS field id, and a newer DRAFT with
 *                  just a couple of fields filled in — both `capturedBy:
 *                  'coach-luke'`. Field ids are read straight off
 *                  DIAGNOSTIC_SECTIONS in seed.js and enumerated in
 *                  DATA-MODEL.md, never retyped independently.
 *   staffInvites — ONE pending invite (contract v1.8, Sprint 10 pin E) at a
 *                  clearly-fake address (`invite-test@example.com`), role
 *                  coach, specialistId null — provision-family.mjs is what
 *                  consumes these in production (looks up the uid, writes the
 *                  users doc, marks the invite provisioned).
 *   notificationPrefs — parent-dana's `users` doc gets a real map (contract
 *                  v1.8, Sprint 10 pin G), one entry per NOTIFICATION_
 *                  CATEGORIES id from data/parent.js (bundled, never
 *                  retyped), each `{ email: true, sms: false }`. Every other
 *                  seeded `users` doc gets `notificationPrefs: null`.
 *   sessions also gain `coachNote` (contract v1.8, Sprint 10 pin H): null on
 *                  every session except one PAST attended training block
 *                  (`2026-11-09-2`), which gets a real note.
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

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleFrontend, fwdPath } from './lib/bundle-frontend.mjs';

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
  // Extracted to scripts/lib/bundle-frontend.mjs (contract v2.1, Sprint 13) —
  // export-memberships.mjs needs the identical esbuild-bundle-and-require
  // dance for a different symbol list, and this file is already grandfathered
  // over the 500-line guideline, so the shared mechanics live in lib/ rather
  // than growing a third inline copy.
  return bundleFrontend(repoRoot, [
    `export { buildSeason, SEASON_BOUNDS } from '${fwdPath(path.join(dataDir, 'season.js'))}';`,
    // contract v2.0 (Sprint 12 pin A/B/L/M) — the ONE token catalogue and
    // the period math, off the PM seam (frontend/src/portal/data/packages.js
    // above its DEPRECATED banner). GOLF_PACKAGES/DROP_IN/FITNESS_PACKAGES/
    // ELITE_TIERS/poolFor (below the banner) are gone from this bundle —
    // nothing here reads them anymore.
    `export { ALL_PACKAGES, periodFor } from '${fwdPath(path.join(dataDir, 'packages.js'))}';`,
    `export { HOUSEHOLD, COACH } from '${fwdPath(path.join(dataDir, 'seed.js'))}';`,
    // contract v1.8, Sprint 10 pin G — the notification-category catalogue
    // the NotificationPreferences screen renders; bundled like everything
    // else here rather than retyped, so a category add/remove can't drift.
    `export { NOTIFICATION_CATEGORIES } from '${fwdPath(path.join(dataDir, 'parent.js'))}';`,
  ], { tmpPrefix: 'ryp-seed-' });
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
        // v1.7.1 (owner, 2026-09-11): phil sessions are GROUP sessions at a
        // cap of 6 — only mental is the true capacity-1 1:1. Mirrors the
        // sync script's CAPACITY map and data/specialists.js.
        capacity: type === 'phil' ? 6 : 1,
        booked: 0,
        coachId: null,
        label: null,
        special: false,
        status: 'scheduled',
        gcalEventId: null, // hand-seeded, never a synced-from-calendar doc
        coachNote: null, // contract v1.8, Sprint 10 pin H
      });
      slotIds.push({ id, type });
    });
  }
  return slotIds;
}

// ---------------------------------------------------------------------------
// PAST Phil sessions — contract v1.9, TEAM.md "Sprint 11 pins" DB lane
// bullet: "two PAST 'phil' bookings for jordan in the CURRENT calendar month
// so derived 'used' is non-zero." addSpecialistSessions() above only ever
// generates FORWARD from the day this script runs (the booking-window
// convention it shares with the live useSpecialistSlots() fallback), so it
// can never produce a session that has already happened — this is a
// separate, small hand-add for exactly that gap.
//
// Walks backward day by day from the run date, inside the SAME calendar
// month only (stops rather than reaching into last month), collecting two of
// Phil's own working days (Mon/Wed/Fri, SPECIALIST_WEEKDAY_TYPE above) and
// hand-adding a single slot 0 session on each — same id convention
// (`YYYY-MM-DD-s0`), same doc shape as addSpecialistSessions(), same Phil
// capacity-6 group-session rule (v1.7.1). Computed off `runDate`, never
// hardcoded, so "past, this month" tracks whenever the seed actually runs —
// same discipline as the forward window.
// ---------------------------------------------------------------------------
function addPastPhilSessions(sessions, runDate = new Date()) {
  const ids = [];
  for (let back = 1; ids.length < 2; back++) {
    const d = new Date(runDate);
    d.setDate(d.getDate() - back);
    if (d.getMonth() !== runDate.getMonth() || d.getFullYear() !== runDate.getFullYear()) {
      break; // ran out of past days in the current calendar month
    }
    if (SPECIALIST_WEEKDAY_TYPE[d.getDay()] !== 'phil') continue;
    const dateStr = isoDate(d);
    const id = `${dateStr}-s0`;
    if (sessions.has(id)) continue; // don't collide with an existing slot
    sessions.set(id, {
      date: dateStr,
      time: SPECIALIST_SLOT_TIMES.phil[0],
      type: 'phil',
      capacity: 6, // v1.7.1: Phil sessions are group sessions, cap 6
      booked: 0,
      coachId: null,
      label: null,
      special: false,
      status: 'scheduled',
      gcalEventId: null, // hand-seeded, never a synced-from-calendar doc
      coachNote: null, // contract v1.8, Sprint 10 pin H
    });
    ids.push(id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Build the documents. Shapes follow the data contract v1 in TEAM.md; the
// field-by-field spec is docs/portal/DATA-MODEL.md.
// ---------------------------------------------------------------------------

function buildDocs(portal) {
  const {
    buildSeason,
    SEASON_BOUNDS,
    ALL_PACKAGES,
    periodFor,
    HOUSEHOLD,
    COACH,
    NOTIFICATION_CATEGORIES,
  } = portal;

  // packages (contract v2.0, pin A/L/M) — ONE catalogue, six docs
  // (t-6/t-12/t-16/t-20/elite/single). price AND pending are both stripped
  // before writing — no dollar amounts, and no invented-price markers,
  // anywhere in seed data (the v1.1 "price stripped" rule, extended to
  // `pending` by this sprint). id becomes the doc id rather than a
  // duplicated field. `kind`/`tokens`/`windowDays`/`access247` (elite only)
  // flow straight through from the seam, never hand-copied.
  const packages = new Map();
  const fields = ({ id, price, pending, ...rest }) => rest;
  for (const p of ALL_PACKAGES) packages.set(p.id, fields(p));

  // sessions — straight from the generator; ids stay the generator's
  // `YYYY-MM-DD-<block>`. Normalized only where the generator omits a field on
  // regular sessions (special/label exist on extras alone). Contract v2.0
  // (pin J): `overflow` is gone (deleted from the generator itself); `bookable`
  // is new — false only for the seed-only Saturday 2-4 PM adult/college
  // display entry, true everywhere else.
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
      bookable: fields.bookable !== false,
      coachNote: null, // contract v1.8, Sprint 10 pin H — set on one session below
    });
  }

  // specialist 1-on-1 sessions (contract v1.7, Sprint 9) — hand-added into
  // the same `sessions` map, never from buildSeason(); see
  // addSpecialistSessions() above for the id/window/pattern rationale.
  const specialistSlotIds = addSpecialistSessions(sessions);

  // PAST Phil sessions (contract v1.9, Sprint 11) — see addPastPhilSessions()
  // above. Must find two or the pinned jordan bookings below have nothing
  // real to reference.
  const pastPhilIds = addPastPhilSessions(sessions);
  if (pastPhilIds.length < 2) {
    throw new Error(
      `Only found ${pastPhilIds.length} past Phil working day(s) (Mon/Wed/Fri) earlier in the ` +
        'current calendar month — the seed pins two PAST phil bookings for jordan so ' +
        'entitlementsFor() has a non-zero Phil "used" this month (TEAM.md Sprint 11 DB lane ' +
        'bullet). This can happen near the start of a month; re-run later in the month, or widen ' +
        'the lookback in addPastPhilSessions() if this becomes a recurring problem.'
    );
  }

  // households — guardian contact from the scaffold (dana@email.com is the
  // parent email seed.js uses). Stripe ids are null: ids only, and a demo
  // household has none. `periodAnchorDay` (contract v2.0, pin B) is written
  // EXPLICITLY as 1 rather than left absent — absent reads identically (the
  // pin's own "absent == 1" rule), but an explicit value is what a raw
  // Firestore/REST read of the emulator actually shows, matching this
  // script's long-standing preference for a visible demo value over an
  // invisible default (the same call WHITFIELD_FITNESS_PACKAGE_IDS's nico
  // used to make for its own field, pre-v2.0 — see the athletes note below).
  const householdId = 'whitfield';
  const households = new Map([
    [
      householdId,
      {
        name: HOUSEHOLD.name,
        guardian: { name: 'Dana', email: 'dana@email.com', phone: null },
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        periodAnchorDay: 1,
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
  // packageId (contract v2.0, pin A) — seed.js's HOUSEHOLD still carries the
  // RETIRED g-*/f-* ids (that file is the data-routing/frontend lanes' — not
  // this script's to edit), so every child's package is overridden here onto
  // the new token catalogue rather than read off `child.packageId` directly.
  // jordan keeps her mid-tier package (was g-8-3, the "8 + 3" golf package;
  // now t-12, the closest token equivalent); reese and nico both move off
  // their shared g-4-2 (the smallest golf package) onto t-6, the smallest
  // token package — "sensible t-* for reese/nico" per TEAM.md's DB-lane
  // bullet, not an invented upgrade/downgrade. `fitnessPackageId` is GONE
  // (pin A: one package pointer now) — the old WHITFIELD_FITNESS_PACKAGE_IDS
  // map and its f-8/f-4/null split are deleted, not merely unused.
  const WHITFIELD_PACKAGE_IDS = {
    jordan: 't-12',
    reese: 't-6',
    nico: 't-6',
  };
  const coachUid = 'coach-luke';
  const athletes = new Map();
  for (const child of HOUSEHOLD.children) {
    const minutes = child.ageLine && child.ageLine.match(/(\d+)\s*min tier/);
    athletes.set(child.id, {
      name: `${child.name} Whitfield`,
      dob: WHITFIELD_DOBS[child.id] ?? null,
      householdId,
      packageId: WHITFIELD_PACKAGE_IDS[child.id],
      contractMinutes: minutes ? Number(minutes[1]) : null,
      coachId: coachUid,
    });
  }
  // athletes/{id}/private/medical is deliberately NOT seeded — see header.

  // ---------------------------------------------------------------------
  // `parker` household (contract v2.0, TEAM.md DB-lane bullet) — a second,
  // SMALL, fully-invented demo household (never a real family, same class as
  // Whitfield) that exists purely to seed two Sprint 12 facts the Whitfield
  // household doesn't: a `periodAnchorDay` other than 1 (so the mid-month
  // cycle math in `periodFor()` is exercised, not just the anchor-1 case),
  // and one Elite athlete (the pin explicitly asks for one in the emulator —
  // DATA-MODEL.md has flagged this as a gap since Sprint 11). The two facts
  // are combined onto one household/athlete rather than two separate adds,
  // since TEAM.md's bullet lists them together and nothing requires they be
  // different households — noted explicitly here and in the report. No
  // `users` doc is seeded for this household (no QA sign-in story is pinned
  // for it); it exists as households/athletes docs only, the same shape the
  // MackBee siblings have in provision-family.mjs.
  // ---------------------------------------------------------------------
  const parkerHouseholdId = 'parker';
  households.set(parkerHouseholdId, {
    name: 'Parker family',
    guardian: { name: 'Sam Parker', email: 'sam.parker@example.com', phone: null },
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    periodAnchorDay: 15,
  });
  const parkerAthleteId = 'sage-parker';
  athletes.set(parkerAthleteId, {
    name: 'Sage Parker',
    dob: '2013-05-10', // fabricated demo dob, same as the Contreras enrollment kids below
    householdId: parkerHouseholdId,
    packageId: 'elite',
    contractMinutes: null,
    coachId: null,
  });

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
  //   jordan 2026-11-07-1 (Sat 10:00 AM tournament) — `attended` (contract
  //     v1.5: flipped from the earlier `confirmed` now that a tournament
  //     result exists for this session below — a result implies the athlete
  //     showed up). Booked by the parent, so this seed exercises the
  //     parent-linkage path (createdBy != athleteId's own account) as well as
  //     the athlete-booked path above.
  //   jordan 2026-11-09-2 (Mon 5:00 PM training) — already `attended`, so the
  //     coach's roster and any "past sessions" UI have a real history entry
  //     to show, not just upcoming confirmeds.
  //   jordan 2026-11-14-1 (Sat 10:00 AM tournament) — `attended`, added
  //     alongside the tournamentResults below: this is the second tournament
  //     Jordan places in (3rd), so the attendance story matches the result.
  //   reese / nico 2026-11-07-1 and 2026-11-14-1 — both tournament blocks,
  //     both `attended`, both `createdBy: 'parent-dana'`. Reese and Nico have
  //     no `users` doc of their own (see below), so every one of their
  //     bookings is the parent-books-for-a-kid path Sprint 7 makes
  //     first-class — not an edge case for them, the only case.
  // `sessions.booked` on each referenced session is incremented below in the
  // same loop that builds these docs — the transaction's other write (v1.4)
  // — so the seed is internally consistent the way a real booking would
  // leave it: a QA pass checking `booked` against `bookings` sees them agree.
  //
  // periodKey (contract v2.0, pin B) — write-once, the period START the
  // SESSION's date falls in, per `periodFor(date, anchorDay)` and the owning
  // household's `periodAnchorDay` (Whitfield: 1). `pool` is no longer written
  // at all (pin A: retired) — every entry below drops it in favor of
  // `periodKey`.
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
  const WHITFIELD_ANCHOR_DAY = households.get(householdId).periodAnchorDay;
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
      periodKey: periodFor(session.date, WHITFIELD_ANCHOR_DAY).periodKey,
      status,
      householdId,
      createdBy,
      createdAt: bookingCreatedAt,
    });
    session.booked += 1; // same write the real booking transaction makes
  }

  // coachNote (contract v1.8, Sprint 10 pin H) — a real note on ONE PAST
  // attended training session, so the roster's "Add a session note" editor
  // has something real to pre-fill and edit instead of always starting
  // blank. 2026-11-09-2 is already jordan's second `attended` training
  // booking above (WHITFIELD_BOOKINGS) — reusing it here keeps the two demo
  // facts (attendance + note) about the same real session, not two
  // unrelated ones.
  {
    const notedSession = sessions.get('2026-11-09-2');
    if (!notedSession) {
      throw new Error(
        "Seed coachNote references sessions/2026-11-09-2, which buildSeason() did not generate " +
          '(the season config in season.js changed under this seed). Update the coachNote target ' +
          'in scripts/seed-firestore.mjs to reference a real generated PAST training session id.'
      );
    }
    notedSession.coachNote =
      'Takeaway tempo was noticeably steadier by the back half of reps — keep an eye on grip pressure creeping up under fatigue next block.';
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
      // periodKey (contract v2.0, pin B) — a specialist 1-on-1 spends an
      // ordinary token now (pin K: "Phil and Yannick sessions spend an
      // ordinary token"); `pool` is retired, so this doc no longer carries
      // one at all (it used to be a literal 'specialist' here — see git
      // history if that reasoning is ever needed again).
      periodKey: periodFor(session.date, WHITFIELD_ANCHOR_DAY).periodKey,
      status: 'confirmed',
      householdId,
      createdBy: 'parent-dana',
      createdAt: bookingCreatedAt,
    });
    session.booked += 1; // same invariant as the WHITFIELD_BOOKINGS loop above
  }

  // TWO PAST 'phil' bookings for jordan (contract v1.9, Sprint 11 DB lane
  // bullet, carried forward under v2.0) — against the two sessions
  // addPastPhilSessions() hand-added above, both already occurred (status
  // 'attended'). Under the token model these simply count against jordan's
  // t-12 period like any other booking — no separate Phil "used of N" pool.
  for (const sessionId of pastPhilIds) {
    const session = sessions.get(sessionId);
    bookings.set(`jordan_${sessionId}`, {
      athleteId: 'jordan',
      sessionId,
      date: session.date,
      type: 'phil',
      periodKey: periodFor(session.date, WHITFIELD_ANCHOR_DAY).periodKey,
      status: 'attended',
      householdId,
      createdBy: 'athlete-jordan',
      createdAt: bookingCreatedAt,
    });
    session.booked += 1; // same invariant as every other booking above
  }

  // ONE upcoming 'phil' booking for reese (contract v1.9, Sprint 11 DB lane
  // bullet) — the household's second specialist row (jordan's upcoming
  // mental booking above is the first), so Family Reservations (pin F) has
  // more than one member's specialist row to render. Picks the first Phil
  // slot addSpecialistSessions() generated, the same
  // deterministic-regardless-of-weekday pattern as jordanMentalSlot above.
  const reeseUpcomingPhilSlot = specialistSlotIds.find((s) => s.type === 'phil');
  if (!reeseUpcomingPhilSlot) {
    throw new Error(
      'addSpecialistSessions() produced no Phil slot in the ' +
        `${SPECIALIST_BOOKING_WINDOW_DAYS}-day window — cannot seed the pinned upcoming reese booking. ` +
        'Widen SPECIALIST_BOOKING_WINDOW_DAYS or check SPECIALIST_WEEKDAY_TYPE.'
    );
  }
  {
    const session = sessions.get(reeseUpcomingPhilSlot.id);
    bookings.set(`reese_${reeseUpcomingPhilSlot.id}`, {
      athleteId: 'reese',
      sessionId: reeseUpcomingPhilSlot.id,
      date: session.date,
      type: session.type, // 'phil'
      periodKey: periodFor(session.date, WHITFIELD_ANCHOR_DAY).periodKey,
      status: 'confirmed',
      householdId,
      createdBy: 'parent-dana', // reese has no users doc of her own
      createdAt: bookingCreatedAt,
    });
    session.booked += 1; // same invariant as every other booking above
  }

  // sessions.coachId on jordan's upcoming '2026-11-02-1' training booking
  // (contract v1.9, Sprint 11 DB lane bullet) — buildSeason() always leaves
  // coachId null (schedule.js never assigns one), so without this the
  // Family Reservations view's derived `instructor` field would have no
  // real training-block example anywhere in this seed.
  {
    const upcomingTrainingSession = sessions.get('2026-11-02-1');
    if (!upcomingTrainingSession) {
      throw new Error(
        "Seed coachId references sessions/2026-11-02-1, which buildSeason() did not generate " +
          '(the season config in season.js changed under this seed). Update the target in ' +
          'scripts/seed-firestore.mjs to reference a real generated UPCOMING training session id.'
      );
    }
    upcomingTrainingSession.coachId = coachUid;
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

  // athletes/jordan/diagnostics (contract v1.8, Sprint 10 pin C) — two
  // captures keyed by the same DIAGNOSTIC_SECTIONS field ids the Diagnostic
  // Capture screen renders (read straight off seed.js, enumerated in
  // DATA-MODEL.md so the key list can't drift from what this script writes):
  //   published-1 — the older, COMPLETE capture: every one of the 13 field
  //     ids across all four sections has a value, status 'published', so the
  //     parent/athlete PUBLISHED-only read and the AthleteDetail "Progress
  //     summary" replacement (pin C) both have something real to render.
  //   draft-1 — the newer, IN-PROGRESS capture: only the launch monitor's
  //     first two fields are filled in, status 'draft' — a parent/athlete
  //     read must never see this one; only staff/coach/specialist reads do.
  // Both capturedBy coach-luke, jordan's assigned coach.
  const diagCapturedAtPublished = new Date();
  diagCapturedAtPublished.setDate(diagCapturedAtPublished.getDate() - 30);
  diagCapturedAtPublished.setHours(16, 0, 0, 0);
  const diagCapturedAtDraft = new Date();
  diagCapturedAtDraft.setDate(diagCapturedAtDraft.getDate() - 2);
  diagCapturedAtDraft.setHours(16, 30, 0, 0);
  const jordanDiagnostics = new Map([
    [
      'published-1',
      {
        athleteId: 'jordan',
        capturedBy: coachUid,
        capturedAt: diagCapturedAtPublished,
        updatedAt: diagCapturedAtPublished,
        status: 'published',
        // Every DIAGNOSTIC_SECTIONS field id (13, across launch/mobility/
        // shortgame/putting) — see DATA-MODEL.md for the enumerated list.
        values: {
          clubhead: 88,
          ball: 118,
          smash: 1.34,
          carry7i: 145,
          hip: 42,
          shoulder: 85,
          balance: 22,
          d30: 6,
          d50: 9,
          d70: 13,
          p3: 9,
          p6: 6,
          p10: 55,
        },
        notes: 'Full capture, all four sections — clean session, no equipment issues.',
      },
    ],
    [
      'draft-1',
      {
        athleteId: 'jordan',
        capturedBy: coachUid,
        capturedAt: diagCapturedAtDraft,
        updatedAt: diagCapturedAtDraft,
        status: 'draft',
        // Only a couple of fields — an in-progress capture, on purpose.
        values: { clubhead: 90, ball: 121 },
        notes: null,
      },
    ],
  ]);

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
  // v1.7.1: `specialistId` links a staff user to the specialist whose
  // sessions they run (== sessions.type; provisioning writes the same field
  // in production). The 'mental' QA account IS Yannick; 'phil' is the new
  // QA account for Phil — window.__rypTestAuth.signInAs('phil') drives his
  // My Sessions view. Neither is ever an athlete's assigned golf coach.
  // notificationPrefs (contract v1.8, Sprint 10 pin G) — parent-dana gets a
  // real map, one entry per NOTIFICATION_CATEGORIES id (bundled from
  // data/parent.js above, never retyped — includes the locked 'billing'
  // category too, since the map stores a preference per category the screen
  // renders regardless of which toggles the UI lets a parent actually flip),
  // each `{ email: true, sms: false }`. Every other seeded users doc below
  // gets `notificationPrefs: null` — the field exists, nothing else has
  // opted in yet.
  const danaNotificationPrefs = Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((cat) => [cat.id, { email: true, sms: false }])
  );

  const users = new Map([
    ['parent-dana', { role: 'parent', householdId, athleteId: null, staff: false, specialistId: null, displayName: 'Dana', email: 'dana@email.com', notificationPrefs: danaNotificationPrefs }],
    ['athlete-jordan', { role: 'athlete', athleteId: 'jordan', householdId, staff: false, specialistId: null, displayName: 'Jordan Whitfield', email: null, notificationPrefs: null }],
    [coachUid, { role: 'coach', athleteId: null, householdId: null, staff: true, specialistId: null, displayName: COACH.name, email: null, notificationPrefs: null }],
    ['owner', { role: 'owner', athleteId: null, householdId: null, staff: true, specialistId: null, displayName: null, email: null, notificationPrefs: null }],
    ['mental', { role: 'mental', athleteId: null, householdId: null, staff: true, specialistId: 'mental', displayName: 'Yannick', email: null, notificationPrefs: null }],
    ['ops', { role: 'ops', athleteId: null, householdId: null, staff: true, specialistId: null, displayName: 'Ops', email: null, notificationPrefs: null }],
    // Sprint 16: the Parker guardian, so the past_due Billing hub is reachable in QA.
    ['parent-sam', { role: 'parent', athleteId: null, householdId: parkerHouseholdId, staff: false, specialistId: null, displayName: 'Sam Parker', email: 'sam.parker@example.com', notificationPrefs: null }],
    ['phil', { role: 'coach', athleteId: null, householdId: null, staff: true, specialistId: 'phil', displayName: 'Phil', email: null, notificationPrefs: null }],
  ]);

  // enrollmentRequests (contract v1.8, Sprint 10 pin A) — ONE pending
  // request, keyed by a NEW, unprovisioned QA uid: 'parent-new'. The point is
  // that users/parent-new does NOT exist (see the users map above — it is
  // deliberately absent, never added), so NotProvisioned's "start
  // enrollment" / "under review" states have a real not-yet-a-family account
  // to exercise, the same way parent-dana exercises the already-provisioned
  // path. Two athletes: one arrives with a dob and a chosen contract tier,
  // one arrives with neither (contract intake, pin B, is what fills that in
  // after approval) — both still carry a packageId, since a family picks a
  // package during registration regardless of whether the tier is decided.
  // All three consents true (a family that got as far as submitting checked
  // every box). guardian/athlete names are invented demo-family data, same
  // as Whitfield/MackBee/Eisele elsewhere in this seed — never a real family.
  const enrollmentCreatedAt = new Date();
  const enrollmentRequests = new Map([
    [
      'parent-new',
      {
        guardian: { name: 'Priya Contreras', email: 'priya.contreras@example.com', phone: null },
        athletes: [
          { name: 'Mateo Contreras', dob: '2016-02-20', packageId: 'g-4-2', contractMinutes: 20 },
          { name: 'Sofia Contreras', dob: null, packageId: 'g-4-2', contractMinutes: null },
        ],
        consents: { dataCollection: true, videoCapture: true, mediaRelease: true },
        // v1.8 amendment (PM integration): free-text emergency contact +
        // medical notes ride the request and land in each approved
        // athlete's private/medical doc. Fabricated for a fabricated
        // family — never real people.
        guardianNotes: {
          emergencyContact: 'Luis Contreras (uncle) — 612-555-0142',
          medical: 'Mateo: mild peanut allergy, carries an EpiPen.',
        },
        status: 'pending',
        declineReason: null,
        createdAt: enrollmentCreatedAt,
        updatedAt: enrollmentCreatedAt,
        reviewedBy: null,
        reviewedAt: null,
      },
    ],
  ]);

  // staffInvites (contract v1.8, Sprint 10 pin E) — ONE pending invite at a
  // clearly-fake address (invent nothing real, per policy — this is never a
  // real hire's email). provision-family.mjs (production) is what consumes
  // these: looks up the auth uid by email, writes the users doc, and marks
  // the invite 'provisioned' + provisionedUid. The emulator seed leaves it
  // 'pending' — there is no auth account behind invite-test@example.com for
  // anything in this worktree to resolve it against.
  const staffInviteCreatedAt = new Date();
  const staffInvites = new Map([
    [
      'invite-1',
      {
        email: 'invite-test@example.com',
        role: 'coach',
        displayName: 'New Coach',
        specialistId: null,
        status: 'pending',
        createdBy: 'owner',
        createdAt: staffInviteCreatedAt,
      },
    ],
  ]);

  // =========================================================================
  // Contract v2.1 (Sprint 13 pin, TEAM.md "token model Part 2: issuance,
  // grace, waitlist, Stripe") — the four Part 2 collections, BUILT and seeded
  // now instead of the v2.0 "documented now, seeded empty" placeholder.
  // =========================================================================

  // C. TOKEN ISSUANCE — jordan's CURRENT period's tokenPeriods doc, standing
  // in for a `invoice.paid` Stripe event that already landed this cycle.
  // periodKey/periodEnd are computed off the runtime clock (`today`, already
  // built above for the contractLogs block — never hardcoded, same
  // discipline as addSpecialistSessions()'s forward window) against
  // Whitfield's own anchor (1), so a re-run always seeds "the period
  // containing whenever this script actually runs", not a frozen date.
  const todayISO = isoDate(today);
  const jordanCurrentPeriod = periodFor(todayISO, WHITFIELD_ANCHOR_DAY);
  const tokenPeriods = new Map([
    [
      `jordan_${jordanCurrentPeriod.periodKey}`,
      {
        athleteId: 'jordan',
        householdId,
        periodKey: jordanCurrentPeriod.periodKey,
        periodEnd: jordanCurrentPeriod.periodEnd,
        // granted is a STORED fact about an issuance event (contract C — the
        // same class as tournamentResults.score), not a derivation. It reads
        // off jordan's actual t-12 package here (packages.get(), not a
        // hand-typed 12) purely because this seed's fabricated "Stripe
        // event" is standing in for her real current package — in general
        // tokenPeriods.granted can outlive a later package change.
        granted: packages.get(WHITFIELD_PACKAGE_IDS.jordan).tokens,
        source: 'stripe',
        eventId: 'evt_seed_1', // fake — no real Stripe event backs this seed
        createdAt: today,
      },
    ],
  ]);

  // E. GRACE TOKENS + the cancelled-session/cancelled-booking pair (pin G) —
  // combined into ONE coherent scenario rather than two unrelated facts,
  // because pin E's own two minting triggers make that the natural story: a
  // real generated session reese was confirmed on gets cancelled by staff,
  // her booking flips to `cancelled` with the system reason, and she is
  // minted exactly one grace token referencing it. `2026-11-11-0` (a real
  // Wednesday 3 PM training block from buildSeason(), not otherwise
  // referenced by any WHITFIELD_BOOKINGS/specialist entry above) plays the
  // cancelled session.
  const CANCELLED_SESSION_ID = '2026-11-11-0';
  const cancelledSession = sessions.get(CANCELLED_SESSION_ID);
  if (!cancelledSession) {
    throw new Error(
      `Seed grace-token scenario references sessions/${CANCELLED_SESSION_ID}, which buildSeason() did ` +
        'not generate (the season config in season.js changed under this seed). Update ' +
        'CANCELLED_SESSION_ID in scripts/seed-firestore.mjs to reference a real generated training session id.'
    );
  }
  // `status` is set explicitly here even though the *generic* session-build
  // loop above never writes it (the pre-existing gap DATA-MODEL.md flags:
  // generator-seeded sessions carry no `status`/`gcalEventId` at all). That
  // gap is out of this pass's scope to fix broadly, but THIS one doc's
  // `status` is a genuine fact this seed needs to tell (a cancelled
  // session), not a cosmetic default, so it gets the field the way
  // addSpecialistSessions() always has.
  cancelledSession.status = 'cancelled';
  const reeseGraceExpiry = new Date(today);
  reeseGraceExpiry.setDate(reeseGraceExpiry.getDate() + 20);
  const graceTokens = new Map([
    [
      'grace-1', // readable slug — same "emulator mints no real auto-ids" convention as diagnostics/staffInvites ids
      {
        athleteId: 'reese',
        householdId,
        expiresAt: isoDate(reeseGraceExpiry), // today + 20 days
        reason: 'session-cancelled',
        sourceSessionId: CANCELLED_SESSION_ID,
        createdBy: 'ops',
        createdAt: today,
      },
    ],
  ]);
  // Reese's cancelled booking on that session (pin G): the confirmed seat
  // she held is what the grace token is compensating for. She has no
  // `users` doc of her own, so `createdBy` stays the parent (contract v1.5,
  // unchanged by cancellation) even though the CANCEL itself was staff's.
  {
    const periodKey = periodFor(cancelledSession.date, WHITFIELD_ANCHOR_DAY).periodKey;
    bookings.set(`reese_${CANCELLED_SESSION_ID}`, {
      athleteId: 'reese',
      sessionId: CANCELLED_SESSION_ID,
      date: cancelledSession.date,
      type: cancelledSession.type,
      periodKey,
      status: 'cancelled',
      cancelledBy: 'system',
      cancelReason: 'session-cancelled',
      householdId,
      createdBy: 'parent-dana',
      createdAt: bookingCreatedAt,
    });
    // No confirmed booking remains on a cancelled session — booked reflects
    // that (the mirror of the +1/-1 invariant every other booking loop in
    // this script maintains), never left at a stale pre-cancel count.
    cancelledSession.booked = 0;
  }

  // F. WAITLIST — ONE seed-only FULL session, capacity 2 (booked by jordan
  // and reese, both confirmed), with nico waitlisted. **This is the single
  // deliberate exception to the flat capacity-15 rule (contract v2.0 pin J)
  // anywhere in this seed** — a hand-added session, the same idiom as the
  // specialist `-s<n>` slots and the holiday `-x<n>` extras (new letter,
  // `-w0`, "waitlist"), kept at capacity 2 purely so a THIRD athlete can
  // fill it and be waitlisted without needing 15 fabricated bookings. Dated
  // 2026-11-16 (a real, non-closure Monday inside SEASON_BOUNDS) so
  // `periodFor()` and the Whitfield anchor behave exactly as they would for
  // any other November session.
  const FULL_SESSION_ID = '2026-11-16-w0';
  if (sessions.has(FULL_SESSION_ID)) {
    throw new Error(`Seed FULL-session id ${FULL_SESSION_ID} collides with an existing sessions doc.`);
  }
  const fullSessionDate = '2026-11-16';
  sessions.set(FULL_SESSION_ID, {
    date: fullSessionDate,
    time: '3:30 PM',
    type: 'training',
    capacity: 2, // <-- the one exception to CAPACITY = 15, see comment above
    booked: 2,
    coachId: null,
    label: null,
    special: false,
    bookable: true,
    status: 'scheduled',
    gcalEventId: null,
    coachNote: null,
  });
  const fullSessionPeriodKey = periodFor(fullSessionDate, WHITFIELD_ANCHOR_DAY).periodKey;
  bookings.set(`jordan_${FULL_SESSION_ID}`, {
    athleteId: 'jordan',
    sessionId: FULL_SESSION_ID,
    date: fullSessionDate,
    type: 'training',
    periodKey: fullSessionPeriodKey,
    status: 'confirmed',
    householdId,
    createdBy: 'athlete-jordan',
    createdAt: bookingCreatedAt,
  });
  bookings.set(`reese_${FULL_SESSION_ID}`, {
    athleteId: 'reese',
    sessionId: FULL_SESSION_ID,
    date: fullSessionDate,
    type: 'training',
    periodKey: fullSessionPeriodKey,
    status: 'confirmed',
    householdId,
    createdBy: 'parent-dana',
    createdAt: bookingCreatedAt,
  });
  const nicoJoinedAt = new Date();
  const waitlist = new Map([
    [
      `${FULL_SESSION_ID}_nico`,
      {
        sessionId: FULL_SESSION_ID,
        athleteId: 'nico',
        householdId,
        date: fullSessionDate,
        periodKey: fullSessionPeriodKey,
        joinedAt: nicoJoinedAt,
        createdBy: 'parent-dana', // nico has no users doc of his own, same as every other nico booking above
      },
    ],
  ]);

  // H. MEMBERSHIP STATUS + STRIPE — whitfield stays ABSENT (contract:
  // absent == active; every household provisioned before Part 2 stays
  // bookable with zero migration). `parker` (anchor 15, already this seed's
  // one Elite athlete's household) plays the past_due case instead, so both
  // membership states are exercisable in the emulator from one seed run.
  const parkerPeriod = periodFor(todayISO, households.get(parkerHouseholdId).periodAnchorDay);
  households.get(parkerHouseholdId).stripeCustomerId = 'cus_seed_parker';
  households.get(parkerHouseholdId).membership = {
    status: 'past_due',
    stripeSubscriptionStatus: 'past_due',
    currentPeriodStart: parkerPeriod.periodKey,
    currentPeriodEnd: parkerPeriod.periodEnd,
    lastEventId: 'evt_seed_2',
    updatedAt: today,
    // Contract v2.4 (Sprint 16): the retry position the Billing hub draws.
    attemptCount: 1,
    nextPaymentAttempt: isoDate(new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)),
    lastFailedAt: isoDate(new Date(today.getTime() - 24 * 60 * 60 * 1000)),
  };
  const stripeEvents = new Map([
    [
      'evt_seed_2',
      {
        type: 'invoice.payment_failed',
        customer: 'cus_seed_parker',
        householdId: parkerHouseholdId,
        receivedAt: today,
        outcome: 'past_due',
      },
    ],
  ]);

  // I. NOTIFICATIONS (contract v2.2, Sprint 14) — the ledger rows the Cloud
  // Functions would have written for three facts this seed already holds:
  // jordan's confirmed booking on the full -w0 session (booking-confirmed),
  // reese's cancelled 2026-11-11-0 booking + grace token (session-cancelled),
  // and jordan's current period (tokens-expiring). Ids are {kind}_{subjectKey}
  // exactly as functions/portal/notify.js keys them; outcomes are what the
  // emulator leaves with no Courier/Twilio configured and no users.phone.
  const hoursAgo = (h) => new Date(today.getTime() - h * 60 * 60 * 1000);
  const jordanTokensLeft =
    tokenPeriods.get(`jordan_${jordanCurrentPeriod.periodKey}`).granted -
    [...bookings.values()].filter(
      (b) => b.athleteId === 'jordan' && b.status !== 'cancelled' && b.periodKey === jordanCurrentPeriod.periodKey && !b.graceTokenId
    ).length;
  const niceDate = (iso) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const graceExpiry = niceDate(graceTokens.get('grace-1').expiresAt);
  const notifications = new Map([
    [
      `booking-confirmed_jordan_${FULL_SESSION_ID}`,
      {
        kind: 'booking-confirmed',
        category: 'schedule',
        householdId,
        athleteId: 'jordan',
        sessionId: FULL_SESSION_ID,
        bookingId: `jordan_${FULL_SESSION_ID}`,
        subjectKey: `jordan_${FULL_SESSION_ID}`,
        title: 'Session booked',
        body: 'Jordan is booked: Training, Mon, Nov 16 at 3:30 PM.',
        recipients: [
          { uid: 'athlete-jordan', email: 'skipped', push: 'no-device' },
          { uid: 'parent-dana', email: 'skipped', push: 'no-device' },
        ],
        sentAt: hoursAgo(96),
        createdAt: hoursAgo(96),
      },
    ],
    [
      'session-cancelled_reese_2026-11-11-0',
      {
        kind: 'session-cancelled',
        category: 'schedule',
        householdId,
        athleteId: 'reese',
        sessionId: '2026-11-11-0',
        bookingId: 'reese_2026-11-11-0',
        subjectKey: 'reese_2026-11-11-0',
        title: 'Session cancelled',
        body:
          'Training on Wed, Nov 11 was cancelled by the academy. ' +
          `A bonus token was added to Reese's account (expires ${graceExpiry}).`,
        recipients: [{ uid: 'parent-dana', email: 'skipped', push: 'no-device' }],
        sentAt: hoursAgo(48),
        createdAt: hoursAgo(48),
      },
    ],
    [
      `tokens-expiring_jordan_${jordanCurrentPeriod.periodKey}`,
      {
        kind: 'tokens-expiring',
        category: 'billing',
        householdId,
        athleteId: 'jordan',
        sessionId: null,
        bookingId: null,
        subjectKey: `jordan_${jordanCurrentPeriod.periodKey}`,
        title: 'Tokens expiring soon',
        // The same count the Billing hub derives (tokensFor): the period's
        // grant minus jordan's non-cancelled, non-grace bookings in it.
        body:
          `Jordan has ${jordanTokensLeft} tokens left ` +
          `that expire ${niceDate(jordanCurrentPeriod.periodEnd)}. Book before then.`,
        recipients: [{ uid: 'parent-dana', email: 'skipped', push: 'no-device' }],
        sentAt: hoursAgo(5),
        createdAt: hoursAgo(5),
      },
    ],
  ]);

  return {
    packages,
    sessions,
    households,
    athletes,
    users,
    bookings,
    contractLogs,
    tournamentResults,
    enrollmentRequests,
    'athletes/jordan/diagnostics': jordanDiagnostics,
    staffInvites,
    tokenPeriods,
    graceTokens,
    waitlist,
    stripeEvents,
    notifications,
  };
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
  const adultCount = sessionDocs.filter((s) => s.type === 'adult').length; // pin J: seed-only, display, bookable: false
  console.log(
    `Season ${portal.SEASON_BOUNDS.start} -> ${portal.SEASON_BOUNDS.end}: ` +
      `${sessionDocs.length} sessions (${trainingCount} training, ${tournamentCount} tournament, ` +
      `${philCount} phil, ${mentalCount} mental, ${adultCount} adult display-only)\n`
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
      `  bookings/${id}: status=${doc.status} periodKey=${doc.periodKey} createdBy=${doc.createdBy}` +
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
  console.log('\nSpecialist bookings (contract v1.7 + v1.9, v2.0: an ordinary token, no `pool`):');
  for (const [id, doc] of collections.bookings) {
    if (doc.type !== 'phil' && doc.type !== 'mental') continue;
    const session = collections.sessions.get(doc.sessionId);
    console.log(
      `  bookings/${id}: status=${doc.status} type=${doc.type} periodKey=${doc.periodKey} createdBy=${doc.createdBy}` +
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

  console.log('\nenrollmentRequests (contract v1.8):');
  for (const [id, doc] of collections.enrollmentRequests) {
    console.log(
      `  enrollmentRequests/${id}: status=${doc.status} guardian=${doc.guardian.email}` +
        ` athletes=${doc.athletes.length} (users/${id} exists=${collections.users.has(id)})`
    );
    doc.athletes.forEach((a, i) =>
      console.log(`    athletes[${i}]: name=${a.name} dob=${a.dob} packageId=${a.packageId} contractMinutes=${a.contractMinutes}`)
    );
  }

  console.log('\nathletes/jordan/diagnostics (contract v1.8):');
  for (const [id, doc] of collections['athletes/jordan/diagnostics']) {
    console.log(
      `  athletes/jordan/diagnostics/${id}: status=${doc.status} capturedBy=${doc.capturedBy}` +
        ` fields=${Object.keys(doc.values).length}/13 notes=${JSON.stringify(doc.notes)}`
    );
  }

  console.log('\nstaffInvites (contract v1.8):');
  for (const [id, doc] of collections.staffInvites) {
    console.log(`  staffInvites/${id}: email=${doc.email} role=${doc.role} specialistId=${doc.specialistId} status=${doc.status}`);
  }

  console.log('\nnotificationPrefs (contract v1.8):');
  for (const [id, doc] of collections.users) {
    console.log(
      `  users/${id}: notificationPrefs=${doc.notificationPrefs ? Object.keys(doc.notificationPrefs).join(',') : 'null'}`
    );
  }

  console.log('\ncoachNote (contract v1.8):');
  {
    const notedSession = collections.sessions.get('2026-11-09-2');
    console.log(`  sessions/2026-11-09-2: coachNote=${JSON.stringify(notedSession.coachNote)}`);
  }

  console.log('\nathletes.packageId (contract v2.0 — fitnessPackageId is gone, one pointer now):');
  for (const [id, doc] of collections.athletes) {
    console.log(`  athletes/${id}: packageId=${doc.packageId} householdId=${doc.householdId}`);
  }

  console.log('\nhouseholds.periodAnchorDay (contract v2.0, pin B):');
  for (const [id, doc] of collections.households) {
    console.log(`  households/${id}: periodAnchorDay=${doc.periodAnchorDay}`);
  }

  console.log('\nsessions.coachId on an upcoming booked training session (contract v1.9):');
  {
    const coachedSession = collections.sessions.get('2026-11-02-1');
    console.log(`  sessions/2026-11-02-1: coachId=${JSON.stringify(coachedSession.coachId)}`);
  }

  console.log('\nFirst generated Saturday (contract v2.0, pin J — 9/10/11/12/1 + the adult entry):');
  {
    // Scan for the first date carrying an 'adult' block — that is Saturday,
    // by construction (only blocksForDay(SAT) ever emits `type: 'adult'`).
    const byDate = new Map();
    for (const [id, doc] of collections.sessions) {
      if (doc.type === 'adult' || ['training', 'tournament'].includes(doc.type)) {
        const list = byDate.get(doc.date) || [];
        list.push([id, doc]);
        byDate.set(doc.date, list);
      }
    }
    const firstSatDate = [...byDate.keys()].sort().find((d) => (byDate.get(d) || []).some(([, doc]) => doc.type === 'adult'));
    for (const [id, doc] of (byDate.get(firstSatDate) || []).sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`  sessions/${id}: time=${doc.time} type=${doc.type} bookable=${doc.bookable} label=${JSON.stringify(doc.label)}`);
    }
  }

  console.log('\nparker household — contract v2.0 anchor-15 + Elite exercise:');
  {
    const parker = collections.households.get('parker');
    const sage = collections.athletes.get('sage-parker');
    console.log(`  households/parker: periodAnchorDay=${parker.periodAnchorDay}`);
    console.log(`  athletes/sage-parker: packageId=${sage.packageId} householdId=${sage.householdId}`);
  }

  console.log('\ntokenPeriods (contract v2.1, pin C):');
  for (const [id, doc] of collections.tokenPeriods) {
    console.log(
      `  tokenPeriods/${id}: granted=${doc.granted} source=${doc.source} eventId=${doc.eventId}` +
        ` periodKey=${doc.periodKey} periodEnd=${doc.periodEnd}`
    );
  }

  console.log('\ngraceTokens (contract v2.1, pin E):');
  for (const [id, doc] of collections.graceTokens) {
    console.log(
      `  graceTokens/${id}: athleteId=${doc.athleteId} reason=${doc.reason}` +
        ` sourceSessionId=${doc.sourceSessionId} expiresAt=${doc.expiresAt} createdBy=${doc.createdBy}`
    );
  }

  console.log('\nCancelled session + booking (contract v2.1, pin E/G — the grace token above is minted for this):');
  {
    const s = collections.sessions.get('2026-11-11-0');
    console.log(`  sessions/2026-11-11-0: status=${s.status} booked=${s.booked}/${s.capacity}`);
    const b = collections.bookings.get('reese_2026-11-11-0');
    console.log(`  bookings/reese_2026-11-11-0: status=${b.status} cancelledBy=${b.cancelledBy} cancelReason=${b.cancelReason}`);
  }

  console.log('\nFULL session + waitlist (contract v2.1, pin F — the ONE exception to capacity 15):');
  {
    const s = collections.sessions.get('2026-11-16-w0');
    console.log(`  sessions/2026-11-16-w0: capacity=${s.capacity} booked=${s.booked} status=${s.status}`);
    for (const athleteId of ['jordan', 'reese']) {
      const b = collections.bookings.get(`${athleteId}_2026-11-16-w0`);
      console.log(`  bookings/${athleteId}_2026-11-16-w0: status=${b.status} periodKey=${b.periodKey}`);
    }
    for (const [id, doc] of collections.waitlist) {
      console.log(`  waitlist/${id}: athleteId=${doc.athleteId} periodKey=${doc.periodKey} joinedAt=${doc.joinedAt.toISOString()}`);
    }
  }

  console.log('\nhouseholds.membership (contract v2.1, pin H):');
  for (const [id, doc] of collections.households) {
    console.log(`  households/${id}: membership=${doc.membership ? JSON.stringify(doc.membership) : 'absent (== active)'} stripeCustomerId=${doc.stripeCustomerId}`);
  }

  console.log('\nstripeEvents (contract v2.1, pin H):');
  for (const [id, doc] of collections.stripeEvents) {
    console.log(`  stripeEvents/${id}: type=${doc.type} customer=${doc.customer} householdId=${doc.householdId} outcome=${doc.outcome}`);
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
