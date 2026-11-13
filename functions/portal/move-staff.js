/**
 * moveBooking's staff mode (spec 2026-11-13 section 9.2): the checks that
 * replace the family ones when the caller is the owner or ops. Pure -
 * portal/move-decide.js calls these from `decideMove` when `ctx.staff`.
 *
 * Staff mode is chosen by the caller's role (`users/{uid}.role`, read in
 * portal/move.js), never by a request flag. Against the family checks:
 *   - ownership is never checked: the role is the check;
 *   - a `noshow` moves as well as a `confirmed`; `attended` is refused as
 *     `attended`, anything else as `not-confirmed`;
 *   - no start checks: the old booking's period and the target's period
 *     must still be open (`period-over`), and a started target comes back
 *     as the override `started` (portal/staff-gates.js);
 *   - the window, booking-open, the handicap block, Elite's one-a-day and,
 *     with `allowFull`, a full target are not refused here;
 *   - a test athlete or test household is `test-athlete`.
 * Payment never changes on a move: a free comp stays free, and a paid
 * booking of an athlete who is not paying is `membership-inactive`.
 */

'use strict';

const lib = require('./lib');
const {periodOver} = require('./staff-gates');

/** Booking statuses staff may move (as staff cancel, CANCELLABLE). */
const MOVABLE = ['confirmed', 'noshow'];

/**
 * The staff checks on the booking being moved, in order.
 * @param {!Object} ctx A `decideMove` ctx.
 * @return {?string} The first refusal, or null.
 */
function staffOldRefusal(ctx) {
  const {old, oldSession, target, household} = ctx;
  if (!old) return 'booking-missing';
  if (old.status === 'attended') return 'attended';
  if (!MOVABLE.includes(old.status)) return 'not-confirmed';
  if (old.source === 'calendly') return 'calendly-managed';
  if ((old.type || (oldSession && oldSession.type)) === 'mental') {
    return 'mental-no-move';
  }
  const toId = ctx.toSessionId || (target && target.id);
  if (toId && toId === old.sessionId) return 'same-session';
  if (!oldSession || !target) return 'session-missing';
  // A booking with no date cannot be placed in a period.
  const date = old.date || oldSession.date;
  if (!date) return 'session-missing';
  if (periodOver(date, household && household.periodAnchorDay, ctx.now)) {
    return 'period-over';
  }
  return null;
}

/**
 * The staff checks on the target session, in order. No start check and
 * no window: a target in the open period is fine, started or not.
 * @param {!Object} ctx A `decideMove` ctx that passed `staffOldRefusal`.
 * @return {?string} The first refusal, or null.
 */
function staffTargetRefusal(ctx) {
  const {old, oldSession, target, targetBooking, household} = ctx;
  if (target.type !== (old.type || oldSession.type)) return 'different-type';
  if (target.status === 'cancelled') return 'session-cancelled';
  if (target.hidden === true) return 'session-hidden';
  if (target.bookable === false) return 'display-only';
  if (periodOver(target.date, household && household.periodAnchorDay,
      ctx.now)) {
    return 'period-over';
  }
  if (targetBooking && targetBooking.status !== 'cancelled') {
    return 'already-booked';
  }
  return null;
}

/**
 * The staff checks on the athlete: present, not a test athlete, and
 * paying unless the booking is a free comp. No booking-open, handicap or
 * full check.
 * @param {!Object} ctx A `decideMove` ctx.
 * @param {boolean} comp Whether the booking is a free comp.
 * @return {?string} The first refusal, or null.
 */
function staffAthleteRefusal(ctx, comp) {
  const {athlete, household, pkg} = ctx;
  if (!athlete) return 'membership-inactive';
  if (athlete.test === true || (household && household.test === true)) {
    return 'test-athlete';
  }
  if (!comp && (!pkg || !lib.membershipAllowsBooking(household, athlete))) {
    return 'membership-inactive';
  }
  return null;
}

module.exports = {staffAthleteRefusal, staffOldRefusal, staffTargetRefusal};
