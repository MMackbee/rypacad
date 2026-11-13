import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { renderScreen } from './screens/testRender';
import PortalRoutes from './PortalRoutes';

/*
 * Yannick's /portal/mental routes. The Commitment Contract left his view
 * (owner 2026-11-12/13: it runs on a paper calendar now): no Contract tab, and
 * an old /portal/mental/contract link lands on the viewer's own home.
 */
const mockLive = { value: false };
const mockUser = { value: null };
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
jest.mock('./hooks/useAuthSession', () => ({
  ...jest.requireActual('./hooks/useAuthSession'),
  __esModule: true,
  default: () => ({ user: mockUser.value, provisioned: Boolean(mockUser.value), loading: false, signOut: async () => {}, refresh: () => {} }),
}));
// The homes a signed-in link lands on: stand-ins, so no live screen runs its reads here.
jest.mock('./screens/SpecialistDay', () => ({ __esModule: true, default: () => 'MY SESSIONS' }));
jest.mock('./screens/AdminDashboard', () => ({ __esModule: true, default: ({ role }) => `ADMIN as ${role}` }));
// The athlete page's read answers as live does for an id with no athletes doc, so a
// link that fell through to mental/:athleteId shows the real "This athlete was not found."
jest.mock('./hooks/mental', () => ({
  ...jest.requireActual('./hooks/mental'),
  useMentalAthlete: () => ({ data: null, loading: false, error: null }),
}));

afterEach(() => {
  mockLive.value = false;
  mockUser.value = null;
});

// Mounted at /portal/* as App.js does: renderScreen's own splat route resolves
// PortalRoutes' relative paths against '/', where 'mental' never matches.
const portal = <Routes><Route path="/portal/*" element={<PortalRoutes />} /></Routes>;
const tabs = (r) => [...r.container.querySelectorAll('nav button')].map((b) => b.textContent);

// The real Athletes screen loads as a lazy chunk inside the test, so its first
// require counts against the test's budget. It failed once in a loaded full CI
// run (the suite took 27 s there) and passed alone and on reruns: an explicit 30 s.
test('a mental login has no Contract tab', async () => {
  const r = await renderScreen(portal, { path: '/portal/mental' });
  await r.flush();
  expect(r.text()).toContain('Athletes');
  expect(r.text()).toContain('Jordan Whitfield');
  expect(tabs(r)).toEqual(['Sessions', 'Today', 'Athletes', 'Tour']);
  expect(r.button('Contract')).toBeNull();
  await r.unmount();
}, 30000);

test('/portal/mental/contract goes home, never to an athlete called "contract"', async () => {
  const cases = [
    [{ uid: 'u-mental', role: 'mental', specialistId: 'mental' }, '/portal/my-sessions', 'MY SESSIONS'],
    [{ uid: 'u-ops', role: 'ops' }, '/portal/admin', 'ADMIN as ops'],
    [{ uid: 'u-owner', role: 'owner' }, '/portal/admin', 'ADMIN as owner'],
  ];
  for (const [user, home, screen] of cases) {
    mockLive.value = true;
    mockUser.value = user;
    const r = await renderScreen(portal, { path: '/portal/mental/contract' });
    // lazy() resolves its chunk on a microtask.
    for (let i = 0; i < 5; i += 1) await r.flush();
    expect(r.location().pathname).toBe(home);
    expect(r.text()).toContain(screen);
    expect(r.text()).not.toContain('This athlete was not found');
    await r.unmount();
  }
}, 30000);
