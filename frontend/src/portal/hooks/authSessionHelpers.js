/*
 * Moved here from useAuthSession.js unchanged (review 2026-11-17, to keep
 * that file under 500 lines); useAuthSession re-exports all four names.
 */
import { ERR, LiveDataError } from './live';

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
