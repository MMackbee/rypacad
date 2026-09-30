/**
 * K04 (Sprint 20, spec 6.1): Yannick's monthly cadence is judged for the
 * SLOT's month, not today's. The rest of hooks/index.js is exercised in the
 * emulator; Firebase is mocked out here.
 *
 * Perf wave B: the live loaders that now read in parallel (liveAthleteDetail)
 * are driven through their hooks against mocked adapters - the reads each
 * one issues, which round they land in, and the payload they return.
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
  fetchHousehold: jest.fn(),
  fetchPackage: jest.fn(),
  fetchSessionsByIds: jest.fn(),
  fetchSessionsInRange: jest.fn(),
}));
jest.mock('./signups', () => ({ ...jest.requireActual('./signups'), __esModule: true, fetchLoginInvite: jest.fn() }));
jest.mock('./waitlist', () => ({
  ...jest.requireActual('./waitlist'),
  __esModule: true,
  fetchWaitlistByAthlete: jest.fn(),
  fetchWaitlistByHousehold: jest.fn(),
  fetchWaitlistBySession: jest.fn(),
}));

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { coachingFor, seedSpecialistDays, useAthleteDetail } from './index';
import * as live from './live';
import * as signups from './signups';
import { loginStateFor } from '../data/signups';

const mental = (date) => ({ id: date, type: 'mental', status: 'confirmed', date });

test('coachingFor judges the given month, defaulting to today\'s', () => {
  const bookings = [mental('2026-10-14'), mental('2026-11-03')];
  expect(coachingFor(bookings, '2026-10-20')).toEqual({ used: 1, limit: 1, capReached: true });
  expect(coachingFor(bookings, '2026-10-20', null, '2026-11')).toEqual({ used: 1, limit: 1, capReached: true });
  expect(coachingFor(bookings, '2026-10-20', null, '2026-12')).toEqual({ used: 0, limit: 1, capReached: false });
  expect(coachingFor(bookings, '2026-10-20', { kind: 'elite' }, '2026-10')).toEqual({ used: 1, limit: 2, capReached: false });
});

test('seed mental slots are the three 30-minute Yannick times; Phil slots are 45', () => {
  const mentalDay = seedSpecialistDays('mental', '2026-10-06', 30).find((d) => d.slots.length); // Tue
  expect(mentalDay.slots.map((s) => [s.time, s.durationMinutes])).toEqual([['4:00 PM', 30], ['4:30 PM', 30], ['5:00 PM', 30]]);
  const philDay = seedSpecialistDays('phil', '2026-10-05', 30).find((d) => d.slots.length); // Mon
  expect(philDay.slots.every((s) => s.durationMinutes === 45)).toBe(true);
});

/* ---------------------------- live loaders ---------------------------- */

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mountHook(useHook) {
  const result = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  return { result, unmount: () => act(async () => root.unmount()) };
}

describe('live loaders (perf wave B)', () => {
  beforeEach(() => {
    live.isLive.mockReturnValue(true);
  });

  test('liveAthleteDetail: athlete + viewer, then package/household/bookings/invite together, then sessions', async () => {
    const athleteGate = deferred();
    const bookingsGate = deferred();
    live.fetchAthlete.mockReturnValue(athleteGate.promise);
    live.fetchCurrentUser.mockResolvedValue({ uid: 'p1', role: 'parent', householdId: 'h1' });
    live.fetchPackage.mockResolvedValue({ id: 't-12', name: '12 tokens' });
    live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 15 });
    live.fetchBookings.mockReturnValue(bookingsGate.promise);
    signups.fetchLoginInvite.mockResolvedValue(null);
    live.fetchSessionsByIds.mockResolvedValue([{ id: 's1', time: '4:00 PM', label: 'Junior block' }]);

    const h = await mountHook(() => useAthleteDetail({ athleteId: 'a1' }));
    // Round 1: both issued before the athlete resolves.
    expect(live.fetchAthlete).toHaveBeenCalledWith('a1');
    expect(live.fetchCurrentUser).toHaveBeenCalledTimes(1);
    expect(live.fetchBookings).not.toHaveBeenCalled();

    await act(async () => {
      athleteGate.resolve({ id: 'a1', name: 'Jordan Whitfield', packageId: 't-12', householdId: 'h1', contractMinutes: 45, loginEmail: 'jordan@email.com' });
    });
    await settle();
    // Round 2: all four issued while the bookings are still in flight.
    expect(live.fetchPackage).toHaveBeenCalledWith('t-12');
    expect(live.fetchHousehold).toHaveBeenCalledWith('h1');
    expect(live.fetchBookings).toHaveBeenCalledWith('a1', { householdId: 'h1' });
    expect(signups.fetchLoginInvite).toHaveBeenCalledWith('jordan@email.com');
    expect(live.fetchSessionsByIds).not.toHaveBeenCalled();

    await act(async () => {
      bookingsGate.resolve([
        { id: 'a1_s1', sessionId: 's1', date: '2099-01-06', status: 'confirmed', type: 'training' },
        { id: 'a1_s2', sessionId: 's2', date: '2099-01-07', status: 'cancelled', type: 'training' },
      ]);
    });
    await settle();
    expect(live.fetchSessionsByIds).toHaveBeenCalledWith(['s1']);
    const { data, error } = h.result.current;
    expect(error).toBeNull();
    expect(data.athlete).toEqual({
      name: 'Jordan Whitfield',
      subline: '45 min tier · 12 tokens package',
      attendance: '—',
      attendanceLabel: 'attendance — not tracked live yet',
      board: '—',
      boardLabel: 'months on the Board — not tracked live yet',
      contractMinutes: 45,
      packageId: 't-12',
      facilityAccess: false,
      facilityAccessConsent: null,
      loginEmail: 'jordan@email.com',
      login: loginStateFor('jordan@email.com', null),
      householdId: 'h1',
      householdName: 'Whitfield family',
      periodAnchorDay: 15,
    });
    expect(data.upcoming).toEqual([
      { id: 's1', date: '2099-01-06', dayLabel: expect.any(String), time: '4:00 PM', name: 'Junior block', status: 'confirmed' },
    ]);
    expect(data).toMatchObject({ history: [], checklist: [], hasEnoughData: true });
    await h.unmount();
  });

  test('liveAthleteDetail: a staff viewer queries by athleteId alone; a denied household read leaves the name null', async () => {
    live.fetchAthlete.mockResolvedValue({ id: 'a1', name: 'Jordan', householdId: 'h1' });
    live.fetchCurrentUser.mockResolvedValue({ uid: 'c1', role: 'coach' });
    live.fetchHousehold.mockRejectedValue(new Error('permission-denied'));
    live.fetchBookings.mockResolvedValue([]);
    live.fetchSessionsByIds.mockResolvedValue([]);

    const h = await mountHook(() => useAthleteDetail({ athleteId: 'a1' }));
    await settle();
    expect(live.fetchBookings).toHaveBeenCalledWith('a1', {});
    expect(live.fetchPackage).not.toHaveBeenCalled();
    expect(signups.fetchLoginInvite).not.toHaveBeenCalled();
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.athlete).toMatchObject({ householdName: null, subline: null, login: { state: 'none', claimedAt: null } });
    await h.unmount();
  });




});
