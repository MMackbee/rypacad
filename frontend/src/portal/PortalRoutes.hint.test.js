import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PortalRoutes, { RequireRole } from './PortalRoutes';

/*
 * The cold-start role hint in the guards (speed work 2026-11-17): while
 * users/{uid} is in flight for the account auth restored, RequireRole renders
 * the landing the hint names, so its chunk and its reads start in parallel.
 * The verified user decides: a disagreeing read re-routes, and nothing
 * redirects on the hint alone.
 *
 * mockSession is one shared session every useAuthSession instance reads;
 * resolve() lands the verified user everywhere at once.
 */
const mockSession = { value: null, listeners: new Set() };
const mockLive = { value: true };
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
jest.mock('./hooks/useAuthSession', () => {
  const { useSyncExternalStore } = require('react');
  return {
    ...jest.requireActual('./hooks/useAuthSession'),
    __esModule: true,
    default: function useMockSession() {
      const s = useSyncExternalStore(
        (fn) => { mockSession.listeners.add(fn); return () => mockSession.listeners.delete(fn); },
        () => mockSession.value
      );
      return { ...s, signOut: async () => {}, refresh: () => {} };
    },
  };
});
jest.mock('./StatesHarness', () => ({ __esModule: true, default: () => 'HARNESS' }));
const mockAdminProps = { last: null };
jest.mock('./screens/AdminDashboard', () => ({ __esModule: true, default: (props) => { mockAdminProps.last = props; return `ADMIN as ${props.role}`; } }));
jest.mock('./screens/CoachDashboard', () => ({ __esModule: true, default: ({ role, specialistId }) => `COACH HOME as ${role}${specialistId ? '/' + specialistId : ''}` }));
jest.mock('./screens/SpecialistDay', () => ({ __esModule: true, default: ({ specialistId, canSwitch }) => `MY SESSIONS ${specialistId ?? 'none'}${canSwitch ? ' (switch)' : ''}` }));
jest.mock('./screens/TourStandings', () => ({ __esModule: true, default: () => 'TOUR' }));
jest.mock('./screens/ParentDashboard', () => ({ __esModule: true, default: () => 'FAMILY HOME' }));
jest.mock('./screens/AthleteDashboard', () => ({ __esModule: true, default: () => 'ATHLETE HOME' }));
jest.mock('./hooks/researchConsent', () => ({ useResearchConfirm: () => ({ data: { pending: [] }, loading: false, error: null }), saveResearchConsent: async () => ({}) }));

