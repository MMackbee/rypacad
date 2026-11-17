import { useCallback, useEffect, useRef, useState } from 'react';
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
import { ERR, LiveDataError, fetchCurrentUser } from './live';
import { callClaimInvite } from './callables';
import { publishAssessorTab } from './assessorTab';
import { clearResearchSkips } from './researchSkip';
import { showsAssessmentsTab } from '../data/assessmentAccess';
import { publishSelfManaged, resolveSelfManaged, useSelfManaged } from './selfManaged';
import {
  forgetSessionUser, peekSessionUser, publishSessionUser, resetSession, sessionUserStale, setSessionScope, signedOutKnown, subscribeSessionUser,
} from './sessionStore';
import { clearRoleHint, roleHintFor, suppressRoleHint, writeRoleHint } from './roleHint';
import { accountLoadError, claimStateOf, createLoginError, resendError, verifyContinueUrl } from './authSessionHelpers';

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

// The self-managed athlete (Mike S6 2026-09-30): ./selfManaged.js, re-exported.
export { resolveSelfManaged, useSelfManaged };
// The invite, verify-link and error helpers: ./authSessionHelpers.js, re-exported.
export { claimStateOf, createLoginError, resendError, verifyContinueUrl };

/**
 * The portal's auth session — the seam between Firebase auth and every screen.
 *
 * Real mode (no `variant` passed) returns the shape pinned in
 * docs/portal/TEAM.md, "Sprint 4 pins":
 *
 *   { user: { uid, email, role, athleteId, householdId, specialistId, assessor, emailVerified, selfManaged } | null,
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
    // 2026-10-14 (assessments spec 3): the owner's Assessments permission.
    assessor: profile.assessor === true,
    // Sprint 20 (spec 4.2): paying and claiming need a verified email.
    emailVerified: Boolean(fbUser && fbUser.emailVerified),
    selfManaged: selfManaged === true,
  };
}

/** The shared user with this account's current emailVerified (it flips after the link is opened). */
function withAuth(user, fbUser) {
  const verified = Boolean(fbUser && fbUser.emailVerified);
  return user.emailVerified === verified ? user : { ...user, emailVerified: verified };
}

/**
 * While users/{uid} loads, the tab bar and the athlete's home read the flags
 * of THIS account's hint (or none), not the plain or the last account's bar;
 * the verified user's applyUser publishes over them (review 2026-11-17).
 */
function seedFromHint(hint) {
  publishSelfManaged(Boolean(hint) && hint.role === 'athlete' && hint.selfManaged === true);
  publishAssessorTab(showsAssessmentsTab(hint));
}

/** A verified user, published to everything that reads it without a session of its own. */
function applyUser(user) {
  publishSelfManaged(user.selfManaged);
  publishAssessorTab(showsAssessmentsTab(user));
  publishSessionUser(user);
  writeRoleHint(user); // the next cold start's landing (roleHint.js)
}

/**
 * F4 (speed work 2026-11-17): users/{uid} is read once per sign-in and shared
 * (sessionStore.js). A role change still reaches an open session: this reads
 * it again in the background - the page coming back into view, a session
 * mounting after PROFILE_TTL_MS - and a change re-renders every session. A
 * failed re-read keeps what the session had; firestore.rules enforce anyway.
 */
function revalidate(fbUser) {
  fetchCurrentUser({ fresh: true })
    .then((profile) => resolveSelfManaged(profile).then((selfManaged) => {
      if (auth.currentUser && auth.currentUser.uid === fbUser.uid) applyUser(toUser(profile, fbUser, selfManaged));
    }))
    .catch(() => {});
}

let mountedSessions = 0;
function onVisible() {
  const fbUser = auth.currentUser;
  if (document.visibilityState === 'visible' && fbUser && peekSessionUser(fbUser.uid)) revalidate(fbUser);
}

/** A new instance starts from what the page already knows: resolved, signed out, or waiting on this account. */
function initialSession() {
  const fbUser = auth.currentUser;
  if (!fbUser && signedOutKnown()) return SIGNED_OUT;
  const known = fbUser ? peekSessionUser(fbUser.uid) : null;
  if (known) return { user: withAuth(known.user, fbUser), provisioned: true, loading: false, error: null };
  return { user: null, provisioned: false, loading: true, error: null, pendingUid: fbUser ? fbUser.uid : null };
}

