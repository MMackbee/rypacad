/**
 * The staff cancel decision (owner approved 2026-11-12): may the owner or
 * ops cancel these bookings, and does each one give a token back. Pure -
 * portal/staff-cancel.js reads everything inside its transaction, asks
 * here, then writes.
 *
 * The academy's own tool for one athlete's booking (three sick brothers a
 * coach marked No-show): a family's cancel stops at the session start, but
 * here a past session is the whole point, so there is NO before-start
 * check. What bounds it is the billing period: a booking whose period has
 * ended is refused, so a token only ever comes back to a period the family
 * can still spend it in.
 *
 * Nothing here returns a token by writing one. Only a non-cancelled
 * booking spends (lib.tokensPosition), and a grace or single token is
 * consumed only by a non-cancelled booking, so cancelling the row is the
 * return. A free comp spent nothing and Elite has no tokens: `tokenBack`
 * is false for those, true otherwise.
 *
 * CHANGE ONE, CHANGE BOTH with the frontend's `staffCancellable` helper:
 * cancellable is a `confirmed` or `noshow` booking Calendly does not own
 * and not a 1:1.
 */

'use strict';

const lib = require('./lib');
const {isFreeComp} = require('./move-decide');

const PRE = 'failed-precondition';

/** Most bookings one call cancels (an athlete and the siblings). */
const MAX_BOOKINGS = 6;
/** Longest Other note, as the family cancel (bookingChanges.js). */
const NOTE_MAX = 140;
/** Longest id accepted; real ids are far shorter. */
const MAX_ID_LENGTH = 200;
/** The reason picker's ids (bookingChanges.js CANCEL_CATEGORIES). */
const CATEGORIES = ['sick', 'injured', 'school', 'family', 'other'];
/** The roles the staff Billing view serves (StaffBillingRoute). */
const STAFF_ROLES = ['owner', 'ops'];
/** Booking statuses staff may cancel. */
const CANCELLABLE = ['confirmed', 'noshow'];

/**
 * Every refusal the callable can give, with the HttpsError code and a
 * short staff-facing message. The app maps `reason` to its own copy.
 * @const {!Object<string, {code: string, message: string}>}
 */
const REFUSALS = {
  'signed-out': {code: 'unauthenticated', message: 'Sign in to continue.'},
  'bad-request': {code: 'invalid-argument',
    message: 'Pick a booking and a reason.'},
  'not-staff': {code: 'permission-denied',
    message: 'Only the owner or ops can cancel a booking here.'},
  'not-found': {code: 'not-found',
    message: 'That booking isn\'t there any more.'},
  'mixed': {code: 'invalid-argument',
    message: 'Pick bookings of one family on one session.'},
  'already-cancelled': {code: PRE,
    message: 'This booking was already changed.'},
  'attended': {code: PRE, message: 'An attended session can\'t be cancelled.'},
  'calendly': {code: PRE, message: 'Cancel this 1:1 in Calendly.'},
  'mental': {code: PRE, message: 'Book and change this 1:1 in Calendly.'},
  'period-over': {code: PRE,
    message: 'That billing period has ended.'},
};

/**
 * As portal/move.js: a 1..200 character id with no '/' that Firestore
 * accepts as a document id (not '.', '..' or '__x__').
 * @param {*} id A request field.
 * @return {boolean} True for a usable id.
 */
function goodId(id) {
  return typeof id === 'string' && id.length > 0 &&
      id.length <= MAX_ID_LENGTH && !id.includes('/') &&
      !/^\.\.?$|^__.*__$/.test(id);
}

/**
 * The request, checked: 1..6 distinct good ids, a known category, and for
 * Other a trimmed 1..140 note (any note is ignored for the others).
 * @param {*} data `{bookingIds, category, note?}`.
 * @return {?{bookingIds: !Array<string>, category: string, note: ?string}}
 *     The request, or null when it is not usable.
 */
