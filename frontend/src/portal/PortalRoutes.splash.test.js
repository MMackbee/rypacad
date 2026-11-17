import React, { Profiler, act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PortalRoutes from './PortalRoutes';

/*
 * The launch splash all the way to the first screen (review 2026-11-17, F2).
 * The HTML splash goes at React's first commit; every frame after it on the
 * launch path must show something - the React splash or the screen - never
 * a blank (black) page. Those frames were: a redirect (<Navigate> renders
 * nothing), RequireRole waiting on auth, and the lazy screen's chunk loading
 * under a null Suspense fallback.
 *
 * Each commit is checked as it lands (a Profiler's onRender runs in the
 * commit, after the DOM changed).
 */
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
jest.mock('./StatesHarness', () => ({ __esModule: true, default: () => 'HARNESS' }));
jest.mock('./screens/AdminDashboard', () => ({ __esModule: true, default: ({ role }) => `ADMIN as ${role}` }));
jest.mock('./screens/CoachDashboard', () => ({ __esModule: true, default: ({ role }) => `COACH HOME as ${role}` }));
jest.mock('./screens/ParentDashboard', () => ({ __esModule: true, default: () => 'FAMILY HOME' }));
jest.mock('./screens/AthleteDashboard', () => ({ __esModule: true, default: () => 'ATHLETE HOME' }));
jest.mock('./components/FeedbackButton', () => ({ __esModule: true, default: () => null }));
jest.mock('./hooks/researchConsent', () => ({ useResearchConfirm: () => ({ data: { pending: [] }, loading: false, error: null }), saveResearchConsent: async () => ({}) }));

const restoring = (hint = null) => ({ user: null, provisioned: false, loading: true, error: null, hint });
const ready = (user) => ({ user, provisioned: true, loading: false, error: null, hint: null });
function setSession(next) { mockSession.value = next; mockSession.listeners.forEach((fn) => fn()); }

function Spy({ onLoc }) { onLoc(useLocation()); return null; }

async function mount(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const loc = { current: null };
  const frames = [];
  const onRender = () => {
    frames.push(container.querySelector('[data-launch-splash]') ? 'SPLASH' : container.textContent.trim() || 'BLANK');
  };
  await act(async () => {
    root.render(
      <Profiler id="launch" onRender={onRender}>
        <MemoryRouter initialEntries={[path]}>
          <Spy onLoc={(l) => { loc.current = l; }} />
          <Routes><Route path="/portal/*" element={<PortalRoutes />} /></Routes>
        </MemoryRouter>
      </Profiler>
    );
  });
  const settle = async () => { for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); }); };
  await settle();
  return {
    frames,
    text: () => container.textContent,
    pathname: () => loc.current.pathname,
    resolve: async (session) => { await act(async () => { setSession(session); }); await settle(); },
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

afterEach(() => { mockSession.value = null; });

// First: Admin's lazy chunk loads once per file.
test("the home-screen launch with this account's hint: the splash on every frame until Admin paints", async () => {
  setSession(restoring({ uid: 'u-o', role: 'owner', specialistId: null }));
  const r = await mount('/portal');
  expect(r.pathname()).toBe('/portal/admin');
  expect(r.text()).toBe('ADMIN as owner');
  expect(r.frames).not.toContain('BLANK');
  expect(r.frames[0]).toBe('SPLASH');
  await r.unmount();
});

test('a deep link while auth restores (no hint): the splash while the guard waits, then the screen', async () => {
  setSession(restoring());
  const r = await mount('/portal/family');
  expect(r.pathname()).toBe('/portal/family');
  expect(r.frames.length).toBeGreaterThan(0);
  expect(r.frames.every((f) => f === 'SPLASH')).toBe(true);
  await r.resolve(ready({ uid: 'u-p', role: 'parent', householdId: 'hh' }));
  expect(r.text()).toBe('FAMILY HOME');
  expect(r.frames).not.toContain('BLANK');
  await r.unmount();
});

test('the launch that resolves at the index: no blank frame on the way to the landing, or to sign-in', async () => {
  setSession(restoring());
  const a = await mount('/portal');
  await a.resolve(ready({ uid: 'u-c', role: 'coach' }));
  expect(a.pathname()).toBe('/portal/coach');
  expect(a.text()).toBe('COACH HOME as coach');
  expect(a.frames).not.toContain('BLANK');
  await a.unmount();

  setSession(restoring());
  const b = await mount('/portal');
  await b.resolve({ user: null, provisioned: false, loading: false, error: null, hint: null });
  expect(b.pathname()).toBe('/portal/signin');
  expect(b.frames).not.toContain('BLANK');
  await b.unmount();
});
