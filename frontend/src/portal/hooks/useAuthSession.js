import { useCallback, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, provider } from '../../firebase';
import { ERR, LiveDataError, fetchCurrentUser } from './live';

/**
 * The portal's auth session — the seam between Firebase auth and every screen.
 *
 * Real mode (no `variant` passed) returns the shape pinned in
 * docs/portal/TEAM.md, "Sprint 4 pins":
 *
 *   { user: { uid, email, role, athleteId, householdId } | null,
 *     provisioned: boolean, loading, error, signIn(), signOut() }
 *
 * - Auth is the existing app instance from src/firebase.js (project `rypacad`)
 *   — never a second init. signIn() runs the existing Google popup; a popup the
 *   user closes themselves is a change of mind, not an error state.
 * - `loading` is true until onAuthStateChanged's first emission and, when that
 *   emission carries a signed-in account, until the users/{uid} read settles —
 *   so a guard never redirects on a session that is still resolving.
 * - Role resolution goes through live.js's fetchCurrentUser(). Its NOT_FOUND
 *   (no users/{uid} doc) is not an error here: it is the defined
 *   signed-in-but-unprovisioned state — `user` with role null, provisioned
 *   false — which routes to the Not Provisioned screen rather than an error
 *   surface. Every other failure lands in `error` as a LiveDataError with a
 *   plain-language message (SDK errors are wrapped, never surfaced verbatim).
 *
 * Demo mode (`variant` passed) is the scaffold's review escape hatch: the
 * harness and the SignIn screen demonstrate the designed auth states
 * ('idle' | 'loading' | 'invalid' | 'locked') deterministically, so a variant
 * bypasses real auth entirely — no subscription, no Firestore, no popup — and
 * the legacy return shape is preserved exactly. A component never switches
 * between modes across renders (variants come from static harness config), so
 * the mode split is stable for the rules of hooks.
 *
 * The lock remains presented, not enforced, here: attempt counting must live
 * server-side, and MFA is required for staff roles at setup.
 */
export const MAX_ATTEMPTS = 5;

const SIGNED_OUT = { user: null, provisioned: false, loading: false, error: null };

/** The pinned five-key user object — nothing extra leaks from the users doc. */
function toUser(profile) {
  return {
    uid: profile.uid,
    email: profile.email != null ? profile.email : null,
    role: profile.role != null ? profile.role : null,
    athleteId: profile.athleteId != null ? profile.athleteId : null,
    householdId: profile.householdId != null ? profile.householdId : null,
  };
}

