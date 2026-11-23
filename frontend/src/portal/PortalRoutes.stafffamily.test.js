/**
 * The single staff family page's routes (owner 2026-11-16): a click on an
 * ATHLETE by the owner or ops - Admin's Outstanding and consent rows, the old
 * athlete-bookings link - finds the athlete's family and lands on the family
 * page, opened on that athlete. The harness below (mocks, the mount helper)
 * is PortalRoutes.combine.test.js lines 6-97; the family page is a stand-in.
 * It also covers the athlete roster's route (hq card 14, 2026-11-23): /portal/admin/athletes
 * for the owner and ops, beside the athlete redirects it must not collide with.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PortalRoutes from './PortalRoutes';

const mockLive = { value: false };
const mockUser = { value: null };
const mockDeferred = { value: false };
// What the route's read of the athlete answers.
const mockAthlete = { value: null };
const mockAthleteAsked = [];
// What an Admin athlete row hands the route: an id, or { athleteId, householdId } when the row knows the family.
const mockOpenWith = { value: 'jordan' };
jest.mock('./StatesHarness', () => ({ __esModule: true, default: () => 'HARNESS' }));
jest.mock('./screens/AdminDashboard', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    // The button is an athlete row (Outstanding, the consent tracker).
    default: ({ role, onOpenAthlete, onOpenAthletes }) =>
      createElement('div', null,
        createElement('button', { type: 'button', 'data-do': 'athlete', onClick: () => onOpenAthlete(mockOpenWith.value) }, `ADMIN as ${role}`),
        createElement('button', { type: 'button', 'data-do': 'roster', onClick: onOpenAthletes }, 'Open athlete roster')),
  };
});
// Every render of the roster screen: which role, bare or not.
const mockRosterRenders = [];
jest.mock('./screens/AdminAthletes', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({ role, bare, onBack, onOpenHousehold }) => {
      mockRosterRenders.push({ role, bare });
      return createElement('div', null,
        createElement('span', { 'data-screen': 'roster' }, `ATHLETE ROSTER as ${role}`),
        createElement('button', { type: 'button', 'data-do': 'back', onClick: onBack }, 'Back'),
        createElement('button', { type: 'button', 'data-do': 'family', onClick: () => onOpenHousehold('hh9') }, 'Family'));
    },
  };
});
jest.mock('./screens/AdminScholarships', () => ({ __esModule: true, default: () => 'SCHOLARSHIPS' }));
jest.mock('./screens/CoachDashboard', () => ({ __esModule: true, default: ({ role }) => `COACH HOME as ${role}` }));
jest.mock('./screens/SpecialistDay', () => ({ __esModule: true, default: () => 'MY SESSIONS' }));
jest.mock('./screens/MentalConsentFlow', () => ({ __esModule: true, default: () => 'CONSENT FLOW' }));
jest.mock('./screens/CommitmentContract', () => ({ __esModule: true, default: () => 'CONTRACT' }));
jest.mock('./screens/AuthAction', () => ({ __esModule: true, default: () => 'AUTH ACTION' }));
jest.mock('./screens/AthleteDashboard', () => ({ __esModule: true, default: () => 'ATHLETE HOME' }));
jest.mock('./screens/ParentDashboard', () => ({ __esModule: true, default: () => 'FAMILY HOME' }));
jest.mock('./screens/Billing', () => ({ __esModule: true, default: ({ role, householdId, staff }) => `FAMILY PAGE ${householdId} as ${role}${staff ? ' (staff)' : ''}` }));
jest.mock('./screens/Membership', () => ({ __esModule: true, default: () => 'MEMBERSHIP' }));
jest.mock('./screens/NotificationPreferences', () => ({ __esModule: true, default: ({ role }) => `SETTINGS as ${role}` }));
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
jest.mock('./hooks/researchConsent', () => ({ useResearchConfirm: () => ({ data: { pending: [] }, loading: false, error: null }), saveResearchConsent: async () => ({}) }));
jest.mock('./hooks/staffBooking', () => ({
  ...jest.requireActual('./hooks/staffBooking'),
  __esModule: true,
  useStaffAthlete: (id) => {
    mockAthleteAsked.push(id);
    return mockAthlete.value;
  },
}));
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
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
  return {
    container,
    at: () => `${loc.current.pathname}${loc.current.search}`,
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

const found = (householdId) => ({ data: { athleteId: 'jordan', householdId }, loading: false, error: null });
const signIn = (user) => { mockLive.value = true; mockUser.value = user; };

beforeEach(() => {
  mockAthlete.value = found('hh1');
  mockAthleteAsked.length = 0;
});
afterEach(() => {
  mockLive.value = false;
  mockUser.value = null;
  mockDeferred.value = false;
  mockOpenWith.value = 'jordan';
  mockRosterRenders.length = 0;
});

const ATHLETE = '/portal/admin/athletes/jordan';
const FAMILY = '/portal/admin/households/hh1?athlete=jordan';

test('an athlete link lands on the family page, opened on that athlete - for the owner and ops', async () => {
  for (const role of ['owner', 'ops']) {
    signIn({ uid: `u-${role}`, role });
    const r = await mount(ATHLETE);
    expect(r.at()).toBe(FAMILY);
    expect(r.container.textContent).toContain(`FAMILY PAGE hh1 as ${role} (staff)`);
    await r.unmount();
  }
  expect(mockAthleteAsked).toContain('jordan');
});

test('the old athlete-bookings link goes to the family page too', async () => {
  signIn({ uid: 'u-owner', role: 'owner' });
  const r = await mount(`${ATHLETE}/bookings`);
  expect(r.at()).toBe(FAMILY);
  await r.unmount();
});

test("Admin's athlete rows (Outstanding, the consent tracker) open the family page, not the athlete page", async () => {
  signIn({ uid: 'u-ops', role: 'ops' });
  const r = await mount('/portal/admin');
  await act(async () => { r.container.querySelector('[data-do="athlete"]').click(); });
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
  expect(r.at()).toBe(FAMILY);
  await r.unmount();
});

test("a row that knows the family goes straight there: the athlete's staff model is never built to find it", async () => {
  signIn({ uid: 'u-owner', role: 'owner' });
  mockOpenWith.value = { athleteId: 'jordan', householdId: 'hh1' };
  const r = await mount('/portal/admin');
  await act(async () => { r.container.querySelector('[data-do="athlete"]').click(); });
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
  expect(r.at()).toBe(FAMILY);
  expect(r.container.textContent).toContain('FAMILY PAGE hh1 as owner (staff)');
  expect(mockAthleteAsked).toEqual([]);
  await r.unmount();
});

test('coach, mental, parent and athlete are turned away', async () => {
  for (const user of [
    { uid: 'u-coach', role: 'coach' },
    { uid: 'u-mental', role: 'mental' },
    { uid: 'u-parent', role: 'parent', householdId: 'hh1' },
    { uid: 'u-athlete', role: 'athlete', athleteId: 'jordan' },
  ]) {
    signIn(user);
    const r = await mount(ATHLETE);
    expect(r.container.textContent).not.toContain('FAMILY PAGE hh1 as');
    expect(r.at()).not.toBe(FAMILY);
    expect(r.at()).not.toBe(ATHLETE);
    await r.unmount();
  }
});

test('an athlete who is gone: a line and the way back to Admin', async () => {
  signIn({ uid: 'u-owner', role: 'owner' });
  mockAthlete.value = { data: null, loading: false, error: Object.assign(new Error('gone'), { code: 'not-found' }) };
  const r = await mount(ATHLETE);
  expect(r.at()).toBe(ATHLETE);
  expect(r.container.textContent).toContain("That athlete isn't on file.");
  await act(async () => { [...r.container.querySelectorAll('button')].find((b) => b.textContent.includes('Admin')).click(); });
  expect(r.at()).toBe('/portal/admin');
  await r.unmount();
});

test('an athlete with no family on file goes to the athlete page: there is no family page to show', async () => {
  signIn({ uid: 'u-owner', role: 'owner' });
  mockAthlete.value = found(null);
  const r = await mount(ATHLETE);
  expect(r.at()).toBe('/portal/athlete/jordan');
  expect(r.container.textContent).not.toContain("isn't on file");
  await r.unmount();
});

test('while the athlete loads nothing is drawn and nothing is guessed', async () => {
  signIn({ uid: 'u-owner', role: 'owner' });
  mockAthlete.value = { data: null, loading: true, error: null };
  const r = await mount(ATHLETE);
  expect(r.at()).toBe(ATHLETE);
  expect(r.container.textContent).not.toContain('FAMILY PAGE');
  expect(r.container.textContent).not.toContain("isn't on file");
  await r.unmount();
});

// The athlete roster (hq card 14, 2026-11-23).
const ROSTER = '/portal/admin/athletes';
const rosterScreen = (r) => r.container.querySelector('[data-screen="roster"]');
const rosterPress = async (r, what) => {
  await act(async () => { r.container.querySelector(`[data-do="${what}"]`).click(); });
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
};

test('owner and ops reach /portal/admin/athletes, bare, as themselves; it is not the athlete redirect', async () => {
  for (const role of ['owner', 'ops']) {
    signIn({ uid: `u-${role}`, role });
    const r = await mount(ROSTER);
    expect(r.at()).toBe(ROSTER);
    expect(rosterScreen(r).textContent).toBe(`ATHLETE ROSTER as ${role}`);
    expect(mockRosterRenders.every((x) => x.bare === true && x.role === role)).toBe(true);
    await r.unmount();
    mockRosterRenders.length = 0;
  }
  // The athlete redirect is not asked about: the roster's path is not an athlete id.
  expect(mockAthleteAsked).toEqual([]);
});

test('coach, mental, parent and athlete are turned away from the roster', async () => {
  for (const user of [
    { uid: 'u-coach', role: 'coach' },
    { uid: 'u-mental', role: 'mental' },
    { uid: 'u-parent', role: 'parent', householdId: 'hh1' },
    { uid: 'u-athlete', role: 'athlete', athleteId: 'jordan' },
  ]) {
    signIn(user);
    const r = await mount(ROSTER);
    expect(r.container.textContent).not.toContain('ATHLETE ROSTER');
    expect(r.at()).not.toBe(ROSTER);
    await r.unmount();
  }
  expect(mockRosterRenders).toEqual([]);
});

test('the Admin dashboard is handed the way in, and the roster Back goes to Admin', async () => {
  for (const role of ['owner', 'ops']) {
    signIn({ uid: `u-${role}`, role });
    const r = await mount('/portal/admin');
    await rosterPress(r, 'roster');
    expect(r.at()).toBe(ROSTER);
    expect(rosterScreen(r).textContent).toBe(`ATHLETE ROSTER as ${role}`);
    await rosterPress(r, 'back');
    expect(r.at()).toBe('/portal/admin');
    await r.unmount();
  }
});

test("a family name on the roster opens that household's page", async () => {
  signIn({ uid: 'u-owner', role: 'owner' });
  const r = await mount(ROSTER);
  await rosterPress(r, 'family');
  expect(r.at()).toBe('/portal/admin/households/hh9');
  await r.unmount();
});

test('with the roster route in place, /portal/admin/athletes/<id> still lands on the family page', async () => {
  signIn({ uid: 'u-owner', role: 'owner' });
  const r = await mount(ATHLETE);
  expect(r.at()).toBe(FAMILY);
  expect(r.container.textContent).not.toContain('ATHLETE ROSTER');
  await r.unmount();
});

test('a live session still loading waits, so the roster never sees a guessed role', async () => {
  signIn({ uid: 'u-ops', role: 'ops' });
  mockDeferred.value = true;
  const r = await mount(ROSTER);
  expect(rosterScreen(r).textContent).toBe('ATHLETE ROSTER as ops');
  expect(mockRosterRenders.every((x) => x.role === 'ops')).toBe(true);
  await r.unmount();
});
