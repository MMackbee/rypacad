/**
 * One bookability rule for a session card (spec 2026-11-11 §5, §10 "where
 * the bookability rule is shared"): what Book a Session shows on each card
 * (screens/BookSession.js DaySessionList) and which sessions the Move picker
 * offers (hooks/move.js), so the picker never offers what the Book tab would
 * refuse. Pure. The server decides in the end - createBooking (hooks/live.js)
 * for a booking, moveBooking (functions/portal/move-decide.js) for a move.
 */
import { capacityFor } from './season';
import { eliteDailyCapHit, periodFor, positionForDate } from './packages';
import { sessionStarted } from './sessionStart';
import { reservedEligible } from './reserved';
import { isHiddenSession } from './hiddenSessions';

/** Sessions arrive raw (numeric capacity/booked) from useMonthSessions;
    useBooking's slots carry a pre-formatted capacity object. Accept both. */
export function formatCapacity(session) {
  if (session.capacity && typeof session.capacity === 'object') return session.capacity;
  return capacityFor(session);
}

/**
 * The facts a card is drawn from:
 *   cap          the capacity pill ({ state, label })
 *   isFull       full, or the session a plain tap just found full
 *   rowTokens    the position this session is judged by - a next-period
 *                session by that period's own count (positionForDate)
 *   hasGrace     a bonus or single token covers this date (expiry on or after)
 *   tokensSpent  no period token and no bonus token for it (never Elite)
 *   displayOnly  the Saturday adult block (bookable: false)
 *   started      R2: the session has started (only when `checkStarted`)
 *   held         the athlete already holds it (started wins)
 *   notTheirs    a handicap-reserved block over the athlete's handicap; an
 *                unread handicap holds nothing back
 */
export function cardFacts(
  session,
  { tokens = null, athlete = null, handicapUnread = false, checkStarted = false, bookedSessionIds = [], justFilledId = null, now = new Date() } = {}
) {
  const cap = formatCapacity(session);
  const isFull = cap.state === 'full' || session.id === justFilledId;
  const rowTokens = positionForDate(tokens, session.date);
  const hasGrace = (rowTokens?.grace ?? []).some((g) => !g.expiresAt || g.expiresAt >= session.date);
  const tokensSpent = rowTokens ? !rowTokens.unlimited && rowTokens.left === 0 && !hasGrace : false;
  const displayOnly = session.bookable === false;
  const started = checkStarted && !displayOnly && sessionStarted(session, now);
  const held = !displayOnly && !started && bookedSessionIds.includes(session.id);
  const notTheirs = !displayOnly && !handicapUnread && !reservedEligible(session, athlete);
  return { cap, isFull, rowTokens, hasGrace, tokensSpent, displayOnly, started, held, notTheirs };
}

/**
 * The token position for `dateISO` with the booking being moved (`from`, a
 * screen row) counted as given back - the server's charge (C2): a bonus or
 * single token it holds comes back while it is still valid on the new date;
 * a period token comes back only inside its own period (the household's
 * anchor period, not the calendar month); a comp never spent anything.
 */
export function positionWithFreed(tokens, from, dateISO, anchorDay) {
  const pos = positionForDate(tokens, dateISO);
  if (!pos || pos.unlimited || !from || from.comp) return pos;
  if (from.graceTokenId) {
    if (from.graceExpiresAt && from.graceExpiresAt < dateISO) return pos;
    return { ...pos, grace: [...(pos.grace ?? []), { id: from.graceTokenId, expiresAt: from.graceExpiresAt ?? null }] };
  }
  if (from.periodKey === periodFor(dateISO, anchorDay).periodKey) return { ...pos, left: (pos.left ?? 0) + 1 };
  return pos;
}

/**
 * Whether the Move picker offers `session` for the booking `from` (spec §5):
 * another session of the same kind, not cancelled by the academy, not hidden,
 * not Calendly's, not one the athlete waits on (the Book tab offers Leave
 * there, Decided 7), and bookable by the card rule above with the moved
 * booking given back; Elite's one-a-day counts the athlete's other bookings
 * only. A comp is judged without tokens (it stays free wherever it goes).
 * `bookings` are the athlete's booking docs (each with its `id`).
 */
export function moveTargetOpen(
  session,
  { from, tokens, athlete, bookedSessionIds = [], waitingSessionIds = [], pkg, bookings = [], anchorDay, now = new Date() }
) {
  if (!session || !from || session.id === from.id || session.type !== from.type) return false;
  if ((session.status ?? 'scheduled') === 'cancelled' || isHiddenSession(session) || session.source === 'calendly') return false;
  if (waitingSessionIds.includes(session.id)) return false;
  const facts = cardFacts(session, {
    tokens: from.comp ? null : positionWithFreed(tokens, from, session.date, anchorDay),
    athlete,
    checkStarted: true,
    bookedSessionIds,
    now,
  });
  if (facts.displayOnly || facts.started || facts.isFull || facts.held || facts.notTheirs || facts.tokensSpent) return false;
  return !eliteDailyCapHit(pkg, session.type, session.date, (bookings || []).filter((b) => b && b.id !== from.bookingId));
}
