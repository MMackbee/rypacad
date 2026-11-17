/**
 * The Facility door staff screen route (2026-11-17 door spec 7): /portal/admin/door
 * for the owner and ops only, lazy; the Admin dashboard is handed the way in;
 * Back goes to Admin. The harness (mocks, the mount helper) is
 * PortalRoutes.staffbooking.test.js lines 1-98; the screen is a stand-in.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PortalRoutes from './PortalRoutes';

const mockLive = { value: false };
const mockUser = { value: null };
// mockDeferred: every hook instance starts {user: null, loading: true} and
// resolves after its first commit, like a freshly mounted live session.
const mockDeferred = { value: false };
const mockSettingsRoles = [];
// Every render of the Admin dashboard: which role, and whether it was handed the scholarships destination.
const mockAdminRenders = [];
jest.mock('./StatesHarness', () => ({ __esModule: true, default: () => 'HARNESS' }));
jest.mock('./screens/AdminDashboard', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({ role, onOpenScholarships, onOpenDoor }) => {
      mockAdminRenders.push({ role, scholarships: typeof onOpenScholarships === 'function', door: typeof onOpenDoor === 'function' });
      return createElement('div', null,
        createElement('button', { type: 'button', onClick: onOpenScholarships }, `ADMIN as ${role}`),
        createElement('button', { type: 'button', 'data-do': 'door', onClick: onOpenDoor }, 'Open facility door'));
    },
  };
});
jest.mock('./screens/AdminScholarships', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    // The first button is the screen's back; the two unlabelled ones open an application and close it, and
    // data-open says which application the route reports as open.
    default: ({ role, onBack, onRetry, openId, onOpen, onClose }) =>
      createElement('div', { 'data-open': openId ?? '' },
        createElement('button', { type: 'button', onClick: onBack }, `SCHOLARSHIPS as ${role}, retry ${typeof onRetry === 'function' ? 'wired' : 'missing'}`),
        createElement('button', { type: 'button', 'data-do': 'open', onClick: () => onOpen('app-1') }),
        createElement('button', { type: 'button', 'data-do': 'close', onClick: onClose })),
  };
});
// The staff homes a refused role is sent to: stand-ins, so no real screen runs its live reads here.
jest.mock('./screens/CoachDashboard', () => ({ __esModule: true, default: ({ role, specialistId }) => `COACH HOME as ${role}${specialistId ? '/' + specialistId : ''}` }));
jest.mock('./screens/SpecialistDay', () => ({ __esModule: true, default: () => 'MY SESSIONS' }));
jest.mock('./screens/MentalConsentFlow', () => ({ __esModule: true, default: ({ athleteId, change }) => `CONSENT FLOW ${athleteId}${change ? ' (change)' : ''}` }));
jest.mock('./screens/CommitmentContract', () => ({ __esModule: true, default: () => 'CONTRACT' }));
jest.mock('./screens/AuthAction', () => ({ __esModule: true, default: () => 'AUTH ACTION' }));
jest.mock('./screens/AthleteDashboard', () => ({ __esModule: true, default: () => 'ATHLETE HOME' }));
jest.mock('./screens/ParentDashboard', () => ({ __esModule: true, default: () => 'FAMILY HOME' }));
jest.mock('./screens/Billing', () => ({ __esModule: true, default: ({ role }) => `BILLING as ${role}` }));
jest.mock('./screens/Membership', () => ({ __esModule: true, default: ({ selfManaged }) => `MEMBERSHIP selfManaged=${selfManaged}` }));
jest.mock('./screens/NotificationPreferences', () => ({
  __esModule: true,
  default: ({ role }) => { mockSettingsRoles.push(role); return `SETTINGS as ${role}`; },
}));
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
// The one-time research confirm wraps the family and athlete homes; nothing is pending here.
jest.mock('./hooks/researchConsent', () => ({ useResearchConfirm: () => ({ data: { pending: [] }, loading: false, error: null }), saveResearchConsent: async () => ({}) }));
jest.mock('./hooks/useAuthSession', () => {
  const { useEffect, useState } = require('react');
  return {
    ...jest.requireActual('./hooks/useAuthSession'),
    __esModule: true,
    default: function useMockSession() {
      const [loading, setLoading] = useState(mockDeferred.value);
      useEffect(() => { if (loading) setLoading(false); }, [loading]);
      const user = loading ? null : mockUser.value;
      return { user, provisioned: Boolean(user), loading, signOut: async () => {}, refresh: () => {} };
    },
  };
});

function Spy({ onLoc }) { onLoc(useLocation()); return null; }

async function mount(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const loc = { current: null };
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Spy onLoc={(l) => { loc.current = l; }} />
        <Routes><Route path="/portal/*" element={<PortalRoutes />} /></Routes>
      </MemoryRouter>
    );
  });
  // lazy() resolves its chunk on a microtask.
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
  return {
    container,
    pathname: () => loc.current.pathname,
    state: () => loc.current.state,
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}


// Every render of the screen: which role, bare or not.
const mockDoorRenders = [];
jest.mock('./screens/AdminDoor', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({ role, bare, onBack }) => {
      mockDoorRenders.push({ role, bare });
      return createElement('div', null,
        createElement('span', { 'data-screen': 'door' }, `FACILITY DOOR as ${role}`),
        createElement('button', { type: 'button', 'data-do': 'back', onClick: onBack }, 'Back'));
    },
  };
});

afterEach(() => {
  mockLive.value = false;
  mockUser.value = null;
  mockDeferred.value = false;
  mockDoorRenders.length = 0;
  mockAdminRenders.length = 0;
});

const PATH = '/portal/admin/door';
const signIn = (user) => { mockLive.value = true; mockUser.value = user; };
const screen = (r) => r.container.querySelector('[data-screen="door"]');
const press = async (r, what) => {
  await act(async () => { r.container.querySelector(`[data-do="${what}"]`).click(); });
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
};

test('owner and ops reach /portal/admin/door, bare, as themselves', async () => {
  for (const role of ['owner', 'ops']) {
    signIn({ uid: `u-${role}`, role });
    const r = await mount(PATH);
    expect(r.pathname()).toBe(PATH);
    expect(screen(r).textContent).toBe(`FACILITY DOOR as ${role}`);
    expect(mockDoorRenders.every((x) => x.bare === true)).toBe(true);
    await r.unmount();
  }
});

test('coach, mental, parent and athlete are turned away', async () => {
  for (const user of [
    { uid: 'u-coach', role: 'coach' },
    { uid: 'u-mental', role: 'mental' },
    { uid: 'u-parent', role: 'parent', householdId: 'hh1' },
    { uid: 'u-athlete', role: 'athlete', athleteId: 'jordan' },
  ]) {
    signIn(user);
    const r = await mount(PATH);
    expect(r.container.textContent).not.toContain('FACILITY DOOR');
    expect(r.pathname()).not.toBe(PATH);
    await r.unmount();
  }
  expect(mockDoorRenders).toEqual([]);
});

test('the Admin dashboard is handed the way in, for owner and ops alike', async () => {
  for (const role of ['owner', 'ops']) {
    signIn({ uid: `u-${role}`, role });
    const r = await mount('/portal/admin');
    expect(mockAdminRenders.some((x) => x.door)).toBe(true);
    await press(r, 'door');
    expect(r.pathname()).toBe(PATH);
    expect(screen(r).textContent).toBe(`FACILITY DOOR as ${role}`);
    await r.unmount();
    mockAdminRenders.length = 0;
  }
});

test('Back goes to Admin', async () => {
  signIn({ uid: 'u-ops', role: 'ops' });
  const r = await mount(PATH);
  await press(r, 'back');
  expect(r.pathname()).toBe('/portal/admin');
  expect(r.container.textContent).toContain('ADMIN as ops');
  await r.unmount();
});

test('a live session still loading waits, so the screen never sees a guessed role', async () => {
  signIn({ uid: 'u-ops', role: 'ops' });
  mockDeferred.value = true;
  const r = await mount(PATH);
  expect(screen(r).textContent).toBe('FACILITY DOOR as ops');
  expect(mockDoorRenders.every((x) => x.role === 'ops')).toBe(true);
  await r.unmount();
});
