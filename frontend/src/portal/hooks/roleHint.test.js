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
    __emit: (auth, user) => { auth.currentUser = user; [...listeners].forEach((cb) => cb(user)); },
    createUserWithEmailAndPassword: () => {}, sendEmailVerification: () => {}, sendPasswordResetEmail: () => {},
    signInWithEmailAndPassword: () => {}, signInWithPopup: () => {},
  };
});
jest.mock('firebase/firestore', () => ({
  doc: (_db, col, id) => ({ col, id }),
  getDoc: async (ref) => {
    await mockGate.promise;
    if (mockFail.value) throw Object.assign(new Error('Failed to get document because the client is offline.'), { code: mockFail.value });
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
import { ROLE_HINT_KEY, clearRoleHint, readRoleHint, roleHintFor, suppressRoleHint, viewerOf, writeRoleHint } from './roleHint';
import { resetSession } from './sessionStore';

const mockDocs = {};
const mockFail = { value: null };
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
  mockFail.value = null;
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

// Review 2026-11-17 (F3): auth can report account B straight after account A
// with no signed-out emission between (a hidden tab's storage poll sees both
// at once). Nothing of A's session may carry into B's loading state.
describe('another account straight after this one', () => {
  test("B's session never carries A's user while B's read is in flight", async () => {
    mockDocs['users/u-a'] = { role: 'parent', householdId: 'hh-a' };
    mockDocs['users/u-b'] = { role: 'parent', householdId: 'hh-b' };
    auth.currentUser = account('u-a');
    const p = await mountProbe();
    await flush();
    expect(p.now().user).toMatchObject({ uid: 'u-a', householdId: 'hh-a' });
    writeRoleHint({ uid: 'u-b', role: 'parent' }); // B signed in from another tab
    const release = holdReads();
    await act(async () => { __emit(auth, account('u-b')); });
    await flush();
    expect(p.now()).toMatchObject({ loading: true, user: null, provisioned: false, hint: { uid: 'u-b', role: 'parent' } });
    await act(async () => { release(); });
    await flush();
    expect(p.now()).toMatchObject({ loading: false, user: { uid: 'u-b', householdId: 'hh-b' } });
  });
});

// Review 2026-11-17 (F2): a verified role with no landing (null, or one the
// portal does not know) retires the old hint, or every cold start keeps
// rendering the last role's landing before bouncing.
describe('a role with no landing', () => {
  test('clears the stored hint', () => {
    writeRoleHint({ uid: 'u-c', role: 'coach' });
    writeRoleHint({ uid: 'u-c', role: null });
    expect(readRoleHint()).toBeNull();
    writeRoleHint({ uid: 'u-c', role: 'coach' });
    writeRoleHint({ uid: 'u-c', role: 'former' });
    expect(readRoleHint()).toBeNull();
  });

  test('a verified read that finds no role retires the last staff hint', async () => {
    writeRoleHint({ uid: 'u-left', role: 'coach' });
    mockDocs['users/u-left'] = { role: null };
    auth.currentUser = account('u-left');
    const p = await mountProbe();
    await flush();
    expect(p.now()).toMatchObject({ loading: false, user: { uid: 'u-left', role: null } });
    expect(readRoleHint()).toBeNull();
  });
});

// Review 2026-11-17 (F1): a users read that fails for any reason but
// NOT_FOUND - offline, unavailable, refused - must not leave the hint driving
// the launch paths, or RequireRole's redirect to sign-in and sign-in's hint
// navigation bounce for as long as the read keeps failing.
describe('a failed users read', () => {
  test('suppressRoleHint: not offered for the rest of the page load, the stored copy kept; a verified write offers it again', () => {
    writeRoleHint({ uid: 'u1', role: 'owner' });
    suppressRoleHint();
    expect(roleHintFor('u1')).toBeNull();
    expect(readRoleHint()).toMatchObject({ uid: 'u1', role: 'owner' });
    writeRoleHint({ uid: 'u1', role: 'owner' });
    expect(roleHintFor('u1')).toMatchObject({ uid: 'u1', role: 'owner' });
  });

  test('stops the hint for this session and every session mounted after it, until a read succeeds', async () => {
    writeRoleHint({ uid: 'u-off', role: 'owner' });
    auth.currentUser = account('u-off');
    mockFail.value = 'unavailable';
    const first = await mountProbe();
    expect(first.seen[0]).toMatchObject({ loading: true, hint: { uid: 'u-off', role: 'owner' } });
    await flush();
    expect(first.now()).toMatchObject({ loading: false, user: null, hint: null });
    expect(first.now().error).toBeTruthy();
    const late = await mountProbe();
    expect(late.seen[0]).toMatchObject({ loading: true, hint: null });
    await flush();
    mockFail.value = null;
    mockDocs['users/u-off'] = { role: 'owner' };
    await act(async () => { await late.now().refresh(); });
    await flush();
    expect(late.now()).toMatchObject({ loading: false, user: { role: 'owner' } });
    expect(roleHintFor('u-off')).toMatchObject({ role: 'owner' });
  });
});
