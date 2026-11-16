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
 * Only a period ON RECORD rolls (a `tokenPeriods` doc): the package-count
 * fallback the booking screens use for a period nobody has paid for yet must
 * never mint tokens after the fact - a family that joins or pays in December
 * gets nothing out of November.
 *
 * A RUNNING period without a record (owner 2026-11-16, the Schmidt case:
 * "she clearly has the tokens"). The screens count such a period at the
 * package's own number and let an active family book with it - an athlete
 * on a paused legacy subscription has no `tokenPeriods` doc - so to the
 * family those tokens are real, and nobody should have to issue the month
 * by hand for them to roll. So the same nightly run PUTS THE RUNNING PERIOD
 * ON RECORD at the package's count (`packageRecord`, source 'package') for
 * every monthly token athlete whose membership may book and who has no
 * record - but only when the package count really stands for a paid month
 * (`packageCountStands`): from the period's third day on (by then the 1st's
 * payment has either written the record itself or frozen the membership),
 * and only for an athlete whose billing was ALREADY active before the
 * period began (`memberBefore`). A family that signs up on Nov 29 pays for
 * December - its billing turned active inside November, so November is
 * never recorded - and an athlete with no billing on file gets none either.
 * A test athlete and one with no household are skipped. `rollTokenAhead`
 * applies the same test when it relies on the count. A Stripe payment or an
 * ops Issue overwrites the record as before, and while the record is still
 * the package's ('package'), the nightly run keeps it at the athlete's
 * current package count.
 *
 * Elite holds no tokens and the single token is already good all season, so
 * neither rolls.
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
 * A running period with no record is counted at the package's number from
 * this many days after it starts (see the header).
 */
const FALLBACK_AFTER_DAYS = 2;
/** `tokenPeriods.source` of a record written from the package count. */
const PACKAGE_SOURCE = 'package';

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
 * @param {string} iso `'YYYY-MM-DD'`.
 * @param {number} days Whole days to add.
 * @return {string} That many days later, on UTC-noon arithmetic.
 */
function addDays(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12) + days * DAY_MS)
      .toISOString().slice(0, 10);
}

/**
 * Whether a RUNNING period that has no `tokenPeriods` doc may be counted at
 * the package's own number: from its third day on.
 * CHANGE ONE, CHANGE BOTH: frontend/src/portal/data/rollover.js
 * fallbackStands.
 * @param {?{periodKey: string}} period The running period.
 * @param {string} today `'YYYY-MM-DD'` in Chicago.
 * @return {boolean} True when the package count stands in for the record.
 */
function fallbackStands(period, today) {
  return Boolean(period && period.periodKey) &&
      today >= addDays(period.periodKey, FALLBACK_AFTER_DAYS);
}

/**
 * Whether the athlete was already a paying member when `period` began:
 * billing on file, active, and last changed BEFORE the period's first day.
 * A sign-up, a payment, a failure or a re-start inside the period all move
 * `billing.updatedAt` into it, and each of those either writes the record
 * itself or is not a month the package count can stand for.
 * @param {?Object} athlete An `athletes/{id}` body.
 * @param {?{periodKey: string}} period The period.
 * @return {boolean} True when billing was active before the period began.
 */
function memberBefore(athlete, period) {
  const billing = athlete && athlete.billing;
  if (!billing || billing.status !== 'active' || !billing.updatedAt) {
    return false;
  }
  if (!period || !period.periodKey) return false;
  const at = billing.updatedAt;
  const when = typeof at.toDate === 'function' ? at.toDate() : new Date(at);
  if (Number.isNaN(when.getTime())) return false;
  return lib.chicagoDate(when) < period.periodKey;
}

/**
 * Whether a RUNNING period with no `tokenPeriods` doc is counted at the
 * package's own number for this athlete (see the header): third day on, a
 * member since before the period, a household on file, not a test athlete.
 * CHANGE ONE, CHANGE BOTH: frontend/src/portal/data/rollover.js
 * packageCountStands.
 * @param {{athlete: ?Object, period: ?Object, today: string}} a The
 *     athlete, the running period and the Chicago date.
 * @return {boolean} True when the package count stands in for the record.
 */
function packageCountStands(a) {
  const athlete = a.athlete;
  return Boolean(athlete) && athlete.test !== true &&
      Boolean(athlete.householdId) && fallbackStands(a.period, a.today) &&
      memberBefore(athlete, a.period);
}

