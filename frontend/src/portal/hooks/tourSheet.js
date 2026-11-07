/**
 * The Tour score sheet's look back at earlier results (owner rulings
 * 2026-11-06): each player's last saved Boys/Girls, for the pre-fill, and
 * the coaches already entered, for the quick picks. Kept out of
 * hooks/index.js and hooks/live.js, both long; index.js re-exports the hook
 * so the sheet's namespace-import seam finds it.
 */
import useSeedResource from './useSeedResource';
import { fetchTournamentResults, isLive } from './live';
import { coachQuickPicks, priorGenders } from '../data/tourSheet';

const EMPTY = { genderById: {}, coaches: [] };

/** Every tournamentResults doc (the standings' own read: signedIn() alone, no index) -> the sheet's history. */
export async function fetchTourSheetHistory() {
  const rows = await fetchTournamentResults();
  return { genderById: priorGenders(rows), coaches: coachQuickPicks(rows) };
}

/**
 * useTourSheetHistory() -> { data: { genderById: { [athleteId]: 'boys' |
 * 'girls' }, coaches: [{ athleteId, name, gender }] }, loading, error }.
 * One read when the sheet opens. No invalidation subscription: the sheet
 * keeps what it sends itself, and a re-read mid-sheet would only blank the
 * pre-fill while it runs. Seed mode: empty, and never fetches.
 */
export function useTourSheetHistory() {
  const live = isLive();
  return useSeedResource(live ? null : EMPTY, live ? { source: fetchTourSheetHistory, deps: ['tour-sheet-history'] } : undefined);
}
