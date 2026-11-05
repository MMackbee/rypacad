/**
 * Hidden sessions (owner 2026-11-05: the empty Monday and Wednesday 6 PM
 * blocks "sort of hidden for now"), the hook seam: a session doc with
 * hidden === true (scripts/hide-sessions.mjs) is left out of every list a
 * family books from - Book a Session's slots and month calendar, Phil's
 * slots - and out of the staff lists that share those reads (the coach's
 * day and month, the admin block fill, a specialist's own day). A booking
 * that already sits on a hidden block still shows on the family's schedule:
 * those rows are joined by id. Kept beside index.test.js with its own mock
 * list so the lanes merge cleanly.
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
import * as hooks from './index';
import * as live from './live';
import * as waitlist from './waitlist';
import * as grace from './grace';
import * as adapter from './assessmentsLive';
import * as calendar from '../data/calendar';
import { buildMonthDayMaps } from '../components/MonthCalendar';

const { useAdminDashboard, useBooking, useCoachDay, useMonthSessions, useSchedule, useSpecialistSessions, useSpecialistSlots } = hooks;

// Thu Nov 5 2026, 10:00 AM in Chicago.
const NOW = new Date('2026-11-05T16:00:00Z');
const TODAY = '2026-11-05';

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
const HIDDEN = { hidden: true, hiddenAt: '2026-11-05T15:00:00Z', hiddenBy: 'hide-sessions' };
const session = (id, date, time, over = {}) => ({ id, date, time, type: 'training', status: 'scheduled', capacity: 12, booked: 3, ...over });
// Wed Nov 11: the 5 PM block runs; the 6 PM block is hidden (empty). Mon Nov 16: only the hidden 6 PM block
// (a day whose only session is hidden). Wed Nov 18: Phil at 5 PM and a hidden Phil session at 6 PM.
const WEEK = [
  session('2026-11-11-6', '2026-11-11', '5:00 PM'),
  session('2026-11-11-7', '2026-11-11', '6:00 PM', { booked: 0, ...HIDDEN }),
  session('2026-11-16-7', '2026-11-16', '6:00 PM', { booked: 0, ...HIDDEN }),
  session('2026-11-18-6', '2026-11-18', '5:00 PM', { type: 'phil', capacity: 6, booked: 1 }),
  session('2026-11-18-7', '2026-11-18', '6:00 PM', { type: 'phil', capacity: 6, booked: 0, ...HIDDEN }),
  // hidden: false is not hidden.
  session('2026-11-18-8', '2026-11-18', '7:00 PM', { hidden: false }),
];
const ids = (rows) => rows.map((r) => r.id ?? r.sessionId);

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(NOW);
  calendar.todayISO.mockReturnValue(TODAY);
  live.isLive.mockReturnValue(true);
  live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1 });
  live.fetchPackage.mockResolvedValue(T6);
  live.fetchBookings.mockResolvedValue([]);
  live.fetchGraceTokensByAthlete.mockResolvedValue([]);
  live.fetchSessionsInRange.mockResolvedValue(WEEK);
  live.fetchSessions.mockResolvedValue(WEEK);
  live.fetchSessionsByIds.mockResolvedValue([]);
  live.fetchBookingsBySession.mockResolvedValue([]);
  live.fetchAthletesByIds.mockResolvedValue([]);
  waitlist.fetchWaitlistByAthlete.mockResolvedValue([]);
  waitlist.fetchWaitlistByHousehold.mockResolvedValue([]);
  waitlist.fetchWaitlistPositions.mockResolvedValue({});
  grace.fetchTokenPeriod.mockResolvedValue(null);
});
afterEach(() => {
  jest.useRealTimers();
});

const asParent = () => {
  live.fetchCurrentUser.mockResolvedValue({ uid: 'p1', role: 'parent', householdId: 'h1', email: 'dana@email.com' });
  live.fetchHouseholdAthletes.mockResolvedValue([{ id: 'jordan', name: 'Jordan Whitfield', householdId: 'h1', packageId: 't-6' }]);
};
const asStaff = (role, extra = {}) => {
  live.fetchCurrentUser.mockResolvedValue({ uid: `${role}1`, role, displayName: 'Luke', ...extra });
};

describe('Book a Session: a family never sees a hidden session', () => {
  test('the month calendar: the hidden block is not a row, and a day whose only session is hidden has nothing bookable (not "closed")', async () => {
    asParent();
    const month = await mountHook(() => useMonthSessions('2026-11'));
    expect(month.result.current.error).toBeNull();
    const { days, dayMarks } = month.result.current.data;
    expect(days.map((d) => [d.date, ids(d.sessions)])).toEqual([
      ['2026-11-11', ['2026-11-11-6']],
      ['2026-11-18', ['2026-11-18-8']],
    ]);
    // Nov 16 paints as an open day with nothing to book - never available, never "Academy closed".
    const { dayStates } = buildMonthDayMaps(days);
    expect(dayStates['2026-11-16']).toBeUndefined();
    expect(dayStates['2026-11-11']).toBe('available');
    expect(dayMarks['2026-11-16']).toBeUndefined();
    await month.unmount();
  });

  test('the slot list and its dates leave the hidden blocks out', async () => {
    asParent();
    const booking = await mountHook(() => useBooking({ today: TODAY }));
    expect(booking.result.current.error).toBeNull();
    expect(ids(booking.result.current.data.slots)).toEqual(['2026-11-11-6', '2026-11-18-8']);
    expect(booking.result.current.data.dates.map((d) => d.iso)).toEqual(['2026-11-11', '2026-11-18']);
    await booking.unmount();
  });

  test("Phil's slots leave a hidden Phil session out", async () => {
    asParent();
    const phil = await mountHook(() => useSpecialistSlots('phil'));
    expect(phil.result.current.error).toBeNull();
    const day = phil.result.current.data.days.find((d) => d.date === '2026-11-18');
    expect(day.slots.map((s) => s.sessionId)).toEqual(['2026-11-18-6']);
    await phil.unmount();
  });

  test("a booking already on a hidden block still shows on the athlete's schedule", async () => {
    const athlete = { id: 'jordan', name: 'Jordan Whitfield', householdId: 'h1', packageId: 't-6' };
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', role: 'athlete', athleteId: 'jordan', email: 'kid@email.com' });
    live.fetchAthlete.mockResolvedValue(athlete);
    live.fetchBookings.mockResolvedValue([{ id: 'jordan_2026-11-11-7', athleteId: 'jordan', sessionId: '2026-11-11-7', date: '2026-11-11',
      type: 'training', status: 'confirmed', householdId: 'h1', periodKey: '2026-11-01', chargedFrom: 'period' }]);
    live.fetchSessionsByIds.mockResolvedValue([WEEK[1]]);
    const schedule = await mountHook(() => useSchedule({ today: TODAY }));
    expect(schedule.result.current.error).toBeNull();
    expect(schedule.result.current.data.sessions.map((r) => [r.bookingId, r.status, r.cancellable])).toEqual([['jordan_2026-11-11-7', 'confirmed', true]]);
    await schedule.unmount();
  });
});

describe('staff lists that share those reads leave a hidden block out too', () => {
  test("the coach's day", async () => {
    asStaff('coach');
    live.fetchSessions.mockResolvedValue(WEEK.filter((s) => s.date === '2026-11-11'));
    const day = await mountHook(() => useCoachDay());
    expect(day.result.current.error).toBeNull();
    expect(day.result.current.data.blocks.map((b) => b.sessionId)).toEqual(['2026-11-11-6']);
    await day.unmount();
  });

  test("the coach's month (the same feed as Book a Session)", async () => {
    asStaff('coach');
    const month = await mountHook(() => useMonthSessions('2026-11'));
    expect(month.result.current.data.days.flatMap((d) => ids(d.sessions))).toEqual(['2026-11-11-6', '2026-11-18-8']);
    await month.unmount();
  });

  test("the admin dashboard's block fill counts only the blocks families can book", async () => {
    asStaff('owner');
    for (const fetch of [live.fetchAllAthletes, live.fetchPendingEnrollmentRequests, live.fetchNoShowBookingsSince,
      live.fetchContractLogsSince, adapter.fetchAllAssessmentWindows, live.fetchAllHouseholds]) fetch.mockResolvedValue([]);
    live.fetchSessionsInRange.mockResolvedValue([
      session('2026-11-11-6', '2026-11-11', '5:00 PM', { booked: 6 }),
      session('2026-11-11-7', '2026-11-11', '6:00 PM', { booked: 0, ...HIDDEN }),
    ]);
    const admin = await mountHook(() => useAdminDashboard());
    expect(admin.result.current.error).toBeNull();
    expect(admin.result.current.data.blockFill.find((b) => b.day === 'Wed')).toEqual({ day: 'Wed', pct: 50 });
    expect(admin.result.current.data.metrics.fill).toBe('50%');
    await admin.unmount();
  });

  test("a specialist's own day", async () => {
    asStaff('coach', { specialistId: 'phil' });
    const mine = await mountHook(() => useSpecialistSessions('phil'));
    expect(mine.result.current.error).toBeNull();
    expect(mine.result.current.data.sessions.map((s) => s.sessionId)).toEqual(['2026-11-18-6']);
    await mine.unmount();
  });
});
