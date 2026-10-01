/**
 * Who is next on a session's waitlist, and whether they may be booked
 * (contract v2.1 pin F; owner rulings 2026-10-01).
 *
 * ONE ORDER. portal/promotion.js promotes in the order `orderedCandidates`
 * returns, inside its transaction, and portal/waitlist-positions.js shows a
 * family the same order - so the place on the screen is the place the
 * server uses. Never write the order a second time.
 *
 * Rules are bypassed under the admin SDK, so every gate a normal booking
 * passes is applied here: membership not past_due/lapsed and the athlete
 * paid, a package, the booking window, Elite's one-per-type-per-day cap,
 * the period cap counted exactly as `tokensFor` counts it, and the
 * grace-first charge order. A promotion may never produce a booking a
 * normal tap would refuse.
 *
 * `reader` is whatever answers `get(refOrQuery)`: the transaction in a
 * promotion, `PLAIN` for a read-only caller.
 */

'use strict';

const lib = require('./lib');
const gates = require('./booking-gates');

/** Firestore's limit on the values of one `in` filter. */
const IN_LIMIT = 30;

/** A reader outside any transaction. */
const PLAIN = {get: (target) => target.get()};

/**
 * Milliseconds from a `joinedAt` that may be a Firestore Timestamp, a Date
 * or an ISO string (the seed writes one shape, the client another).
 * @param {*} value The stored `joinedAt`.
 * @return {number} Epoch millis; `Infinity` sorts an unusable value last.
 */
function joinedAtMillis(value) {
  if (!value) return Infinity;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Infinity;
}

/**
 * The bookings that spend one of these bonus tokens, in ANY billing period.
 * A bonus token lasts 30 days, so it is routinely spent on a session in the
 * period before or after the one being promoted into; reading only that
 * period's bookings made a spent token look unspent, and it was charged a
 * second time and jumped the line.
 * @param {!Object} reader The transaction, or `PLAIN`.
 * @param {!Object} store An admin Firestore.
 * @param {!Array<!Object>} graceTokens The athlete's `graceTokens` rows.
 * @param {string} today Today in America/Chicago.
 * @return {!Promise<!Array<!Object>>} `bookings` rows.
 */
async function graceSpends(reader, store, graceTokens, today) {
  const ids = graceTokens
      .filter((g) => !g.expiresAt || g.expiresAt >= today)
      .map((g) => g.id);
  const spends = [];
  for (let i = 0; i < ids.length; i += IN_LIMIT) {
    const snap = await reader.get(store.collection('bookings')
        .where('graceTokenId', 'in', ids.slice(i, i + IN_LIMIT)));
    spends.push(...lib.rows(snap));
  }
  return spends;
}

/**
 * Everything one waitlist entry's gates need. READ ONLY - a Firestore
 * transaction requires every read before any write, so the caller loads all
 * candidates first and only then decides and writes.
 * @param {!Object} reader The transaction, or `PLAIN`.
 * @param {!Object} store An admin Firestore.
 * @param {!Object} entry `{id, ...}` from the waitlist query.
 * @param {{sessionId: string, session: !Object, today: string, now: !Date}}
 *     ctx The session and the clock.
 * @return {!Promise<!Object>} A candidate: the entry, its gate verdict and,
 *     when it passes, the charge that would pay for it.
 */
