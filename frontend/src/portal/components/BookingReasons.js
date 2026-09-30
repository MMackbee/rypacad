import React from 'react';
import { color, font } from '../tokens';
import { Banner } from './Primitives';
import { BOOKING_OPENS_AT, BOOKING_OPENS_LABEL, academyDateISO, longDayLabel, nextMonthFirstShort, todayISO, windowOpensOn } from '../data/calendar';

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
  if (reason === 'outside-window') return "That date isn't open for booking yet.";
  if (reason === 'cap-reached') return capReachedCopy();
  // v2.0.1 (Sprint 18): Elite's per-day frequency caps.
  if (reason === 'one-per-day') return "Elite includes one training block, one tournament and one Phil session a day — there's already one of those booked that day.";
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
 */
export function cancelReasonCopy(reason) {
  if (reason === 'session-cancelled') return 'Cancelled by the academy — a bonus token was added.';
  if (reason === 'lapsed') return 'Cancelled — membership lapsed.';
  if (reason === 'downgrade') return 'Cancelled — package changed.';
  return null;
}

/** The Oct 10 gate's calendar date in America/Chicago ('2026-10-10'), derived from the one constant. */
const GATE_ISO = academyDateISO(new Date(BOOKING_OPENS_AT));

/**
 * Pin D: a day past the booking window renders locked, not just empty.
 * UX review #8: while the Oct 10 gate is shut (`gateOpen` false: a token
 * package before 07:00 Oct 10), a day whose window would open BEFORE the gate
 * says the gate's date - "session date minus the window" told families
 * Nov 3 opens Sunday, Oct 4. Display only; the server gate is unchanged.
 * Titled per day so it doesn't repeat the screen's own "Not open yet".
 */
export function LockedDayNotice({ date, windowDays, gateOpen = true }) {
  const opens = windowOpensOn(date, windowDays);
  return (
    <Banner tone="neutral" title="Not open for this day yet">
      {!gateOpen && opens < GATE_ISO
        ? `Booking for ${longDayLabel(date)} opens ${BOOKING_OPENS_LABEL}.`
        : `Booking for ${longDayLabel(date)} opens 7 AM on ${longDayLabel(opens)}.`}
    </Banner>
  );
}
