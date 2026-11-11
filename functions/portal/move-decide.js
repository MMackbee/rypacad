/**
 * The move decision (spec 2026-11-11 section 5): may this booking move to
 * that session, and what pays for the new seat. Pure - portal/move.js reads
 * everything inside its transaction, asks here, then writes.
 *
 * A move is one server step so the seat can never be lost between a cancel
 * and a re-book. Rules are bypassed under the admin SDK, so every gate a
 * normal booking passes is applied here, the same gates portal/
 * waitlist-order.js applies before a promotion (membership and the athlete
 * paid, a package, booking open, the window, the handicap block, room,
 * Elite's one-per-day cap) plus the move's own (the caller owns the
 * booking, it is confirmed, not Calendly's, not a 1:1, not started; the
 * target is the same kind, scheduled, offered and not started). The first
 * failing check wins, in the order of REFUSALS below.
 *
 * The charge, with the booking being moved counted as given back (it is
 * left out of every row handed to `lib.tokensPosition`):
 *   (a) Elite stays Elite;
 *   (b) a bonus or single token the old booking spent carries while it is
 *       still valid on the new date;
 *   (c) a period token carries inside the same period while one is left;
 *   (d) otherwise the new session is charged like a fresh booking
 *       (`lib.chargeFor`: grace first, then the period).
 *
 * A free comp (`isFreeComp`) skips billing, the freeze, the package,
 * booking-open and the charge in any period, and stays free where it goes.
 */

'use strict';

const lib = require('./lib');
const gates = require('./booking-gates');
const {sessionStarted} = require('./session-time');

const PRE = 'failed-precondition';

/**
 * Every refusal the callable can give, in the order the checks run, with
 * the HttpsError code and the server's message. The app maps `reason` to
 * its own copy.
 * @const {!Object<string, {code: string, message: string}>}
 */
const REFUSALS = {
  'signed-out': {code: 'unauthenticated', message: 'Sign in to continue.'},
  'bad-request': {code: 'invalid-argument',
    message: 'Send a booking and a session.'},
  'booking-missing': {code: 'not-found',
    message: 'This booking no longer exists.'},
  'not-yours': {code: 'permission-denied',
    message: 'This booking isn\'t on your account.'},
  'not-confirmed': {code: PRE, message: 'This booking was already changed.'},
  'calendly-managed': {code: PRE,
    message: 'Cancel or reschedule from Calendly\'s email'},
  'mental-no-move': {code: PRE, message: 'A 1:1 can\'t be moved in the app.'},
  'same-session': {code: PRE, message: 'Pick a different session.'},
  'session-missing': {code: PRE,
    message: 'That session isn\'t on the schedule any more.'},
  'already-started': {code: PRE,
    message: 'This session has already started.'},
  'different-type': {code: PRE, message: 'Pick a session of the same kind.'},
  'session-cancelled': {code: PRE,
    message: 'The academy cancelled that session.'},
  'session-hidden': {code: PRE,
    message: 'That session isn\'t offered right now. Pick another time.'},
  'display-only': {code: PRE,
    message: 'That session isn\'t booked through the portal.'},
  'session-past': {code: PRE, message: 'That session has already started.'},
  'outside-window': {code: PRE,
    message: 'That date isn\'t open for booking yet.'},
  'already-booked': {code: PRE,
    message: 'This athlete already has this session booked.'},
  'membership-inactive': {code: PRE,
    message: 'This membership isn\'t active right now.'},
  'booking-not-open': {code: PRE, message: 'Booking isn\'t open yet.'},
  'handicap-reserved': {code: PRE,
    message: 'This session is reserved for lower handicaps.'},
  'full': {code: PRE, message: 'That session just filled.'},
  'one-per-day': {code: PRE, message: 'Elite includes one of each a day - ' +
    'there\'s already one that day.'},
  'no-tokens-left': {code: PRE, message: 'No tokens left for that period.'},
  'no-session-token': {code: PRE, message: 'No session token left.'},
};

/**
 * A free comp: a session the academy gave, never charged and never counted
 * as a period spend. A row the family re-booked with a bonus or single
 * token is an ordinary booking even if an older app left `comp` on it.
 *
 * CHANGE ONE, CHANGE BOTH with
 * `frontend/src/portal/data/bookingChanges.js#isFreeComp`.
 * @param {?Object} booking A `bookings/{id}` body.
 * @return {boolean} True for a free comp.
 */
