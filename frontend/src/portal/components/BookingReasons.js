import React from 'react';
import { color, font } from '../tokens';
import { Banner } from './Primitives';
import { BOOKING_OPENS_AT, BOOKING_OPENS_LABEL, academyDateISO, longDayLabel, monthName, nextMonthFirstShort, todayISO, windowOpensOn } from '../data/calendar';
import { SESSION_STARTED_COPY } from '../data/sessionStart';
import { afterSeasonEnd, SEASON_BOUNDS } from '../data/season';

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

/** 'yyyy-MM' or 'yyyy-MM-dd' -> a day in that month; nothing -> today. */
const dayIn = (dateOrMonth) => (dateOrMonth && dateOrMonth.length === 7 ? `${dateOrMonth}-01` : dateOrMonth) || todayISO();

/**
 * Pin K's exact wording: "next mental game session opens <date>." K04: the
 * cap is judged for the SESSION's month (live.js assertMentalCadence), so the
 * date is the 1st after that session's month - a December refusal on Nov 4
 * says Jan 1, not Dec 1. With no date (the Calendly panel, where nothing is
 * picked yet) it is the 1st after today's month.
 */
export function capReachedCopy(dateOrMonth) {
  return `Next mental game session opens ${nextMonthFirstShort(dayIn(dateOrMonth))}.`;
}

/** 'yyyy-MM' -> the next month's 'yyyy-MM'. */
function nextMonthKey(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** "Saturday, Feb 27" - nothing runs after the season's last day. */
const SEASON_END_COPY = `The season ends ${longDayLabel(SEASON_BOUNDS.end)}, so there is no later month to book.`;

/**
 * When the next mental game session can be, with `dateOrMonth`'s cap booked
 * (review 2026-11-04): the 1st after the LAST month in a row whose cap is
 * booked too (`bookedMonths`, 'yyyy-MM' - a booked November and December
 * name Jan 1, never Dec 1); past the season's last month, the season's end
 * instead of a March with no sessions. No months given: the month after
 * the given one, as capReachedCopy says.
 */
export function capOpensCopy(dateOrMonth, bookedMonths = []) {
  let last = dayIn(dateOrMonth).slice(0, 7);
  while (bookedMonths.includes(nextMonthKey(last))) last = nextMonthKey(last);
  return afterSeasonEnd(`${nextMonthKey(last)}-01`) ? SEASON_END_COPY : capReachedCopy(last);
}

/**
 * K04: the cap line for a booked month by name - a later month on the slot
 * list ("December's mental game cap is booked. Next mental game session
 * opens Jan 1."), past any run of booked months after it (capOpensCopy).
 */
export function capMonthCopy(dateOrMonth, bookedMonths = []) {
  return `${monthName(dayIn(dateOrMonth))}'s mental game cap is booked. ${capOpensCopy(dateOrMonth, bookedMonths)}`;
}

/**
 * Calendly, with today's month booked and a later one open (review
 * 2026-11-04): the month to pick a time in, and what a time before it would
 * do - Calendly takes any date. `bookedMonths`: the booked months before
 * `pick`, in order ("November's and December's ... caps are booked").
 */
export function capPickCopy(bookedMonths, pick) {
  const names = (bookedMonths.length ? bookedMonths : [todayISO()]).map((m) => monthName(dayIn(m)));
  const pickName = monthName(dayIn(pick));
  if (names.length === 1) {
    return `${names[0]}'s mental game cap is booked. Pick a time in ${pickName} - another ${names[0]} time would go over the monthly limit.`;
  }
  const owners = names.map((n) => `${n}'s`);
  const list = `${owners.slice(0, -1).join(', ')} and ${owners[owners.length - 1]}`;
  return `${list} mental game caps are booked. Pick a time in ${pickName} - an earlier time would go over the monthly limit.`;
}

/**
 * The typed booking-rejection reasons (routing lane, contract v2.1 §12/pin D/H).
 * `opts.date`: the refused session's date, for the reasons that name a month.
 */
export function reasonCopy(reason, opts) {
  if (reason === 'no-tokens-left') return 'No tokens left this period.';
  // The single token (ruling 2026-09-29/30): tokens are bought, never reset.
  if (reason === 'no-session-token') return 'No session token left - buy one to book.';
  if (reason === 'outside-window') return "That date isn't open for booking yet.";
  if (reason === 'cap-reached') return capReachedCopy(opts && opts.date);
  // v2.0.1 (Sprint 18): Elite's per-day frequency caps.
  if (reason === 'one-per-day') return "Elite includes one training block, one Tour event and one Performance with Phil session a day - there's already one of those booked that day.";
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
  // Owner ruling 2026-10-02: a block reserved by handicap (data/reserved.js).
  // The card says the limit; this is the write's refusal, when a screen
  // loaded before the block was reserved let the tap through.
  if (reason === 'handicap-reserved') return 'This session is reserved for lower handicaps.';
  if (reason === 'membership-inactive') return "This membership isn't active right now.";
  // Owner 2026-11-04: a block the athlete already holds reads "Booked" on the
  // card and is inert; this is the write's own refusal when a screen loaded
  // before the booking let the tap through. A second tap changes nothing.
  if (reason === 'already-booked') return 'This athlete already has this session booked.';
  return null;
}

/** False for the refusals a second tap on the same session cannot change. */
export function canRetry(reason) {
  return !['full', 'session-past', 'waitlist-closed', 'no-waitlist', 'handicap-reserved', 'already-booked'].includes(reason);
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
 * Pin D: a day past the booking window renders locked, not just empty. The
 * day it opens is the 1st of a month at 7 AM (owner ruling 2026-11-02:
 * windowOpensOn, `windowMonths` months before the session's own month).
 * UX review #8: while the Oct 10 gate is shut (`gateOpen` false: a token
 * package before 07:00 Oct 10), a day whose window would open BEFORE the gate
 * says the gate's date instead. Display only; the server gate is unchanged.
 * Titled per day so it doesn't repeat the screen's own "Not open yet".
 */
export function LockedDayNotice({ date, windowMonths = 1, gateOpen = true }) {
  const opens = windowOpensOn(date, windowMonths);
  return (
    <Banner tone="neutral" title="Not open for this day yet">
      {!gateOpen && opens < GATE_ISO
        ? `Booking for ${longDayLabel(date)} opens ${BOOKING_OPENS_LABEL}.`
        : `Booking for ${longDayLabel(date)} opens 7 AM on ${longDayLabel(opens)}.`}
    </Banner>
  );
}
