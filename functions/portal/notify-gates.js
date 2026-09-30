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

module.exports = {shouldNoticeBookingCreated};
