/**
 * The single staff family page's routes (owner 2026-11-16): a click on an
 * ATHLETE by the owner or ops - Admin's Outstanding and consent rows, the old
 * athlete-bookings link - finds the athlete's family and lands on the family
 * page, opened on that athlete. The harness below (mocks, the mount helper)
 * is PortalRoutes.combine.test.js lines 6-97; the family page is a stand-in.
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
jest.mock('./StatesHarness', () => ({ __esModule: true, default: () => 'HARNESS' }));
jest.mock('./screens/AdminDashboard', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    // The button is an athlete row (Outstanding, the consent tracker).
    default: ({ role, onOpenAthlete }) =>
      createElement('button', { type: 'button', 'data-do': 'athlete', onClick: () => onOpenAthlete('jordan') }, `ADMIN as ${role}`),
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