async function loadCandidate(reader, store, entry, ctx) {
  const {session, sessionId, today} = ctx;
  const athleteId = entry.athleteId || null;
  const base = {
    entry, ok: false, reason: null, graceExpiry: null, athleteId,
    athlete: null, householdId: entry.householdId || null,
  };
  const fail = (reason) => Object.assign(base, {reason});
  if (!athleteId) return fail('no-athlete');

  const athleteSnap = await reader.get(
      store.collection('athletes').doc(athleteId));
  if (!athleteSnap.exists) return fail('no-athlete');
  const athlete = athleteSnap.data() || {};
  const householdId = athlete.householdId || entry.householdId || null;
  Object.assign(base, {athlete, householdId});

  let household = null;
  if (householdId) {
    const hhSnap = await reader.get(
        store.collection('households').doc(householdId));
    household = hhSnap.exists ? hhSnap.data() : null;
  }
  if (!lib.membershipAllowsBooking(household, athlete)) {
    return fail('membership-inactive');
  }

  // The period is derived from the SESSION's date and the household's own
  // anchor - never from the entry's stored periodKey, which a client wrote.
  const anchorDay = household && household.periodAnchorDay;
  const period = lib.periodFor(session.date, anchorDay);

  let pkg = null;
  if (athlete.packageId) {
    const pkgSnap = await reader.get(
        store.collection('packages').doc(athlete.packageId));
    pkg = pkgSnap.exists ? pkgSnap.data() : null;
  }
  if (!pkg) return fail('no-package');
  if (session.date >
      gates.openThrough(ctx.now, gates.windowDaysFor(pkg))) {
    return fail('outside-window');
  }

  const tpSnap = await reader.get(store.collection('tokenPeriods')
      .doc(lib.tokenPeriodId(athleteId, period.periodKey)));
  const tokenPeriod = tpSnap.exists ? tpSnap.data() : null;

  const bookingSnap = await reader.get(
      lib.periodBookingsQuery(store, athleteId, period));
  const bookings = lib.rows(bookingSnap);
  const already = bookings.find(
      (b) => b.id === lib.bookingId(athleteId, sessionId) &&
          b.status !== 'cancelled');
  if (already) return fail('already-booked');
  // The period read is a date range, so it holds every booking on the
  // session's own date.
  if (gates.eliteDailyCapHit(pkg, session.type, session.date, bookings)) {
    return fail('one-per-day');
  }

  const waitSnap = await reader.get(store.collection('waitlist')
      .where('athleteId', '==', athleteId));
  const graceSnap = await reader.get(store.collection('graceTokens')
      .where('athleteId', '==', athleteId));
  const graceTokens = lib.rows(graceSnap);
  // Only ever feeds the consumed set: `used` counts a row only when it is
  // in this period and has no graceTokenId, and every row here has one.
  const seen = new Set(bookings.map((b) => b.id));
  const spends = (await graceSpends(reader, store, graceTokens, today))
      .filter((b) => !seen.has(b.id));

  const position = lib.tokensPosition({
    pkg,
    tokenPeriod,
    bookings: bookings.concat(spends),
    // The entry being promoted IS the reservation now being spent, so it
    // must not also count against the cap it is paying into.
    waitlist: lib.rows(waitSnap).map((w) => ({
      id: w.id,
      periodKey: lib.periodFor(w.date || session.date, anchorDay).periodKey,
    })),
    ignoreWaitlistIds: [entry.id],
    graceTokens,
    periodKey: period.periodKey,
    today,
  });
  const charge = lib.chargeFor({position, sessionDate: session.date});
  if (!charge.chargedFrom) return fail(charge.reason || 'no-tokens-left');
  // Ordering key: the bonus token this candidate would actually spend.
  const spent = graceTokens.find((g) => g.id === charge.graceTokenId);
  return Object.assign(base, {
    ok: true,
    period,
    charge,
    graceExpiry: charge.chargedFrom === 'grace' ?
        (spent && spent.expiresAt) || '9999-12-31' : null,
  });
}

/**
 * The promotion order (pin F): entries whose athlete holds an unconsumed,
 * unexpired grace token first, soonest expiry first, then `joinedAt` asc.
 * "Grace holders first" is the old rollover priority under tokens - a family
 * the Academy already failed once goes to the front.
 * @param {!Array<!Object>} candidates Loaded candidates.
 * @return {!Array<!Object>} A new, ordered array.
 */
function orderCandidates(candidates) {
  return candidates.slice().sort((a, b) => {
    if (a.graceExpiry && !b.graceExpiry) return -1;
    if (!a.graceExpiry && b.graceExpiry) return 1;
    if (a.graceExpiry && b.graceExpiry && a.graceExpiry !== b.graceExpiry) {
      return a.graceExpiry < b.graceExpiry ? -1 : 1;
    }
    return joinedAtMillis(a.entry.joinedAt) - joinedAtMillis(b.entry.joinedAt);
  });
}

/**
 * A session's waitlist rows. Rides the `waitlist (sessionId, joinedAt)`
 * composite index.
 * @param {!Object} reader The transaction, or `PLAIN`.
 * @param {!Object} store An admin Firestore.
 * @param {string} sessionId The session.
 * @return {!Promise<!Array<!Object>>} `[{id, ...}]`, oldest join first.
 */
async function sessionEntries(reader, store, sessionId) {
  return lib.rows(await reader.get(store.collection('waitlist')
      .where('sessionId', '==', sessionId)
      .orderBy('joinedAt', 'asc')));
}

/**
 * A session's waitlist in the order promotion walks it, each entry with
 * its gate verdict. The one function both callers use.
 * @param {!Object} reader The transaction, or `PLAIN`.
 * @param {!Object} store An admin Firestore.
 * @param {{sessionId: string, session: !Object, entries: !Array<!Object>,
 *     today: string, now: !Date}} args The session, its waitlist rows
 *     (`[{id, ...}]`) and the clock.
 * @return {!Promise<!Array<!Object>>} Candidates, first in line first.
 */
async function orderedCandidates(reader, store, args) {
  const candidates = [];
  for (const entry of args.entries) {
    candidates.push(await loadCandidate(reader, store, entry, args));
  }
  return orderCandidates(candidates);
}

module.exports = {
  PLAIN,
  joinedAtMillis,
  loadCandidate,
  orderCandidates,
  orderedCandidates,
  sessionEntries,
};
