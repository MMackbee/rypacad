/**
 * The /portal/combine routes (plan Task 7, spec 4): who reaches which, the
 * attendance route's two new props, and Back. The harness below (mocks, the
 * mount helper) is PortalRoutes.test.js lines 1-99 without its Roster mock.
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
    default: ({ role, onOpenScholarships }) => {
      mockAdminRenders.push({ role, scholarships: typeof onOpenScholarships === 'function' });
      return createElement('button', { type: 'button', onClick: onOpenScholarships }, `ADMIN as ${role}`);
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

// The Combine screen and its two callers (plan Task 7): stand-ins that show what the route handed them.
jest.mock('./screens/AthleteDetail', () => {
  const { createElement } = require('react');
  return { __esModule: true, default: () => createElement('div', null, 'ATHLETE PAGE') };
});
jest.mock('./screens/Combine', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({ athleteId, fallbackName, onBack }) => createElement('button', { type: 'button', onClick: onBack }, `COMBINE ${athleteId} ${fallbackName ?? '-'}`),
  };
});
jest.mock('./screens/Roster', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: () => 'ROSTER',
    SessionAttendance: ({ showIntake, onOpenCombine }) => createElement('button', { type: 'button', onClick: () => onOpenCombine('a1', 'Jordan Whitfield') }, `ATTENDANCE intake=${showIntake}`),
  };
});

afterEach(() => {
  mockLive.value = false;
  mockUser.value = null;
  mockDeferred.value = false;
});

const press = async (r) => {
  await act(async () => { r.container.querySelector('button').click(); });
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
};
const signIn = (user) => { mockLive.value = true; mockUser.value = user; };
const ATHLETE = { uid: 'u-a', role: 'athlete', athleteId: 'jordan' };

test('an athlete opens their own scores', async () => {
  signIn(ATHLETE);
  const r = await mount('/portal/combine');
  expect(r.container.textContent).toBe('COMBINE jordan -');
  await r.unmount();
});

test("staff and parents open one athlete's scores", async () => {
  for (const role of ['parent', 'coach', 'mental', 'ops', 'owner']) {
    signIn({ uid: `u-${role}`, role });
    const r = await mount('/portal/combine/a1');
    expect(r.container.textContent).toBe('COMBINE a1 -');
    await r.unmount();
  }
});

test('each route keeps out the other roles', async () => {
  signIn(ATHLETE);
  const a = await mount('/portal/combine/a1');
  expect(a.pathname()).toBe('/portal/home');
  expect(a.container.textContent).toBe('ATHLETE HOME');
  await a.unmount();
  signIn({ uid: 'u-p', role: 'parent' });
  const p = await mount('/portal/combine');
  expect(p.pathname()).toBe('/portal/family');
  await p.unmount();
});

test('an athlete login with no athlete on file (Review Focus 8)', async () => {
  signIn({ uid: 'u-a2', role: 'athlete', athleteId: null });
  const r = await mount('/portal/combine');
  expect(r.pathname()).toBe('/portal/home');
  expect(r.container.textContent).not.toContain('COMBINE');
  await r.unmount();
});

test('a live session that is still loading waits before choosing the athlete', async () => {
  signIn(ATHLETE);
  mockDeferred.value = true;
  const r = await mount('/portal/combine');
  expect(r.pathname()).toBe('/portal/combine');
  expect(r.container.textContent).toBe('COMBINE jordan -');
  await r.unmount();
});

test('the attendance row opens Combine and Back returns to the session (Review Focus 9)', async () => {
  signIn({ uid: 'coach-luke', role: 'coach' });
  const block = { date: '2026-11-09', time: '4:00 PM', type: 'training', name: null, meta: null };
  const r = await mount({ pathname: '/portal/attendance', state: { sessionId: 's1', block } });
  expect(r.container.textContent).toBe('ATTENDANCE intake=true');
  await press(r);
  expect(r.pathname()).toBe('/portal/combine/a1');
  expect(r.state().name).toBe('Jordan Whitfield');
  expect(r.container.textContent).toBe('COMBINE a1 Jordan Whitfield');
  await press(r);
  expect(r.pathname()).toBe('/portal/attendance');
  expect(r.state().sessionId).toBe('s1');
  expect(r.container.textContent).toBe('ATTENDANCE intake=true');
  await r.unmount();
});

test('Back from a deep link', async () => {
  signIn({ uid: 'u-p', role: 'parent' });
  const p = await mount('/portal/combine/a1');
  await press(p);
  expect(p.pathname()).toBe('/portal/athlete/a1');
  expect(p.container.textContent).toBe('ATHLETE PAGE');
  await p.unmount();
  signIn(ATHLETE);
  const a = await mount('/portal/combine');
  await press(a);
  expect(a.pathname()).toBe('/portal/home');
  await a.unmount();
  signIn({ uid: 'coach-luke', role: 'coach' });
  const c = await mount('/portal/combine/a1');
  await press(c);
  // A coach's deep link goes to the index, which lands the coach on their own home.
  expect(c.pathname()).toBe('/portal/coach');
  await c.unmount();
});

test('seed mode', async () => {
  const r = await mount('/portal/combine');
  expect(r.container.textContent).toBe('COMBINE jordan -');
  await r.unmount();
  const one = await mount('/portal/combine/r2');
  expect(one.container.textContent).toBe('COMBINE r2 -');
  await one.unmount();
});
