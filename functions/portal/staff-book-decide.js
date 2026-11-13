/**
 * The staffBookSession decision (spec 2026-11-13 section 9.1): may the
 * owner or ops add this athlete to that session, and what pays for the
 * seat. Pure - portal/staff-book.js reads everything inside its
 * transaction, asks here, then writes.
 *
 * The first failing check wins, in the order of the spec's table (the
 * caller, the athlete and household, the session, the period on the
 * Chicago clock, an existing row, payment, the charge) and `full` last, so
 * the overfill question is always the final confirm before anything
 * commits.
 *
 * Staff skip the family window, the handicap-only block and Elite's
 * one-a-day, and may add into today's or an earlier session of the open
 * billing period: each skip is reported in `overrides`
 * (portal/staff-gates.js), never refused.
 *
 * The charge is the family order (`lib.chargeFor`: Elite, then the
 * soonest-expiring grace token valid on the session date, then the
 * period), over the SESSION's period, so a next-period add spends a
 * next-period token. Free writes `comp: true` and spends nothing on any
 * package; an unpaid athlete can only be added Free.
 */

'use strict';

const lib = require('./lib');
const {goodId, isStaff} = require('./staff-cancel-decide');
const {positionFor} = require('./move-decide');
const {capacityOf, periodOver, staffOverrides, takenOf} =
    require('./staff-gates');

const PRE = 'failed-precondition';

/**
 * Every refusal the callable can give, in the order the checks run, with
 * the HttpsError code and a short staff-facing message (no names). The
 * app maps `reason` to its own copy.
 * @const {!Object<string, {code: string, message: string}>}
 */
const REFUSALS = {
  'signed-out': {code: 'unauthenticated', message: 'Sign in to continue.'},
  'bad-request': {code: 'invalid-argument',
    message: 'Pick an athlete and a session.'},
  'not-staff': {code: 'permission-denied',
    message: 'Only the owner or ops can add a booking here.'},
  'athlete-missing': {code: 'not-found',
    message: 'That athlete isn\'t there any more.'},
  'no-household': {code: PRE,
    message: 'This athlete has no family on file.'},
  'test-athlete': {code: PRE,
    message: 'Test athletes can\'t be booked onto real sessions.'},
  'session-missing': {code: PRE,
    message: 'That session isn\'t on the schedule any more.'},
  'calendly': {code: PRE, message: '1:1s are booked in Calendly.'},
  'session-cancelled': {code: PRE,
    message: 'The academy cancelled that session.'},
  'session-hidden': {code: PRE,
    message: 'That session is hidden. Un-hide it first.'},
  'display-only': {code: PRE,
    message: 'That session isn\'t booked through the portal.'},
  'period-over': {code: PRE, message: 'That billing period has ended.'},
  'already-booked': {code: PRE,
    message: 'This athlete already has this session booked.'},
  'not-paid': {code: PRE,
    message: 'This athlete isn\'t paid up. Add the session Free.'},
  'no-tokens-left': {code: PRE, message: 'No tokens left for that period.'},
  'no-session-token': {code: PRE, message: 'No session token left.'},
  'full': {code: PRE, message: 'That session is full.'},
};

/**
 * The request, checked. Both ids must pass `goodId`; `free` and
 * `allowFull` must be absent or boolean (`null` is refused). Unknown keys
 * are ignored, so a `householdId` in the request never reaches anything:
 * this reads the spec's "anything else is bad-request" narrowly, as a bad
 * id or a non-boolean flag (plan decision 5).
 * @param {*} data `{athleteId, sessionId, free?, allowFull?}`.
 * @return {?{athleteId: string, sessionId: string, free: boolean,
 *     allowFull: boolean}} The request, or null when it is not usable.
 */
function parseStaffBook(data) {
  if (!data || typeof data !== 'object') return null;
  const {athleteId, sessionId, free, allowFull} = data;
  if (!goodId(athleteId) || !goodId(sessionId)) return null;
  const flag = (v) => v === undefined || typeof v === 'boolean';
  if (!flag(free) || !flag(allowFull)) return null;
  return {athleteId, sessionId, free: free === true,
    allowFull: allowFull === true};
}

/**
 * The checks before payment (spec 9.1 rows 3-13), in order.
 * @param {!Object} ctx See `decideStaffBook`.
 * @return {?string} The first refusal, or null.
 */
