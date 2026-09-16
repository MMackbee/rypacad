import React from 'react';
import { color, font } from '../tokens';
import { Banner } from './Primitives';
import { longDayLabel, nextMonthFirstShort, todayISO, windowOpensOn } from '../data/calendar';

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
  if (reason === 'full') return 'That block filled before the reservation completed.';
  if (reason === 'membership-inactive') return "This membership isn't active right now.";
  return null;
}

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

/** Pin D: a day past the booking window renders locked, not just empty. */
export function LockedDayNotice({ date, windowDays }) {
  return (
    <Banner tone="neutral" title="Not open yet">
      Booking for {longDayLabel(date)} opens 7 AM on {longDayLabel(windowOpensOn(date, windowDays))}.
    </Banner>
  );
}