function isFreeComp(booking) {
  return Boolean(booking) && booking.comp === true &&
      (booking.chargedFrom ?? 'period') === 'period' && !booking.graceTokenId;
}

/**
 * What pays for the new seat, C2 (a)-(d).
 * @param {{old: !Object, target: !Object, position: !Object,
 *     period: {periodKey: string}, oldPeriodKey: ?string}} args The booking
 *     being moved, the target session, the athlete's position in the
 *     target's period (the old booking left out) and the old period key.
 * @return {({chargedFrom: string, graceTokenId: ?string}|{reason: string})}
 *     The charge, or the refusal reason.
 */
function moveCharge(args) {
  const {old, target, position, period, oldPeriodKey} = args;
  if (position.unlimited) return {chargedFrom: 'elite', graceTokenId: null};
  const carried = old.graceTokenId && (position.grace || []).find(
      (g) => g.id === old.graceTokenId);
  if (carried && (!carried.expiresAt || carried.expiresAt >= target.date)) {
    return {chargedFrom: 'grace', graceTokenId: carried.id};
  }
  const spentPeriod = !old.graceTokenId &&
      (old.chargedFrom ?? 'period') === 'period';
  if (spentPeriod && oldPeriodKey === period.periodKey &&
      (position.left || 0) > 0) {
    return {chargedFrom: 'period', graceTokenId: null};
  }
  const charge = lib.chargeFor({position, sessionDate: target.date});
  if (charge.chargedFrom) {
    return {chargedFrom: charge.chargedFrom, graceTokenId: charge.graceTokenId};
  }
  return {reason: position.perPurchase ? 'no-session-token' : 'no-tokens-left'};
}

/**
 * Whether the signed-in user may change this booking: an athlete login its
 * own athlete's, a parent its household's.
 * @param {?Object} user The caller's `users/{uid}` body.
 * @param {!Object} old The booking.
 * @return {boolean} True when the booking is the caller's.
 */
function ownsBooking(user, old) {
  if (!user) return false;
  if (user.role === 'athlete') {
    return Boolean(user.athleteId) && user.athleteId === old.athleteId;
  }
  return user.role === 'parent' && Boolean(user.householdId) &&
      user.householdId === old.householdId;
}

/**
 * The checks on the booking being moved and on the caller (C2 3-10).
 * @param {!Object} ctx See `decideMove`.
 * @return {?string} The first refusal, or null.
 */
function oldRefusal(ctx) {
  const {old, oldSession, target} = ctx;
  if (!old) return 'booking-missing';
  if (!ownsBooking(ctx.user, old)) return 'not-yours';
  if (old.status !== 'confirmed') return 'not-confirmed';
  if (old.source === 'calendly') return 'calendly-managed';
  if ((old.type || (oldSession && oldSession.type)) === 'mental') {
    return 'mental-no-move';
  }
  const toId = ctx.toSessionId || (target && target.id);
  if (toId && toId === old.sessionId) return 'same-session';
  if (!oldSession || !target) return 'session-missing';
  if (sessionStarted(oldSession, ctx.now)) return 'already-started';
  return null;
}

/**
 * The checks on the target session (C2 11-17).
 * @param {!Object} ctx See `decideMove`.
 * @param {?Object} pkg The athlete's package.
 * @return {?string} The first refusal, or null.
 */
function targetRefusal(ctx, pkg) {
  const {old, oldSession, target, targetBooking} = ctx;
  if (target.type !== (old.type || oldSession.type)) return 'different-type';
  if (target.status === 'cancelled') return 'session-cancelled';
  if (target.hidden === true) return 'session-hidden';
  if (target.bookable === false) return 'display-only';
  if (sessionStarted(target, ctx.now)) return 'session-past';
  if (target.date > gates.openThrough(ctx.now, gates.windowMonthsFor(pkg))) {
    return 'outside-window';
  }
  if (targetBooking && targetBooking.status !== 'cancelled') {
    return 'already-booked';
  }
  return null;
}

/**
 * The checks on the athlete and the room (C2 18-21).
 * @param {!Object} ctx See `decideMove`.
 * @param {boolean} comp Whether the booking is a free comp.
 * @param {number} taken The target's seats taken.
 * @return {?string} The first refusal, or null.
 */
