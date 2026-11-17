/**
 * Live payload for useSpecialistSessions (hooks/index.js) - the specialist's
 * OWN upcoming sessions, each joined to its live roster (non-cancelled
 * bookings -> athlete names; a name the caller cannot read renders as a
 * count, not a crash). Powers the "My sessions" day view (Sprint 9 amendment
 * v1.7.1: specialist-side access) for Phil, Yannick and the owner/ops
 * switcher.
 *
 * Speed review F1 (2026-11-17): this ran one bookings query per upcoming slot
 * AFTER the sessions read (256 for Phil in production), then one athlete read
 * per booking per session - 3 rounds, about 360 requests on every open and
 * every bookings or sessions bump. Now the sessions range and ONE bookings
 * query by type (specialistLive.js) run together, then one deduped athlete
 * join: 2 rounds. The rows are exactly what the per-session reads built
 * (specialistSessions.test.js runs that code beside this on one fixture).
 */
import { fetchAthletesByIds, fetchBookingsBySession, fetchSessionsInRange } from './live';
import { fetchBookingsByType } from './specialistLive';
import { dayLabel } from '../data/season';
import { DEFAULT_DURATION_MINUTES } from '../data/schedule';
import { isHiddenSession } from '../data/hiddenSessions';
import { SPECIALISTS } from '../data/specialists';

/** The statuses fetchBookingsBySession reads (live.js): a booking that holds its seat. */
const SEATED = new Set(['confirmed', 'attended', 'noshow']);
const SPECIALIST_BY_ID = new Map(SPECIALISTS.map((sp) => [sp.id, sp]));

const byDateThenId = (a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1);

function rowFor(s, active, nameById, today) {
  // 2026-11-04: a Calendly booking the webhook could not place is HELD
  // as a session with no booking (functions/portal/calendly.js,
  // `unresolved: true`) - Yannick's time is taken, so it counts as booked
  // and the row says so until the academy links it.
  const unresolved = active.length === 0 && s.unresolved === true;
  return {
    sessionId: s.id,
    date: s.date,
    dayLabel: dayLabel(s.date, today),
    time: s.time,
    booked: unresolved ? 1 : active.length,
    capacity: s.capacity ?? 1,
    unresolved,
    type: s.type,
    durationMinutes: s.durationMinutes ?? (SPECIALIST_BY_ID.get(s.type)?.durationMinutes ?? DEFAULT_DURATION_MINUTES),
    athletes: active.map((b) => ({
      athleteId: b.athleteId,
      name: nameById.get(b.athleteId) ?? null,
      // Who is coming (owner ruling, 2026-09-22). The booking is still
      // FOR the child - absent means they attend, which is every booking
      // written before the choice existed.
      attendee: b.attendee ?? 'athlete',
    })),
  };
}

/**
 * @param {string} specialistId - 'phil' | 'mental', which is also sessions.type and bookings.type.
 * @param {string} today - ISO 'yyyy-MM-dd'.
 * @param {string} toDate - the last day shown (MAX_WINDOW_MONTHS out; see index.js).
 */
export async function liveSpecialistSessions(specialistId, today, toDate) {
  const [sessions, typed] = await Promise.all([fetchSessionsInRange(today, toDate), fetchBookingsByType(specialistId)]);
  const mine = sessions
    // 2026-11-05: a hidden session is left out unless a seat is counted on it
    // (as on the coach's day), so its roster still opens.
    .filter((s) => s.type === specialistId && s.status !== 'cancelled' && (!isHiddenSession(s) || Number(s.booked ?? 0) > 0))
    .sort(byDateThenId);

  // The type query reads every booking of the type, past and cancelled ones
  // too; only seated bookings on the day's own slots are kept.
  const seated = new Map(mine.map((s) => [s.id, []]));
  for (const b of typed) {
    if (SEATED.has(b.status)) seated.get(b.sessionId)?.push(b);
  }

  // A slot the calendar sync re-typed after families booked it keeps their
  // bookings' old type, so the type query misses them; its seat counter does
  // not. Where the counter says more than were found, that one slot is read
  // by id as before. A held Calendly slot counts a seat with no booking by
  // design, so it is not.
  const short = mine.filter((s) => s.unresolved !== true && seated.get(s.id).length < Number(s.booked ?? 0));
  await Promise.all(
    short.map(async (s) => {
      seated.set(s.id, (await fetchBookingsBySession(s.id)).filter((b) => b.status !== 'cancelled'));
    })
  );

  // One join for the whole day: an athlete on six of Phil's slots is read once.
  const athletes = await fetchAthletesByIds([...new Set([...seated.values()].flat().map((b) => b.athleteId))]);
  const nameById = new Map(athletes.map((a) => [a.id, a.name]));
  return { sessions: mine.map((s) => rowFor(s, seated.get(s.id), nameById, today)) };
}
