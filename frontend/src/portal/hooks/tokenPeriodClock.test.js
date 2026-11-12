/**
 * "This period" follows the academy's date, not the phone's (2026-11-04).
 * Every token surface judged the period on todayISO(), the phone's own
 * calendar day, so a phone in another time zone turned November into
 * December at its own midnight - hours before the academy did - and the
 * meter, the "Next period" badges and the issued-grant read all moved with
 * it, while the booking check (live.js createBooking, firestore.rules) kept
 * Chicago's period.
 *
 * jest runs in America/Chicago, so a phone elsewhere is modelled by its own
 * day alone: todayISO() is pinned to the phone's date while the clock is
 * faked to the instant, and academyDateISO() is the real one, reading that
 * instant in Chicago.
 *   London, 2026-12-01T03:00Z: the phone says Dec 1; Chicago is 9 PM Nov 30.
 *   Honolulu, 2026-12-01T07:00Z: the phone says Nov 30; Chicago is 1 AM Dec 1.
 * A family in Central time sees both clocks agree, so nothing changes for them.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchAthlete: jest.fn(),
  fetchBookings: jest.fn(),
  fetchContractLogs: jest.fn(),
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
  fetchWaitlistPositions: jest.fn(),
}));
jest.mock('./grace', () => ({ ...jest.requireActual('./grace'), __esModule: true, fetchTokenPeriod: jest.fn() }));
jest.mock('./signups', () => ({ ...jest.requireActual('./signups'), __esModule: true, fetchLoginInvite: jest.fn() }));
// Only the phone's own day is pinned; academyDateISO stays the real one.
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  useAthleteDashboard,
  useBooking,
  useHousehold,
  useHouseholdAthletes,
  useHouseholdReservations,
  useMembership,
  useSchedule,
  useSpecialistSlots,
} from './index';
import useBillingHub, { useMyTokens } from './billing';
import * as live from './live';
import * as grace from './grace';
import * as signups from './signups';
import * as waitlist from './waitlist';
import * as calendar from '../data/calendar';

// Fake timers freeze setTimeout; act() drains the promise chains instead.
const flush = async () => { for (let i = 0; i < 12; i += 1) await act(async () => {}); };

async function mountHook(useHook) {
  const result = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await flush();
  return { result, unmount: () => act(async () => root.unmount()) };
}

/** The phone's own date at an instant (jest's clock reads the instant in Chicago). */
function phoneAt(instant, phoneDate) {
  jest.setSystemTime(new Date(instant));
  calendar.todayISO.mockReturnValue(phoneDate);
}
const LONDON = () => phoneAt('2026-12-01T03:00:00Z', '2026-12-01');
const HONOLULU = () => phoneAt('2026-12-01T07:00:00Z', '2026-11-30');

const T16 = { id: 't-16', name: '16 tokens', kind: 'tokens', tokens: 16 };
const ATHLETE = { id: 'a1', name: 'Jordan', householdId: 'h1', packageId: 't-16', billing: { status: 'active' } };
const row = (sessionId, date) => ({
  id: `a1_${sessionId}`, athleteId: 'a1', householdId: 'h1', sessionId, date, periodKey: `${date.slice(0, 7)}-01`, status: 'confirmed', type: 'training',
});
// Three November sessions spent, one December session booked ahead.
const BOOKINGS = [row('n10', '2026-11-10'), row('n17', '2026-11-17'), row('n24', '2026-11-24'), row('d08', '2026-12-08')];
const SESSIONS = BOOKINGS.map((b) => ({ id: b.sessionId, date: b.date, time: '4:00 PM', type: 'training', status: 'scheduled', capacity: 8, booked: 1 }));

// November is "this period": three spent, December's one booked ahead.
const NOVEMBER = { granted: 16, used: 3, left: 13 };
// December is: one spent, nothing yet in January.
const DECEMBER = { granted: 16, used: 1, left: 15 };

const asAthlete = () => live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', role: 'athlete', athleteId: 'a1', email: 'jordan@email.com' });
const asParent = () => live.fetchCurrentUser.mockResolvedValue({ uid: 'p1', role: 'parent', householdId: 'h1' });

beforeEach(() => {
  jest.useFakeTimers('modern');
  live.isLive.mockReturnValue(true);
  live.fetchAthlete.mockResolvedValue(ATHLETE);
  live.fetchBookings.mockResolvedValue(BOOKINGS);
  live.fetchContractLogs.mockResolvedValue([]);
  live.fetchGraceTokensByAthlete.mockResolvedValue([]);
  live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1 });
  live.fetchHouseholdAthletes.mockResolvedValue([ATHLETE]);
  live.fetchHouseholdBookings.mockResolvedValue(BOOKINGS);
  live.fetchPackage.mockResolvedValue(T16);
  live.fetchSessionsByIds.mockImplementation(async (ids) => SESSIONS.filter((s) => ids.includes(s.id)));
  live.fetchSessionsInRange.mockResolvedValue([]);
  waitlist.fetchWaitlistByAthlete.mockResolvedValue([]);
  waitlist.fetchWaitlistByHousehold.mockResolvedValue([]);
  waitlist.fetchWaitlistPositions.mockResolvedValue({});
  grace.fetchTokenPeriod.mockResolvedValue(null);
  signups.fetchLoginInvite.mockResolvedValue(null);
});
afterEach(() => { jest.useRealTimers(); });

test('the two clocks the tests below set apart', () => {
  LONDON();
  expect(calendar.todayISO()).toBe('2026-12-01');
  expect(calendar.academyDateISO()).toBe('2026-11-30');
  HONOLULU();
  expect(calendar.todayISO()).toBe('2026-11-30');
  expect(calendar.academyDateISO()).toBe('2026-12-01');
});

