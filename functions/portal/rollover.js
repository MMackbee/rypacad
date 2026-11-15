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
 * SESSIONS BOOKED AHEAD (review 2026-11-15). A booking made before the
 * tokens existed - a December session booked in November - was charged to
 * the new period's own tokens. The same nightly run therefore SETTLES: each
 * free rolled-over token is put on the earliest token-paid booking of the
 * running period it can pay for (`settlePlan`), which hands that period's
 * own token back. Without it "spent first" would hold only for a family
 * that books late. Settling changes `chargedFrom` and `graceTokenId` on
 * the booking and nothing else, and sends nothing.
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
  // 06:00 sweep closes it), so only bookings count against the grant. A
  // booking counts by its DATE, not the `periodKey` it was written with:
  // the key is client-derived from the household's anchor day at the time,
  // and an anchor that moved since would leave every old booking uncounted
  // and roll the whole grant.
  const period = args.period;
  const inPeriod = (args.bookings || []).filter((b) => b && (!b.date ||
      (b.date >= period.periodKey && b.date <= period.periodEnd)));
  const position = lib.tokensPosition({
    pkg: args.pkg,
    tokenPeriod: args.tokenPeriod,
    bookings: inPeriod.map((b) => (b.date ?
        Object.assign({}, b, {periodKey: period.periodKey}) : b)),
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

const byDateThenId = (a, b) => (a.date === b.date ?
    String(a.id).localeCompare(String(b.id)) :
    String(a.date).localeCompare(String(b.date)));

/**
 * Which bookings of the running period the rolled-over tokens should be
 * paying for (ruling 1: they are spent FIRST). Pure.
 *
 * A booking made while the tokens did not exist yet - booked ahead, back in
 * the old period - was charged to the new period's own tokens. Left alone,
 * a family that books ahead would keep its rolled-over tokens for extra
 * sessions only and lose them, while a family that books late has them
 * spent first: the same month, two outcomes. So every free rolled-over
 * token is put on the earliest token-paid booking it can pay for, which
 * hands that booking's own-period token back.
 *
 * It also untangles a token that ended up on two bookings (two taps at the
 * same moment - the rules cannot count): the earliest keeps it, the others
 * take a free token, or go back onto the period.
 *
 * @param {{tokens: !Array<{id: string, expiresAt: string}>,
 *     bookings: !Array<!Object>, period: {periodKey: string}}} args The
 *     athlete's live rolled-over tokens and their bookings of the running
 *     period (`{id, ...data}`).
 * @return {!Array<{bookingId: string, graceTokenId: ?string}>} The changes:
 *     a token id to charge the booking to, or null for "the period".
 */
function settlePlan(args) {
  const tokens = (args.tokens || []).slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const ids = new Set(tokens.map((t) => t.id));
  const live = (args.bookings || []).filter((b) => b &&
      b.status !== 'cancelled').sort(byDateThenId);
  const holder = new Map();
  const displaced = [];
  for (const b of live) {
    if (!ids.has(b.graceTokenId)) continue;
    if (holder.has(b.graceTokenId)) displaced.push(b);
    else holder.set(b.graceTokenId, b);
  }
  const free = tokens.filter((t) => !holder.has(t.id));
  const displacedIds = new Set(displaced.map((b) => b.id));
  const payable = live.filter((b) => displacedIds.has(b.id) ||
      (b.status !== 'revoked' && !b.graceTokenId && b.comp !== true &&
      (b.chargedFrom || 'period') === 'period' &&
      b.date >= args.period.periodKey));
  const changes = [];
  const taken = new Set();
  for (const token of free) {
    const b = payable.find((x) => !taken.has(x.id) &&
        x.date <= token.expiresAt);
    if (!b) continue;
    taken.add(b.id);
    changes.push({bookingId: b.id, graceTokenId: token.id});
  }
  for (const b of displaced) {
    if (!taken.has(b.id)) changes.push({bookingId: b.id, graceTokenId: null});
  }
  return changes;
}

/**
 * Apply `settlePlan` for one athlete, in a transaction so the bookings are
 * read and rewritten as one. Only `chargedFrom` and `graceTokenId` change -
 * the two fields a booking made with the token in hand would carry.
 * @param {!Object} store An admin `Firestore`.
 * @param {{athleteId: string, period: !Object, current: !Object,
 *     today: string}} a The ended period, the running one and the day.
 * @return {!Promise<number>} How many bookings were re-charged.
 */
async function settleAthlete(store, a) {
  return store.runTransaction(async (tx) => {
    const graceSnap = await tx.get(store.collection('graceTokens')
        .where('athleteId', '==', a.athleteId));
    const tokens = lib.rows(graceSnap).filter((g) =>
      isRolloverTokenId(g.id) && g.sourcePeriodKey === a.period.periodKey &&
        g.expiresAt && g.expiresAt >= a.today);
    if (tokens.length === 0) return 0;
    const bookingSnap = await tx.get(
        lib.periodBookingsQuery(store, a.athleteId, a.current));
    const changes = settlePlan({tokens, bookings: lib.rows(bookingSnap),
      period: a.current});
    for (const c of changes) {
      tx.update(store.collection('bookings').doc(c.bookingId),
          c.graceTokenId ?
              {chargedFrom: 'grace', graceTokenId: c.graceTokenId} :
              {chargedFrom: 'period', graceTokenId: FieldValue.delete()});
    }
    if (changes.length > 0) {
      console.log(`runTokenRollover settle ${a.athleteId}: ` +
          changes.map((c) => `${c.bookingId}->${c.graceTokenId || 'period'}`)
              .join(' '));
    }
    return changes.length;
  });
}

/**
 * Roll one athlete's ended period, if anything rolls, then settle the
 * rolled-over tokens onto the running period's bookings.
 * @param {!Object} store An admin `Firestore`.
 * @param {{athleteId: string, athlete: !Object, today: string,
 *     households: function(?string): !Promise<?Object>,
 *     packages: function(?string): !Promise<?Object>}} a The athlete.
 * @return {!Promise<{created: number, recharged: number}>} Tokens created
 *     and bookings re-charged.
 */
async function rollAthlete(store, a) {
  const nothing = {created: 0, recharged: 0};
  const {athleteId, athlete, today} = a;
  const pkg = await a.packages(athlete.packageId);
  if (!isMonthlyTokens(pkg)) return nothing;
  const household = await a.households(athlete.householdId);
  const anchorDay = household && household.periodAnchorDay;
  const period = previousPeriod(today, anchorDay);
  // The cheap refusals first, before any per-athlete read.
  const early = rolloverPlan({athlete, household, pkg, period, anchorDay,
    today, tokenPeriod: {granted: 0}, bookings: []});
  if (early.skip) return nothing;
  const [tpSnap, bookingSnap] = await Promise.all([
    store.collection('tokenPeriods')
        .doc(lib.tokenPeriodId(athleteId, period.periodKey)).get(),
    lib.periodBookingsQuery(store, athleteId, period).get(),
  ]);
  const plan = rolloverPlan({athlete, household, pkg, period, anchorDay,
    today, tokenPeriod: tpSnap.exists ? tpSnap.data() : null,
    bookings: lib.rows(bookingSnap)});
  if (plan.skip || plan.count === 0) return nothing;
  const created = await mintMissing(store, {athleteId,
    householdId: athlete.householdId || null, periodKey: period.periodKey,
    count: plan.count, expiresAt: plan.expiresAt});
  const recharged = await settleAthlete(store, {athleteId, period,
    current: lib.periodFor(today, anchorDay), today});
  return {created, recharged};
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
  const summary = {today, considered: 0, athletes: 0, minted: 0,
    recharged: 0, errors: 0};
  const households = cachedReader(store, 'households');
  const packages = cachedReader(store, 'packages');
  const snap = await store.collection('athletes').get();
  for (const doc of snap.docs) {
    const athlete = doc.data() || {};
    if (!athlete.packageId) continue;
    summary.considered += 1;
    try {
      const {created, recharged} = await rollAthlete(store, {
        athleteId: doc.id, athlete, today, households, packages});
      if (created > 0) {
        summary.athletes += 1;
        summary.minted += created;
      }
      summary.recharged += recharged;
    } catch (err) {
      summary.errors += 1;
      console.error('runTokenRollover error:', doc.id, err);
    }
  }
  console.log(`runTokenRollover ${today}: considered=${summary.considered} ` +
      `athletes=${summary.athletes} minted=${summary.minted} ` +
      `recharged=${summary.recharged} errors=${summary.errors}`);
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
  settlePlan,
  tokenIdFor,
};
