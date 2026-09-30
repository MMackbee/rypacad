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
  fetchGraceTokensByAthlete: jest.fn(),
  fetchHousehold: jest.fn(),
  fetchHouseholdAthletes: jest.fn(),
  fetchHouseholdBookings: jest.fn(),
  fetchPackage: jest.fn(),
  fetchSessionsByIds: jest.fn(),
  fetchSessionsInRange: jest.fn(),
}));
jest.mock('./waitlist', () => ({
  ...jest.requireActual('./waitlist'),
  __esModule: true,
  fetchWaitlistByAthlete: jest.fn(),
  fetchWaitlistByHousehold: jest.fn(),
}));
// "Today" is pinned per test. The seed modules call todayISO() at import, so
// the real one answers until resetMocks clears it before the first test.
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useBooking, useHousehold, useHouseholdReservations, useSchedule } from './index';
import * as live from './live';
import * as waitlist from './waitlist';
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

// Review 2026-09-30: an October slot is charged to October by createBooking,
// and the "Next period" badge compared against the calendar month - both
// disagreed with a meter that reads November before the season.
const oct = { id: 'a1_phil', sessionId: 'phil', date: '2026-10-24', periodKey: '2026-10-01', status: 'confirmed', type: 'phil' };
const nov5 = { id: 'a1_nov5', sessionId: 'nov5', date: '2026-11-05', periodKey: '2026-11-01', status: 'confirmed', type: 'training' };
const dec = { id: 'a1_dec', sessionId: 'dec', date: '2026-12-02', periodKey: '2026-12-01', status: 'confirmed', type: 'training' };
const session = (b) => ({ id: b.sessionId, date: b.date, type: b.type, time: '4:00 PM' });

test('the family card counts an October booking against November', async () => {
  calendar.todayISO.mockReturnValue('2026-10-20');
  live.fetchCurrentUser.mockResolvedValue({ uid: 'p1', householdId: 'h1' });
  live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1 });
  live.fetchHouseholdAthletes.mockResolvedValue([{ id: 'a1', name: 'Jordan', householdId: 'h1', packageId: 't-16', billing: { status: 'active' } }]);
  live.fetchPackage.mockResolvedValue(T16);
  live.fetchBookings.mockResolvedValue([oct, nov5]);
  live.fetchSessionsByIds.mockResolvedValue([]);

  const h = await mountHook(() => useHousehold());
  expect(h.result.current.data.children[0].tokens).toMatchObject({ granted: 16, used: 2, left: 14, startsOn: '2026-11-01' });
  await h.unmount();
});

test('October: a November booking is this period on My Schedule and Reservations, a December one is next', async () => {
  calendar.todayISO.mockReturnValue('2026-10-15');
  live.fetchHousehold.mockResolvedValue({ id: 'h1', periodAnchorDay: 1 });
  live.fetchPackage.mockResolvedValue(T16);
  live.fetchSessionsByIds.mockResolvedValue([session(oct), session(nov5), session(dec)]);
  live.fetchGraceTokensByAthlete.mockResolvedValue([]);
  waitlist.fetchWaitlistByAthlete.mockResolvedValue([]);
  waitlist.fetchWaitlistByHousehold.mockResolvedValue([]);
  const nextBy = (rows) => Object.fromEntries(rows.map((r) => [r.date, r.nextPeriod]));
  const expected = { '2026-10-24': false, '2026-11-05': false, '2026-12-02': true };

  live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', athleteId: 'a1', email: 'jordan@email.com' });
  live.fetchAthlete.mockResolvedValue({ id: 'a1', householdId: 'h1', packageId: 't-16', billing: { status: 'active' } });
  live.fetchBookings.mockResolvedValue([oct, nov5, dec]);
  const mine = await mountHook(() => useSchedule({ today: '2026-10-15' }));
  expect(mine.result.current.error).toBeNull();
  expect(nextBy(mine.result.current.data.sessions)).toEqual(expected);
  // The meter beside it spends the same two November tokens.
  expect(mine.result.current.data.tokens).toMatchObject({ used: 2, left: 14 });
  await mine.unmount();

  live.fetchCurrentUser.mockResolvedValue({ uid: 'p1', householdId: 'h1' });
  live.fetchHouseholdAthletes.mockResolvedValue([{ id: 'a1', name: 'Jordan', householdId: 'h1', packageId: 't-16' }]);
  live.fetchHouseholdBookings.mockResolvedValue([oct, nov5, dec].map((b) => ({ ...b, athleteId: 'a1' })));
  const family = await mountHook(() => useHouseholdReservations());
  expect(family.result.current.error).toBeNull();
  expect(nextBy(family.result.current.data.members[0].upcoming)).toEqual(expected);
  await family.unmount();
});

// Owner report 2026-09-30 (Mike): Elite reads the first period too, so its
// "Next period" badge and its meter agree the same way a token package's do.
test('Elite before the season: November is this period on My Schedule, December next; the meter stays unlimited', async () => {
  calendar.todayISO.mockReturnValue('2026-09-30');
  live.fetchHousehold.mockResolvedValue({ id: 'h1', periodAnchorDay: 1 });
  live.fetchPackage.mockResolvedValue(ELITE_PKG);
  live.fetchSessionsByIds.mockResolvedValue([session(nov), session(nov5), session(dec)]);
  live.fetchGraceTokensByAthlete.mockResolvedValue([]);
  waitlist.fetchWaitlistByAthlete.mockResolvedValue([]);
  live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', athleteId: 'a1', email: 'jordan@email.com' });
  live.fetchAthlete.mockResolvedValue({ id: 'a1', householdId: 'h1', packageId: 'elite', billing: { status: 'active' } });
  live.fetchBookings.mockResolvedValue([nov, nov5, dec]);

  const mine = await mountHook(() => useSchedule({ today: '2026-09-30' }));
  expect(mine.result.current.error).toBeNull();
  expect(Object.fromEntries(mine.result.current.data.sessions.map((r) => [r.date, r.nextPeriod])))
    .toEqual({ '2026-11-03': false, '2026-11-05': false, '2026-12-02': true });
  expect(mine.result.current.data.tokens).toMatchObject({ unlimited: true, left: null });
  expect(mine.result.current.data.tokens).not.toHaveProperty('startsOn');
  await mine.unmount();
});
