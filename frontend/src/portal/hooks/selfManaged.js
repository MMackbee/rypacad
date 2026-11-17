/*
 * Moved here from useAuthSession.js unchanged (speed work 2026-11-17, to keep
 * that file under 500 lines); useAuthSession re-exports both public names.
 */
import { useSyncExternalStore } from 'react';
import { fetchHousehold } from './live';

/*
 * Self-managed athlete (owner report, Mike S6 2026-09-30): the 18+ athlete who
 * signed up for themselves (createFamily mode 'athlete') is their household's
 * createdBy and its only member - the payer, so they get the parent's Billing
 * and Settings. A child's claimed login sits in the parent's household
 * (createdBy is the parent) and stays a plain athlete. Same test as
 * firestore.rules' athlete package-change branch. One households read per
 * uid per page load, shared by every mounted session (createdBy is
 * server-written); a failed read is false, and the next resolution retries.
 */
const selfManagedFlights = new Map();
export function resolveSelfManaged(profile) {
  if (!profile || profile.role !== 'athlete' || !profile.uid || !profile.householdId) return Promise.resolve(false);
  const key = `${profile.uid}/${profile.householdId}`;
  if (!selfManagedFlights.has(key)) {
    selfManagedFlights.set(key, fetchHousehold(profile.householdId).then(
      (household) => Boolean(household) && household.createdBy === profile.uid,
      () => { selfManagedFlights.delete(key); return false; }
    ));
  }
  return selfManagedFlights.get(key);
}

// The signed-in session's selfManaged for BottomTabBar, which renders on
// every athlete screen with no session of its own: every resolution
// publishes it (the same value from each mounted instance), sign-out clears it.
let selfManagedNow = false;
const selfManagedListeners = new Set();
export function publishSelfManaged(value) {
  if (selfManagedNow === value) return;
  selfManagedNow = value;
  selfManagedListeners.forEach((listener) => listener());
}
function subscribeSelfManaged(listener) {
  selfManagedListeners.add(listener);
  return () => selfManagedListeners.delete(listener);
}
/** True while the signed-in account is a self-managed athlete; false in seed mode. */
export function useSelfManaged() {
  return useSyncExternalStore(subscribeSelfManaged, () => selfManagedNow, () => false);
}
