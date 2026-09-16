import React from 'react';
import { Banner } from './Primitives';
import { longDayLabel, nextMonthFirstShort, todayISO, windowOpensOn } from '../data/calendar';

/**
 * Shared booking-rejection/lock copy (Sprint 12 pin, contract v2.0). Both
 * BookSession.js and SpecialistBooking.js hit the same four typed reasons
 * (contract §12: 'no-tokens-left' | 'outside-window' | 'cap-reached' |
 * 'full') and the same "past the booking window" locked state (pin D) —
 * extracted here so the copy can't drift between the two screens, and so
 * SpecialistBooking.js (already over the project's 500-line file convention
 * before this sprint) doesn't grow net lines carrying a second copy of it.
 */

/** Pin K's exact wording: "next mental game session opens <date>." */
export function capReachedCopy() {
  return `Next mental game session opens ${nextMonthFirstShort(todayISO())}.`;
}

/** The typed booking-rejection reasons (routing lane, contract v2.0 §12/pin D). */
export function reasonCopy(reason) {
  if (reason === 'no-tokens-left') return 'No tokens left this period.';
  if (reason === 'outside-window') return "That date isn't open for booking yet.";
  if (reason === 'cap-reached') return capReachedCopy();
  if (reason === 'full') return 'That block filled before the reservation completed.';
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
