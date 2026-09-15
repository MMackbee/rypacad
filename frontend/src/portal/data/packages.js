/**
 * 2026-27 package catalogue — CONFIRMED. Supersedes the placeholder TIERS in seed.js.
 *
 * The scaffold was built against revision 2 of the design handoff, which said
 * tier names, count and prices were undecided. They are decided. Registration's
 * "TIERS NOT DECIDED" caution banner and the dashed `$ ——` price slots should be
 * removed, and the tier cards should render from this file.
 *
 * The structural change that matters most: a package grants TWO separate monthly
 * allowances — training sessions and tournament entries. They do not substitute
 * for each other. An athlete can have training left with no tournaments
 * remaining, or the reverse. `TIER_RULE = { used, limit }` in seed.js models one
 * pool and needs to become two.
 */

// Sprint 11 (contract v1.9, pin C): entitlementsFor's mental (Yannick) cap
// is the same flat, owner-tunable knob the specialist booking gate already
// uses - one import, no re-declared constant to drift out of sync.
import { SPECIALIST_MONTHLY_CAP } from './specialists';

// `kind` (contract v1.1's own discriminator: 'golf' | 'drop-in' | 'fitness' |
// 'elite') is added to every entry below as of Sprint 11 (contract v1.9,
// pin C) - a pre-existing gap this lane found and fixed rather than carried
// forward: the FIELD has been in DATA-MODEL.md since v1.1 and every Firestore
// package doc has always carried it (db lane's provisioning bundles this
// catalogue "price stripped", per DATA-MODEL - kind was never stripped), but
// this STATIC catalogue itself never restated it, because nothing read it
// client-side before entitlementsFor's Elite branch needed `golf.kind ===
// 'elite'` to work in SEED mode too (live mode was always fine - it reads
// the real Firestore field). Values match the Firestore docs exactly.
/** Golf packages. `training` and `tournaments` are entitlements per month. */
export const GOLF_PACKAGES = [
  { id: 'g-4-2',  name: '4 + 2',  price: 260, training: 4,  tournaments: 2,  kind: 'golf' },
  { id: 'g-8-3',  name: '8 + 3',  price: 440, training: 8,  tournaments: 3,  kind: 'golf' },
  { id: 'g-12-4', name: '12 + 4', price: 600, training: 12, tournaments: 4,  kind: 'golf' },
  { id: 'g-16-4', name: '16 + 4', price: 740, training: 16, tournaments: 4,  kind: 'golf' },
];

/** Single session, no commitment. Priced at 1.5x the cheapest package rate on purpose. */
export const DROP_IN = { id: 'drop-in', name: 'Drop-in', price: 65, training: 1, tournaments: 0, kind: 'drop-in' };

/** Bought separately from the golf package, not bundled into it. */
export const FITNESS_PACKAGES = [
  { id: 'f-4',  name: '4 sessions',  price: 120, sessions: 4,  kind: 'fitness' },
  { id: 'f-8',  name: '8 sessions',  price: 200, sessions: 8,  kind: 'fitness' },
  { id: 'f-12', name: '12 sessions', price: 240, sessions: 12, kind: 'fitness' },
  { id: 'f-16', name: '16 sessions', price: 260, sessions: 16, kind: 'fitness' },
];

/**
 * Elite replaces a golf package + fitness add-on rather than stacking with them.
 * At $1,000 it equals the top golf package plus the top fitness package exactly,
 * with Phil and Yannick time on top — so at that level it is always the better buy.
 *
 * `philSessions: 16` (owner ruling, Sprint 11 amendment v1.9.1, 2026-09-15):
 * "Elite includes 16 Phil sessions a month." entitlementsFor's elite branch
 * below reads this directly as the monthly Phil limit — no more flat-cap
 * fallback for Elite athletes. `yannickSessions` stays OPEN/null: still
 * undecided, so Yannick's cap for an Elite athlete answers to the same flat
 * SPECIALIST_MONTHLY_CAP (data/specialists.js) every other athlete's does.
 * Whether 24/7 facility access is workable is also unconfirmed either way.
 */
