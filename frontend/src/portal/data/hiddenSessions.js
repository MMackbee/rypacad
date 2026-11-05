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
 * session out (hooks/repeat.js isGroupBookable - the group flow, the
 * coach's day and the admin block fill - plus the month calendar, Phil's
 * slots and a specialist's own day in hooks/index.js), Repeat weekly steps
 * over its week as "no session", and createBooking refuses it with
 * SESSION_HIDDEN. A booking that already sits on a hidden session is
 * joined by id and shows as usual. firestore.rules is the server half: no
 * + 1 on its seat count (a booking or a re-book) and no waitlist join; a
 * cancel always lands.
 */

/** The typed rejection reason createBooking carries for a hidden session. */
export const SESSION_HIDDEN = 'session-hidden';

/** What a screen loaded before the session was hidden shows when it is tapped. */
export const HIDDEN_SESSION_LINE = "That session isn't offered right now. Pick another time.";

/** True only for a session the hide script hid. */
export function isHiddenSession(session) {
  return Boolean(session) && session.hidden === true;
}
