/**
 * F4 (speed work 2026-11-17): users/{uid} is read once per sign-in and shared
 * by every mounted useAuthSession and every fetchCurrentUser caller. A role
 * change still reaches an open session: the profile is read again when the
 * page becomes visible, after five minutes, on refresh(), and after a write
 * to the users collection. Sign-out and a user switch drop it.
 *
 * Real live.js and sessionStore.js; only the SDKs are stand-ins.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, provider: {}, db: {}, functions: {} }));
jest.mock('firebase/auth', () => {
  const listeners = new Set();
  return {
    // Like the SDK: a new observer hears the current account on a later tick.
    onAuthStateChanged: (auth, cb) => {
      listeners.add(cb);
      Promise.resolve().then(() => { if (listeners.has(cb)) cb(auth.currentUser); });
      return () => listeners.delete(cb);
    },
    signOut: async (auth) => { auth.currentUser = null; [...listeners].forEach((cb) => cb(null)); },
    __emit: (auth, user) => { auth.currentUser = user; [...listeners].forEach((cb) => cb(user)); },
    createUserWithEmailAndPassword: () => {}, sendEmailVerification: () => {}, sendPasswordResetEmail: () => {},
    signInWithEmailAndPassword: () => {}, signInWithPopup: () => {},
  };
});
jest.mock('firebase/firestore', () => ({
  doc: (_db, col, id) => ({ col, id }),
  getDoc: async (ref) => {
    mockReads.push(`${ref.col}/${ref.id}`);
    const data = mockDocs[`${ref.col}/${ref.id}`];
    return { exists: () => data !== undefined, data: () => data };
  },
}));
jest.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: { state: 'none' } }) }));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { auth } from '../../firebase';
import { __emit } from 'firebase/auth';
import useAuthSession from './useAuthSession';
import { fetchCurrentUser } from './live';
import { bump } from './invalidate';
import { PROFILE_TTL_MS, resetSession } from './sessionStore';

const mockReads = [];
const mockDocs = {};
const roots = [];

const account = (uid) => ({ uid, email: `${uid}@example.com`, emailVerified: true, reload: async () => {} });
const userReads = (uid) => mockReads.filter((r) => r === `users/${uid}`).length;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };

/** Mount one probe; `seen` keeps every render's session, `now()` the latest. */
async function mountProbe() {
  const seen = [];
  function Probe() { seen.push(useAuthSession()); return null; }
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  await act(async () => { root.render(<Probe />); });
  return { seen, now: () => seen[seen.length - 1], first: () => seen[0] };
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(async () => {
  while (roots.length) { const root = roots.pop(); await act(async () => root.unmount()); }
  resetSession();
  auth.currentUser = null;
  mockReads.length = 0;
  Object.keys(mockDocs).forEach((k) => delete mockDocs[k]);
  jest.restoreAllMocks();
});

test('three mounted sessions and a data hook share ONE users read', async () => {
  mockDocs['users/u-owner'] = { role: 'owner', displayName: 'Owner' };
  auth.currentUser = account('u-owner');
  const probes = [await mountProbe(), await mountProbe(), await mountProbe()];
  await flush();
  for (const p of probes) expect(p.now()).toMatchObject({ loading: false, provisioned: true, user: { uid: 'u-owner', role: 'owner' } });
  expect(await fetchCurrentUser()).toMatchObject({ uid: 'u-owner', role: 'owner', displayName: 'Owner' });
  expect(userReads('u-owner')).toBe(1);
});

test('a route wrapper mounted after the profile is known starts resolved: no loading frame, no read', async () => {
  mockDocs['users/u-coach'] = { role: 'coach', specialistId: 'phil' };
  auth.currentUser = account('u-coach');
  await mountProbe();
  await flush();
  const late = await mountProbe();
  expect(late.first()).toMatchObject({ loading: false, user: { uid: 'u-coach', role: 'coach', specialistId: 'phil' } });
  await flush();
  expect(late.seen.every((s) => s.loading === false)).toBe(true);
  expect(userReads('u-coach')).toBe(1);
});

test('sign-out clears the shared profile: a new session waits, and the next sign-in reads again', async () => {
  mockDocs['users/u-ops'] = { role: 'ops' };
  auth.currentUser = account('u-ops');
  const p = await mountProbe();
  await flush();
  await act(async () => { await p.now().signOut(); });
  expect(p.now()).toMatchObject({ user: null, loading: false });
  const after = await mountProbe();
  expect(after.first()).toMatchObject({ user: null, loading: true });
  await act(async () => { __emit(auth, account('u-ops')); });
  await flush();
  expect(p.now().user).toMatchObject({ role: 'ops' });
  expect(userReads('u-ops')).toBe(2);
});

test('a user switch never serves the last account: the new uid reads its own profile', async () => {
  mockDocs['users/u-first'] = { role: 'owner' };
  mockDocs['users/u-second'] = { role: 'parent', householdId: 'hh-2' };
  auth.currentUser = account('u-first');
  const p = await mountProbe();
  await flush();
  await act(async () => { __emit(auth, account('u-second')); });
  await flush();
  expect(p.now().user).toMatchObject({ uid: 'u-second', role: 'parent' });
  expect(await fetchCurrentUser()).toMatchObject({ uid: 'u-second', role: 'parent' });
  expect(userReads('u-second')).toBe(1);
});

test('the page becoming visible again re-reads the profile, and a role change reaches every open session', async () => {
  mockDocs['users/u-staff'] = { role: 'coach' };
  auth.currentUser = account('u-staff');
  const a = await mountProbe();
  const b = await mountProbe();
  await flush();
  mockDocs['users/u-staff'] = { role: 'ops' };
  await act(async () => { setVisibility('hidden'); });
  expect(userReads('u-staff')).toBe(1);
  await act(async () => { setVisibility('visible'); });
  await flush();
  expect(userReads('u-staff')).toBe(2);
  expect(a.now().user.role).toBe('ops');
  expect(b.now().user.role).toBe('ops');
  expect(await fetchCurrentUser()).toMatchObject({ role: 'ops' });
  expect(userReads('u-staff')).toBe(2);
});

test('after five minutes a newly mounted session shows the known profile and re-reads it in the background', async () => {
  const start = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(start);
  mockDocs['users/u-ttl'] = { role: 'mental', specialistId: 'mental' };
  auth.currentUser = account('u-ttl');
  await mountProbe();
  await flush();
  mockDocs['users/u-ttl'] = { role: 'coach', specialistId: 'phil' };
  clock.mockReturnValue(start + PROFILE_TTL_MS - 1);
  const early = await mountProbe();
  await flush();
  expect(userReads('u-ttl')).toBe(1);
  expect(early.now().user.role).toBe('mental');
  clock.mockReturnValue(start + PROFILE_TTL_MS + 1);
  const late = await mountProbe();
  expect(late.first()).toMatchObject({ loading: false, user: { role: 'mental' } });
  await flush();
  expect(userReads('u-ttl')).toBe(2);
  expect(late.now().user).toMatchObject({ role: 'coach', specialistId: 'phil' });
  expect(early.now().user).toMatchObject({ role: 'coach', specialistId: 'phil' });
});

test('refresh() always reads again', async () => {
  mockDocs['users/u-ref'] = { role: 'parent', householdId: 'hh-r' };
  auth.currentUser = account('u-ref');
  const p = await mountProbe();
  await flush();
  await act(async () => { await p.now().refresh(); });
  expect(userReads('u-ref')).toBe(2);
});

test("a write to the users collection (the member's own prefs or phone) makes the next fetchCurrentUser read again", async () => {
  mockDocs['users/u-prefs'] = { role: 'parent', householdId: 'hh-p', phone: null };
  auth.currentUser = account('u-prefs');
  await mountProbe();
  await flush();
  mockDocs['users/u-prefs'] = { role: 'parent', householdId: 'hh-p', phone: '555' };
  bump('users');
  expect(await fetchCurrentUser()).toMatchObject({ phone: '555' });
  expect(userReads('u-prefs')).toBe(2);
});

test('an unprovisioned account (no users doc) is never cached: each look reads', async () => {
  auth.currentUser = account('u-new');
  const p = await mountProbe();
  await flush();
  expect(p.now()).toMatchObject({ provisioned: false, user: { uid: 'u-new', role: null } });
  await expect(fetchCurrentUser()).rejects.toMatchObject({ code: 'not-found' });
  expect(userReads('u-new')).toBe(2);
});

test('fetchCurrentUser hands out copies: a caller editing its profile never edits the shared one', async () => {
  mockDocs['users/u-copy'] = { role: 'owner' };
  auth.currentUser = account('u-copy');
  await mountProbe();
  await flush();
  const mine = await fetchCurrentUser();
  mine.role = 'parent';
  expect((await fetchCurrentUser()).role).toBe('owner');
});
