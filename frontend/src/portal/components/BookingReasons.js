import React from 'react';
import { color, font } from '../tokens';
import { Banner } from './Primitives';
import { BOOKING_OPENS_LABEL, longDayLabel, nextMonthFirstShort, todayISO, windowOpensOn } from '../data/calendar';

/**
 * Shared booking-rejection/lock/cancellation copy (Sprint 12 pin, contract
 * v2.0; extended Sprint 13, contract v2.1). Both BookSession.js and
 * SpecialistBooking.js hit the same typed rejection reasons (contract §12:
 * 'no-tokens-left' | 'outside-window' | 'cap-reached' | 'full', now joined by
 * Part 2's 'membership-inactive') and the same "past the booking window"
 * locked state (pin D) — extracted here so the copy can't drift between the
 * two screens, and so SpecialistBooking.js (already over the project's
 * 500-line file convention before this sprint) doesn't grow net lines
 * carrying a second copy of it. MySchedule.js/Reservations.js share the
 * cancellation-reason map (pin G) for the same reason.
 */

/** Pin K's exact wording: "next mental game session opens <date>." */
export function capReachedCopy() {
  return `Next mental game session opens ${nextMonthFirstShort(todayISO())}.`;
}

/** The typed booking-rejection reasons (routing lane, contract v2.1 §12/pin D/H). */
export function reasonCopy(reason) {
  if (reason === 'no-tokens-left') return 'No tokens left this period.';
  // The single token (ruling 2026-09-29/30): tokens are bought, never reset.
  if (reason === 'no-session-token') return 'No session token left - buy one to book.';
  if (reason === 'outside-window') return "That date isn't open for booking yet.";
  if (reason === 'cap-reached') return capReachedCopy();
  // v2.0.1 (Sprint 18): Elite's per-day frequency caps.
  if (reason === 'one-per-day') return "Elite includes one golf session and one Phil session a day — there's already one booked that day.";
  // Sprint 20 (contract 3.6): the per-athlete paid gate, the Oct 10 gate and
  // Calendly-managed rows. Copy is section 9's, verbatim.
  if (reason === 'billing-pending') return 'Payment pending - finish checkout to start booking';
  if (reason === 'booking-not-open') return `Booking opens ${BOOKING_OPENS_LABEL}`;
  if (reason === 'calendly-managed') return "Cancel or reschedule from Calendly's email";
  if (reason === 'full') return 'That block filled before the reservation completed.';
  if (reason === 'membership-inactive') return "This membership isn't active right now.";
  return null;
}

/** The non-cancellable Calendly row's action copy (MySchedule, Reservations). */
export const CALENDLY_MANAGED_COPY = reasonCopy('calendly-managed');

/**
 * "See membership ›" — the pointer BookSession/SpecialistBooking's
 * 'membership-inactive' rejection copy needs (pin: "reason copy for
 * 'membership-inactive' pointing at Membership"). Same inline-link idiom
 * EntitlementSummary.js already draws for Yannick's cap-reached banner,
 * pulled out here so the two booking screens and this one component don't
 * carry three copies of the same button.
 */
export function SeeMembershipLink({ onClick, style }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        display: 'block',
        font: `500 12px ${font.body}`,
        color: color.primary,
        cursor: 'pointer',
        ...style,
      }}
    >
      See membership ›
    </button>
  );
}

/**
 * bookings.cancelReason (pin G, contract v2.1): the system reasons a
 * cancelled row states plainly rather than leaving blank — a member's own
 * cancellation ('member') needs no explanation and renders nothing.
 * `singleToken` (the row was paid with a bought single token, ruling
 * 2026-09-29/30): an academy cancel returns that token instead of adding a
 * bonus; 'double-spend' is the server guard releasing a second booking made
 * with a token another booking already used.
 */
export function cancelReasonCopy(reason, { singleToken = false } = {}) {
  if (reason === 'session-cancelled' && singleToken) return 'Cancelled by the academy - your session token was returned.';
  if (reason === 'session-cancelled') return 'Cancelled by the academy — a bonus token was added.';
  if (reason === 'double-spend') return 'Released - this session token was already used for another booking.';
  if (reason === 'lapsed') return 'Cancelled — membership lapsed.';
  if (reason === 'downgrade') return 'Cancelled — package changed.';
  return null;
}

/** Pin D: a day past the booking window renders locked, not just empty. */
export function LockedDayNotice({ date, windowDays }) {
  return (
    <Banner tone="neutral" title="Not open yet">
      Booking for {longDayLabel(date)} opens 7 AM on {longDayLabel(windowOpensOn(date, windowDays))}.
    </Banner>
  );
}