test("My Schedule: the meter, the grant read and the \"Next period\" badge follow Chicago's day; the list keeps the phone's", async () => {
  asAthlete();
  LONDON();
  const london = await mountHook(() => useSchedule());
  expect(london.result.current.error).toBeNull();
  expect(london.result.current.data.tokens).toMatchObject(NOVEMBER);
  expect(grace.fetchTokenPeriod).toHaveBeenCalledWith('a1', '2026-11-01');
  expect(grace.fetchTokenPeriod).not.toHaveBeenCalledWith('a1', '2026-12-01');
  // Upcoming is still the phone's: Dec 1 on, so only Dec 8 - which is NEXT period in Chicago.
  expect(london.result.current.data.sessions.map((r) => [r.date, r.nextPeriod])).toEqual([['2026-12-08', true]]);
  await london.unmount();

  grace.fetchTokenPeriod.mockClear();
  HONOLULU();
  const honolulu = await mountHook(() => useSchedule());
  expect(honolulu.result.current.data.tokens).toMatchObject(DECEMBER);
  expect(grace.fetchTokenPeriod).toHaveBeenCalledWith('a1', '2026-12-01');
  expect(honolulu.result.current.data.sessions.map((r) => [r.date, r.nextPeriod])).toEqual([['2026-12-08', false]]);
  await honolulu.unmount();
});

test("Book a Session (athlete and parent rows): Chicago's period and its next", async () => {
  asAthlete();
  LONDON();
  const mine = await mountHook(() => useBooking());
  expect(mine.result.current.error).toBeNull();
  expect(mine.result.current.data.tokens).toMatchObject(NOVEMBER);
  expect(mine.result.current.data.tokens.nextPeriod).toMatchObject({ periodKey: '2026-12-01', booked: 1 });
  await mine.unmount();

  asParent();
  const rows = await mountHook(() => useHouseholdAthletes());
  expect(rows.result.current.error ?? null).toBeNull();
  expect(rows.result.current.data[0].tokens).toMatchObject(NOVEMBER);
  expect(rows.result.current.data[0].tokens.nextPeriod).toMatchObject({ periodKey: '2026-12-01', booked: 1 });
  await rows.unmount();

  HONOLULU();
  const west = await mountHook(() => useHouseholdAthletes());
  expect(west.result.current.data[0].tokens).toMatchObject(DECEMBER);
  expect(west.result.current.data[0].tokens.nextPeriod).toMatchObject({ periodKey: '2027-01-01', booked: 0 });
  await west.unmount();
});

test("Phil's booking screen and both home cards read Chicago's period", async () => {
  asParent();
  LONDON();
  const phil = await mountHook(() => useSpecialistSlots('phil', { athleteId: 'a1' }));
  expect(phil.result.current.error).toBeNull();
  expect(phil.result.current.data.tokens).toMatchObject(NOVEMBER);
  await phil.unmount();

  const family = await mountHook(() => useHousehold());
  expect(family.result.current.error).toBeNull();
  expect(family.result.current.data.children[0].tokens).toMatchObject(NOVEMBER);
  await family.unmount();

  asAthlete();
  const home = await mountHook(() => useAthleteDashboard());
  expect(home.result.current.error).toBeNull();
  expect(home.result.current.data.athlete.tokens).toMatchObject(NOVEMBER);
  await home.unmount();
});

test("Membership and Reservations: the meter, its period end and the badges are Chicago's", async () => {
  asParent();
  LONDON();
  const membership = await mountHook(() => useMembership());
  expect(membership.result.current.error).toBeNull();
  const [jordan] = membership.result.current.data.members;
  expect(jordan.tokens).toMatchObject(NOVEMBER);
  expect(jordan.periodEnd).toBe('2026-11-30');
  await membership.unmount();

  const reservations = await mountHook(() => useHouseholdReservations());
  expect(reservations.result.current.error).toBeNull();
  const [member] = reservations.result.current.data.members;
  expect(member.upcoming.map((r) => [r.date, r.nextPeriod])).toEqual([['2026-12-08', true]]);
  await reservations.unmount();
});

test("Billing: the hub's period, its count and its reset date are Chicago's", async () => {
  asParent();
  LONDON();
  const hub = await mountHook(() => useBillingHub());
  expect(hub.result.current.error).toBeNull();
  const [jordan] = hub.result.current.data.members;
  expect(jordan.period).toMatchObject({ start: '2026-11-01', end: '2026-11-30', resetsOn: '2026-12-01' });
  expect(jordan.tokens).toMatchObject(NOVEMBER);
  expect(jordan.nextPeriod).toMatchObject({ start: '2026-12-01', booked: 1 });
  await hub.unmount();

  HONOLULU();
  const west = await mountHook(() => useBillingHub());
  expect(west.result.current.data.members[0].period).toMatchObject({ start: '2026-12-01', end: '2026-12-31' });
  expect(west.result.current.data.members[0].tokens).toMatchObject(DECEMBER);
  await west.unmount();

  asAthlete();
  LONDON();
  const mine = await mountHook(() => useMyTokens());
  expect(mine.result.current.error).toBeNull();
  expect(mine.result.current.data.member.period).toMatchObject({ start: '2026-11-01', end: '2026-11-30' });
  await mine.unmount();
});

test("the seed membership (harness, walkthrough) reads Chicago's period too", async () => {
  live.isLive.mockReturnValue(false);
  LONDON();
  const h = await mountHook(() => useMembership());
  const [first] = h.result.current.data.members;
  expect(first.periodEnd).toBe('2026-11-30');
  expect(first.tokens.nextPeriod).toMatchObject({ periodKey: '2026-12-01' });
  await h.unmount();
});