/** The signed-in-but-unprovisioned user (no users/{uid} doc yet). */
function unprovisionedUser(fbUser) {
  return { uid: fbUser.uid, email: fbUser.email != null ? fbUser.email : null, role: null, athleteId: null, householdId: null, assessor: false, emailVerified: Boolean(fbUser.emailVerified), selfManaged: false };
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
  // Loading until the first auth emission - unless the page already knows
  // the answer: this account's profile, or that nobody is signed in.
  const [session, setSession] = useState(() => (demo ? SIGNED_OUT : initialSession()));

  // Emission sequence: a resolution result only lands if no later auth
  // emission (or unmount) superseded it — sign-out during a slow users read
  // must not resurrect the signed-in state.
  const seqRef = useRef(0);
  const [claimState, setClaimState] = useState('idle');
  const claimRef = useRef(null); // latest runClaim; the auth effect never re-subscribes

  // Resolve users/{uid} for one emission or refresh; only the latest `seq`
  // may land. Returns 'provisioned' | 'not-found' | 'error' | 'stale'.
  const resolveProfile = useCallback(async (seq, fbUser, fresh = false) => {
    try {
      const profile = await (fresh ? fetchCurrentUser({ fresh: true }) : fetchCurrentUser());
      // Before `loading` clears, so a guard never redirects a self-managed
      // athlete off Billing on a half-resolved session. Never rejects.
      const selfManaged = await resolveSelfManaged(profile);
      if (seq !== seqRef.current) return 'stale';
      const user = toUser(profile, fbUser, selfManaged);
      applyUser(user);
      setSession({ user, provisioned: true, loading: false, error: null });
      return 'provisioned';
    } catch (err) {
      if (seq !== seqRef.current) return 'stale';
      forgetSessionUser(fbUser.uid);
      publishSelfManaged(false);
      publishAssessorTab(false);
      if (err instanceof LiveDataError && err.code === ERR.NOT_FOUND) {
        // Exactly the unprovisioned case: a real account with no users/{uid}
        // doc yet. Defined state, not an error.
        clearRoleHint();
        setSession({ user: unprovisionedUser(fbUser), provisioned: false, loading: false, error: null });
        return 'not-found';
      }
      suppressRoleHint(); // or sign-in follows it straight back to the landing (roleHint.js)
      setSession({ user: null, provisioned: false, loading: false, error: accountLoadError(err) });
      return 'error';
    }
  }, []);

  useEffect(() => {
    if (demo) return undefined; // demo bypasses real auth entirely
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      const seq = ++seqRef.current;
      if (!fbUser) {
        resetSession(); // the shared profile and everything kept for the account
        publishSelfManaged(false);
        publishAssessorTab(false);
        clearResearchSkips(); // "Skip for now" lasts until sign-out (Review Focus 5)
        setSession(SIGNED_OUT);
        setClaimState('idle');
        return;
      }
      setSessionScope(fbUser.uid); // another account: the last one's profile goes
      const known = peekSessionUser(fbUser.uid);
      if (known) {
        setSession({ user: withAuth(known.user, fbUser), provisioned: true, loading: false, error: null });
        if (sessionUserStale(fbUser.uid)) revalidate(fbUser);
        return;
      }
      seedFromHint(roleHintFor(fbUser.uid));
      // Another account straight after this one (no signed-out emission between): none of its state carries over.
      setSession((s) => ({ ...(s.user && s.user.uid !== fbUser.uid ? SIGNED_OUT : s), loading: true, pendingUid: fbUser.uid }));
      resolveProfile(seq, fbUser).then((outcome) => {
        // Sprint 20 (spec 3.2): every NOT_FOUND emission with an email asks
        // claimInvite; an emulator custom-token user has no email -> 'none'.
        if (outcome !== 'not-found') return;
        if (!fbUser.email) { setClaimState('none'); return; }
        claimRef.current(seq, fbUser);
      });
    });
    // A verified re-read anywhere (another session, a visible page) lands here too.
    const unlisten = subscribeSessionUser((user) => {
      const fbUser = auth.currentUser;
      if (!fbUser || fbUser.uid !== user.uid) return;
      seqRef.current += 1;
      setSession({ user: withAuth(user, fbUser), provisioned: true, loading: false, error: null });
    });
    if (mountedSessions++ === 0) document.addEventListener('visibilitychange', onVisible);
    return () => {
      seqRef.current += 1; // invalidate any in-flight resolution
      unsubscribe();
      unlisten();
      if (--mountedSessions === 0) document.removeEventListener('visibilitychange', onVisible);
    };
  }, [demo, resolveProfile]);

  /** Re-run the users/{uid} read under the current sequence (spec 2.2: `provisioned` flips without a reload). */
  const refresh = useCallback(async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) { resetSession(); publishSelfManaged(false); publishAssessorTab(false); clearResearchSkips(); setSession(SIGNED_OUT); return; }
    try { await fbUser.reload(); } catch (err) { /* offline reload: the cached user still resolves */ }
    setSession((s) => ({ ...s, loading: true, pendingUid: fbUser.uid }));
    await resolveProfile(seqRef.current, fbUser, true);
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
    resetSession(); // nothing of this account outlives the tap, even before the listener hears it
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
    // While users/{uid} loads: THIS account's last verified role, for the landing only (roleHint.js).
    hint: session.loading ? roleHintFor(session.pendingUid) : null,
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