function parseRequest(data) {
  const ids = data && data.bookingIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_BOOKINGS ||
      !ids.every(goodId) || new Set(ids).size !== ids.length) {
    return null;
  }
  const category = data.category;
  if (!CATEGORIES.includes(category)) return null;
  if (category !== 'other') return {bookingIds: ids, category, note: null};
  const note = typeof data.note === 'string' ? data.note.trim() : '';
  if (!note || note.length > NOTE_MAX) return null;
  return {bookingIds: ids, category, note};
}

/**
 * @param {?Object} user The caller's `users/{uid}` body.
 * @return {boolean} True for the owner or ops.
 */
function isStaff(user) {
  return Boolean(user) && STAFF_ROLES.includes(user.role);
}

/**
 * Whether cancelling gives a token back: not for a free comp (it spent
 * nothing) nor Elite (unlimited, no tokens).
 * @param {!Object} booking A `bookings/{id}` body.
 * @return {boolean} True when a token comes back.
 */
function tokenBack(booking) {
  return !isFreeComp(booking) && booking.chargedFrom !== 'elite';
}

/**
 * The checks on one booking, in order.
 * @param {!Object} b The booking.
 * @param {?Object} session Its session.
 * @param {number=} anchorDay `households.periodAnchorDay`.
 * @param {string} today Today in America/Chicago.
 * @return {?string} The refusal, or null.
 */
function bookingRefusal(b, session, anchorDay, today) {
  if (b.status === 'cancelled') return 'already-cancelled';
  if (b.status === 'attended') return 'attended';
  if (b.source === 'calendly') return 'calendly';
  // A 1:1 booked in the portal (the in-app fallback) is excluded too.
  if ((b.type || (session && session.type)) === 'mental') return 'mental';
  // Any other status is not a booking staff can cancel here.
  if (!CANCELLABLE.includes(b.status)) return 'already-cancelled';
  // A booking with no date cannot be placed in a period.
  const date = b.date || (session && session.date);
  if (!date) return 'not-found';
  if (lib.periodFor(date, anchorDay).periodEnd < today) return 'period-over';
  return null;
}

/**
 * Decide one staff cancel. The first failing check wins: the caller, then
 * every booking exists, one session and one household, then each booking
 * in request order.
 * @param {{user: ?Object, bookings: !Array<?Object>, session: ?Object,
 *     household: ?Object, now: !Date}} ctx Everything portal/
 *     staff-cancel.js read: the caller, each booking (with its `id`) in
 *     request order, their session (with `id`) and household, the clock.
 * @return {({ok: boolean, sessionId: ?string, booked: ?number,
 *     cancelled: !Array<{bookingId: string, athleteId: ?string,
 *     cancelledFrom: string, tokenBack: boolean}>}|{ok: boolean,
 *     reason: string})} The cancel to write (`booked` is the session's new
 *     count, null when the session doc is missing), or the refusal.
 */
function decideStaffCancel(ctx) {
  const refuse = (reason) => ({ok: false, reason});
  if (!isStaff(ctx.user)) return refuse('not-staff');
  const bookings = ctx.bookings || [];
  if (bookings.length === 0 || bookings.some((b) => !b)) {
    return refuse('not-found');
  }
  const one = (field) => new Set(bookings.map((b) => b[field])).size === 1;
  if (!one('sessionId') || !one('householdId')) return refuse('mixed');
  const {session, household} = ctx;
  const anchorDay = household ? household.periodAnchorDay : undefined;
  const today = lib.todayISO(ctx.now);
  for (const b of bookings) {
    const reason = bookingRefusal(b, session, anchorDay, today);
    if (reason) return refuse(reason);
  }
  return {
    ok: true,
    sessionId: bookings[0].sessionId || null,
    booked: session ?
        Math.max(0, (Number(session.booked) || 0) - bookings.length) : null,
    cancelled: bookings.map((b) => ({bookingId: b.id,
      athleteId: b.athleteId || null, cancelledFrom: b.status,
      tokenBack: tokenBack(b)})),
  };
}

module.exports = {CATEGORIES, MAX_BOOKINGS, NOTE_MAX, REFUSALS,
  decideStaffCancel, goodId, isStaff, parseRequest, tokenBack};
