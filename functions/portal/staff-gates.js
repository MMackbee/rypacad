/**
 * Pure helpers the staff booking tools share (spec 2026-11-13 sections
 * 9.1-9.2): `staffBookSession` (portal/staff-book-decide.js) and
 * `moveBooking`'s staff mode (portal/move-staff.js).
 *
 * Staff may book into today's or an earlier session of the open billing
 * period, and past the family window. They skip the family limits a
 * normal booking passes - the window, the handicap-only block, Elite's
 * one-a-day and, when asked, a full session. Each skipped limit comes back
 * as an override, never a refusal, so the sheet can say what was waived.
 * What bounds staff is the billing period, by the same rule as
 * staffCancelBooking (portal/staff-cancel-decide.js).
 */

'use strict';

const lib = require('./lib');
const gates = require('./booking-gates');
const {sessionStarted} = require('./session-time');

/**
 * Every limit a staff booking may skip, in the order `staffOverrides`
 * reports them.
 * @const {!Array<string>}
 */
const OVERRIDES = ['started', 'outside-window', 'handicap-reserved',
  'one-per-day', 'full'];

/**
 * The seats a session has taken: the larger of the live roster and the
 * stored counter, so a counter that reads low heals (portal/promotion.js).
 * @param {*} live The session's non-cancelled bookings count.
 * @param {?Object} session A `sessions/{id}` body.
 * @return {number} Seats taken.
 */
function takenOf(live, session) {
  return Math.max(Number(live) || 0,
      Number(session && session.booked) || 0);
}

/**
 * @param {?Object} session A `sessions/{id}` body.
 * @return {number} Its capacity; 0 when it has none.
 */
function capacityOf(session) {
  return Number(session && session.capacity) || 0;
}

/**
 * Whether the billing period a date falls in has ended, on the Chicago
 * clock: its last day is before today. The same rule as staff cancel.
 * @param {string} dateISO `'YYYY-MM-DD'`, a session date.
 * @param {number=} anchorDay `households.periodAnchorDay`; absent == 1.
 * @param {!Date} now The clock.
 * @return {boolean} True once the period is over.
 */
function periodOver(dateISO, anchorDay, now) {
  return lib.periodFor(dateISO, anchorDay).periodEnd < lib.todayISO(now);
}

/**
 * The handicap-only block (`firestore.rules` reservedOk, as
 * portal/move-decide.js checks it): a session with an integer
 * `maxHandicap` takes only athletes with an integer handicap at or under
 * it.
 * @param {?Object} session A `sessions/{id}` body.
 * @param {?Object} athlete An `athletes/{id}` body.
 * @return {boolean} True when the block keeps this athlete out.
 */
function handicapBlocked(session, athlete) {
  if (!session || !Number.isInteger(session.maxHandicap)) return false;
  return !(athlete && Number.isInteger(athlete.handicap) &&
      athlete.handicap <= session.maxHandicap);
}

/**
 * The family limits a staff booking skips here, in `OVERRIDES` order.
 * @param {{session: !Object, athlete: ?Object, pkg: ?Object,
 *     bookings: ?Array<!Object>, taken: number, allowFull: boolean,
 *     now: !Date}} args The session, the athlete and package, the
 *     athlete's other bookings that period, the seats taken, whether a
 *     full session was allowed, and the clock.
 * @return {!Array<string>} A subset of `OVERRIDES`.
 */
function staffOverrides(args) {
  const {session, athlete, pkg, bookings, taken, allowFull, now} = args;
  const out = [];
  if (sessionStarted(session, now)) out.push('started');
  if (session.date > gates.openThrough(now, gates.windowMonthsFor(pkg))) {
    out.push('outside-window');
  }
  if (handicapBlocked(session, athlete)) out.push('handicap-reserved');
  if (gates.eliteDailyCapHit(pkg, session.type, session.date, bookings)) {
    out.push('one-per-day');
  }
  if (allowFull && taken >= capacityOf(session)) out.push('full');
  return out;
}

/**
 * The one log line a staff add or move writes: ids only, never names.
 * @param {!Object} entry `{action, by, role, athleteId, sessionId, ...}`.
 */
function logStaffBooking(entry) {
  console.log('staff booking', JSON.stringify(entry));
}

module.exports = {OVERRIDES, capacityOf, handicapBlocked, logStaffBooking,
  periodOver, staffOverrides, takenOf};
