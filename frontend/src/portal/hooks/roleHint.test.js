/**
 * The cold-start role hint (speed work 2026-11-17): a UI-only last-known
 * { uid, role, specialistId } in localStorage, written after a verified
 * users read and cleared on sign-out. It only lets the landing start early;
 * nothing security-relevant reads it.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, provider: {}, db: {}, functions: {} }));
jest.mock('firebase/auth', () => {
  const listeners = new Set();
  return {
    onAuthStateChanged: (auth, cb) => {
      listeners.add(cb);
      Promise.resolve().then(() => { if (listeners.has(cb)) cb(auth.currentUser); });
      return () => listeners.delete(cb);
    },
    signOut: async (auth) => { auth.currentUser = null; [...listeners].forEach((cb) => cb(null)); },
    createUserWithEmailAndPassword: () => {}, sendEmailVerification: () => {}, sendPasswordResetEmail: () => {},
    signInWithEmailAndPassword: () => {}, signInWithPopup: () => {},
  };
});
jest.mock('firebase/firestore', () => ({
  doc: (_db, col, id) => ({ col, id }),
  getDoc: async (ref) => {
    await mockGate.promise;
    const data = mockDocs[`${ref.col}/${ref.id}`];
    return { exists: () => data !== undefined, data: () => data };
  },
}));
jest.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: { state: 'none' } }) }));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { auth } from '../../firebase';
import useAuthSession from './useAuthSession';
import { ROLE_HINT_KEY, clearRoleHint, readRoleHint, roleHintFor, viewerOf, writeRoleHint } from './roleHint';
import { resetSession } from './sessionStore';

const mockDocs = {};
let mockGate = { promise: Promise.resolve() };
const roots = [];
const account = (uid) => ({ uid, email: `${uid}@example.com`, emailVerified: true, reload: async () => {} });
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };

async function mountProbe() {
  const seen = [];
  function Probe() { seen.push(useAuthSession()); return null; }
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  await act(async () => { root.render(<Probe />); });
  return { seen, now: () => seen[seen.length - 1] };
}

/** Hold every getDoc until release(). */
function holdReads() {
  let release;
  mockGate = { promise: new Promise((r) => { release = r; }) };
  return () => release();
}

afterEach(async () => {
  while (roots.length) { const root = roots.pop(); await act(async () => root.unmount()); }
  resetSession();
  auth.currentUser = null;
  mockGate = { promise: Promise.resolve() };
  Object.keys(mockDocs).forEach((k) => delete mockDocs[k]);
  window.localStorage.clear();
  jest.restoreAllMocks();
});

describe('the stored hint', () => {
  test('round-trips uid, role and specialistId only', () => {
    writeRoleHint({ uid: 'u1', role: 'coach', specialistId: 'phil', householdId: 'hh', email: 'x@example.com' });
    expect(JSON.parse(window.localStorage.getItem(ROLE_HINT_KEY))).toEqual({ uid: 'u1', role: 'coach', specialistId: 'phil' });
    expect(readRoleHint()).toEqual({ uid: 'u1', role: 'coach', specialistId: 'phil' });
    expect(roleHintFor('u1')).toEqual({ uid: 'u1', role: 'coach', specialistId: 'phil' });
    expect(roleHintFor('someone-else')).toBeNull();
    expect(roleHintFor(null)).toBeNull();
    clearRoleHint();
    expect(readRoleHint()).toBeNull();
  });

  test('junk in storage, an unknown role or no role reads as no hint; nothing is written without a role', () => {
    window.localStorage.setItem(ROLE_HINT_KEY, '{not json');
    expect(readRoleHint()).toBeNull();
    window.localStorage.setItem(ROLE_HINT_KEY, JSON.stringify({ uid: 'u1', role: 'superuser' }));
    expect(readRoleHint()).toBeNull();
    window.localStorage.setItem(ROLE_HINT_KEY, JSON.stringify({ uid: 7, role: 'owner' }));
    expect(readRoleHint()).toBeNull();
    window.localStorage.removeItem(ROLE_HINT_KEY);
    writeRoleHint({ uid: 'u-none', role: null });
    expect(window.localStorage.getItem(ROLE_HINT_KEY)).toBeNull();
  });

  test('storage that throws (private mode, blocked site data) never breaks a read or a write', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readRoleHint()).toBeNull();
    expect(() => writeRoleHint({ uid: 'u1', role: 'owner' })).not.toThrow();
    expect(() => clearRoleHint()).not.toThrow();
  });

  test('viewerOf: the verified user when there is one, the hint only while loading', () => {
    const hint = { uid: 'u1', role: 'owner', specialistId: null };
    expect(viewerOf({ user: { uid: 'u1', role: 'ops' }, loading: false, hint })).toEqual({ uid: 'u1', role: 'ops' });
    expect(viewerOf({ user: null, loading: true, hint })).toBe(hint);
    expect(viewerOf({ user: null, loading: false, hint })).toBeNull();
    expect(viewerOf({ user: null, loading: true })).toBeNull();
  });
});

describe('useAuthSession and the hint', () => {
  test('a verified read writes it', async () => {
    mockDocs['users/u-owner'] = { role: 'owner' };
    auth.currentUser = account('u-owner');
    const p = await mountProbe();
    await flush();
    expect(p.now().user.role).toBe('owner');
    expect(readRoleHint()).toEqual({ uid: 'u-owner', role: 'owner', specialistId: null });
  });

  test('sign-out clears it', async () => {
    mockDocs['users/u-out'] = { role: 'coach', specialistId: 'phil' };
    auth.currentUser = account('u-out');
    const p = await mountProbe();
    await flush();
    expect(readRoleHint()).toMatchObject({ uid: 'u-out' });
    await act(async () => { await p.now().signOut(); });
    expect(readRoleHint()).toBeNull();
  });

  test('an unprovisioned account clears it', async () => {
    writeRoleHint({ uid: 'u-gone', role: 'parent' });
    auth.currentUser = account('u-gone');
    const p = await mountProbe();
    await flush();
    expect(p.now().provisioned).toBe(false);
    expect(readRoleHint()).toBeNull();
  });

  test("while the users read is in flight the session offers the hint - only when it is this account's", async () => {
    writeRoleHint({ uid: 'u-cold', role: 'ops', specialistId: null });
    mockDocs['users/u-cold'] = { role: 'ops' };
    auth.currentUser = account('u-cold');
    const release = holdReads();
    const p = await mountProbe();
    await flush();
    expect(p.now()).toMatchObject({ loading: true, user: null, hint: { uid: 'u-cold', role: 'ops' } });
    await act(async () => { release(); });
    await flush();
    expect(p.now()).toMatchObject({ loading: false, user: { role: 'ops' }, hint: null });
  });

  test("another account's hint is never offered", async () => {
    writeRoleHint({ uid: 'u-previous', role: 'owner' });
    mockDocs['users/u-next'] = { role: 'parent', householdId: 'hh' };
    auth.currentUser = account('u-next');
    const release = holdReads();
    const p = await mountProbe();
    await flush();
    expect(p.now()).toMatchObject({ loading: true, hint: null });
    await act(async () => { release(); });
    await flush();
    expect(readRoleHint()).toMatchObject({ uid: 'u-next', role: 'parent' });
  });
});
