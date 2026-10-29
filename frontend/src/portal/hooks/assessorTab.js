/**
 * Whether the signed-in account shows the Assessments tab (assessments spec
 * 5: "the Capture tab becomes Assessments for Phil and assessor staff").
 * useAuthSession publishes it on every profile resolution and clears it on
 * sign-out; BottomTabBar reads it, since it renders on every staff screen
 * with no session of its own - the same store as useSelfManaged. A module of
 * its own so the screen tests that mock useAuthSession keep a working bar.
 */
import { useSyncExternalStore } from 'react';

let current = false;
const listeners = new Set();

/** Set the flag (true only for a strict true). */
export function publishAssessorTab(value) {
  const next = value === true;
  if (current === next) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while the signed-in account is Phil or holds the Assessments permission; false in seed mode. */
export function useAssessorTab() {
  return useSyncExternalStore(subscribe, () => current, () => false);
}
