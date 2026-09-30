/**
 * The auth session's Sprint 20 additions (spec 2.1, 3.2): the pure mapping
 * from Firebase Auth / claimInvite outcomes to the states screens branch on.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, provider: {}, functions: {} }));
jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(), onAuthStateChanged: jest.fn(), sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(), signInWithEmailAndPassword: jest.fn(), signInWithPopup: jest.fn(), signOut: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));

import { ERR } from './live';
import { claimStateOf, createLoginError, resendError, verifyContinueUrl } from './useAuthSession';

describe('claimStateOf', () => {
  test('the four contract states pass through; anything else is error', () => {
    for (const s of ['claimed', 'needs-verification', 'already-claimed', 'none']) expect(claimStateOf({ state: s })).toBe(s);
    expect(claimStateOf({ state: 'weird' })).toBe('error');
    expect(claimStateOf(null)).toBe('error');
  });
});

describe('createLoginError', () => {
  test('email-in-use is the pinned copy with a stable reason', () => {
    const e = createLoginError({ code: 'auth/email-already-in-use' });
    expect(e).toMatchObject({ code: ERR.INVALID, reason: 'email-in-use', message: 'This email already has a login - sign in instead' });
  });
  test('weak password, bad email, throttling, disabled provider, unknown', () => {
    expect(createLoginError({ code: 'auth/weak-password' })).toMatchObject({ code: ERR.INVALID, reason: 'weak-password' });
    expect(createLoginError({ code: 'auth/invalid-email' })).toMatchObject({ code: ERR.INVALID, reason: 'invalid-email' });
    expect(createLoginError({ code: 'auth/too-many-requests' }).code).toBe(ERR.UNAVAILABLE);
    expect(createLoginError({ code: 'auth/operation-not-allowed' }).message).toBe('Email sign-in is not enabled yet — use Continue with Google.');
    expect(createLoginError(new Error('x'))).toMatchObject({ code: ERR.UNAVAILABLE, reason: null });
  });
});

test('resendError: throttled is UNAVAILABLE, anything else UNKNOWN', () => {
  expect(resendError({ code: 'auth/too-many-requests' }).code).toBe(ERR.UNAVAILABLE);
  expect(resendError({ code: 'auth/network-request-failed' })).toMatchObject({ code: ERR.UNKNOWN, message: 'Could not send the verification email. Please try again.' });
});

test('the verification link returns to this origin\'s sign-in page', () => {
  expect(verifyContinueUrl()).toBe(`${window.location.origin}/portal/signin`);
});