export const ELITE_TIERS = [
  {
    id: 'elite',
    name: 'Elite',
    price: 1000,
    training: 16,
    tournaments: 4,
    philSessions: 16,
    yannickSessions: null,
    facility247: false,
    kind: 'elite',
  },
  {
    id: 'elite-247',
    name: 'Elite 24/7',
    price: 1250,
    training: 16,
    tournaments: 4,
    philSessions: 16,
    yannickSessions: null,
    facility247: true,
    kind: 'elite',
  },
];

/** Rate per session, for the comparison a parent actually makes. */
export function ratePerSession(pkg) {
  const units = (pkg.training || 0) + (pkg.tournaments || 0);
  return units ? pkg.price / units : 0;
}

/** Monthly total for a golf package plus an optional fitness add-on. */
export function monthlyTotal({ golf, fitness }) {
  return (golf ? golf.price : 0) + (fitness ? fitness.price : 0);
}

/**
 * The two-pool allowance. Replaces TIER_RULE.
 * `resetsOn` is the billing cycle date, not a rolling window.
 */
export function makeAllowance(pkg, { trainingUsed = 0, tournamentsUsed = 0, resetsOn }) {
  return {
    training:    { used: trainingUsed,    limit: pkg.training,    left: Math.max(0, pkg.training - trainingUsed) },
    tournaments: { used: tournamentsUsed, limit: pkg.tournaments, left: Math.max(0, pkg.tournaments - tournamentsUsed) },
    resetsOn,
  };
}

/**
 * Which pool a slot spends. Booking UI must show this before the athlete
 * commits. Sprint 9 pin (contract v1.7): a specialist 1-on-1 (session type
 * 'phil' | 'mental', data/specialists.js) spends its OWN pool, 'specialist'
 * — it never touches the training or tournament allowance, so the two-pool
 * model becomes three, still non-substitutable, and exclusion from the
 * older two pools is automatic (both derive their own spend by filtering on
 * their own pool value).
 */
export function poolFor(sessionType) {
  if (sessionType === 'tournament') return 'tournaments';
  if (sessionType === 'phil' || sessionType === 'mental') return 'specialist';
  return 'training';
}

/**
 * Every derived entitlement for one athlete in one calendar month — Sprint 11
 * pin C (contract v1.9). ENTITLEMENTS ARE DERIVED FROM PACKAGES, NEVER
 * STORED (the sprint's own design keystone): `athlete.packageId` and
 * `athlete.fitnessPackageId` are the only stored facts; this pure function
 * is the ONE place every "N of M left" on every surface (Membership,
 * SpecialistBooking's summary, live.js's booking-gate cap check) computes
 * from them, so none of those surfaces can ever disagree with each other or
 * with what booking itself allows.
 *
 * @param {object} athlete - `{ packageId, fitnessPackageId }` at minimum
 *   (a live Firestore doc or a seed-shaped stand-in). `fitnessPackageId` is
 *   read `?? null` — contract v1.9 pin A's "ABSENT == null everywhere" rule;
 *   pre-existing athlete docs carry no such field at all.
 * @param {Array} packages - every package doc this derivation might need
 *   (the athlete's golf package, and its fitness package if any) — a flat
 *   array, not a lookup keyed by caller, so both data modes can hand it
 *   whatever they already have in hand (Firestore docs live, the static
 *   catalogue in seed mode) without reshaping first. Missing/null entries
 *   are tolerated (a package that failed to resolve reads as "no package").
 * @param {Array} bookings - every one of the athlete's bookings, unfiltered
 *   (fetchBookings' own shape) - filtered and summed here, never pre-summed
 *   by the caller, so there is nothing to drift.
 * @param {string} monthISO - 'yyyy-MM', the calendar month this derivation
 *   answers for.
 *
 * training/tournaments: makeAllowance()'s UNCHANGED two-pool math, applied
 * with the SAME "date >= this month's 1st, no upper bound" cycle window
 * deriveAllowance() (hooks/index.js) already uses everywhere else in the
 * app — so Membership's numbers can never disagree with the dashboard's.
 *
 * phil: limit = the fitness package's `sessions` when fitnessPackageId is
 * set (source 'fitness'); else, if the golf package's kind == 'elite', the
 * golf package's OWN `philSessions` (Sprint 11 amendment v1.9.1 — Elite
 * carries a real Phil entitlement now, 16, not the flat specialist cap;
 * source 'elite'); else 0 (source 'none' — no fitness package on file).
 * `used` is the athlete's non-cancelled 'phil' bookings THIS calendar month
 * exactly (`date` sliced to 'yyyy-MM' — the specialist cap's own existing
 * convention, deliberately NOT the training/tournaments one-sided window
 * above; the two pools have always counted differently in this app, and
 * this function preserves both conventions rather than harmonizing them).
 *
 * mental: limit is ALWAYS SPECIALIST_MONTHLY_CAP — the flat knob stands
 * (owner ruling, v1.7.1: yannickSessions stays undecided even for Elite).
 * source 'flat'. `used` counted the same exact-month way as phil.
 *
 * Deliberately does NOT read ELITE_TIERS.yannickSessions anywhere — it
 * stays null/unsurfaced by design (data/specialists.js's own long-standing
 * rule, amendment v1.9.1 keeps it in force for Yannick only).
 */
