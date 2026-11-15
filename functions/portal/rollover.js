/**
 * One-month rollover of unused monthly tokens (owner ruling 2026-11-15:
 * "lets let them roll over 1 mo"). A token left unused when its period ends
 * is good for the period that follows, then gone: November's leftovers are
 * usable through Dec 31, not in January.
 *
 * HOW. Nothing about a period's own count changes. Once a period has ended,
 * the daily job mints one `graceTokens/rollover_{athleteId}_{periodKey}_{n}`
 * per unused token (reason 'rollover'), expiring on the next period's last
 * day. From there the existing grace-token machinery does the rest, on the
 * client, in the rules and in every server writer, untouched: a grace token
 * is spent before a period token, soonest expiry first (lib.chargeFor), so
 * the older, rolled-over tokens go first; the rules already anchor a booking
 * to an own, unexpired token (bookingGraceOk); a cancel frees the token with
 * its use-by date unchanged; and it never rolls twice, because a grace token
 * simply expires.
 *
 * The owner's five rulings (2026-11-15):
 *   1. rolled-over tokens are spent first (grace-first, above);
 *   2. a family whose payment failed, who cancelled or never paid gets none
 *      (`lib.membershipAllowsBooking` at mint time; the job looks again every
 *      day, so a card fixed on the 3rd is given its rollover on the 4th);
 *   3. January's leftovers are good through the season end (Feb 27);
 *      February's end with the season;
 *   4. tokens the academy issued by hand roll like paid ones (the count is
 *      the period's issued grant, whoever wrote it);
 *   5. it starts with November's leftovers on Dec 1 (FIRST_ROLLING_END).
 *
 * Only an ISSUED period rolls (a `tokenPeriods` doc): the package-count
 * fallback the booking screens use for a period nobody has paid for yet must
 * never mint tokens. Elite holds no tokens and the single token is already
 * good all season, so neither rolls.
 *
 * `runTokenRollover` is a plain function taking a fixed clock, like the jobs
 * in portal/jobs.js; index.js wraps it in a schedule.
 */

'use strict';

const admin = require('firebase-admin');
const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const {SEASON_END} = require('./single');

/** Every rolled-over token's id starts with this. @const {string} */
const TOKEN_PREFIX = 'rollover_';
/** `graceTokens.reason` (and `createdBy`) of a rolled-over token. */
const REASON = 'rollover';
/**
 * The first period end that rolls (ruling 5): November 2026. A period that
 * ends before it - October, or an off-anchor period closing mid-November -
 * expires the way every period did before the ruling.
 */
const FIRST_ROLLING_END = '2026-11-30';
/** No period grants more (firestore.rules tokenPeriodShapeOk). */
const MAX_PER_PERIOD = 40;
/** gRPC ALREADY_EXISTS, what `create()` rejects with on a taken id. */
const ALREADY_EXISTS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string} iso `'YYYY-MM-DD'`.
 * @return {string} The day before, on UTC-noon arithmetic.
 */
function dayBefore(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12) - DAY_MS)
      .toISOString().slice(0, 10);
}

/**
 * The id of the n-th token rolled out of one period. Deterministic, so the
 * id IS the idempotency key: a second run finds it and writes nothing.
 * @param {string} athleteId The athlete.
 * @param {string} periodKey The period the token was left unused in.
 * @param {number} n 1-based.
 * @return {string} `rollover_{athleteId}_{periodKey}_{n}`.
 */
function tokenIdFor(athleteId, periodKey, n) {
  return `${TOKEN_PREFIX}${athleteId}_${periodKey}_${n}`;
}

/**
 * @param {*} id A graceTokens id (or a booking's `graceTokenId`).
 * @return {boolean} True for a rolled-over token's id.
 */
function isRolloverTokenId(id) {
  return typeof id === 'string' && id.length > TOKEN_PREFIX.length &&
      id.startsWith(TOKEN_PREFIX);
}

/**
 * The last day a token left unused in `period` can still be spent: the end
 * of the period after it, capped at the season end. Null when the period
 * does not roll - it ended before the ruling's first month, or the season
 * is over by the time it ends (February).
 * CHANGE ONE, CHANGE BOTH: frontend/src/portal/data/rollover.js rollsUntil.
 * @param {?{periodKey: string, periodEnd: string}} period The period.
 * @param {number=} anchorDay The household anchor.
 * @return {?string} `'YYYY-MM-DD'` or null.
 */
