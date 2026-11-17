import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PortalRoutes from './PortalRoutes';
import { writeRoleHint } from './hooks/roleHint';

/*
 * The launch paths (speed work 2026-11-17, F3): the portal index and the
 * sign-in page name no screen of their own. While auth restores they show the
 * launch splash or go straight to the landing the cold-start hint names, and
 * they warm that landing's chunk by ROLE rather than by URL segment.
 *
 * The warm-up tests run first and in order: a lazy screen's module loads once
 * per file, so each asserts only on chunks no earlier test has fetched.
 */
const mockLoaded = new Set();
const mockSession = { value: null, listeners: new Set() };
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => true }));
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
      return { ...s, signOut: async () => {}, refresh: () => {}, signIn: () => {}, signInWithEmail: () => {} };
    },
  };
});
const mockScreen = (name, render) => {
  mockLoaded.add(name);
  return { __esModule: true, default: render || (() => name) };
};
jest.mock('./StatesHarness', () => mockScreen('StatesHarness'));
jest.mock('./screens/AdminDashboard', () => mockScreen('AdminDashboard', ({ role }) => `ADMIN as ${role}`));
jest.mock('./screens/CoachDashboard', () => mockScreen('CoachDashboard', ({ role }) => `COACH HOME as ${role}`));
jest.mock('./screens/SpecialistDay', () => mockScreen('SpecialistDay', ({ specialistId }) => `MY SESSIONS ${specialistId}`));
jest.mock('./screens/ParentDashboard', () => ({ __esModule: true, default: () => 'FAMILY HOME' }));
jest.mock('./screens/AthleteDashboard', () => ({ __esModule: true, default: () => 'ATHLETE HOME' }));
jest.mock('./hooks/researchConsent', () => ({ useResearchConfirm: () => ({ data: { pending: [] }, loading: false, error: null }), saveResearchConsent: async () => ({}) }));

const restoring = () => ({ user: null, provisioned: false, loading: true, error: null, hint: null });
const hinted = (hint) => ({ ...restoring(), hint });
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
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
  return {
    container,
    text: () => container.textContent,
    pathname: () => loc.current.pathname,
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

afterEach(() => {
  mockSession.value = null;
  window.localStorage.clear();
});

describe('warming the landing by role (in order)', () => {
  test('no hint: the index and sign-in warm no staff screen', async () => {
    setSession(restoring());
    const a = await mount('/portal');
    await a.unmount();
    const b = await mount('/portal/signin');
    await b.unmount();
    expect([...mockLoaded].filter((n) => n !== 'StatesHarness')).toEqual([]);
  });

  test("sign-in warms the coach's golf day from a coach's stored hint", async () => {
    writeRoleHint({ uid: 'u-c', role: 'coach' });
    setSession(restoring());
    const r = await mount('/portal/signin');
    expect(mockLoaded.has('CoachDashboard')).toBe(true);
    expect(mockLoaded.has('AdminDashboard')).toBe(false);
    await r.unmount();
  });

  test("the index warms a specialist's own day from their stored hint", async () => {
    writeRoleHint({ uid: 'u-y', role: 'mental', specialistId: 'mental' });
    setSession(restoring());
    const r = await mount('/portal');
    expect(mockLoaded.has('SpecialistDay')).toBe(true);
    expect(mockLoaded.has('AdminDashboard')).toBe(false);
    await r.unmount();
  });

  test("the index warms Admin from an owner's stored hint", async () => {
    writeRoleHint({ uid: 'u-o', role: 'owner' });
    setSession(restoring());
    const r = await mount('/portal');
    expect(mockLoaded.has('AdminDashboard')).toBe(true);
    await r.unmount();
  });
});

describe('the portal index on a launch', () => {
  test('while auth restores with no hint: the launch splash, not a blank page', async () => {
    setSession(restoring());
    const r = await mount('/portal');
    expect(r.pathname()).toBe('/portal');
    expect(r.container.querySelector('[data-launch-splash]')).not.toBeNull();
    expect(r.text()).toContain('RYP Academy');
    await r.unmount();
  });

  test("with this account's hint: straight to its landing while the users read is in flight", async () => {
    setSession(hinted({ uid: 'u-o', role: 'owner', specialistId: null }));
    const r = await mount('/portal');
    expect(r.pathname()).toBe('/portal/admin');
    expect(r.text()).toBe('ADMIN as owner');
    await r.unmount();
  });

  test("a specialist's hint lands on their own day", async () => {
    setSession(hinted({ uid: 'u-p', role: 'coach', specialistId: 'phil' }));
    const r = await mount('/portal');
    expect(r.pathname()).toBe('/portal/my-sessions');
    expect(r.text()).toBe('MY SESSIONS phil');
    await r.unmount();
  });

  test('resolved: the verified landing, as before; signed out: sign-in', async () => {
    setSession({ user: { uid: 'u-c', role: 'coach' }, provisioned: true, loading: false, error: null, hint: null });
    const c = await mount('/portal');
    expect(c.pathname()).toBe('/portal/coach');
    await c.unmount();
    setSession({ user: null, provisioned: false, loading: false, error: null, hint: null });
    const out = await mount('/portal');
    expect(out.pathname()).toBe('/portal/signin');
    await out.unmount();
  });
});
