/**
 * Waitlist hardening (audit 2026-09-30), the hook seam. The live loaders run
 * against mocked adapters: which waitlist reads go out and with what filter,
 * where the place in line comes from (the waitlistPositions callable, never a
 * count of other families' entries), and the token position the booking
 * screens are handed - the one the booking check enforces.
 * Kept beside index.test.js with its own mock list so the lanes merge cleanly.
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
  createBooking: jest.fn(),
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
  fetchWaitlistBySession: jest.fn(),
  fetchWaitlistPositions: jest.fn(),
}));
jest.mock('./grace', () => ({ ...jest.requireActual('./grace'), __esModule: true, fetchTokenPeriod: jest.fn() }));
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useBooking, useHouseholdAthletes, useHouseholdReservations, useMonthSessions, useSchedule, useSpecialistSlots } from './index';
import * as live from './live';
import * as waitlist from './waitlist';
import * as grace from './grace';
import * as calendar from '../data/calendar';

// Thu Nov 12 2026, 4:30 PM in Chicago.
const NOW = new Date('2026-11-12T22:30:00Z');
const TODAY = '2026-11-12';

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

const T6 = { id: 't-6', name: '6 tokens', kind: 'tokens', tokens: 6, windowDays: 30 };
const ELITE_PKG = { id: 'elite', name: 'Elite', kind: 'elite', tokens: null, windowDays: 45 };
const booked = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `ava_b${i}`, athleteId: 'ava', sessionId: `b${i}`, date: '2026-11-0' + (i + 2), periodKey: '2026-11-01', status: 'confirmed', type: 'training',
  }));
const hold = (sessionId, athleteId = 'ava') => ({ id: `${sessionId}_${athleteId}`, sessionId, athleteId, householdId: 'h1', date: '2026-11-20', periodKey: '2026-11-01' });
const session = (id, date, time = '4:00 PM', over = {}) => ({ id, date, time, type: 'training', status: 'scheduled', capacity: 8, booked: 8, ...over });

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(NOW);
  calendar.todayISO.mockReturnValue(TODAY);
  live.isLive.mockReturnValue(true);
  live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1 });
  live.fetchPackage.mockImplementation(async (id) => (id === 'elite' ? ELITE_PKG : T6));
  live.fetchGraceTokensByAthlete.mockResolvedValue([]);
  live.fetchSessionsInRange.mockResolvedValue([]);
  live.fetchSessionsByIds.mockResolvedValue([]);
  waitlist.fetchWaitlistByAthlete.mockResolvedValue([]);
  waitlist.fetchWaitlistByHousehold.mockResolvedValue([]);
  waitlist.fetchWaitlistPositions.mockResolvedValue({});
  grace.fetchTokenPeriod.mockResolvedValue(null);
});
afterEach(() => {
  jest.useRealTimers();
});

const asAthlete = () => {
  live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', role: 'athlete', athleteId: 'ava', email: 'ava@email.com' });
  live.fetchAthlete.mockResolvedValue({ id: 'ava', name: 'Ava', householdId: 'h1', packageId: 't-6', billing: { status: 'active' } });
};
const asParent = (athletes = [{ id: 'ava', name: 'Ava', householdId: 'h1', packageId: 't-6' }]) => {
  live.fetchCurrentUser.mockResolvedValue({ uid: 'p1', role: 'parent', householdId: 'h1', email: 'dana@email.com' });
  live.fetchHouseholdAthletes.mockResolvedValue(athletes);
  live.fetchAthlete.mockImplementation(async (id) => athletes.find((a) => a.id === id));
};

describe('the token figure on the booking screens is the one the booking check enforces', () => {
  test('Book a Session, athlete: a token held on a waitlist is not left to spend', async () => {
    asAthlete();
    live.fetchBookings.mockResolvedValue(booked(5));
    waitlist.fetchWaitlistByAthlete.mockResolvedValue([hold('w1')]);
    const h = await mountHook(() => useBooking({ today: TODAY }));
    expect(h.result.current.error).toBeNull();
    // Was: used 5, left 1 - and the tap was then refused "5 of 6, 1 held on a waitlist".
    expect(h.result.current.data.tokens).toMatchObject({ granted: 6, used: 5, reserved: 1, left: 0, grace: [] });
    await h.unmount();
  });

  test('Book a Session, athlete: an unexpired bonus token is available when the period reads zero', async () => {
    asAthlete();
    live.fetchBookings.mockResolvedValue(booked(6));
    live.fetchGraceTokensByAthlete.mockResolvedValue([
      { id: 'g-old', athleteId: 'ava', expiresAt: '2026-11-01', reason: 'session-cancelled' },
      { id: 'g1', athleteId: 'ava', expiresAt: '2026-12-01', reason: 'session-cancelled', sourceSessionId: '2026-11-03-t0' },
    ]);
    const h = await mountHook(() => useBooking({ today: TODAY }));
    const { tokens } = h.result.current.data;
    expect(tokens).toMatchObject({ used: 6, left: 0 });
    expect(tokens.grace).toEqual([{ id: 'g1', expiresAt: '2026-12-01', reason: 'session-cancelled', sourceSessionId: '2026-11-03-t0' }]);
    await h.unmount();
  });

  test("Book a Session, athlete: the period's issued grant is the grant", async () => {
    asAthlete();
    live.fetchBookings.mockResolvedValue(booked(6));
    grace.fetchTokenPeriod.mockResolvedValue({ id: 'ava_2026-11-01', granted: 8 });
    const h = await mountHook(() => useBooking({ today: TODAY }));
    expect(grace.fetchTokenPeriod).toHaveBeenCalledWith('ava', '2026-11-01');
    expect(h.result.current.data.tokens).toMatchObject({ granted: 8, used: 6, left: 2 });
    await h.unmount();
  });

  test("a parent's 'Booking for' child: holds and bonus tokens counted, and the waitlist read carries the household filter", async () => {
    asParent();
    live.fetchBookings.mockResolvedValue(booked(5));
    waitlist.fetchWaitlistByAthlete.mockResolvedValue([hold('w1')]);
    live.fetchGraceTokensByAthlete.mockResolvedValue([{ id: 'g1', athleteId: 'ava', expiresAt: '2026-12-01', reason: 'session-cancelled' }]);
    const h = await mountHook(() => useHouseholdAthletes());
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data[0].tokens).toMatchObject({ used: 5, reserved: 1, left: 0 });
    expect(h.result.current.data[0].tokens.grace.map((g) => g.id)).toEqual(['g1']);
    expect(waitlist.fetchWaitlistByAthlete).toHaveBeenCalledWith('ava', { householdId: 'h1' });
    await h.unmount();
  });

  test('the Phil screen: the same position', async () => {
    asParent();
    live.fetchBookings.mockResolvedValue(booked(5));
    waitlist.fetchWaitlistByAthlete.mockResolvedValue([hold('w1')]);
    const h = await mountHook(() => useSpecialistSlots('phil', { athleteId: 'ava' }));
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.tokens).toMatchObject({ used: 5, reserved: 1, left: 0 });
    expect(waitlist.fetchWaitlistByAthlete).toHaveBeenCalledWith('ava', { householdId: 'h1' });
    await h.unmount();
  });
});

describe('the Phil and Yannick lists', () => {
  const phil = (id, date, time, over = {}) => ({ id, date, time, type: 'phil', status: 'scheduled', capacity: 6, booked: 0, ...over });

  test("today's sessions that have started are not offered; later ones are", async () => {
    asParent();
    live.fetchBookings.mockResolvedValue([]);
    live.fetchSessionsInRange.mockResolvedValue([
      phil('p-3', TODAY, '3:00 PM'), // started 90 minutes ago
      phil('p-430', TODAY, '4:30 PM'), // starting this minute
      phil('p-515', TODAY, '5:15 PM'),
      phil('p-tom', '2026-11-13', '3:00 PM'),
    ]);
    const h = await mountHook(() => useSpecialistSlots('phil', { athleteId: 'ava' }));
    const byDate = Object.fromEntries(h.result.current.data.days.map((d) => [d.date, d.slots.map((s) => s.sessionId)]));
    expect(byDate[TODAY]).toEqual(['p-515']);
    expect(byDate['2026-11-13']).toEqual(['p-tom']);
    await h.unmount();
  });

  test('a session the athlete is already waiting on is flagged, with its place when the server says one', async () => {
    asParent();
    live.fetchBookings.mockResolvedValue([]);
    live.fetchSessionsInRange.mockResolvedValue([
      phil('p-full', '2026-11-16', '3:00 PM', { booked: 6 }),
      phil('p-other', '2026-11-16', '3:45 PM', { booked: 6 }),
    ]);
    waitlist.fetchWaitlistByAthlete.mockResolvedValue([hold('p-full')]);
    waitlist.fetchWaitlistPositions.mockResolvedValue({ 'p-full': { ava: 2 } });
    const h = await mountHook(() => useSpecialistSlots('phil', { athleteId: 'ava' }));
    const slots = h.result.current.data.days.find((d) => d.date === '2026-11-16').slots;
    expect(slots[0]).toMatchObject({ sessionId: 'p-full', open: false, waitlisted: true, waitlistPosition: 2 });
    expect(slots[1].waitlisted).toBeUndefined();
    expect(waitlist.fetchWaitlistPositions).toHaveBeenCalledWith(['p-full']);
    expect(waitlist.fetchWaitlistBySession).not.toHaveBeenCalled();
    await h.unmount();

    // The callable is not deployed yet: still flagged, no number, no error.
    waitlist.fetchWaitlistPositions.mockResolvedValue({});
    const bare = await mountHook(() => useSpecialistSlots('phil', { athleteId: 'ava' }));
    expect(bare.result.current.error).toBeNull();
    expect(bare.result.current.data.days.find((d) => d.date === '2026-11-16').slots[0]).toMatchObject({ waitlisted: true, waitlistPosition: null });
    await bare.unmount();
  });

  test("another family's Calendly appointment with Yannick is not a slot", async () => {
    asParent();
    live.fetchBookings.mockResolvedValue([]);
    live.fetchSessionsInRange.mockResolvedValue([
      { id: 'cal-1', date: '2026-11-17', time: '4:00 PM', type: 'mental', status: 'scheduled', capacity: 1, booked: 1, bookable: false, source: 'calendly' },
      { id: 'm-2', date: '2026-11-17', time: '4:30 PM', type: 'mental', status: 'scheduled', capacity: 1, booked: 0 },
    ]);
    const h = await mountHook(() => useSpecialistSlots('mental', { athleteId: 'ava' }));
    expect(h.result.current.data.days.find((d) => d.date === '2026-11-17').slots.map((s) => s.sessionId)).toEqual(['m-2']);
    await h.unmount();
  });
});

describe('the place in line comes from the server, for the caller\'s own athletes only', () => {
  test("Book a Session's month, parent: each child's own place on a session two of them wait for", async () => {
    asParent([
      { id: 'ava', name: 'Ava', householdId: 'h1', packageId: 't-6' },
      { id: 'eli', name: 'Eli', householdId: 'h1', packageId: 'elite' },
    ]);
    live.fetchSessionsInRange.mockResolvedValue([session('s1', '2026-11-20'), session('s2', '2026-11-20', '5:00 PM')]);
    waitlist.fetchWaitlistByHousehold.mockResolvedValue([hold('s1', 'ava'), hold('s1', 'eli')]);
    waitlist.fetchWaitlistPositions.mockResolvedValue({ s1: { ava: 3, eli: 1 } });
    const h = await mountHook(() => useMonthSessions('2026-11'));
    expect(h.result.current.error).toBeNull();
    expect(waitlist.fetchWaitlistByHousehold).toHaveBeenCalledWith('h1');
    expect(waitlist.fetchWaitlistPositions).toHaveBeenCalledWith(['s1']);
    expect(waitlist.fetchWaitlistBySession).not.toHaveBeenCalled();
    const rows = Object.fromEntries(h.result.current.data.days.flatMap((d) => d.sessions).map((r) => [r.id, r]));
    expect(rows.s1.waitlistBy).toEqual({ ava: 3, eli: 1 });
    expect(rows.s1.waitlisted).toBe(true);
    expect(rows.s2.waitlistBy).toBeUndefined();
    await h.unmount();
  });

  test('My Schedule: the waitlisted row carries the server\'s place, or none when the call fails', async () => {
    asAthlete();
    live.fetchBookings.mockResolvedValue([]);
    live.fetchSessionsByIds.mockResolvedValue([session('s1', '2026-11-20')]);
    waitlist.fetchWaitlistByAthlete.mockResolvedValue([hold('s1')]);
    waitlist.fetchWaitlistPositions.mockResolvedValue({ s1: { ava: 2 } });
    const mine = await mountHook(() => useSchedule({ today: TODAY }));
    expect(mine.result.current.error).toBeNull();
    expect(mine.result.current.data.sessions[0]).toMatchObject({ id: 's1', status: 'waitlisted', waitlistPosition: 2, athleteId: 'ava' });
    expect(waitlist.fetchWaitlistBySession).not.toHaveBeenCalled();
    await mine.unmount();

    waitlist.fetchWaitlistPositions.mockResolvedValue({});
    const bare = await mountHook(() => useSchedule({ today: TODAY }));
    expect(bare.result.current.error).toBeNull();
    expect(bare.result.current.data.sessions[0]).toMatchObject({ status: 'waitlisted', waitlistPosition: null });
    await bare.unmount();
  });

  test('Reservations: one positions call for the household, and each member says whether they are Elite', async () => {
    asParent([
      { id: 'ava', name: 'Ava', householdId: 'h1', packageId: 't-6' },
      { id: 'eli', name: 'Eli', householdId: 'h1', packageId: 'elite' },
    ]);
    live.fetchHouseholdBookings.mockResolvedValue([]);
    live.fetchSessionsByIds.mockResolvedValue([session('s1', '2026-11-20'), session('s2', '2026-11-21')]);
    waitlist.fetchWaitlistByHousehold.mockResolvedValue([hold('s1', 'ava'), hold('s2', 'eli')]);
    waitlist.fetchWaitlistPositions.mockResolvedValue({ s1: { ava: 1 }, s2: { eli: 4 } });
    const h = await mountHook(() => useHouseholdReservations());
    expect(h.result.current.error).toBeNull();
    expect(waitlist.fetchWaitlistPositions).toHaveBeenCalledTimes(1);
    const [ava, eli] = h.result.current.data.members;
    expect(ava).toMatchObject({ athleteId: 'ava', unlimited: false });
    expect(ava.upcoming[0]).toMatchObject({ id: 's1', status: 'waitlisted', waitlistPosition: 1 });
    expect(eli).toMatchObject({ athleteId: 'eli', unlimited: true });
    expect(eli.upcoming[0]).toMatchObject({ id: 's2', waitlistPosition: 4 });
    await h.unmount();
  });
});

describe('book(): a waitlist place is its own request', () => {
  const slot = { id: 's1', date: '2026-11-20', type: 'training' };

  test('a plain reserve asks for no waitlist place; Join waitlist does, and gets its place from the server', async () => {
    asParent();
    const h = await mountHook(() => useBooking({ today: TODAY, withSlots: false }));
    live.createBooking.mockResolvedValue({ id: 'ava_s1', status: 'confirmed' });
    await act(async () => { await h.result.current.book(slot, { athleteId: 'ava' }); });
    expect(live.createBooking.mock.calls[0]).toHaveLength(1);

    live.createBooking.mockResolvedValue({ id: 's1_ava', status: 'waitlisted', position: null });
    waitlist.fetchWaitlistPositions.mockResolvedValue({ s1: { ava: 3 } });
    let out;
    await act(async () => { out = await h.result.current.book(slot, { athleteId: 'ava', joinWaitlist: true }); });
    expect(live.createBooking.mock.calls[1][1]).toEqual({ waitlistIfFull: true });
    expect(out).toMatchObject({ status: 'waitlisted', position: 3 });
    expect(waitlist.fetchWaitlistPositions).toHaveBeenCalledWith(['s1']);
    await h.unmount();
  });

  test('the place is simply absent when the positions call is unavailable', async () => {
    asAthlete();
    const h = await mountHook(() => useBooking({ today: TODAY, withSlots: false }));
    live.createBooking.mockResolvedValue({ id: 's1_ava', status: 'waitlisted', position: null });
    waitlist.fetchWaitlistPositions.mockResolvedValue({});
    let out;
    await act(async () => { out = await h.result.current.book(slot, { joinWaitlist: true }); });
    expect(out).toMatchObject({ status: 'waitlisted', position: null });
    await h.unmount();
  });
});
