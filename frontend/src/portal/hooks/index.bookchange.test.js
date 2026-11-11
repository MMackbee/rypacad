/**
 * Cancel up to the start, Move any booking (spec 2026-11-11), the hook seam:
 * a family row is cancellable through its own day (a 1:1 only up to the day
 * before; never a Calendly one), carries whether it is a free comp and the
 * bonus or single token it holds, and the schedule and each household member
 * say whether the account is on hold (no Move on an ordinary booking then).
 * Seed mode carries the same fields and echoes a cancel with a reason. Kept
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
  fetchAllAthletes: jest.fn(),
  fetchAllHouseholds: jest.fn(),
  fetchAthlete: jest.fn(),
  fetchAthletesByIds: jest.fn(),
  fetchBookings: jest.fn(),
  fetchBookingsBySession: jest.fn(),
  fetchContractLogsSince: jest.fn(),
  fetchCurrentUser: jest.fn(),
  fetchGraceTokensByAthlete: jest.fn(),
  fetchHousehold: jest.fn(),
  fetchHouseholdAthletes: jest.fn(),
  fetchHouseholdBookings: jest.fn(),
  fetchNoShowBookingsSince: jest.fn(),
  fetchPackage: jest.fn(),
  fetchPendingEnrollmentRequests: jest.fn(),
  fetchSessions: jest.fn(),
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
jest.mock('./assessmentsLive', () => ({ ...jest.requireActual('./assessmentsLive'), __esModule: true, fetchAllAssessmentWindows: jest.fn() }));
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useHouseholdReservations, useSchedule } from './index';
import * as live from './live';
import * as waitlist from './waitlist';
import * as grace from './grace';
import * as calendar from '../data/calendar';
import { cancelDayOpen } from '../data/sessionStart';

// Thu Nov 12 2026, noon in Chicago.
const NOW = new Date('2026-11-12T18:00:00Z');
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

const T6 = { id: 't-6', name: '6 tokens', kind: 'tokens', tokens: 6 };
const session = (id, date, time, type) => ({ id, date, time, type, status: 'scheduled', capacity: 12, booked: 3 });
const SESSIONS = [
  session('s1', '2026-11-12', '4:00 PM', 'training'),
  session('s2', '2026-11-12', '5:00 PM', 'mental'),
  session('s3', '2026-11-13', '5:00 PM', 'mental'),
  session('s4', '2026-11-14', '5:00 PM', 'mental'),
  session('s5', '2026-11-16', '4:00 PM', 'training'),
];
const booking = (athleteId, s, over = {}) => ({
  id: `${athleteId}_${s.id}`, athleteId, sessionId: s.id, date: s.date, type: s.type, status: 'confirmed',
  householdId: 'h1', periodKey: '2026-11-01', chargedFrom: 'period', ...over,
});

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(NOW);
  calendar.todayISO.mockReturnValue(TODAY);
  live.fetchPackage.mockResolvedValue(T6);
  live.fetchGraceTokensByAthlete.mockResolvedValue([]);
  live.fetchSessionsByIds.mockResolvedValue(SESSIONS);
  waitlist.fetchWaitlistByAthlete.mockResolvedValue([]);
  waitlist.fetchWaitlistByHousehold.mockResolvedValue([]);
  waitlist.fetchWaitlistPositions.mockResolvedValue({});
  grace.fetchTokenPeriod.mockResolvedValue(null);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('live rows', () => {
  test("My Schedule: today's training is cancellable, a 1:1 only from tomorrow, never Calendly; comp, token and the hold ride along", async () => {
    live.isLive.mockReturnValue(true);
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', role: 'athlete', athleteId: 'jordan', email: 'kid@email.com' });
    live.fetchAthlete.mockResolvedValue({ id: 'jordan', name: 'Jordan Whitfield', householdId: 'h1', packageId: 't-6', billing: { status: 'active' } });
    live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1, membership: { status: 'past_due' } });
    live.fetchBookings.mockResolvedValue([
      booking('jordan', SESSIONS[0], { comp: true }),
      booking('jordan', SESSIONS[1]),
      booking('jordan', SESSIONS[2]),
      booking('jordan', SESSIONS[3], { source: 'calendly' }),
      booking('jordan', SESSIONS[4], { chargedFrom: 'grace', graceTokenId: 'g1' }),
    ]);
    const schedule = await mountHook(() => useSchedule({ today: TODAY }));
    expect(schedule.result.current.error).toBeNull();
    expect(schedule.result.current.data.sessions.map((r) => [r.bookingId, r.cancellable, r.comp, r.graceTokenId])).toEqual([
      ['jordan_s1', true, true, null],
      ['jordan_s2', false, false, null],
      ['jordan_s3', true, false, null],
      ['jordan_s4', false, false, null],
      ['jordan_s5', true, false, 'g1'],
    ]);
    expect(schedule.result.current.data.onHold).toBe(true);
    await schedule.unmount();
  });

  test('Reservations: each member says whether it is on hold; a comp re-booked with a token is an ordinary row', async () => {
    live.isLive.mockReturnValue(true);
    live.fetchCurrentUser.mockResolvedValue({ uid: 'p1', role: 'parent', householdId: 'h1', email: 'parent@email.com' });
    live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1, membership: { status: 'active' } });
    live.fetchHouseholdAthletes.mockResolvedValue([
      { id: 'jordan', name: 'Jordan Whitfield', householdId: 'h1', packageId: 't-6', billing: { status: 'pending' } },
      { id: 'nico', name: 'Nico Whitfield', householdId: 'h1', packageId: 't-6', billing: { status: 'active' } },
    ]);
    live.fetchHouseholdBookings.mockResolvedValue([
      booking('jordan', SESSIONS[0], { comp: true }),
      booking('nico', SESSIONS[4], { comp: true, chargedFrom: 'grace', graceTokenId: 'g2' }),
    ]);
    const family = await mountHook(() => useHouseholdReservations());
    expect(family.result.current.error).toBeNull();
    const { members } = family.result.current.data;
    expect(members.map((m) => m.onHold)).toEqual([true, false]);
    expect(members[0].upcoming.map((r) => [r.bookingId, r.comp, r.graceTokenId, r.cancellable])).toEqual([['jordan_s1', true, null, true]]);
    expect(members[1].upcoming.map((r) => [r.bookingId, r.comp, r.graceTokenId])).toEqual([['nico_s5', false, 'g2']]);
    await family.unmount();
  });
});

describe('seed mode (no live data)', () => {
  test('rows carry the new fields, cancellable by the same day rule, and a cancel with a reason is an echo', async () => {
    live.isLive.mockReturnValue(false);
    const schedule = await mountHook(() => useSchedule({ today: TODAY }));
    const rows = schedule.result.current.data.sessions;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect([row.comp, row.graceTokenId, row.cancellable]).toEqual([false, null, cancelDayOpen(row, TODAY)]);
    }
    // Today's seed row (Thu Nov 12) is cancellable now; earlier ones are not.
    expect(rows.some((r) => r.date === TODAY && r.cancellable)).toBe(true);
    await expect(schedule.result.current.cancel('b1', { reason: { category: 'sick', note: null } }))
      .resolves.toEqual({ id: 'b1', status: 'cancelled', simulated: true });
    expect(live.fetchCurrentUser).not.toHaveBeenCalled();
    await schedule.unmount();
  });
});
