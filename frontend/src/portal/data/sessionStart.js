/**
 * Has a session started (waitlist hardening, owner ruling R2: a session that
 * has started or is in the past cannot be booked or waitlisted). Pure, and
 * judged on the academy's clock (America/Chicago), not the phone's - the one
 * rule createBooking/joinWaitlist (hooks/live.js) and both booking screens
 * read, so a card can never offer what the write would refuse.
 */
import { academyClock, parseTimeToMinutes } from './calendar';

/** The copy every refusal of a started session shows. */
export const SESSION_STARTED_COPY = 'This session has already started.';

/** True for a date before the academy's today. */
export function dayIsPast(dateISO, now = new Date()) {
  return Boolean(dateISO) && dateISO < academyClock(now).date;
}

/**
 * True when the session's date is before today, or it is today and its
 * start time has passed. A session with no readable time is judged by its
 * date alone (the rules still refuse it once its day is over).
 */
export function sessionStarted(session, now = new Date()) {
  if (!session || !session.date) return false;
  const clock = academyClock(now);
  if (session.date !== clock.date) return session.date < clock.date;
  const start = parseTimeToMinutes(session.time);
  return start != null && start <= clock.minutes;
}

/**
 * No same-day promotion (owner ruling R3): nobody is booked off a waitlist
 * on the day of the session, so from that day on a waitlist place can never
 * turn into a booking and is not offered.
 */
export function waitlistClosed(session, now = new Date()) {
  if (!session || !session.date) return false;
  return session.date <= academyClock(now).date;
}

/**
 * Book a Session's day states with past days made untappable ('open' is the
 * grid's not-tappable state). Returns a new map; today and later are as given.
 */
export function lockPastDays(dayStates, now = new Date()) {
  const today = academyClock(now).date;
  const out = {};
  for (const iso of Object.keys(dayStates || {})) out[iso] = iso < today ? 'open' : dayStates[iso];
  return out;
}