function rollsUntil(period, anchorDay) {
  if (!period || !period.periodKey || !period.periodEnd) return null;
  if (period.periodEnd < FIRST_ROLLING_END) return null;
  const next = lib.nextPeriod(period.periodKey, anchorDay).periodEnd;
  const until = next < SEASON_END ? next : SEASON_END;
  return until > period.periodEnd ? until : null;
}

/**
 * The period that ended just before the one `today` falls in.
 * @param {string} today `'YYYY-MM-DD'` in Chicago.
 * @param {number=} anchorDay The household anchor.
 * @return {{periodKey: string, periodEnd: string}} The ended period.
 */
function previousPeriod(today, anchorDay) {
  const current = lib.periodFor(today, anchorDay);
  return lib.periodFor(dayBefore(current.periodKey), anchorDay);
}

/**
 * A monthly token package: a finite count per period. Not Elite (unlimited)
 * and not the single token (bought one at a time, good all season).
 * @param {?Object} pkg A `packages/{id}` body.
 * @return {boolean} True when the package's tokens can roll.
 */
function isMonthlyTokens(pkg) {
  return Boolean(pkg) && Number.isFinite(pkg.tokens) && pkg.kind !== 'single';
}

/**
 * How many tokens roll out of one ended period for one athlete. Pure.
 * @param {{athlete: ?Object, household: ?Object, pkg: ?Object,
 *     tokenPeriod: ?Object, bookings: !Array<!Object>,
 *     period: {periodKey: string, periodEnd: string}, anchorDay: *,
 *     today: string}} args The athlete's documents for the ended period:
 *     its issued `tokenPeriods` doc (null when none) and its bookings.
 * @return {{count: number, expiresAt: ?string, skip: ?string}} `count`
 *     tokens to hold as `rollover_..._1..count`, good through `expiresAt`;
 *     `skip` names why nothing rolls ('not-monthly' | 'not-active' |
 *     'no-rollover' | 'not-issued'), null otherwise.
 */
function rolloverPlan(args) {
  const none = (skip) => ({count: 0, expiresAt: null, skip});
  if (!isMonthlyTokens(args.pkg)) return none('not-monthly');
  if (!lib.membershipAllowsBooking(args.household, args.athlete)) {
    return none('not-active');
  }
  const expiresAt = rollsUntil(args.period, args.anchorDay);
  if (!expiresAt || expiresAt < args.today) return none('no-rollover');
  const issued = args.tokenPeriod && args.tokenPeriod.granted;
  if (!Number.isInteger(issued)) return none('not-issued');
  // The period is over: a waitlist entry in it holds nothing any more (the
  // 06:00 sweep closes it), so only bookings count against the grant.
  const position = lib.tokensPosition({
    pkg: args.pkg,
    tokenPeriod: args.tokenPeriod,
    bookings: args.bookings || [],
    waitlist: [],
    graceTokens: [],
    periodKey: args.period.periodKey,
    today: args.today,
  });
  const count = Math.min(MAX_PER_PERIOD, Math.max(0, position.left || 0));
  return {count, expiresAt, skip: null};
}

/**
 * The `graceTokens` body of one rolled-over token. The shape every other
 * grace token has, plus `sourcePeriodKey` (the month it came from).
 * @param {{athleteId: string, householdId: ?string, expiresAt: string,
 *     periodKey: string}} a The token.
 * @return {!Object} The document body.
 */
function rolloverTokenDoc(a) {
  return {
    athleteId: a.athleteId,
    householdId: a.householdId || null,
    expiresAt: a.expiresAt,
    reason: REASON,
    sourceSessionId: null,
    sourcePeriodKey: a.periodKey,
    createdBy: REASON,
    createdAt: FieldValue.serverTimestamp(),
  };
}

/**
 * A memoized document reader.
 * @param {!Object} store An admin `Firestore`.
 * @param {string} collection The collection.
 * @return {function(?string): !Promise<?Object>} The reader.
 */
function cachedReader(store, collection) {
  const cache = new Map();
  return async (id) => {
    if (!id) return null;
    if (!cache.has(id)) {
      const snap = await store.collection(collection).doc(id).get();
      cache.set(id, snap.exists ? snap.data() : null);
    }
    return cache.get(id);
  };
}

/**
 * Create the tokens `1..count` that do not exist yet.
 * @param {!Object} store An admin `Firestore`.
 * @param {{athleteId: string, householdId: ?string, periodKey: string,
 *     count: number, expiresAt: string}} a The plan for one athlete.
 * @return {!Promise<number>} How many were created.
 */