function earlyRefusal(ctx) {
  const {athlete, household, session, existing} = ctx;
  if (!isStaff(ctx.user)) return 'not-staff';
  if (!athlete) return 'athlete-missing';
  if (!athlete.householdId || !household) return 'no-household';
  if (athlete.test === true || household.test === true) return 'test-athlete';
  if (!session || !session.date) return 'session-missing';
  if (session.type === 'mental' || session.source === 'calendly' ||
      session.unresolved === true) {
    return 'calendly';
  }
  if (session.status === 'cancelled') return 'session-cancelled';
  if (session.hidden === true) return 'session-hidden';
  if (session.bookable === false) return 'display-only';
  if (periodOver(session.date, household.periodAnchorDay, ctx.now)) {
    return 'period-over';
  }
  if (existing && existing.status !== 'cancelled') return 'already-booked';
  return null;
}

/**
 * What pays for the seat: nothing when Free, else the family charge order
 * over the session's period with the athlete's own entry on this session
 * holding no token.
 * @param {!Object} ctx See `decideStaffBook`.
 * @param {{periodKey: string}} period The session's period.
 * @param {?string} waitlistEntryId The athlete's entry on this session.
 * @return {({chargedFrom: string, graceTokenId: ?string}|{reason: string})}
 *     The charge, or the refusal reason.
 */
function staffCharge(ctx, period, waitlistEntryId) {
  if (ctx.free === true) return {chargedFrom: 'period', graceTokenId: null};
  const sessionDate = ctx.session.date;
  const position = positionFor(ctx, {period, leaveOutId: null,
    waitlistEntryId, sessionDate});
  const charge = lib.chargeFor({position, sessionDate});
  if (!charge.chargedFrom) {
    return {reason: position.perPurchase ?
        'no-session-token' : 'no-tokens-left'};
  }
  return {chargedFrom: charge.chargedFrom, graceTokenId: charge.graceTokenId};
}

/**
 * Decide one staff add.
 * @param {{user: ?Object, athlete: ?Object, household: ?Object,
 *     pkg: ?Object, session: ?Object, existing: ?Object, live: number,
 *     tokenPeriod: ?Object, periodBookings: !Array<!Object>,
 *     graceSpends: !Array<!Object>, waitlist: !Array<!Object>,
 *     graceTokens: !Array<!Object>, now: !Date, free: boolean,
 *     allowFull: boolean}} ctx Everything portal/staff-book.js read: the
 *     caller, the athlete, household, package and session (each with its
 *     `id`), the `{athleteId}_{sessionId}` row, the session's live
 *     bookings count, the session period's `tokenPeriods` doc and
 *     bookings, the grace spends, the athlete's waitlist and grace tokens,
 *     the clock and the request's two flags.
 * @return {({ok: boolean, comp: boolean, charge: !Object, period: !Object,
 *     taken: number, capacity: number, waitlistEntryId: ?string,
 *     rebooked: boolean, overrides: !Array<string>}|{ok: boolean,
 *     reason: string, details: (!Object|undefined)})} The add to write, or
 *     the refusal (`details` `{taken, capacity}` with `full` only).
 */
function decideStaffBook(ctx) {
  const early = earlyRefusal(ctx);
  if (early) return {ok: false, reason: early};
  const {athlete, household, pkg, session} = ctx;
  const free = ctx.free === true;
  const allowFull = ctx.allowFull === true;
  if (!free && (!pkg || !lib.membershipAllowsBooking(household, athlete))) {
    return {ok: false, reason: 'not-paid'};
  }
  const period = lib.periodFor(session.date, household.periodAnchorDay);
  const entryId = lib.waitlistId(session.id, athlete.id);
  const waitlistEntryId = (ctx.waitlist || []).some(
      (w) => w && w.id === entryId) ? entryId : null;
  const charge = staffCharge(ctx, period, waitlistEntryId);
  if (charge.reason) return {ok: false, reason: charge.reason};
  const taken = takenOf(ctx.live, session);
  const capacity = capacityOf(session);
  if (!allowFull && taken >= capacity) {
    return {ok: false, reason: 'full', details: {taken, capacity}};
  }
  return {
    ok: true,
    comp: free,
    charge,
    period,
    taken,
    capacity,
    waitlistEntryId,
    rebooked: Boolean(ctx.existing),
    overrides: staffOverrides({session, athlete, pkg,
      bookings: ctx.periodBookings || [], taken, allowFull, now: ctx.now}),
  };
}

module.exports = {REFUSALS, decideStaffBook, parseStaffBook};
