/**
 * Whose results the Tour tab opens on (owner ruling 2026-11-06: an athlete
 * or parent lands on the Age filter that includes them). An athlete is
 * their own id; a parent is every athlete in the household. Staff browse
 * with no one of their own. Kept out of hooks/index.js, which is long.
 */
import useSeedResource from './useSeedResource';
import { fetchCurrentUser, fetchHouseholdAthletes, isLive } from './live';
import { HOUSEHOLD } from '../data/seed';

const NONE = [];

/** The signed-in parent's household athlete ids. */
export async function fetchFamilyAthleteIds() {
  const profile = await fetchCurrentUser();
  if (!profile?.householdId) return [];
  const athletes = await fetchHouseholdAthletes(profile.householdId);
  return athletes.map((a) => a.id).filter(Boolean);
}

/**
 * useTourViewerIds({ role, athleteId, enabled }) -> athlete ids (never
 * null): [athleteId] for an athlete, the household for a parent (the seed
 * Whitfields in seed mode), [] for staff, while loading, and on a failed
 * read - the screen then keeps its default board.
 */
export function useTourViewerIds({ role, athleteId, enabled = true } = {}) {
  const parentLive = enabled && role === 'parent' && isLive();
  const state = useSeedResource(
    parentLive ? null : NONE,
    parentLive ? { source: fetchFamilyAthleteIds, deps: ['tour-family-ids'] } : undefined
  );
  if (!enabled) return NONE;
  if (role === 'athlete') return athleteId ? [athleteId] : NONE;
  if (role !== 'parent') return NONE;
  if (!parentLive) return HOUSEHOLD.children.map((c) => c.id);
  return state.data ?? NONE;
}
