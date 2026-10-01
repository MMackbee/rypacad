/**
 * WHEN a booking trigger owes a notice - pure, so the gates functions/
 * index.js applies are unit-tested without the emulator (index.js has no
 * unit runner for its triggers). The triggers still build the copy and send.
 */
'use strict';

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

module.exports = {shouldNoticeBookingCreated, shouldNoticeMemberCancel};
