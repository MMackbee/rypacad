import React from 'react';
import { color, font } from '../tokens';
import { Banner } from './Primitives';
import { BOOKING_OPENS_AT, BOOKING_OPENS_LABEL, academyDateISO, longDayLabel, nextMonthFirstShort, todayISO, windowOpensOn } from '../data/calendar';
import { SESSION_STARTED_COPY } from '../data/sessionStart';

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
  if (reason === 'one-per-day') return "Elite includes one training block, one Tour event and one Phil session a day - there's already one of those booked that day.";
  // Sprint 20 (contract 3.6): the per-athlete paid gate, the Oct 10 gate and
  // Calendly-managed rows. Copy is section 9's, verbatim.
  if (reason === 'billing-pending') return 'Payment pending - finish checkout to start booking';
  if (reason === 'booking-not-open') return `Booking opens ${BOOKING_OPENS_LABEL}`;
  if (reason === 'calendly-managed') return "Cancel or reschedule from Calendly's email";
  // Waitlist hardening (audit 2026-09-30): a plain reserve on a session that
  // filled since the screen loaded joins no waitlist; a started session takes
  // no booking; from the session's own day its waitlist takes nobody new.
  if (reason === 'full') return 'This session just filled.';
  if (reason === 'session-past') return SESSION_STARTED_COPY;
  if (reason === 'waitlist-closed') return 'The waitlist for this session has closed.';
  if (reason === 'no-waitlist') return "Yannick's sessions have no waitlist.";
  if (reason === 'membership-inactive') return "This membership isn't active right now.";
  return null;
}

/** False for the refusals a second tap on the same session cannot change. */
export function canRetry(reason) {
  return !['full', 'session-past', 'waitlist-closed', 'no-waitlist'].includes(reason);
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
 * `unlimited` (Elite) has no tokens, so no bonus-token sentence - and no
 * token wording at all, whatever the row was paid with.
 * `singleToken` (the row was paid with a bought single token, ruling
 * 2026-09-29/30): an academy cancel returns that token instead of adding a
 * bonus; 'double-spend' is the server guard releasing a second booking made
 * with a token another booking already used.
 */
export function cancelReasonCopy(reason, { unlimited = false, singleToken = false } = {}) {
  if (reason === 'session-cancelled') {
    if (unlimited) return 'Cancelled by the academy.';
    if (singleToken) return 'Cancelled by the academy - your session token was returned.';
    return 'Cancelled by the academy - a bonus token was added.';
  }
  if (reason === 'double-spend') {
    return unlimited ? 'Cancelled by the academy.' : 'Released - this session token was already used for another booking.';
  }
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
