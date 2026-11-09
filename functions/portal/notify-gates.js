/**
 * WHEN a booking trigger owes a notice - pure, so the gates functions/
 * index.js applies are unit-tested without the emulator (index.js has no
 * unit runner for its triggers). The triggers still build the copy and send.
 */
'use strict';

const lib = require('./lib');
const {consentStatusFor, utcToday} = require('./mental-consent-status');

/**
 * Whether a newly created booking gets the 'booking-confirmed' notice.
 *
 * - Only a confirmed booking.
 * - Not a waitlist promotion: portal/promotion.js writes it with
 *   `promotedFromWaitlist: true` and `createdBy: 'system'` and sends
 *   'promoted' itself - one seat, one message.
 * - Not a Repeat weekly copy (`createdVia: 'repeat'`, written by the
 *   portal's bookRecurring): the family just saw the on-screen summary of
 *   every week, so a notice per week (six at once for a six-week repeat)
 *   says nothing new (owner report 2026-09-30). The auto-booking feature
 *   will send a weekly digest instead.
 * @param {?Object} booking The `bookings/{id}` document body.
 * @return {boolean} True when the notice is owed.
 */
function shouldNoticeBookingCreated(booking) {
  const b = booking || {};
  if (b.status !== 'confirmed') return false;
  if (b.promotedFromWaitlist === true || b.createdBy === 'system') {
    return false;
  }
  return b.createdVia !== 'repeat';
}

/**
 * Whether a family's own cancel gets the 'booking-cancelled' receipt.
 *
 * - Only a member cancel (`cancelReason: 'member'`). The academy cancelling
 *   a session and a Calendly cancellation are decided in the trigger and
 *   never ask this gate.
 * - Not one week of a series cancel (`cancelledVia: 'series'`, written by
 *   the portal's cancelSeries and the one value the rules admit): the family
 *   just saw one on-screen summary of every week, so a notice per week says
 *   nothing new (tester Mike 2026-09-30). A single cancel carries no
 *   `cancelledVia` and still sends.
 * @param {?Object} booking The `bookings/{id}` body AFTER the cancel.
 * @return {boolean} True when the receipt is owed.
 */
function shouldNoticeMemberCancel(booking) {
  const b = booking || {};
  if (b.status !== 'cancelled' || b.cancelReason !== 'member') return false;
  return b.cancelledVia !== 'series';
}

/**
 * Whether a newly created booking asks the family for Yannick's mental
 * performance consent ('consent-needed', spec 6.3; plan 2026-10-30).
 *
 * - Only a confirmed 1:1 with Yannick (`type: 'mental'`) that names an
 *   athlete. A held, unmatched Calendly session has no booking at all and
 *   never reaches here. `source` and `createdBy` are never read: the
 *   Calendly webhook writes its bookings as 'system', and they are exactly
 *   the ones that need the ask.
 * - Only while the switch `config/mentalConsent.notices` is true.
 * - Not for a past date: the owner's Calendly re-link and comp-booking
 *   scripts can write a booking for any date (Chicago date, `lib.todayISO`).
 * - Never to a test household or a test athlete, nor when the household
 *   doc is missing.
 * - Only when the athlete is 'unsigned' or 'needs-adult' (18 counted on the
 *   UTC date of the same `now`); 'signed' and 'no-dob' are never asked.
 * @param {{booking: ?Object, athlete: ?Object, household: ?Object,
 *     record: ?Object, config: ?Object, now: !Date}} args The booking body,
 *     its athlete and household docs, the athlete's consent record (or
 *     null) and the switch.
 * @return {boolean} True when the ask is owed.
 */
function shouldNoticeConsentNeeded(args) {
  const {booking, athlete, household, record, config, now} = args || {};
  const b = booking || {};
  if (b.type !== 'mental' || b.status !== 'confirmed' || !b.athleteId) {
    return false;
  }
  if (!athlete || !household || typeof household !== 'object') return false;
  if (!config || config.notices !== true) return false;
  if (!(typeof b.date === 'string' && b.date >= lib.todayISO(now))) {
    return false;
  }
  if (household.test === true || athlete.test === true) return false;
  const status = consentStatusFor(athlete, record, utcToday(now));
  return status === 'unsigned' || status === 'needs-adult';
}

module.exports = {shouldNoticeBookingCreated, shouldNoticeConsentNeeded,
  shouldNoticeMemberCancel};