/**
 * The `tokenPeriods` body that puts a period on record at the package's own
 * count - the number the screens showed for it all along.
 * @param {{athleteId: string, householdId: ?string, pkg: ?Object,
 *     period: {periodKey: string, periodEnd: string}, by: string}} a The
 *     athlete, the period and who relied on the count.
 * @return {!Object} The document body.
 */
function packageRecord(a) {
  return {
    athleteId: a.athleteId,
    householdId: a.householdId || null,
    periodKey: a.period.periodKey,
    periodEnd: a.period.periodEnd,
    granted: lib.periodFallback(a.pkg),
    source: PACKAGE_SOURCE,
    eventId: null,
    recordedBy: a.by,
    createdAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Create a document unless it is already there.
 * @param {!Object} ref The document reference.
 * @param {!Object} body The body.
 * @return {!Promise<boolean>} True when it was created.
 */
async function createOnce(ref, body) {
  try {
    await ref.create(body);
    return true;
  } catch (err) {
    // Another run got there first: the document exists, which is the goal.
    const taken = err && (err.code === ALREADY_EXISTS ||
        /already exists/i.test(String(err.message)));
    if (!taken) throw err;
    return false;
  }
}

/**
 * Put the RUNNING period on record at the package's count for one athlete
 * who has no record of it (see the header). Only a period that rolls needs
 * one.
 * @param {!Object} store An admin `Firestore`.
 * @param {{athleteId: string, athlete: !Object, household: ?Object,
 *     pkg: !Object, anchorDay: *, today: string}} a A monthly token
 *     athlete.
 * @return {!Promise<number>} 1 when a record was written, else 0.
 */
async function recordRunningPeriod(store, a) {
  if (!lib.membershipAllowsBooking(a.household, a.athlete)) return 0;
  if (a.household && a.household.test === true) return 0;
  const period = lib.periodFor(a.today, a.anchorDay);
  if (!packageCountStands({athlete: a.athlete, period, today: a.today})) {
    return 0;
  }
  if (!rollsUntil(period, a.anchorDay)) return 0;
  const ref = store.collection('tokenPeriods')
      .doc(lib.tokenPeriodId(a.athleteId, period.periodKey));
  const snap = await ref.get();
  const count = lib.periodFallback(a.pkg);
  if (snap.exists) {
    // A record that is still the package's follows the athlete's package:
    // without one the count always did (a staff package change mid-month).
    const have = snap.data() || {};
    if (have.source !== PACKAGE_SOURCE || have.granted === count) return 0;
    await ref.update({granted: count});
    console.log(`runTokenRollover re-counted ${a.athleteId} ` +
        `${period.periodKey}: ${have.granted} -> ${count}`);
    return 1;
  }
  const made = await createOnce(ref, packageRecord({athleteId: a.athleteId,
    householdId: a.athlete.householdId, pkg: a.pkg, period, by: REASON}));
  if (made) {
    console.log(`runTokenRollover recorded ${a.athleteId} ` +
        `${period.periodKey} at the package count`);
  }
  return made ? 1 : 0;
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
 * One period's bookings, picked by DATE and re-keyed to the period, the way
 * the rollover counts them (see rolloverPlan).
 * @param {?Array<!Object>} bookings The athlete's booking rows.
 * @param {{periodKey: string, periodEnd: string}} period The period.
 * @return {!Array<!Object>} The rows of that period, `periodKey` set to it.
 */
function bookingsOfPeriod(bookings, period) {
  return (bookings || []).filter((b) => b && (!b.date ||
      (b.date >= period.periodKey && b.date <= period.periodEnd)))
      .map((b) => (b.date ?
          Object.assign({}, b, {periodKey: period.periodKey}) : b));
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
  // No grace tokens are passed: a token rolled out early
  // (portal/roll-ahead.js) is one of the `1..count` this plan names, not
  // something to take off the count.
  const position = lib.tokensPosition({
    pkg: args.pkg,
    tokenPeriod: args.tokenPeriod,
    bookings: bookingsOfPeriod(args.bookings, args.period),
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
    if (await createOnce(refs[i], rolloverTokenDoc(a))) created += 1;
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
 * A token rolled EARLY (portal/roll-ahead.js) may already be paying for a
 * session outside the running period - one in its own month. `spends` are
 * the bookings of ANY period that hold one of the tokens: such a token is
 * taken, not free, or it would pay twice.
 *
 * @param {{tokens: !Array<{id: string, expiresAt: string}>,
 *     bookings: !Array<!Object>, spends: (!Array<!Object>|undefined),
 *     period: {periodKey: string}}} args The athlete's live rolled-over
 *     tokens, their bookings of the running period (`{id, ...data}`) and
 *     the bookings of any period that spent one of the tokens.
 * @return {!Array<{bookingId: string, graceTokenId: ?string}>} The changes:
 *     a token id to charge the booking to, or null for "the period".
 */
function settlePlan(args) {
  const tokens = (args.tokens || []).slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const ids = new Set(tokens.map((t) => t.id));
  const live = (args.bookings || []).filter((b) => b &&
      b.status !== 'cancelled').sort(byDateThenId);
  const running = new Set(live.map((b) => b.id));
  const elsewhere = (args.spends || []).filter((b) => b &&
      b.status !== 'cancelled' && !running.has(b.id));
  const holder = new Map();
  const displaced = [];
  // Earliest session keeps the token. Only a booking of the running period
  // is ever moved off it; one in another period is left as it is.
  for (const b of live.concat(elsewhere).sort(byDateThenId)) {
    if (!ids.has(b.graceTokenId)) continue;
    if (!holder.has(b.graceTokenId)) holder.set(b.graceTokenId, b);
    else if (running.has(b.id)) displaced.push(b);
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
    // Where each token is already spent, in ANY period (2026-11-16).
    const spends = await lib.readGraceSpends((q) => tx.get(q),
        lib.graceSpendQueries(store, tokens, a.today));
    const changes = settlePlan({tokens, bookings: lib.rows(bookingSnap),
      spends, period: a.current});
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
 * @return {!Promise<{created: number, recharged: number,
 *     recorded: number}>} Tokens created, bookings re-charged, and 1 when
 *     the running period was put on record.
 */
async function rollAthlete(store, a) {
  const {athleteId, athlete, today} = a;
  const pkg = await a.packages(athlete.packageId);
  if (!isMonthlyTokens(pkg)) return {created: 0, recharged: 0, recorded: 0};
  const household = await a.households(athlete.householdId);
  const anchorDay = household && household.periodAnchorDay;
  // Its own catch: a failed record must not cost the athlete tonight's
  // rollover and settle.
  let recorded = 0;
  try {
    recorded = await recordRunningPeriod(store, {athleteId, athlete,
      household, pkg, anchorDay, today});
  } catch (err) {
    console.error('runTokenRollover record error:', athleteId, err);
  }
  const nothing = {created: 0, recharged: 0, recorded};
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
  return {created, recharged, recorded};
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
    recharged: 0, recorded: 0, errors: 0};
  const households = cachedReader(store, 'households');
  const packages = cachedReader(store, 'packages');
  const snap = await store.collection('athletes').get();
  for (const doc of snap.docs) {
    const athlete = doc.data() || {};
    if (!athlete.packageId) continue;
    summary.considered += 1;
    try {
      const {created, recharged, recorded} = await rollAthlete(store, {
        athleteId: doc.id, athlete, today, households, packages});
      if (created > 0) {
        summary.athletes += 1;
        summary.minted += created;
      }
      summary.recharged += recharged;
      summary.recorded += recorded;
    } catch (err) {
      summary.errors += 1;
      console.error('runTokenRollover error:', doc.id, err);
    }
  }
  console.log(`runTokenRollover ${today}: considered=${summary.considered} ` +
      `athletes=${summary.athletes} minted=${summary.minted} ` +
      `recharged=${summary.recharged} recorded=${summary.recorded} ` +
      `errors=${summary.errors}`);
  return summary;
}

module.exports = {
  FIRST_ROLLING_END,
  REASON,
  bookingsOfPeriod,
  fallbackStands,
  isMonthlyTokens,
  memberBefore,
  packageCountStands,
  packageRecord,
  isRolloverTokenId,
  previousPeriod,
  rolloverPlan,
  rolloverTokenDoc,
  rollsUntil,
  runTokenRollover,
  settlePlan,
  tokenIdFor,
};
