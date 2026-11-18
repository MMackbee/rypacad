/**
 * The cold-start hint and a users read that fails (review 2026-11-17, F1).
 * A returning owner opens the app offline, or users/{uid} is refused: auth
 * still restores the account, RequireRole renders Admin from the hint, the
 * read fails and the guard sends the visitor to sign-in. Sign-in must then
 * show the form with the error - not follow the same hint straight back to
 * Admin, which bounced between the two pages for as long as the read kept
 * failing, re-reading users/{uid} (and mounting Admin) on every pass.
 *
 * Real useAuthSession, sessionStore and roleHint composed with RequireRole and
 * SignIn; only the SDKs and the staff screens are stand-ins.
 */
jest.mock('../firebase', () => ({ auth: { currentUser: null }, provider: {}, db: {}, functions: {} }));
jest.mock('firebase/auth', () => {
  const listeners = new Set();
  return {
    ...jest.requireActual('firebase/auth'),
    onAuthStateChanged: (auth, cb) => {
      listeners.add(cb);
      Promise.resolve().then(() => { if (listeners.has(cb)) cb(auth.currentUser); });
      return () => listeners.delete(cb);
    },
    signOut: async (auth) => { auth.currentUser = null; [...listeners].forEach((cb) => cb(null)); },
    // The same account signing in again: Firebase 9 notifies listeners only
    // when the uid changes, so no emission follows (review 2026-11-17, AUTH-1).
    signInWithEmailAndPassword: async (auth) => { mockSignIns.push('email'); return { user: auth.currentUser }; },
    signInWithPopup: async (auth) => { mockSignIns.push('google'); return { user: auth.currentUser }; },
  };
});
jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'),
  doc: (_db, col, id) => ({ col, id }),
  getDoc: async (ref) => {
    mockReads.push(`${ref.col}/${ref.id}`);
    if (mockFail.value) throw Object.assign(new Error('Failed to get document because the client is offline.'), { code: mockFail.value });
    const data = mockDocs[`${ref.col}/${ref.id}`];
    return { exists: () => data !== undefined, data: () => data };
  },
}));
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => true }));
jest.mock('./screens/AdminDashboard', () => ({ __esModule: true, default: ({ role }) => `ADMIN as ${role}` }));
jest.mock('./hooks/researchConsent', () => ({ useResearchConfirm: () => ({ data: { pending: [] }, loading: false, error: null }), saveResearchConsent: async () => ({}) }));
jest.mock('./components/FeedbackButton', () => ({ __esModule: true, default: () => null }));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import PortalRoutes from './PortalRoutes';
import { readRoleHint, writeRoleHint } from './hooks/roleHint';
import { resetSession } from './hooks/sessionStore';

const mockReads = [];
const mockDocs = {};
const mockFail = { value: null };
const mockSignIns = [];

const account = (uid) => ({ uid, email: `${uid}@example.com`, emailVerified: true, reload: async () => {} });
const userReads = () => mockReads.filter((r) => r.startsWith('users/')).length;
const flush = async (n = 12) => { for (let i = 0; i < n; i += 1) await act(async () => { await Promise.resolve(); }); };

function Spy({ onLoc }) { onLoc(useLocation()); return null; }

