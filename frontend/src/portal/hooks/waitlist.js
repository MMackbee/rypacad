/**
 * The waitlist surface (Sprint 13, contract v2.1, pin F) — split out of
 * hooks/live.js / hooks/index.js per the sprint brief's own instruction
 * ("split new code into hooks/waitlist.js / hooks/grace.js"); everything
 * here is genuinely new, not a change to an existing function. Same
 * one-directional dependency shape useAuthSession.js/useRoster.js already
 * establish (imports FROM ./live, never the other way) — live.js's own
 * createBooking needs `joinWaitlist` too, so that one write lives in
 * live.js itself (avoiding a circular import) and this file re-uses it
 * rather than duplicating the shape.
 *
 * Read model (audit 2026-09-30, replacing the signed-in-reads-all rule): the
 * waitlist read is household-scoped like bookings. An athlete's own login
 * reads entries with its own athleteId, a parent entries with its own
 * householdId, staff all of them - so every member query here carries that
 * filter. No family can read another's entries, which means the place in
 * line can no longer be counted in the browser: it comes from the
 * waitlistPositions callable (fetchWaitlistPositions below), in the exact
 * order promotion uses, and is simply not shown when the call fails.
 */

import { useState } from 'react';
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { bump, useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { callWaitlistPositions } from './callables';
import {
  ERR,
  LiveDataError,
  fetchAthlete,
  fetchCurrentUser,
  fetchHousehold,
  fetchSessionsByIds,
  isLive,
  joinWaitlist,
  requireUser,
  wrap,
} from './live';
import { normalizeAnchorDay, periodFor } from '../data/packages';

/**
 * Every waitlist entry for one session, joinedAt ascending. STAFF ONLY under
 * the household-scoped read rule (a member's list on sessionId alone is
 * refused) - the query a "who's waiting" staff view would use; no member
 * code path calls it. Rides the pre-existing `waitlist (sessionId, joinedAt)`
 * composite index (firestore.indexes.json).
 */
export async function fetchWaitlistBySession(sessionId) {
  if (!sessionId) {
    throw new LiveDataError(ERR.INVALID, 'fetchWaitlistBySession: sessionId is required.');
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'waitlist'), where('sessionId', '==', sessionId), orderBy('joinedAt'))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchWaitlistBySession');
  }
}

/**
 * Every waitlist entry for one athlete — powers the "waitlisted" row state
 * useSchedule/useMonthSessions merge in (hooks/index.js). The athlete's own
 * login proves the athleteId filter; a parent-context caller passes its
 * `householdId` so the query also carries the one filter the rule can prove
 * for a parent (the fetchBookings pattern, hooks/live.js).
 */
export async function fetchWaitlistByAthlete(athleteId, { householdId = null } = {}) {
  if (!athleteId) {
    throw new LiveDataError(ERR.INVALID, 'fetchWaitlistByAthlete: athleteId is required.');
  }
  try {
    const filters = [where('athleteId', '==', athleteId)];
    if (householdId) filters.push(where('householdId', '==', householdId));
    const snap = await getDocs(query(collection(db, 'waitlist'), ...filters));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchWaitlistByAthlete');
  }
}

/** The callable takes 1 to 50 session ids a call. */
const POSITIONS_PER_CALL = 50;

/**
 * `{ [sessionId]: { [athleteId]: place } }` for the caller's own athletes,
 * from the waitlistPositions callable. NEVER throws: not deployed yet, a
 * network failure or an odd reply all resolve to "no places known", and the
 * screens then say "On the waitlist" without a number.
 */
export async function fetchWaitlistPositions(sessionIds) {
  const ids = [...new Set((sessionIds || []).filter(Boolean))];
  const out = {};
  const calls = [];
  for (let i = 0; i < ids.length; i += POSITIONS_PER_CALL) {
    calls.push(
      Promise.resolve()
        .then(() => callWaitlistPositions({ sessionIds: ids.slice(i, i + POSITIONS_PER_CALL) }))
        .catch(() => null)
    );
  }
  for (const reply of await Promise.all(calls)) {
    const positions = reply && reply.positions;
    if (positions && typeof positions === 'object') Object.assign(out, positions);
  }
  return out;
}

/** One athlete's 1-based place on one session from that map, or null when unknown. */
export function positionOf(positions, sessionId, athleteId) {
  const place = positions && positions[sessionId] ? positions[sessionId][athleteId] : null;
  return Number.isInteger(place) && place > 0 ? place : null;
}

/**
 * Every waitlist entry across an entire household — powers
 * useHouseholdReservations' merged waitlisted rows, one query for every
 * member at once (mirrors fetchHouseholdBookings' own shape in live.js).
 */
