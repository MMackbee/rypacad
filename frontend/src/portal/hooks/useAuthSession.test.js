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
// CRA's resetMocks clears these before every test; each test sets its own.
jest.mock('./live', () => ({ ...jest.requireActual('./live'), __esModule: true, fetchCurrentUser: jest.fn(), fetchHousehold: jest.fn() }));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged } from 'firebase/auth';
import * as live from './live';
import { ERR } from './live';
import useAuthSession, { claimStateOf, createLoginError, resendError, resolveSelfManaged, useSelfManaged, verifyContinueUrl } from './useAuthSession';

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

// Owner report (Mike S6 2026-09-30): the 18+ athlete who signed up for
// themselves created their household; a child's claimed login did not.
// The cache lives for the page load, so every test uses its own uids.
describe('self-managed athlete', () => {
  const household = (createdBy) => async (id) => ({ id, createdBy });

  test('an athlete who created their own household is self-managed; a child login is not', async () => {
    live.fetchHousehold.mockImplementation(async (id) => ({ id, createdBy: id === 'hh-self' ? 'u-self' : 'u-parent' }));
    expect(await resolveSelfManaged({ uid: 'u-self', role: 'athlete', athleteId: 'a-self', householdId: 'hh-self' })).toBe(true);
    expect(await resolveSelfManaged({ uid: 'u-kid', role: 'athlete', athleteId: 'a-kid', householdId: 'hh-family' })).toBe(false);
    expect(live.fetchHousehold.mock.calls).toEqual([['hh-self'], ['hh-family']]);
  });

  test('a parent, staff, or an athlete with no household never reads a household', async () => {
    live.fetchHousehold.mockImplementation(household('u-p'));
    expect(await resolveSelfManaged({ uid: 'u-p', role: 'parent', householdId: 'hh-p' })).toBe(false);
    expect(await resolveSelfManaged({ uid: 'u-o', role: 'owner', householdId: null })).toBe(false);
    expect(await resolveSelfManaged({ uid: 'u-legacy', role: 'athlete', athleteId: 'a-legacy', householdId: null })).toBe(false);
    expect(await resolveSelfManaged(null)).toBe(false);
    expect(live.fetchHousehold).not.toHaveBeenCalled();
  });

  test('ONE household read per uid, shared by every mounted session', async () => {
    live.fetchHousehold.mockImplementation(household('u-shared'));
    const profile = { uid: 'u-shared', role: 'athlete', athleteId: 'a-shared', householdId: 'hh-shared' };
    expect(await Promise.all([resolveSelfManaged(profile), resolveSelfManaged(profile)])).toEqual([true, true]);
    expect(await resolveSelfManaged(profile)).toBe(true);
    expect(live.fetchHousehold).toHaveBeenCalledTimes(1);
  });

  test('a failed read is false (never a payer by accident) and the next resolution retries', async () => {
    const profile = { uid: 'u-flaky', role: 'athlete', athleteId: 'a-flaky', householdId: 'hh-flaky' };
    live.fetchHousehold.mockRejectedValueOnce(new Error('offline')).mockImplementation(household('u-flaky'));
    expect(await resolveSelfManaged(profile)).toBe(false);
    expect(await resolveSelfManaged(profile)).toBe(true);
    expect(live.fetchHousehold).toHaveBeenCalledTimes(2);
  });

  test('the session carries user.selfManaged, publishes it for the tab bar, and sign-out clears it', async () => {
    let emit = null;
    onAuthStateChanged.mockImplementation((_auth, cb) => { emit = cb; return () => {}; });
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u-hook', role: 'athlete', athleteId: 'a-hook', householdId: 'hh-hook' });
    live.fetchHousehold.mockImplementation(household('u-hook'));
    const seen = {};
    function Probe() {
      seen.session = useAuthSession();
      seen.tabBar = useSelfManaged();
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<Probe />); });
    expect(seen.tabBar).toBe(false);
    await act(async () => { emit({ uid: 'u-hook', email: 'sam@example.com', emailVerified: true }); await new Promise((r) => setTimeout(r, 0)); });
    expect(seen.session.loading).toBe(false);
    expect(seen.session.user).toMatchObject({ uid: 'u-hook', role: 'athlete', householdId: 'hh-hook', selfManaged: true });
    expect(seen.tabBar).toBe(true);
    await act(async () => { emit(null); });
    expect(seen.session.user).toBeNull();
    expect(seen.tabBar).toBe(false);
    await act(async () => root.unmount());
  });

  test("a child's login resolves with selfManaged false", async () => {
    let emit = null;
    onAuthStateChanged.mockImplementation((_auth, cb) => { emit = cb; return () => {}; });
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u-child', role: 'athlete', athleteId: 'a-child', householdId: 'hh-parent' });
    live.fetchHousehold.mockImplementation(household('u-the-parent'));
    const seen = {};
    function Probe() {
      seen.session = useAuthSession();
      seen.tabBar = useSelfManaged();
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<Probe />); });
    await act(async () => { emit({ uid: 'u-child', email: 'kid@example.com', emailVerified: true }); await new Promise((r) => setTimeout(r, 0)); });
    expect(seen.session.user).toMatchObject({ uid: 'u-child', role: 'athlete', selfManaged: false });
    expect(seen.tabBar).toBe(false);
    await act(async () => root.unmount());
  });
});
