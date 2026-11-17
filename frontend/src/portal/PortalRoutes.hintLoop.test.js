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

const account = (uid) => ({ uid, email: `${uid}@example.com`, emailVerified: true, reload: async () => {} });
const userReads = () => mockReads.filter((r) => r.startsWith('users/')).length;
const flush = async (n = 12) => { for (let i = 0; i < n; i += 1) await act(async () => { await Promise.resolve(); }); };

function Spy({ onLoc }) { onLoc(useLocation()); return null; }

async function mount(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const loc = { current: null, visits: [] };
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Spy onLoc={(l) => { loc.current = l; if (loc.visits[loc.visits.length - 1] !== l.pathname) loc.visits.push(l.pathname); }} />
        <Routes><Route path="/portal/*" element={<PortalRoutes />} /></Routes>
      </MemoryRouter>
    );
  });
  return {
    container,
    text: () => container.textContent,
    pathname: () => loc.current.pathname,
    visits: () => loc.visits,
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

afterEach(() => {
  resetSession();
  auth.currentUser = null;
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