const loading = (hint) => ({ user: null, provisioned: false, loading: true, error: null, hint: hint ?? null });
const ready = (user) => ({ user, provisioned: true, loading: false, error: null, hint: null });
function setSession(next) { mockSession.value = next; mockSession.listeners.forEach((fn) => fn()); }

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
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
  return {
    text: () => container.textContent,
    pathname: () => loc.current.pathname,
    resolve: async (user) => {
      await act(async () => { setSession(user ? ready(user) : { user: null, provisioned: false, loading: false, error: null, hint: null }); });
      for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
    },
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

afterEach(() => {
  mockLive.value = true;
  mockSession.value = null;
});

// The launch splash, not a blank page, while the guard waits (review 2026-11-17).
const SPLASH = 'RYP AcademyReach Your Potential';

test('no hint: the guard shows the launch splash until the users read lands', async () => {
  setSession(loading(null));
  const r = await mount('/portal/admin');
  expect(r.text()).toBe(SPLASH);
  await r.resolve({ uid: 'u-o', role: 'owner' });
  expect(r.text()).toBe('ADMIN as owner');
  await r.unmount();
});

test("an owner's hint renders Admin while the read is in flight, and the read agreeing changes nothing", async () => {
  setSession(loading({ uid: 'u-o', role: 'owner', specialistId: null }));
  const r = await mount('/portal/admin');
  expect(r.text()).toBe('ADMIN as owner');
  await r.resolve({ uid: 'u-o', role: 'owner' });
  expect(r.pathname()).toBe('/portal/admin');
  expect(r.text()).toBe('ADMIN as owner');
  await r.unmount();
});

// Review 2026-11-17 (F3, second pass): the owner's Scholarships card mounts
// from the owner's hint, so Admin does not shift a card down when the read
// lands; ops' hint never mounts it (rules refuse ops the read anyway).
test("the owner's hint mounts the owner-only Scholarships card from the first paint; ops' never does", async () => {
  setSession(loading({ uid: 'u-o', role: 'owner', specialistId: null }));
  const o = await mount('/portal/admin');
  expect(typeof mockAdminProps.last.onOpenScholarships).toBe('function');
  await o.resolve({ uid: 'u-o', role: 'owner' });
  expect(typeof mockAdminProps.last.onOpenScholarships).toBe('function');
  await o.unmount();

  setSession(loading({ uid: 'u-ops', role: 'ops', specialistId: null }));
  const s = await mount('/portal/admin');
  expect(mockAdminProps.last.role).toBe('ops');
  expect(mockAdminProps.last.onOpenScholarships).toBeUndefined();
  await s.unmount();
});

test("ops' hint renders ops' Admin, not the owner default", async () => {
  setSession(loading({ uid: 'u-ops', role: 'ops', specialistId: null }));
  const r = await mount('/portal/admin');
  expect(r.text()).toBe('ADMIN as ops');
  await r.unmount();
});

test('a hint the read contradicts re-routes to the verified landing', async () => {
  setSession(loading({ uid: 'u-x', role: 'owner', specialistId: null }));
  const r = await mount('/portal/admin');
  expect(r.text()).toBe('ADMIN as owner');
  await r.resolve({ uid: 'u-x', role: 'parent', householdId: 'hh' });
  expect(r.pathname()).toBe('/portal/family');
  expect(r.text()).toBe('FAMILY HOME');
  await r.unmount();
});

test('a hint for a role this route does not take shows the splash and redirects nowhere until the read lands', async () => {
  setSession(loading({ uid: 'u-p', role: 'parent', specialistId: null }));
  const r = await mount('/portal/admin');
  expect(r.text()).toBe(SPLASH);
  expect(r.pathname()).toBe('/portal/admin');
  await r.resolve({ uid: 'u-p', role: 'ops' });
  expect(r.text()).toBe('ADMIN as ops');
  await r.unmount();
});

test('a read that fails after a hinted render sends the visitor to sign-in, as before', async () => {
  setSession(loading({ uid: 'u-gone', role: 'owner', specialistId: null }));
  const r = await mount('/portal/admin');
  await r.resolve(null);
  expect(r.pathname()).toBe('/portal/signin');
  await r.unmount();
});

test("a coach's hint renders the golf day with the hinted tab set", async () => {
  setSession(loading({ uid: 'u-phil', role: 'coach', specialistId: 'phil' }));
  const r = await mount('/portal/coach');
  expect(r.text()).toBe('COACH HOME as coach/phil');
  await r.resolve({ uid: 'u-phil', role: 'coach', specialistId: 'phil' });
  expect(r.text()).toBe('COACH HOME as coach/phil');
  await r.unmount();
});

test("a specialist's hint renders their own day; a plain coach's hint waits instead of redirecting", async () => {
  setSession(loading({ uid: 'u-y', role: 'mental', specialistId: 'mental' }));
  const y = await mount('/portal/my-sessions');
  expect(y.text()).toBe('MY SESSIONS mental');
  await y.unmount();

  setSession(loading({ uid: 'u-c', role: 'coach', specialistId: null }));
  const c = await mount('/portal/my-sessions');
  expect(c.text()).toBe('');
  expect(c.pathname()).toBe('/portal/my-sessions');
  await c.resolve({ uid: 'u-c', role: 'coach' });
  expect(c.pathname()).toBe('/portal/tour');
  await c.unmount();
});

// Review 2026-11-17 (F3): account B straight after account A (no signed-out
// emission between) used to keep the same screen instance mounted on B's
// hint, so its hooks kept A's data under an unchanged identity.
test('another account straight after this one remounts the guarded screen; its own verification does not', async () => {
  const mounts = [];
  function Screen() {
    React.useEffect(() => { mounts.push('mount'); }, []);
    return 'SCREEN';
  }
  setSession(ready({ uid: 'u-a', role: 'parent', householdId: 'hh-a' }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter><RequireRole roles={['parent']}><Screen /></RequireRole></MemoryRouter>);
  });
  expect(container.textContent).toBe('SCREEN');
  expect(mounts).toHaveLength(1);
  await act(async () => { setSession(loading({ uid: 'u-b', role: 'parent', specialistId: null })); });
  expect(container.textContent).toBe('SCREEN');
  expect(mounts).toHaveLength(2);
  await act(async () => { setSession(ready({ uid: 'u-b', role: 'parent', householdId: 'hh-b' })); });
  expect(mounts).toHaveLength(2);
  await act(async () => { root.unmount(); });
  container.remove();
});

test("an owner's hint opens the specialist switcher on Sessions", async () => {
  setSession(loading({ uid: 'u-o', role: 'owner', specialistId: null }));
  const r = await mount('/portal/my-sessions');
  expect(r.text()).toBe('MY SESSIONS none (switch)');
  await r.unmount();
});