function athleteRefusal(ctx, comp, taken) {
  const {athlete, household, pkg, target} = ctx;
  if (!athlete || athlete.test === true) return 'membership-inactive';
  if (!comp && (!pkg || !lib.membershipAllowsBooking(household, athlete))) {
    return 'membership-inactive';
  }
  if (!comp && !lib.bookingOpen(ctx.now, pkg)) return 'booking-not-open';
  if (Number.isInteger(target.maxHandicap) &&
      !(Number.isInteger(athlete.handicap) &&
          athlete.handicap <= target.maxHandicap)) {
    return 'handicap-reserved';
  }
  if (taken >= (Number(target.capacity) || 0)) return 'full';
  return null;
}

/**
 * Decide one move.
 * @param {{uid: string, user: ?Object, old: ?Object, oldSession: ?Object,
 *     target: ?Object, targetBooking: ?Object, targetLive: number,
 *     athlete: ?Object, household: ?Object, pkg: ?Object,
 *     tokenPeriod: ?Object, periodBookings: !Array<!Object>,
 *     graceSpends: !Array<!Object>, waitlist: !Array<!Object>,
 *     graceTokens: !Array<!Object>, now: !Date,
 *     toSessionId: (string|undefined)}} ctx Everything portal/move.js
 *     read: the booking (`old`, with its `id`), both sessions (with `id`),
 *     the target's booking row for this athlete, the target's live
 *     bookings count, the athlete, household, package, the target period's
 *     `tokenPeriods` doc and bookings, the grace spends, the athlete's
 *     waitlist and grace tokens, and the clock.
 * @return {({ok: boolean, comp: boolean, charge: !Object, period: !Object,
 *     taken: number, waitlistEntryId: ?string}|{ok: boolean,
 *     reason: string})} The move to write, or the refusal.
 */
function decideMove(ctx) {
  const refuse = (reason) => ({ok: false, reason});
  const early = oldRefusal(ctx) || targetRefusal(ctx, ctx.pkg);
  if (early) return refuse(early);
  const {old, target, household, pkg} = ctx;
  const comp = isFreeComp(old);
  const taken = Math.max(Number(ctx.targetLive) || 0,
      Number(target.booked) || 0);
  const late = athleteRefusal(ctx, comp, taken);
  if (late) return refuse(late);

  const anchorDay = household && household.periodAnchorDay;
  const period = lib.periodFor(target.date, anchorDay);
  const notOld = (b) => b && b.id !== old.id;
  const bookings = (ctx.periodBookings || []).filter(notOld);
  if (gates.eliteDailyCapHit(pkg, target.type, target.date, bookings)) {
    return refuse('one-per-day');
  }
  const athleteId = old.athleteId;
  const entryId = lib.waitlistId(target.id, athleteId);
  const waitlist = (ctx.waitlist || []).filter(Boolean);
  const waitlistEntryId = waitlist.some((w) => w.id === entryId) ?
      entryId : null;
  if (comp) {
    return {ok: true, comp, charge: {chargedFrom: 'period',
      graceTokenId: null}, period, taken, waitlistEntryId};
  }

  // As waitlist-order.js loadCandidate builds it: the period rows plus the
  // grace spends of any period, deduplicated by id, without the old row.
  const seen = new Set(bookings.map((b) => b.id));
  const spends = (ctx.graceSpends || []).filter(
      (b) => notOld(b) && !seen.has(b.id));
  const position = lib.tokensPosition({
    pkg,
    tokenPeriod: ctx.tokenPeriod || null,
    bookings: bookings.concat(spends),
    waitlist: waitlist.map((w) => ({id: w.id,
      periodKey: lib.periodFor(w.date || target.date, anchorDay).periodKey})),
    ignoreWaitlistIds: waitlistEntryId ? [waitlistEntryId] : [],
    graceTokens: ctx.graceTokens || [],
    periodKey: period.periodKey,
    today: lib.chicagoDate(ctx.now),
  });
  const charge = moveCharge({old, target, position, period,
    oldPeriodKey: old.periodKey || null});
  if (charge.reason) return refuse(charge.reason);
  return {ok: true, comp, charge, period, taken, waitlistEntryId};
}

module.exports = {REFUSALS, decideMove, isFreeComp, moveCharge};
