/**
 * Hidden sessions (owner 2026-11-05: the empty Monday and Wednesday 6 PM
 * training blocks "sort of hidden for now; once enrollment and token usage %
 * goes up we will need those sessions back"). PURE - the one place the
 * client decides a session is hidden.
 *
 * The flag is DATA on the session: sessions/{id}.hidden === true, written
 * only by scripts/hide-sessions.mjs (with hiddenAt and hiddenBy) and removed
 * by its --show. Absent or anything but true is not hidden. The calendar
 * sync never writes it and keeps it.
 *
 * Hidden means not offered: every list a family books from leaves the
 * session out (hooks/repeat.js isGroupBookable - the group flow and the
 * admin block fill - plus the month calendar and its day marks and Phil's
 * slots in hooks/index.js and data/calendarViews.js), the Repeat weekly
 * card offers only the weeks the live read holds (components/RepeatWeekly.js)
 * and the repeat steps over a hidden week as "no session", and createBooking
 * refuses it with SESSION_HIDDEN. The coach's day and a specialist's own day
 * leave out a hidden session too, unless a seat is counted on it. A booking
 * that already sits on a hidden session is joined by id and shows as usual.
 * firestore.rules is the server half: no + 1 on its seat count (a booking or
 * a re-book) and no waitlist join; a cancel always lands.
 */

/** The typed rejection reason createBooking carries for a hidden session. */
export const SESSION_HIDDEN = 'session-hidden';

/** What a screen loaded before the session was hidden shows when it is tapped. */
export const HIDDEN_SESSION_LINE = "That session isn't offered right now. Pick another time.";

/** True only for a session the hide script hid. */
export function isHiddenSession(session) {
  return Boolean(session) && session.hidden === true;
}