async function mintMissing(store, a) {
  const refs = [];
  for (let n = 1; n <= a.count; n += 1) {
    refs.push(store.collection('graceTokens')
        .doc(tokenIdFor(a.athleteId, a.periodKey, n)));
  }
  if (refs.length === 0) return 0;
  const snaps = await store.getAll(...refs);
  let created = 0;
  for (let i = 0; i < refs.length; i += 1) {
    if (snaps[i].exists) continue;
    try {
      await refs[i].create(rolloverTokenDoc(a));
      created += 1;
    } catch (err) {
      // Another run got there first: the token exists, which is the goal.
      const taken = err && (err.code === ALREADY_EXISTS ||
          /already exists/i.test(String(err.message)));
      if (!taken) throw err;
    }
  }
  return created;
}

/**
 * Roll one athlete's ended period, if anything rolls.
 * @param {!Object} store An admin `Firestore`.
 * @param {{athleteId: string, athlete: !Object, today: string,
 *     households: function(?string): !Promise<?Object>,
 *     packages: function(?string): !Promise<?Object>}} a The athlete.
 * @return {!Promise<number>} How many tokens were created.
 */
async function rollAthlete(store, a) {
  const {athleteId, athlete, today} = a;
  const pkg = await a.packages(athlete.packageId);
  if (!isMonthlyTokens(pkg)) return 0;
  const household = await a.households(athlete.householdId);
  const anchorDay = household && household.periodAnchorDay;
  const period = previousPeriod(today, anchorDay);
  // The cheap refusals first, before any per-athlete read.
  const early = rolloverPlan({athlete, household, pkg, period, anchorDay,
    today, tokenPeriod: {granted: 0}, bookings: []});
  if (early.skip) return 0;
  const [tpSnap, bookingSnap] = await Promise.all([
    store.collection('tokenPeriods')
        .doc(lib.tokenPeriodId(athleteId, period.periodKey)).get(),
    lib.periodBookingsQuery(store, athleteId, period).get(),
  ]);
  const plan = rolloverPlan({athlete, household, pkg, period, anchorDay,
    today, tokenPeriod: tpSnap.exists ? tpSnap.data() : null,
    bookings: lib.rows(bookingSnap)});
  if (plan.count === 0) return 0;
  return mintMissing(store, {athleteId,
    householdId: athlete.householdId || null, periodKey: period.periodKey,
    count: plan.count, expiresAt: plan.expiresAt});
}

/**
 * Daily, just after midnight America/Chicago: give every paid monthly token
 * athlete the tokens left unused in the period that just ended, as
 * rolled-over tokens good through the period now running. Looks at the
 * ended period again on every run of the month, so a late change is picked
 * up (a card fixed, a token staff handed back) and a failed run heals
 * itself. A run that finds every token already there writes nothing.
 * @param {{now: (?Date|undefined), db: (?Object|undefined)}=} args The fixed
 *     clock and Firestore.
 * @return {!Promise<{today: string, considered: number, athletes: number,
 *     minted: number, errors: number}>} A summary.
 */
async function runTokenRollover(args) {
  const a = args || {};
  const now = a.now instanceof Date ? a.now : new Date();
  const store = a.db || admin.firestore();
  const today = lib.todayISO(now);
  const summary = {today, considered: 0, athletes: 0, minted: 0, errors: 0};
  const households = cachedReader(store, 'households');
  const packages = cachedReader(store, 'packages');
  const snap = await store.collection('athletes').get();
  for (const doc of snap.docs) {
    const athlete = doc.data() || {};
    if (!athlete.packageId) continue;
    summary.considered += 1;
    try {
      const created = await rollAthlete(store, {athleteId: doc.id, athlete,
        today, households, packages});
      if (created > 0) {
        summary.athletes += 1;
        summary.minted += created;
      }
    } catch (err) {
      summary.errors += 1;
      console.error('runTokenRollover error:', doc.id, err);
    }
  }
  console.log(`runTokenRollover ${today}: considered=${summary.considered} ` +
      `athletes=${summary.athletes} minted=${summary.minted} ` +
      `errors=${summary.errors}`);
  return summary;
}

module.exports = {
  FIRST_ROLLING_END,
  REASON,
  isMonthlyTokens,
  isRolloverTokenId,
  previousPeriod,
  rolloverPlan,
  rolloverTokenDoc,
  rollsUntil,
  runTokenRollover,
  tokenIdFor,
};
