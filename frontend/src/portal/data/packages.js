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

/** Golf packages. `training` and `tournaments` are entitlements per month. */
export const GOLF_PACKAGES = [
  { id: 'g-4-2',  name: '4 + 2',  price: 260, training: 4,  tournaments: 2 },
  { id: 'g-8-3',  name: '8 + 3',  price: 440, training: 8,  tournaments: 3 },
  { id: 'g-12-4', name: '12 + 4', price: 600, training: 12, tournaments: 4 },
  { id: 'g-16-4', name: '16 + 4', price: 740, training: 16, tournaments: 4 },
];

/** Single session, no commitment. Priced at 1.5x the cheapest package rate on purpose. */
export const DROP_IN = { id: 'drop-in', name: 'Drop-in', price: 65, training: 1, tournaments: 0 };

/** Bought separately from the golf package, not bundled into it. */
export const FITNESS_PACKAGES = [
  { id: 'f-4',  name: '4 sessions',  price: 120, sessions: 4 },
  { id: 'f-8',  name: '8 sessions',  price: 200, sessions: 8 },
  { id: 'f-12', name: '12 sessions', price: 240, sessions: 12 },
  { id: 'f-16', name: '16 sessions', price: 260, sessions: 16 },
];

/**
 * Elite replaces a golf package + fitness add-on rather than stacking with them.
 * At $1,000 it equals the top golf package plus the top fitness package exactly,
 * with Phil and Yannick time on top — so at that level it is always the better buy.
 *
 * OPEN: `philSessions` and `yannickSessions` are not set yet, and whether 24/7
 * access is workable is unconfirmed. Render these from the data so the counts can
 * be filled without touching layout. Do not invent numbers.
 */
export const ELITE_TIERS = [
  {
    id: 'elite',
    name: 'Elite',
    price: 1000,
    training: 16,
    tournaments: 4,
    philSessions: null,
    yannickSessions: null,
    facility247: false,
  },
  {
    id: 'elite-247',
    name: 'Elite 24/7',
    price: 1250,
    training: 16,
    tournaments: 4,
    philSessions: null,
    yannickSessions: null,
    facility247: true,
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

/** Which pool a slot spends. Booking UI must show this before the athlete commits. */
export function poolFor(sessionType) {
  return sessionType === 'tournament' ? 'tournaments' : 'training';
}
