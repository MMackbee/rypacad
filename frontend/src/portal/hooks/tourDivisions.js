/**
 * The Tour score sheet's Boys/Girls pre-fill (owner ruling 2026-11-06).
 * Kept out of hooks/index.js and hooks/live.js, both long; index.js
 * re-exports the hook so the sheet's namespace-import seam finds it.
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import useSeedResource from './useSeedResource';
import { isLive, wrap } from './live';
import { SPLIT_BRACKET_IDS, priorDivisions } from '../data/tourDivisions';

/**
 * Every tournamentResults doc in a 15 & up bracket ('15+B' / '15+G'), any
 * date. One single-field `in` filter, so no composite index; the read rule
 * is signedIn() alone, so the query is provable for every role.
 */
export async function fetchSplitBracketResults() {
  try {
    const snap = await getDocs(
      query(collection(db, 'tournamentResults'), where('bracket', 'in', SPLIT_BRACKET_IDS))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchSplitBracketResults');
  }
}

const NONE = {};

/**
 * usePriorTourDivisions(athleteIds) -> { data: { [athleteId]: 'B' | 'G' },
 * loading, error }: each rostered athlete's Boys/Girls from their most
 * recent saved 15 & up result (data/tourDivisions.js priorDivisions). An
 * athlete with none is absent. Seed mode, or no ids: {} and never fetches.
 * The ids join into one sorted key, so a new roster array with the same ids
 * does not refetch. No invalidation subscription: the sheet keeps what it
 * sends itself, and a re-read mid-sheet would only blank the pre-fill.
 */
export function usePriorTourDivisions(athleteIds) {
  const ids = Array.isArray(athleteIds) ? [...new Set(athleteIds.filter(Boolean))].sort() : [];
  const idsKey = ids.join(',');
  const shouldFetch = isLive() && ids.length > 0;
  return useSeedResource(
    shouldFetch ? null : NONE,
    shouldFetch
      ? { source: async () => priorDivisions(await fetchSplitBracketResults(), ids), deps: ['tour-divisions', idsKey] }
      : undefined
  );
}
