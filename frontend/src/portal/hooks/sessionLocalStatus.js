/**
 * The attendance screen's Start session / Close block state, kept per real
 * session id for the app's lifetime (plan 2026-11-11-parallax-combine,
 * Decided here 11): it was component state, so every trip to Combine (or the
 * Clubhead entry) and Back reset an in-progress or closed block to "Start
 * session". Marks and notes were already saved; this keeps the block's state.
 *
 * A null session id (seed mode, the states gallery) is plain component state
 * and never touches the Map, so gallery states and tests without a session
 * stay independent of each other.
 */
import { useState } from 'react';

/** sessionId -> 'progress' | 'completed' | null */
const statuses = new Map();

/** [status|null, setStatus] for one session. */
export function useSessionLocalStatus(sessionId) {
  const keyed = sessionId != null;
  const [local, setLocal] = useState(null);
  const [, setVersion] = useState(0);
  // Read from the Map on every render, so a screen handed another session shows that session's state.
  const value = keyed ? statuses.get(sessionId) ?? null : local;
  const set = (next) => {
    if (!keyed) {
      setLocal(next);
      return;
    }
    statuses.set(sessionId, next);
    setVersion((v) => v + 1);
  };
  return [value, set];
}

/** Forgets every session's state (tests). */
export function clearSessionLocalStatus() {
  statuses.clear();
}