export async function fetchWaitlistByHousehold(householdId) {
  if (!householdId) {
    throw new LiveDataError(ERR.INVALID, 'fetchWaitlistByHousehold: householdId is required.');
  }
  try {
    const snap = await getDocs(query(collection(db, 'waitlist'), where('householdId', '==', householdId)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchWaitlistByHousehold');
  }
}

/**
 * Leave a waitlist (contract v2.1, pin F) — deletes the caller's own entry.
 * firestore.rules scopes the delete to the athlete's own user or the
 * household parent; no grace token is minted (voluntary leave mints
 * nothing, per §4/pin E).
 *
 * A refused leave (audit 2026-09-30) reloads the lists either way, then
 * rejects with a typed reason the screens word (components/WaitlistAction.js
 * leaveFailureCopy): 'promoted' when the entry is gone because the athlete
 * was just booked into the session, 'leave-failed' for anything else -
 * never the raw permissions text.
 *
 * Demo (seed) mode writes nothing: the screens call this directly, so the
 * seeded waitlisted row's Leave is a no-op that resolves, like every other
 * write off the live flag - never a "could not be removed" about demo data.
 */
export async function leaveWaitlist({ sessionId, athleteId }) {
  if (!sessionId || !athleteId) {
    throw new LiveDataError(ERR.INVALID, 'leaveWaitlist: sessionId and athleteId are both required.');
  }
  const id = `${sessionId}_${athleteId}`;
  if (!isLive()) return { id, simulated: true };
  requireUser();
  try {
    await deleteDoc(doc(db, 'waitlist', id));
  } catch (err) {
    bump('waitlist');
    bump('bookings'); // the row on screen is stale: reload it
    throw await leaveFailure(err, sessionId, athleteId);
  }
  bump('waitlist');
  bump('bookings'); // the schedule/reservations lists subscribe to bookings
  return { id };
}

/**
 * Why a leave was refused. A promotion deletes the entry and writes the
 * booking in one transaction, so a confirmed booking at the pinned
 * `{athleteId}_{sessionId}` id is the proof; a booking that is not there is
 * unreadable by rule, which reads as "not promoted".
 */
async function leaveFailure(err, sessionId, athleteId) {
  const booking = await getDoc(doc(db, 'bookings', `${athleteId}_${sessionId}`)).catch(() => null);
  if (booking && booking.exists() && booking.data().status === 'confirmed') {
    return new LiveDataError(ERR.INVALID, 'This athlete was just booked into this session.', err, 'promoted');
  }
  return new LiveDataError(
    wrap(err, 'leaveWaitlist').code,
    'That waitlist place could not be removed. Your list has been refreshed.',
    err,
    'leave-failed'
  );
}

/**
 * One athlete's own place on one session: their entry (a scoped read) and
 * its position from the callable - null when it is unknown.
 */
async function fetchOwnPlace(sessionId, athleteId) {
  const profile = await fetchCurrentUser();
  const mine = await fetchWaitlistByAthlete(athleteId, { householdId: profile.athleteId ? null : profile.householdId });
  const entry = mine.find((e) => e.sessionId === sessionId) ?? null;
  if (!entry) return { entry: null, position: null };
  return { entry, position: positionOf(await fetchWaitlistPositions([sessionId]), sessionId, athleteId) };
}

/**
 * `useWaitlist(sessionId, { athleteId })` -> `{ entry, position, join(),
 * leave(), saving, error }` (hook seam, contract v2.1). `position` is the
 * athlete's 1-based place from the waitlistPositions callable; null when the
 * athlete is not on it, or the place is unknown. `join()` resolves the session's date and the
 * athlete's household/period itself — the pinned call signature takes no
 * other arguments, matching useBooking().book()'s own "the hook already
 * knows who's asking" idiom.
 *
 * Seed/practice mode: no standalone demo waitlist state for an arbitrary
 * session here (`entry`/`position` stay null) — the populated "waitlisted"
 * demo row lives on useSchedule/useHouseholdReservations/useMonthSessions'
 * OWN seed branches (data/seed.js's WAITLIST_ENTRY), which is what My
 * Schedule/Reservations/Book a Session actually render; join()/leave() are
 * local no-op echoes, the same discipline every other write action in this
 * app uses off the live flag.
 */
export default function useWaitlist(sessionId, { athleteId } = {}) {
  const live = isLive();
  const gen = useInvalidation('waitlist');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const own = live && sessionId && athleteId;
  const state = useSeedResource(
    own ? null : { entry: null, position: null },
    own
      ? { source: () => fetchOwnPlace(sessionId, athleteId), deps: ['waitlist-place', sessionId, athleteId, gen] }
      : undefined
  );

  const entry = state.data?.entry ?? null;
  const position = state.data?.position ?? null;

  const join = async () => {
    if (!sessionId || !athleteId) {
      throw new LiveDataError(ERR.INVALID, 'useWaitlist.join(): sessionId and athleteId are both required.');
    }
    setSaving(true);
    setError(null);
    try {
      if (!live) {
        return { id: `${sessionId}_${athleteId}`, sessionId, athleteId, simulated: true };
      }
      const [sessions, athlete] = await Promise.all([fetchSessionsByIds([sessionId]), fetchAthlete(athleteId)]);
      const session = sessions[0];
      if (!session) {
        throw new LiveDataError(ERR.NOT_FOUND, 'That session no longer exists.');
      }
      const household = athlete.householdId ? await fetchHousehold(athlete.householdId) : null;
      const anchorDay = normalizeAnchorDay(household?.periodAnchorDay);
      const { periodKey } = periodFor(session.date, anchorDay);
      return await joinWaitlist({
        sessionId,
        athleteId,
        householdId: athlete.householdId,
        date: session.date,
        periodKey,
        // The session's own start time and type: joinWaitlist's started,
        // Yannick and Elite one-a-day checks read them.
        time: session.time ?? null,
        type: session.type ?? null,
      });
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!live) {
        return { id: `${sessionId}_${athleteId}`, simulated: true };
      }
      return await leaveWaitlist({ sessionId, athleteId });
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  return {
    entry,
    position,
    join,
    leave,
    saving,
    error: error || state.error,
    loading: state.loading,
  };
}