async function mount(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const loc = { current: null, visits: [] };
  // What each commit left on screen (a Profiler's onRender runs in the commit).
  const frames = [];
  const onRender = () => {
    const form = Boolean(container.querySelector('input[aria-label="Email"]'));
    const panel = container.textContent.includes("Your account didn't load");
    frames.push(container.querySelector('[data-launch-splash]') ? 'SPLASH' : form ? (panel ? 'FORM+PANEL' : 'FORM') : container.textContent.trim() || 'BLANK');
  };
  await act(async () => {
    root.render(
      <React.Profiler id="hint-loop" onRender={onRender}>
        <MemoryRouter initialEntries={[path]}>
          <Spy onLoc={(l) => { loc.current = l; if (loc.visits[loc.visits.length - 1] !== l.pathname) loc.visits.push(l.pathname); }} />
          <Routes><Route path="/portal/*" element={<PortalRoutes />} /></Routes>
        </MemoryRouter>
      </React.Profiler>
    );
  });
  return {
    container,
    frames,
    text: () => container.textContent,
    pathname: () => loc.current.pathname,
    visits: () => loc.visits,
    button: (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label) || null,
    fill: async (label, value) => {
      const el = container.querySelector(`input[aria-label="${label}"]`);
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value);
      await act(async () => { el.dispatchEvent(new Event('input', { bubbles: true })); });
    },
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

afterEach(() => {
  resetSession();
  auth.currentUser = null;
  mockSignIns.length = 0;
  mockReads.length = 0;
  mockFail.value = null;
  Object.keys(mockDocs).forEach((k) => delete mockDocs[k]);
  window.localStorage.clear();
});

for (const code of ['unavailable', 'permission-denied']) {
  test(`a hinted owner whose users read fails (${code}) settles on sign-in with the error, no loop back to Admin`, async () => {
    writeRoleHint({ uid: 'u-own', role: 'owner' });
    auth.currentUser = account('u-own');
    mockFail.value = code;
    const r = await mount('/portal/admin');
    await flush(40);
    expect(r.pathname()).toBe('/portal/signin');
    expect(r.container.querySelectorAll('input').length).toBeGreaterThanOrEqual(2);
    expect(r.container.querySelector('[data-launch-splash]')).toBeNull();
    const settled = userReads();
    await flush(40);
    expect(userReads()).toBe(settled);
    expect(settled).toBeLessThanOrEqual(3);
    expect(r.visits()).toEqual(['/portal/admin', '/portal/signin']);
    await r.unmount();
  });
}

test('a failed read keeps the stored hint for the next launch', async () => {
  writeRoleHint({ uid: 'u-own', role: 'owner' });
  auth.currentUser = account('u-own');
  mockFail.value = 'unavailable';
  const r = await mount('/portal/admin');
  await flush(40);
  expect(r.pathname()).toBe('/portal/signin');
  // The stored hint survives: offline is not a reason to forget the role.
  expect(readRoleHint()).toMatchObject({ uid: 'u-own', role: 'owner' });
  await r.unmount();
});

// F3 (review 2026-11-17): the users read's SDK text never reaches the page.
test.each([
  ['unavailable', "We couldn't load your account. Check your connection and try again."],
  ['permission-denied', "We couldn't load your account. Try again, or contact the academy if it keeps happening."],
])('a failed users read (%s) reads as plain copy on sign-in, not the SDK message', async (code, copy) => {
  writeRoleHint({ uid: 'u-own', role: 'owner' });
  auth.currentUser = account('u-own');
  mockFail.value = code;
  const r = await mount('/portal/admin');
  await flush(40);
  expect(r.pathname()).toBe('/portal/signin');
  expect(r.text()).toContain(copy);
  expect(r.text()).not.toContain('fetchCurrentUser');
  expect(r.text()).not.toContain('client is offline');
  await r.unmount();
});

/*
 * AUTH-1 (review 2026-11-17): the visitor the failed read left on sign-in is
 * still signed in. Signing in again with the same account gets no auth
 * emission (Firebase 9 notifies only on a uid change), so waiting for one
 * left the button on 'Signing in' for good. Every way out re-reads users/{uid}.
 */
async function stuckOnSignIn() {
  writeRoleHint({ uid: 'u-own', role: 'owner' });
  mockDocs['users/u-own'] = { role: 'owner' };
  auth.currentUser = account('u-own');
  mockFail.value = 'unavailable';
  const r = await mount('/portal/admin');
  await flush(40);
  expect(r.pathname()).toBe('/portal/signin');
  mockFail.value = null; // the connection is back
  return r;
}

test('signed in but the account did not load: Try again reads it again and lands', async () => {
  const r = await stuckOnSignIn();
  expect(r.button('Try again')).not.toBeNull();
  const before = r.frames.length;
  await act(async () => { r.button('Try again').click(); });
  await flush(40);
  expect(r.pathname()).toBe('/portal/admin');
  expect(r.text()).toContain('ADMIN as owner');
  // Browser check 2026-11-17: once the read lands, the splash until Admin
  // paints - never a frame of the bare form on the way out.
  expect(r.frames.slice(before)).not.toContain('FORM');
  await r.unmount();
});

test('the same account signing in again with its password lands, never stuck on Signing in', async () => {
  const r = await stuckOnSignIn();
  await r.fill('Email', 'u-own@example.com');
  await r.fill('Password', 'pw-test');
  await act(async () => { r.button('Sign in').click(); });
  await flush(40);
  expect(mockSignIns).toEqual(['email']);
  expect(r.text()).not.toContain('Signing in');
  expect(r.pathname()).toBe('/portal/admin');
  await r.unmount();
});

test('Continue with Google for the same account lands too', async () => {
  const r = await stuckOnSignIn();
  const google = [...r.container.querySelectorAll('button')].find((b) => b.textContent.includes('Continue with Google'));
  await act(async () => { google.click(); });
  await flush(40);
  expect(mockSignIns).toEqual(['google']);
  expect(r.pathname()).toBe('/portal/admin');
  await r.unmount();
});

test('the connection coming back retries once on its own', async () => {
  const r = await stuckOnSignIn();
  await act(async () => { window.dispatchEvent(new Event('online')); });
  await flush(40);
  expect(r.pathname()).toBe('/portal/admin');
  await r.unmount();
});

test('a refused read does not retry on the online event (only an unavailable one does)', async () => {
  writeRoleHint({ uid: 'u-own', role: 'owner' });
  auth.currentUser = account('u-own');
  mockFail.value = 'permission-denied';
  const r = await mount('/portal/admin');
  await flush(40);
  const settled = userReads();
  await act(async () => { window.dispatchEvent(new Event('online')); });
  await flush(40);
  expect(userReads()).toBe(settled);
  expect(r.pathname()).toBe('/portal/signin');
  expect(r.button('Try again')).not.toBeNull();
  await r.unmount();
});
