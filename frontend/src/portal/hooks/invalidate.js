/**
 * Post-write invalidation seam (Sprint 6 pin, docs/portal/TEAM.md — "Post-write
 * refresh"). QA found the same disease behind three defects (#3, #5, #7):
 * every live hook reads once through useSeedResource's async source (no
 * onSnapshot listeners), so a write made by ONE hook (createBooking,
 * createContractLog, updateBookingStatus) left every OTHER mounted hook
 * reading the same collection - useSchedule, useHousehold, useContract, a
 * second useSessionAttendance instance, etc. - showing stale data until a
 * full remount.
 *
 * This file generalizes the fix usePracticeLog already did for itself with a
 * local `refreshKey`: a tiny per-collection generation counter, bumped once
 * by live.js right after a write succeeds, that ANY hook can subscribe to via
 * useInvalidation() and fold into its own useSeedResource `deps` array. A
 * bump anywhere re-runs every subscribed hook's live source, not just the one
 * that wrote.
 *
 * Deliberately not a state library: no context provider, no store, just a
 * module-level Map of listener sets - the same "hooks own their own seam"
 * shape as the rest of this directory.
 */
import { useEffect, useState } from 'react';

/** collection name -> current generation number. */
const generations = new Map();
/** collection name -> Set of subscribed hook instances' notify callbacks. */
const subscribers = new Map();

/**
 * Bump a collection's generation and wake every hook instance currently
 * watching it. Called from ./live.js right after a write commits — never
 * from a screen.
 */
export function bump(collectionName) {
  generations.set(collectionName, (generations.get(collectionName) || 0) + 1);
  const set = subscribers.get(collectionName);
  if (set) set.forEach((notify) => notify());
}

/**
 * This hook instance's current view of a collection's generation. Fold the
 * return value into useSeedResource's `deps` array — when it changes (because
 * bump() ran, anywhere, for this collection name), useSeedResource's depsKey
 * changes and its async source re-runs.
 */
export function useInvalidation(collectionName) {
  const [gen, setGen] = useState(() => generations.get(collectionName) || 0);
  useEffect(() => {
    let set = subscribers.get(collectionName);
    if (!set) {
      set = new Set();
      subscribers.set(collectionName, set);
    }
    const notify = () => setGen(generations.get(collectionName) || 0);
    set.add(notify);
    return () => set.delete(notify);
  }, [collectionName]);
  return gen;
}