export function entitlementsFor(athlete, packages, bookings, monthISO) {
  const byId = new Map((packages || []).filter(Boolean).map((p) => [p.id, p]));
  const golf = athlete && athlete.packageId ? byId.get(athlete.packageId) || null : null;
  const fitnessPackageId = (athlete && athlete.fitnessPackageId) ?? null;
  const fitness = fitnessPackageId ? byId.get(fitnessPackageId) || null : null;

  const rows = bookings || [];
  const nonCancelled = (b) => b.status !== 'cancelled';

  // training/tournaments: unchanged two-pool math, unchanged cycle window.
  const monthStart = `${monthISO}-01`;
  const cycleSpent = rows.filter((b) => nonCancelled(b) && b.date >= monthStart);
  const allowance = golf
    ? makeAllowance(golf, {
        trainingUsed: cycleSpent.filter((b) => b.pool === 'training').length,
        tournamentsUsed: cycleSpent.filter((b) => b.pool === 'tournaments').length,
        resetsOn: null,
      })
    : null;
  const training = allowance ? allowance.training : { used: 0, limit: 0, left: 0 };
  const tournaments = allowance ? allowance.tournaments : { used: 0, limit: 0, left: 0 };

  // phil/mental: exact-calendar-month window, matching the existing
  // specialist monthly cap check (live.js#assertWithinMonthlyCap).
  const usedInMonth = (type) =>
    rows.filter((b) => nonCancelled(b) && b.type === type && (b.date || '').slice(0, 7) === monthISO).length;

  const philUsed = usedInMonth('phil');
  let philLimit = 0;
  let philSource = 'none';
  if (fitness) {
    philLimit = fitness.sessions ?? 0;
    philSource = 'fitness';
  } else if (golf && golf.kind === 'elite') {
    philLimit = golf.philSessions ?? 0; // amendment v1.9.1 - Elite's own count, not the flat cap
    philSource = 'elite';
  }
  const phil = { used: philUsed, limit: philLimit, left: Math.max(0, philLimit - philUsed), source: philSource };

  const mentalUsed = usedInMonth('mental');
  const mental = {
    used: mentalUsed,
    limit: SPECIALIST_MONTHLY_CAP,
    left: Math.max(0, SPECIALIST_MONTHLY_CAP - mentalUsed),
    source: 'flat',
  };

  return { training, tournaments, phil, mental };
}
