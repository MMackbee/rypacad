/**
 * Onboarding completion status (Onboarding program v1 — docs/portal/TEAM.md).
 *
 * Tracks whether the parent and athlete walkthroughs have been completed on
 * this device, under the pinned localStorage keys `ryp.onboarding.parent` /
 * `ryp.onboarding.athlete`. Device-local is deliberate for v1: completion is
 * a convenience flag, not a record. The future home is `users.onboardedAt`
 * (contract v1.2 candidate; needs a diff-key rules allowance — not this
 * sprint), at which point this hook's body changes and its callers do not.
 *
 * localStorage can be unavailable or throw (private browsing, blocked
 * storage, quota) — every read and write is wrapped, and unavailable storage
 * degrades to "not completed". The worst case is a family being offered the
 * walkthrough again; never a crash, and never a completion invented.
 *
 * Consistent with the practice-mode invariant in ./index.js, nothing in this
 * file touches Firestore.
 */

import { useCallback, useState } from 'react';

const KEYS = {
  parent: 'ryp.onboarding.parent',
  athlete: 'ryp.onboarding.athlete',
};

const TRACKS = Object.keys(KEYS);

function readTrack(track) {
  try {
    return window.localStorage.getItem(KEYS[track]) === 'true';
  } catch (err) {
    // Storage unavailable — treat as not completed.
    return false;
  }
}

function readAll() {
  const completed = {};
  for (const track of TRACKS) completed[track] = readTrack(track);
  return completed;
}

/**
 * `{ completed: { parent, athlete }, markComplete(track), reset() }`.
 *
 * State lives in useState so marking or resetting re-renders the caller
 * immediately; localStorage is the persistence behind it, synced on every
 * mark/reset. Two components mounting the hook read the same keys but hold
 * independent state — fine for v1, where OnboardingFlow is the only writer.
 */
export default function useOnboardingStatus() {
  const [completed, setCompleted] = useState(readAll);

  const markComplete = useCallback((track) => {
    if (!KEYS[track]) return; // unknown track: ignore rather than corrupt the shape
    try {
      window.localStorage.setItem(KEYS[track], 'true');
    } catch (err) {
      // Write rejected (private mode/quota). The in-memory flip below still
      // happens, so this session behaves as completed; it just will not
      // survive a reload — the honest fallback.
    }
    setCompleted((prev) => (prev[track] ? prev : { ...prev, [track]: true }));
  }, []);

  const reset = useCallback(() => {
    for (const track of TRACKS) {
      try {
        window.localStorage.removeItem(KEYS[track]);
      } catch (err) {
        // Nothing to remove if storage is unavailable.
      }
    }
    setCompleted({ parent: false, athlete: false });
  }, []);

  return { completed, markComplete, reset };
}
