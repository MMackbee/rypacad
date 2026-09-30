import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, provider } from '../../firebase';
import { ERR, LiveDataError, fetchCurrentUser, fetchHousehold } from './live';
import { callClaimInvite } from './callables';

// Every screen and guard mounts its own useAuthSession, and each one's
// NOT_FOUND emission used to fire claimInvite: the first call claimed, the
// rest read 'already-claimed'. One call per uid at a time; a later call
// (Check again) goes out fresh (review 2026-09-29).
const claimFlights = new Map();
function claimOnce(uid) {
  const key = uid || '';
  if (!claimFlights.has(key)) {
    claimFlights.set(key, callClaimInvite().finally(() => claimFlights.delete(key)));
  }
  return claimFlights.get(key);
}

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
function publishSelfManaged(value) {
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

/**
 * The portal's auth session — the seam between Firebase auth and every screen.
 *
 * Real mode (no `variant` passed) returns the shape pinned in
 * docs/portal/TEAM.md, "Sprint 4 pins":
 *
 *   { user: { uid, email, role, athleteId, householdId, specialistId, emailVerified, selfManaged } | null,
 *     provisioned: boolean, loading, error, signIn(), signInWithEmail(), signOut(),
 *     requestPasswordReset(),
 *     // Sprint 20 (spec 2.1, 3.2; contract 4.1):
 *     createLogin(email, password), refresh(), claimState, checkInvite(), resendVerification() }
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

/** The pinned user object — nothing extra leaks from the users doc.
 * `specialistId` joined the set with v1.7.1 (Sprint 9 integration): it is
 * what routes Yannick and Phil to their My Sessions view; without it here
 * the landing override read undefined and specialists landed on the admin
 * dashboard (caught in the integration browser pass). `selfManaged` comes
 * from resolveSelfManaged above, not the users doc. */
function toUser(profile, fbUser, selfManaged = false) {
  return {
    uid: profile.uid,
    email: profile.email != null ? profile.email : null,
    role: profile.role != null ? profile.role : null,
    athleteId: profile.athleteId != null ? profile.athleteId : null,
    householdId: profile.householdId != null ? profile.householdId : null,
    specialistId: profile.specialistId != null ? profile.specialistId : null,
    // Sprint 20 (spec 4.2): paying and claiming need a verified email.
    emailVerified: Boolean(fbUser && fbUser.emailVerified),
    selfManaged: selfManaged === true,
  };
}

/** The signed-in-but-unprovisioned user (no users/{uid} doc yet). */
function unprovisionedUser(fbUser) {
  return { uid: fbUser.uid, email: fbUser.email != null ? fbUser.email : null, role: null, athleteId: null, householdId: null, emailVerified: Boolean(fbUser.emailVerified), selfManaged: false };
}

/** claimInvite's `state` (contract 1.4), or 'error' for anything else. */
export function claimStateOf(result) {
  const s = result && result.state;
  return s === 'claimed' || s === 'needs-verification' || s === 'already-claimed' || s === 'none' ? s : 'error';
}

/**
 * Where the verification email's link returns to (spec 12.1): this build's
 * own origin - portal.rypacademy.com in production (rypacad.ryptest.com
 * before the move), localhost on the emulator. Every one of them must be a
 * Firebase Auth authorized domain, or the send fails and SignUp says so. Firebase's own action handler completes the
 * verification first, then continues here.
 */
export function verifyContinueUrl() {
  return `${window.location.origin}/portal/signin`;
}

export function createLoginError(err) {
  const code = err && err.code;
  if (code === 'auth/email-already-in-use') return new LiveDataError(ERR.INVALID, 'This email already has a login - sign in instead', err, 'email-in-use');
  if (code === 'auth/weak-password') return new LiveDataError(ERR.INVALID, 'Choose a longer password - at least 6 characters.', err, 'weak-password');
  if (code === 'auth/invalid-email') return new LiveDataError(ERR.INVALID, 'Enter a valid email address.', err, 'invalid-email');
  if (code === 'auth/too-many-requests') return new LiveDataError(ERR.UNAVAILABLE, 'Too many attempts — wait a few minutes, then try again.', err);
  if (code === 'auth/operation-not-allowed') return new LiveDataError(ERR.UNAVAILABLE, 'Email sign-in is not enabled yet — use Continue with Google.', err);
  return new LiveDataError(ERR.UNAVAILABLE, 'Could not create the login. Please try again.', err);
}

export function resendError(err) {
  const throttled = err && err.code === 'auth/too-many-requests';
  return new LiveDataError(
    throttled ? ERR.UNAVAILABLE : ERR.UNKNOWN,
    throttled ? 'Too many attempts — wait a few minutes, then try again.' : 'Could not send the verification email. Please try again.',
    err
  );
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
  const [claimState, setClaimState] = useState('idle');
  const claimRef = useRef(null); // latest runClaim; the auth effect never re-subscribes

  // Resolve users/{uid} for one emission or refresh; only the latest `seq`
  // may land. Returns 'provisioned' | 'not-found' | 'error' | 'stale'.
  const resolveProfile = useCallback(async (seq, fbUser) => {
    try {
      const profile = await fetchCurrentUser();
      // Before `loading` clears, so a guard never redirects a self-managed
      // athlete off Billing on a half-resolved session. Never rejects.
      const selfManaged = await resolveSelfManaged(profile);
      if (seq !== seqRef.current) return 'stale';
      publishSelfManaged(selfManaged);
      setSession({ user: toUser(profile, fbUser, selfManaged), provisioned: true, loading: false, error: null });
      return 'provisioned';
    } catch (err) {
      if (seq !== seqRef.current) return 'stale';
      publishSelfManaged(false);
      if (err instanceof LiveDataError && err.code === ERR.NOT_FOUND) {
        // Exactly the unprovisioned case: a real account with no users/{uid}
        // doc yet. Defined state, not an error.
        setSession({ user: unprovisionedUser(fbUser), provisioned: false, loading: false, error: null });
        return 'not-found';
      }
      setSession({
        user: null, provisioned: false, loading: false,
        error: err instanceof LiveDataError ? err : new LiveDataError(ERR.UNKNOWN, 'Could not load your account. Please try again.', err),
      });
      return 'error';
    }
  }, []);

  useEffect(() => {
    if (demo) return undefined; // demo bypasses real auth entirely
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      const seq = ++seqRef.current;
      if (!fbUser) {
        publishSelfManaged(false);
        setSession(SIGNED_OUT);
        setClaimState('idle');
        return;
      }
      setSession((s) => ({ ...s, loading: true }));
      resolveProfile(seq, fbUser).then((outcome) => {
        // Sprint 20 (spec 3.2): every NOT_FOUND emission with an email asks
        // claimInvite; an emulator custom-token user has no email -> 'none'.
        if (outcome !== 'not-found') return;
        if (!fbUser.email) { setClaimState('none'); return; }
        claimRef.current(seq, fbUser);
      });
    });
    return () => {
      seqRef.current += 1; // invalidate any in-flight resolution
      unsubscribe();
    };
  }, [demo, resolveProfile]);

  /** Re-run the users/{uid} read under the current sequence (spec 2.2: `provisioned` flips without a reload). */
  const refresh = useCallback(async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) { publishSelfManaged(false); setSession(SIGNED_OUT); return; }
    try { await fbUser.reload(); } catch (err) { /* offline reload: the cached user still resolves */ }
    setSession((s) => ({ ...s, loading: true }));
    await resolveProfile(seqRef.current, fbUser);
  }, [resolveProfile]);

  const runClaim = useCallback(async (seq, fbUser) => {
    setClaimState('checking');
    try {
      const result = await claimOnce(fbUser && fbUser.uid);
      if (seq !== seqRef.current) return 'error';
      const state = claimStateOf(result);
      setClaimState(state);
      // 'already-claimed' may mean THIS uid won the claim in another mounted
      // instance a moment ago - re-read users/{uid}; if it is ours,
      // provisioned flips and the dead end never shows.
      if (state === 'claimed' || state === 'already-claimed') await refresh();
      return state;
    } catch (err) {
      if (seq === seqRef.current) setClaimState('error');
      return 'error';
    }
  }, [refresh]);
  claimRef.current = runClaim;

  /** "I've verified" / "Check again": a fresh token first (spec 3.2), then the lookup, no sign-out. */
  const checkInvite = useCallback(async () => {
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.email) { setClaimState('none'); return 'none'; }
    await fbUser.reload();
    await fbUser.getIdToken(true);
    setSession((s) => (s.user ? { ...s, user: { ...s.user, emailVerified: Boolean(fbUser.emailVerified) } } : s));
    return runClaim(seqRef.current, fbUser);
  }, [runClaim]);

  /** Step 0 of sign-up and the sign-in page's "Create a login" (spec 2.1, 3.1). */
  const createLogin = useCallback(async (email, password) => {
    setSession((s) => (s.error ? { ...s, error: null } : s));
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      throw createLoginError(err);
    }
    // Verification is not required to finish sign-up (it is to pay/claim);
    // a failed send is reported, never fatal. Success lands via onAuthStateChanged.
    try {
      await sendEmailVerification(cred.user, { url: verifyContinueUrl() });
      return { sent: true };
    } catch (err) {
      return { sent: false };
    }
  }, []);

  const resendVerification = useCallback(async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new LiveDataError(ERR.UNAUTHENTICATED, 'Sign in first, then resend.');
    try {
      await sendEmailVerification(fbUser, { url: verifyContinueUrl() });
      return { sent: true };
    } catch (err) {
      throw resendError(err);
    }
  }, []);

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

  // Forgot password (Sprint 10, pin I "Quick wins") — the SignIn screen's
  // real "Forgot password" link (frontend lane wires the sent/error states;
  // this only sends the email). Placed here rather than live.js: it is an
  // auth action with no Firestore query behind it, colocated with
  // signIn/signOut/signInWithEmail rather than added to the Firestore-only
  // adapter file for a single unrelated Auth SDK call — the routing
  // report flags this file choice explicitly, as instructed.
  //
  // Deliberately does NOT distinguish "no account for that email" from
  // "sent" — email enumeration (letting a caller probe which addresses
  // have accounts) is a real leak for a minors-heavy user base, so
  // auth/user-not-found resolves as if the email had been sent, same as
  // every other outcome. Only a malformed address or a genuine send
  // failure surfaces as an error.
  const requestPasswordReset = useCallback(async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { sent: true };
    } catch (err) {
      const code = err && err.code;
      if (code === 'auth/user-not-found') return { sent: true };
      const message =
        code === 'auth/invalid-email'
          ? 'Enter a valid email address.'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts — wait a few minutes, then try again.'
            : 'Could not send the reset email. Please try again.';
      throw new LiveDataError(
        code === 'auth/invalid-email' ? ERR.INVALID : ERR.UNAVAILABLE,
        message,
        err
      );
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
    requestPasswordReset,
    createLogin,
    refresh,
    claimState,
    checkInvite,
    resendVerification,
  };
}
