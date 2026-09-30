/**
 * Tokens lane (tester report 2026-09-30): before the season the live
 * loaders read a token package's position against the first (prepaid)
 * period, November, and mark it - "Tokens start Nov 1", or "Pay to start"
 * for an unpaid athlete - instead of granting the calendar month. Kept
 * beside index.test.js with its own mock list so the lanes merge cleanly.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));
// CRA's resetMocks clears these before every test: isLive() reads falsy (seed)
// unless a test turns it on.
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchAthlete: jest.fn(),
  fetchBookings: jest.fn(),
  fetchCurrentUser: jest.fn(),
  fetchHousehold: jest.fn(),
  fetchHouseholdAthletes: jest.fn(),
  fetchPackage: jest.fn(),
  fetchSessionsByIds: jest.fn(),
  fetchSessionsInRange: jest.fn(),
}));
// "Today" is pinned per test. The seed modules call todayISO() at import, so
// the real one answers until resetMocks clears it before the first test.
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useBooking, useHousehold } from './index';
import * as live from './live';
import * as calendar from '../data/calendar';

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mountHook(useHook) {
  const result = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await settle();
  return { result, unmount: () => act(async () => root.unmount()) };
}

const T16 = { id: 't-16', name: '16 tokens', kind: 'tokens', tokens: 16, windowDays: 30 };
const ELITE_PKG = { id: 'elite', name: 'Elite', kind: 'elite', tokens: null, windowDays: 45 };
const nov = { id: 'a1_nov', sessionId: 'nov', date: '2026-11-03', periodKey: '2026-11-01', status: 'confirmed', type: 'training' };

beforeEach(() => {
  live.isLive.mockReturnValue(true);
});

test('the family card: November\'s grant marked "starts", an unpaid child marked unpaid, Elite untouched', async () => {
  calendar.todayISO.mockReturnValue('2026-09-30');
  live.fetchCurrentUser.mockResolvedValue({ uid: 'p1', householdId: 'h1' });
  live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1 });
  live.fetchHouseholdAthletes.mockResolvedValue([
    { id: 'a1', name: 'Jordan', householdId: 'h1', packageId: 't-16', billing: { status: 'active' } },
    { id: 'a2', name: 'Reese', householdId: 'h1', packageId: 't-16', billing: { status: 'pending' } },
    { id: 'a3', name: 'Nico', householdId: 'h1', packageId: 'elite' },
  ]);
  live.fetchPackage.mockImplementation(async (id) => (id === 'elite' ? ELITE_PKG : T16));
  live.fetchBookings.mockImplementation(async (id) => (id === 'a1' ? [nov] : []));
  live.fetchSessionsByIds.mockResolvedValue([]);

  const h = await mountHook(() => useHousehold());
  expect(h.result.current.error).toBeNull();
  const [jordan, reese, nico] = h.result.current.data.children;
  // Was: September's 16 "left" for both, paid or not.
  expect(jordan.tokens).toMatchObject({ granted: 16, used: 1, left: 15, startsOn: '2026-11-01', unpaid: false });
  expect(reese.tokens).toMatchObject({ left: 16, startsOn: '2026-11-01', unpaid: true });
  expect(nico.tokens).toMatchObject({ unlimited: true, left: null });
  expect(nico.tokens).not.toHaveProperty('startsOn');
  await h.unmount();
});

test('Book a Session as an athlete: November before Nov 1, the current period from then on', async () => {
  live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', athleteId: 'a1', email: 'jordan@email.com' });
  live.fetchAthlete.mockResolvedValue({ id: 'a1', householdId: 'h1', packageId: 't-16' });
  live.fetchBookings.mockResolvedValue([nov]);
  live.fetchPackage.mockResolvedValue(T16);
  live.fetchHousehold.mockResolvedValue({ id: 'h1', periodAnchorDay: 1 });
  live.fetchSessionsInRange.mockResolvedValue([]);

  const pre = await mountHook(() => useBooking({ today: '2026-10-12' }));
  expect(pre.result.current.error).toBeNull();
  expect(pre.result.current.data.tokens).toMatchObject({ granted: 16, used: 1, left: 15, startsOn: '2026-11-01', unpaid: false });
  await pre.unmount();

  const inSeason = await mountHook(() => useBooking({ today: '2026-11-10' }));
  expect(inSeason.result.current.data.tokens).toMatchObject({ granted: 16, used: 1, left: 15, startsOn: null, unpaid: false });
  await inSeason.unmount();
});

test('an unpaid athlete booking before the season: marked unpaid on the booking screen too', async () => {
  live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', athleteId: 'a1', email: 'jordan@email.com' });
  live.fetchAthlete.mockResolvedValue({ id: 'a1', householdId: 'h1', packageId: 't-16', billing: { status: 'lapsed' } });
  live.fetchBookings.mockResolvedValue([]);
  live.fetchPackage.mockResolvedValue(T16);
  live.fetchHousehold.mockResolvedValue({ id: 'h1', periodAnchorDay: 1 });
  live.fetchSessionsInRange.mockResolvedValue([]);

  const h = await mountHook(() => useBooking({ today: '2026-09-30' }));
  expect(h.result.current.data.tokens).toMatchObject({ left: 16, startsOn: '2026-11-01', unpaid: true });
  await h.unmount();
});
