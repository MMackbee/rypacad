/**
 * Is everyone the signed-in member books for Elite (tester Mike 2026-09-30:
 * "we could eliminate talk of tokens for elite members")? An Elite athlete
 * holds no tokens, so the copy that is not tied to one athlete's own token
 * position - the Tour tab's explainer - asks here whether a token sentence
 * has a reader at all. An athlete's login answers for itself; a parent for
 * every athlete in the household (one token child keeps the wording).
 *
 * Read off the static catalogue (data/packages.js), like every other
 * "what does this package grant" question: no package doc is fetched.
 */
import { fetchAthlete, fetchCurrentUser, fetchHouseholdAthletes, isLive } from './live';
import { useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { packageById } from '../data/packages';

/** True when the caller has athletes and every one is on an unlimited package. */
export async function fetchAllElite() {
  const profile = await fetchCurrentUser();
  let athletes = [];
  if (profile.athleteId) athletes = [await fetchAthlete(profile.athleteId)];
  else if (profile.householdId) athletes = await fetchHouseholdAthletes(profile.householdId);
  return athletes.length > 0 && athletes.every((a) => a && packageById(a.packageId)?.tokens === null);
}

/**
 * `true` | `false`, or `null` while it loads. Seed mode (the Whitfields hold
 * token packages) and a disabled or failed read are `false`: the wording a
 * token family needs is never dropped on a guess.
 */
export default function useAllElite({ enabled = true } = {}) {
  const live = enabled && isLive();
  const gen = useInvalidation('athletes');
  const state = useSeedResource(live ? null : false, live ? { source: fetchAllElite, deps: ['all-elite', gen] } : undefined);
  if (state.error) return false;
  return state.loading ? null : Boolean(state.data);
}
