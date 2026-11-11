/**
 * The cancelled and moved bookings a coach sees greyed under a session's
 * attendance list (spec 2026-11-11 §6; plan Task S1, contract C5).
 *
 * Which rows, and their words, are data/bookingChanges.js coachLine: a family
 * cancel with a known reason ("Cancelled · Sick", Other with its note) and
 * every moved-away row ("Moved to Thu Nov 12, 4:00 PM"). An older app's
 * cancel (no reason), academy, billing and double-spend cancels stay off.
 *
 * One query on the existing (sessionId, status) index - coaches read any
 * booking - then a name per shown row (each read on its own, so one refusal
 * costs one name, not the list) and the moved rows' new sessions in one read.
 *
 * Never imports hooks/index.js (screen tests mock it partially). Live only:
 * seed mode, or no session, is an empty list that reads nothing.
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, fetchAthlete, fetchSessionsByIds, isLive, wrap } from './live';
import { useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { coachLine, movedToSessionId } from '../data/bookingChanges';

/** Every cancelled booking on one session, as `{ id, ...data }`. */
export async function fetchCancelledBySession(sessionId) {
  if (!sessionId) {
    throw new LiveDataError(ERR.INVALID, 'fetchCancelledBySession: sessionId is required.');
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'bookings'), where('sessionId', '==', sessionId), where('status', '==', 'cancelled'))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchCancelledBySession');
  }
}

/**
 * The rows the coach reads, sorted by name: `[{ bookingId, athleteId, name,
 * line }]`. A name that cannot be read is null (the screen says "Name
 * unavailable"); a moved row whose new session cannot be read says "Moved".
 */
export async function liveCancelledRows(sessionId) {
  const shown = (await fetchCancelledBySession(sessionId)).filter((b) => coachLine(b) != null);
  if (shown.length === 0) return [];
  const athleteIds = [...new Set(shown.map((b) => b.athleteId).filter(Boolean))];
  const targetIds = [...new Set(shown.filter((b) => b.cancelReason === 'moved').map(movedToSessionId).filter(Boolean))];
  const [settled, targets] = await Promise.all([
    Promise.allSettled(athleteIds.map((id) => fetchAthlete(id))),
    targetIds.length ? fetchSessionsByIds(targetIds).catch(() => []) : [],
  ]);
  const nameById = new Map(settled.filter((s) => s.status === 'fulfilled').map((s) => [s.value.id, s.value.name]));
  const sessionById = new Map(targets.map((s) => [s.id, s]));
  return shown
    .map((b) => ({
      bookingId: b.id,
      athleteId: b.athleteId,
      name: nameById.get(b.athleteId) ?? null,
      line: coachLine(b, sessionById.get(movedToSessionId(b)) ?? null),
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/**
 * `{ data, loading, error }` for one session's greyed rows. Re-reads on every
 * bookings write (a mark, a family cancel seen by a stale tap), as
 * useSessionAttendance does.
 */
export function useCancelledBookings(sessionId) {
  const live = isLive() && Boolean(sessionId);
  const bookingsGen = useInvalidation('bookings');
  return useSeedResource(
    live ? null : [],
    live ? { source: () => liveCancelledRows(sessionId), deps: ['cancelled-rows', sessionId, bookingsGen] } : undefined
  );
}
