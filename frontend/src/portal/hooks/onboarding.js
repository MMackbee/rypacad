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
 * The first-visit offer (tester report 2026-09-30): Sprint 20's instant
 * sign-up dropped the old Registration -> walkthrough hop (spec 2.1: "No
 * walkthrough hop" on Success), and nothing else ever offered it, so a new
 * family never saw it. The home screens now show components/WalkthroughOffer
 * until the track is completed or the offer is answered (taken or "Not now")
 * — `offered`, under `ryp.onboarding.offered.<track>`. Settings' "Replay the
 * walkthrough" ignores both flags.
 *
 * Consistent with the practice-mode invariant in ./index.js, nothing in this
 * file touches Firestore.
 */

import { useCallback, useState } from 'react';

const KEYS = {
  parent: 'ryp.onboarding.parent',
  athlete: 'ryp.onboarding.athlete',
};

const OFFER_KEYS = {
  parent: 'ryp.onboarding.offered.parent',
  athlete: 'ryp.onboarding.offered.athlete',
};

const TRACKS = Object.keys(KEYS);

function readFlag(key) {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch (err) {
    // Storage unavailable — treat as not set.
    return false;
  }
}

function readAll(keys) {
  const flags = {};
  for (const track of TRACKS) flags[track] = readFlag(keys[track]);
  return flags;
}

/** Sets one flag in storage; a rejected write (private mode/quota) is ignored. */
function writeFlag(key) {
  try {
    window.localStorage.setItem(key, 'true');
  } catch (err) {
    // The caller's in-memory flip still happens, so this session behaves as
    // set; it just will not survive a reload — the honest fallback.
  }
}

/**
 * `{ completed: { parent, athlete }, offered: { parent, athlete },
 * markComplete(track), markOffered(track), reset() }`.
 *
 * State lives in useState so marking or resetting re-renders the caller
 * immediately; localStorage is the persistence behind it, synced on every
 * mark/reset. Two components mounting the hook read the same keys but hold
 * independent state — fine: OnboardingFlow writes completion, and
 * WalkthroughOffer writes the offer, on different screens.
 */
export default function useOnboardingStatus() {
  const [completed, setCompleted] = useState(() => readAll(KEYS));
  const [offered, setOffered] = useState(() => readAll(OFFER_KEYS));

  const markComplete = useCallback((track) => {
    if (!KEYS[track]) return; // unknown track: ignore rather than corrupt the shape
    writeFlag(KEYS[track]);
    setCompleted((prev) => (prev[track] ? prev : { ...prev, [track]: true }));
  }, []);

  const markOffered = useCallback((track) => {
    if (!OFFER_KEYS[track]) return;
    writeFlag(OFFER_KEYS[track]);
    setOffered((prev) => (prev[track] ? prev : { ...prev, [track]: true }));
  }, []);

  const reset = useCallback(() => {
    for (const track of TRACKS) {
      for (const key of [KEYS[track], OFFER_KEYS[track]]) {
        try {
          window.localStorage.removeItem(key);
        } catch (err) {
          // Nothing to remove if storage is unavailable.
        }
      }
    }
    setCompleted({ parent: false, athlete: false });
    setOffered({ parent: false, athlete: false });
  }, []);

  return { completed, offered, markComplete, markOffered, reset };
}
