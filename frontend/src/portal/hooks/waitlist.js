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
 * Read model (documented at length in firestore.rules' own waitlist match
 * block): waitlist reads are signedIn()-unconditional, the SAME "not
 * family data" call already made for sessions/tournamentResults — a
 * family-scoped rule cannot make a `sessionId ==` list query (needed to
 * compute the pinned 1-based `position` across every family on that
 * session) provable, and a wrong position is worse than an unbuilt one.
 * The payload itself carries no name/dob/contact/medical fact.
 */

import { useState } from 'react';
import { collection, deleteDoc, doc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { bump, useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import {
  ERR,
  LiveDataError,
  fetchAthlete,
  fetchHousehold,
  fetchSessionsByIds,
  isLive,
  joinWaitlist,
  requireUser,
  wrap,
} from './live';
import { normalizeAnchorDay, periodFor } from '../data/packages';

/**
 * Every waitlist entry for one session, joinedAt ascending — the query
 * `useWaitlist`'s position math reads, and the same one a "who's waiting"
 * staff view (not built this sprint) would use. Rides the pre-existing
 * `waitlist (sessionId, joinedAt)` composite index (firestore.indexes.json).
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
 * Every waitlist entry for one athlete, unfiltered — powers the "waitlisted"
 * row state useSchedule/useMonthSessions merge in (hooks/index.js).
 */
export async function fetchWaitlistByAthlete(athleteId) {
  if (!athleteId) {
    throw new LiveDataError(ERR.INVALID, 'fetchWaitlistByAthlete: athleteId is required.');
  }
  try {
    const snap = await getDocs(query(collection(db, 'waitlist'), where('athleteId', '==', athleteId)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchWaitlistByAthlete');
  }
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
 */
export async function leaveWaitlist({ sessionId, athleteId }) {
  if (!sessionId || !athleteId) {
    throw new LiveDataError(ERR.INVALID, 'leaveWaitlist: sessionId and athleteId are both required.');
  }
  requireUser();
  try {
    const id = `${sessionId}_${athleteId}`;
    await deleteDoc(doc(db, 'waitlist', id));
    bump('waitlist');
    return { id };
  } catch (err) {
    throw wrap(err, 'leaveWaitlist');
  }
}

function joinedAtMillis(entry) {
  return entry?.joinedAt?.toMillis?.() ?? 0;
}

/**
 * `useWaitlist(sessionId, { athleteId })` -> `{ entry, position, join(),
 * leave(), saving, error }` (hook seam, contract v2.1). `position` is
 * 1-based by joinedAt among every entry on this session; null when the
 * athlete is not (yet) on it. `join()` resolves the session's date and the
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

  const state = useSeedResource(
    live && sessionId ? null : [],
    live && sessionId
      ? { source: () => fetchWaitlistBySession(sessionId), deps: ['waitlist-session', sessionId, gen] }
      : undefined
  );

  const entries = (state.data ?? []).slice().sort((a, b) => joinedAtMillis(a) - joinedAtMillis(b));
  const idx = athleteId ? entries.findIndex((e) => e.athleteId === athleteId) : -1;
  const entry = idx >= 0 ? entries[idx] : null;
  const position = idx >= 0 ? idx + 1 : null;

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