export default function useAuthSession({ variant } = {}) {
  // Demo when a variant is passed at all — the scaffold always passes one
  // (SignIn defaults its prop to 'idle'), real callers pass nothing.
  const demo = variant != null;

  /* ------------------------------ demo mode ------------------------------ */
  // Preserved exactly as the scaffold shipped it, so the harness's four
  // sign-in states keep rendering deterministically.
  const [authState, setAuthState] = useState(demo ? variant : 'idle');
  const [failedAttempts, setFailedAttempts] = useState(variant === 'locked' ? MAX_ATTEMPTS : 3);

  // Re-seed when the demonstrated state changes (review harness only).
  const [lastVariant, setLastVariant] = useState(variant);
  if (demo && lastVariant !== variant) {
    setLastVariant(variant);
    setAuthState(variant);
    setFailedAttempts(variant === 'locked' ? MAX_ATTEMPTS : 3);
  }

  const demoSignIn = useCallback(() => {
    setAuthState('loading');
  }, []);

  /* ------------------------------ real mode ------------------------------ */
  const [session, setSession] = useState({
    user: null,
    provisioned: false,
    loading: true, // until the first auth emission
    error: null,
  });

  // Emission sequence: a resolution result only lands if no later auth
  // emission (or unmount) superseded it — sign-out during a slow users read
  // must not resurrect the signed-in state.
  const seqRef = useRef(0);

  useEffect(() => {
    if (demo) return undefined; // demo bypasses real auth entirely

    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      const seq = ++seqRef.current;

      if (!fbUser) {
        setSession(SIGNED_OUT);
        return;
      }

      // Signed in: stay loading until the users/{uid} read settles.
      setSession((s) => ({ ...s, loading: true }));
      fetchCurrentUser().then(
        (profile) => {
          if (seq !== seqRef.current) return;
          setSession({ user: toUser(profile), provisioned: true, loading: false, error: null });
        },
        (err) => {
          if (seq !== seqRef.current) return;
          if (err instanceof LiveDataError && err.code === ERR.NOT_FOUND) {
            // Exactly the unprovisioned case: a real Google account with no
            // users/{uid} doc yet. Defined state, not an error.
            setSession({
              user: {
                uid: fbUser.uid,
                email: fbUser.email != null ? fbUser.email : null,
                role: null,
                athleteId: null,
                householdId: null,
              },
              provisioned: false,
              loading: false,
              error: null,
            });
            return;
          }
          setSession({
            user: null,
            provisioned: false,
            loading: false,
            error:
              err instanceof LiveDataError
                ? err
                : new LiveDataError(ERR.UNKNOWN, 'Could not load your account. Please try again.', err),
          });
        }
      );
    });

    return () => {
      seqRef.current += 1; // invalidate any in-flight resolution
      unsubscribe();
    };
  }, [demo]);

  const signIn = useCallback(async () => {
    // Clear a stale error so a retry starts clean.
    setSession((s) => (s.error ? { ...s, error: null } : s));
    try {
      await signInWithPopup(auth, provider);
      // Success lands via onAuthStateChanged — nothing to set here.
    } catch (err) {
      // The user closing the popup is a change of mind, not an error state.
      // Closing the popup and double-clicking the button are both the user
      // changing their mind, not failures — neither deserves an error state.
      if (err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')) return;
      setSession((s) => ({
        ...s,
        loading: false,
        error: new LiveDataError(
          ERR.UNAVAILABLE,
          'Sign-in did not complete. Please try again.',
          err
        ),
      }));
    }
  }, []);

  // Email/password sign-in. Unlike the popup there is no user-cancel branch,
  // so `loading` flips on immediately and only an error turns it back off —
  // success hands off to onAuthStateChanged like the popup does. Credential
  // errors get one deliberately unspecific message (which of the two fields
  // is wrong is not the caller's business, per the designed invalid state).
  const signInWithEmail = useCallback(async (email, password) => {
    setSession((s) => ({ ...s, loading: true, error: null }));
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Success lands via onAuthStateChanged — nothing to set here.
    } catch (err) {
      const code = err && err.code;
      const credential =
        code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-email';
      const message = credential
        ? 'Email or password is incorrect.'
        : code === 'auth/too-many-requests'
          ? 'Too many attempts — wait a few minutes, then try again.'
          : code === 'auth/operation-not-allowed'
            ? 'Email sign-in is not enabled yet — use Continue with Google.'
            : 'Sign-in did not complete. Please try again.';
      setSession((s) => ({
        ...s,
        loading: false,
        error: new LiveDataError(credential ? ERR.INVALID : ERR.UNAVAILABLE, message, err),
      }));
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth); // the auth listener emits the signed-out state
    } catch (err) {
      setSession((s) => ({
        ...s,
        error: new LiveDataError(ERR.UNKNOWN, 'Sign-out did not complete. Please try again.', err),
      }));
    }
  }, []);

  if (demo) {
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - failedAttempts);
    return {
      authState,
      failedAttempts,
      attemptsLeft,
      locked: authState === 'locked',
      signIn: demoSignIn,
      setAuthState,
    };
  }

  return {
    user: session.user,
    provisioned: session.provisioned,
    loading: session.loading,
    error: session.error,
    signIn,
    signInWithEmail,
    signOut,
  };
}
