import { format, parseISO } from 'date-fns';
import { bump } from './invalidate';

/**
 * Cancel a series (tester Mike, 2026-09-30: "cancel just this one or the
 * entire series, like a google calendar meeting"). Repeat weekly writes one
 * ordinary booking per week and nothing links them, so a series is defined
 * by what the family sees on the list: the same athlete, weekday, start time
 * and session type, on later weeks the app can still cancel.
 *
 * Pure and Firebase-free on purpose (CancelSheet imports it): the cancel
 * itself is the hook's own cancel(bookingId, opts), passed in, so every week
 * goes through the SAME transaction and rules a single cancel uses.
 */

/** '2026-12-10' -> 'Thu, Dec 10'. */
function shortDay(iso) {
  return format(parseISO(iso), 'EEE, MMM d');
}

/** ['Nov 10'] -> 'Nov 10'; three -> 'Nov 10, Nov 17 and Nov 24'. */
function listDates(rows) {
  const days = rows.map((r) => format(parseISO(r.date), 'MMM d'));
  return days.length > 1 ? `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}` : days[0];
}

/**
 * The later weeks of `target` among `rows` (useSchedule's sessions, or one
 * member's `upcoming` from useHouseholdReservations), in date order. Earlier
 * bookings are never part of it. `cancellable` is the hooks' own rule
 * (confirmed, the day before at the latest, not Calendly-managed).
 */
export function laterWeeks(target, rows) {
  if (!target || !target.date) return [];
  const weekday = parseISO(target.date).getDay();
  return (rows ?? [])
    .filter(
      (r) =>
        r.bookingId &&
        r.bookingId !== target.bookingId &&
        r.status === 'confirmed' &&
        r.cancellable === true &&
        r.date > target.date &&
        parseISO(r.date).getDay() === weekday &&
        r.time === target.time &&
        r.meridiem === target.meridiem &&
        r.type === target.type &&
        (r.athleteId ?? null) === (target.athleteId ?? null)
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * The series choice for the cancel dialog, or null when there are no later
 * weeks (the dialog is then exactly the single cancel).
 */
export function seriesOffer(later) {
  const n = later?.length ?? 0;
  if (!n) return null;
  const weeks = `${n} later week${n === 1 ? '' : 's'}`;
  return {
    confirmLabel: `Cancel this and ${weeks}`,
    note: `Also booked at the same time on ${weeks}, through ${shortDay(later[n - 1].date)}.`,
  };
}

/**
 * Failures that concern the whole family rather than one booking, by the
 * adapter's error code (live.js ERR - strings here so this module never
 * loads Firebase; live.cancel.test.js pins them to ERR). 'permission-denied'
 * is what a series cancel gets while firestore.rules does not yet admit
 * cancelledVia: it stops at the first week with nothing changed.
 */
export const SERIES_STOP_COPY = {
  'permission-denied': 'The whole series could not be cancelled right now. You can still cancel each week on its own.',
  unavailable: 'The connection dropped. Check your connection and try again.',
  unauthenticated: 'You are signed out. Sign in again to cancel.',
};

/**
 * Cancel `rows` (the booking and its later weeks, date order) one after
 * another through `cancel` - each marked cancelledVia 'series' so
 * onBookingCancelled sends no notice per week, and silent so the lists
 * refresh once at the end rather than after every week. A failure of one
 * booking is collected and the run continues; one that concerns the whole
 * family stops it. Never throws.
 *
 * Returns { total, cancelled: [{bookingId,date}], failed: [{bookingId,date,
 * message}], stopped: { message, remaining: [{bookingId,date}] } | null }.
 */
export async function cancelSeries(rows, cancel) {
  const cancelled = [];
  const failed = [];
  let stopped = null;
  const brief = ({ bookingId, date }) => ({ bookingId, date });
  try {
    for (let i = 0; i < rows.length; i += 1) {
      try {
        await cancel(rows[i].bookingId, { cancelledVia: 'series', silent: true });
        cancelled.push(brief(rows[i]));
      } catch (err) {
        const stop = SERIES_STOP_COPY[err?.code];
        if (stop) {
          stopped = { message: stop, remaining: rows.slice(i).map(brief) };
          break;
        }
        failed.push({ ...brief(rows[i]), message: err?.message || 'It could not be cancelled.' });
      }
    }
  } finally {
    // Weeks cancelled before a stop are real cancellations too.
    if (cancelled.length) {
      bump('bookings');
      bump('sessions');
    }
  }
  return { total: rows.length, cancelled, failed, stopped };
}

/**
 * The one summary a series cancel ends in: how many were cancelled, and any
 * that were not, with the reason (weeks sharing a reason share a line).
 */
export function seriesSummary({ total, cancelled, failed, stopped }) {
  const n = cancelled.length;
  const title =
    n === total
      ? `${n} reservations cancelled`
      : n
        ? `${n} of ${total} reservations cancelled`
        : 'No reservations were cancelled';
  const byReason = new Map();
  for (const f of failed) byReason.set(f.message, [...(byReason.get(f.message) ?? []), f]);
  if (stopped) byReason.set(stopped.message, [...(byReason.get(stopped.message) ?? []), ...stopped.remaining]);
  const lines = n ? [`Cancelled: ${listDates(cancelled)}.`] : [];
  for (const [reason, rows] of byReason) {
    const line = `${listDates(rows)} ${rows.length === 1 ? 'was' : 'were'} not cancelled. ${reason}`;
    lines.push(/[.!?]$/.test(line) ? line : `${line}.`);
  }
  return { title, lines };
}
