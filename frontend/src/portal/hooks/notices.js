/**
 * Recent notices — the member-facing read of the notification ledger
 * (contract v2.2, Sprint 14, TEAM.md "Sprint 14 pins — notifications").
 *
 * `notifications/{kind}_{subjectKey}` is written ONLY by the Cloud Functions
 * that send a notice (admin SDK); a client never creates, updates or deletes
 * one, so this file is read-only by construction. A parent's query filters
 * on their household, an athlete's on their own athleteId — the exact
 * fields firestore.rules proves the read against — newest first, capped.
 * Seed mode resolves the sample Whitfield rows from data/parent.js through
 * the same seam, so Settings renders identically in practice mode.
 */

import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { fetchCurrentUser, isLive, wrap } from './live';
import { SEED_NOTICES } from '../data/parent';

const DEFAULT_LIMIT = 10;

/** A Firestore Timestamp, a Date or an ISO string as an ISO string (or null). */
function toISO(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

/**
 * The signed-in member's newest notices. Staff roles get an empty list: the
 * ledger is academy-wide for them and a "my notices" list means nothing.
 * Rides the `notifications (householdId, createdAt)` / `(athleteId,
 * createdAt)` composites (firestore.indexes.json, v2.2).
 */
export async function fetchRecentNotices(max = DEFAULT_LIMIT) {
  const profile = await fetchCurrentUser();
  let filter = null;
  if (profile?.role === 'parent' && profile.householdId) {
    filter = where('householdId', '==', profile.householdId);
  } else if (profile?.role === 'athlete' && profile.athleteId) {
    filter = where('athleteId', '==', profile.athleteId);
  }
  if (!filter) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'notifications'), filter, orderBy('createdAt', 'desc'), limit(max))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, ...data, createdAt: toISO(data.createdAt), sentAt: toISO(data.sentAt) };
    });
  } catch (err) {
    throw wrap(err, 'fetchRecentNotices');
  }
}

/**
 * `{ data: Notice[] | null, loading, error }` — the seam shape every screen
 * hook returns. Re-fetches when anything bumps 'notifications'.
 */
export default function useRecentNotices({ max = DEFAULT_LIMIT } = {}) {
  const live = isLive();
  const gen = useInvalidation('notifications');
  return useSeedResource(
    live ? null : SEED_NOTICES.slice(0, max),
    live ? { source: () => fetchRecentNotices(max), deps: ['notifications', max, gen] } : undefined
  );
}
