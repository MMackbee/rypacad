import { useCallback, useState } from 'react';

/**
 * Sign-in state for screen 01.
 *
 * State machine: 'idle' | 'loading' | 'invalid' | 'locked'. Five failed attempts
 * locks the account for 30 minutes.
 *
 * The lock is presented, not enforced, here. Attempt counting and lockout must
 * live server-side - a counter in React state is cleared by a page reload. MFA
 * is required on all staff roles at setup; parent and athlete accounts stay on
 * standard login.
 *
 * The real implementation should go through the existing Firebase auth in
 * ../../firebase.js rather than a bespoke password path, per the Blueprint's
 * "use a proven auth provider" rule.
 */
export const MAX_ATTEMPTS = 5;

export default function useAuthSession({ variant = 'idle' } = {}) {
  const [authState, setAuthState] = useState(variant);
  const [failedAttempts, setFailedAttempts] = useState(variant === 'locked' ? MAX_ATTEMPTS : 3);

  // Re-seed when the demonstrated state changes (review harness only).
  const [lastVariant, setLastVariant] = useState(variant);
  if (lastVariant !== variant) {
    setLastVariant(variant);
    setAuthState(variant);
    setFailedAttempts(variant === 'locked' ? MAX_ATTEMPTS : 3);
  }

  const signIn = useCallback(() => {
    setAuthState('loading');
  }, []);

  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - failedAttempts);

  return {
    authState,
    failedAttempts,
    attemptsLeft,
    locked: authState === 'locked',
    signIn,
    setAuthState,
  };
}
