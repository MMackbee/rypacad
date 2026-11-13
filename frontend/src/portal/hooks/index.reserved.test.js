/**
 * Handicap-reserved sessions (owner ruling 2026-10-02), the hook seam: the
 * session rows every screen is handed carry `maxHandicap` (null on an open
 * block) and the athlete rows carry `handicap` (null for none on file), off
 * the docs the loaders already read - no extra Firestore read for either.
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
  fetchAllAthletes: jest.fn(),
  fetchAllHouseholds: jest.fn(),
  fetchAthlete: jest.fn(),
  fetchBookings: jest.fn(),
  fetchBookingsBySession: jest.fn(),
  fetchCoachAthletes: jest.fn(),
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
import { reservedEligible, reservedTag } from '../data/reserved';
import { bump } from './invalidate';

const { useAdminDashboard, useBooking, useCoachDay, useCoachRoster, useHouseholdAthletes, useMembership, useMonthSessions, useSessionAttendance } = hooks;

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

const T6 = { id: 't-6', name: '6 tokens', kind: 'tokens', tokens: 6 };
const session = (id, date, time, over = {}) => ({ id, date, time, type: 'training', status: 'scheduled', capacity: 14, booked: 3, ...over });
// Tuesday Nov 17: the reserved 3 PM block, Phil's 3 PM fitness session beside it, and the open 4 PM block.
const TUESDAY = [
  session('2026-11-17-0', '2026-11-17', '3:00 PM', { maxHandicap: 5 }),
  session('2026-11-17-1', '2026-11-17', '3:00 PM', { type: 'phil', capacity: 6, label: 'Fitness with Phil' }),
  session('2026-11-17-2', '2026-11-17', '4:00 PM'),
  session('2026-11-17-3', '2026-11-17', '5:00 PM', { maxHandicap: null }),
];
const FAMILY = [
  { id: 'jordan', name: 'Jordan Whitfield', householdId: 'h1', packageId: 't-6', handicap: 4 },
  { id: 'reese', name: 'Reese Whitfield', householdId: 'h1', packageId: 't-6', handicap: 27 },
  { id: 'nico', name: 'Nico Whitfield', householdId: 'h1', packageId: 't-6' },
];

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(NOW);
  calendar.todayISO.mockReturnValue(TODAY);
  live.isLive.mockReturnValue(true);
  live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1 });
  live.fetchPackage.mockResolvedValue(T6);
  live.fetchBookings.mockResolvedValue([]);
  live.fetchGraceTokensByAthlete.mockResolvedValue([]);
  live.fetchSessionsInRange.mockResolvedValue(TUESDAY);
  live.fetchSessionsByIds.mockResolvedValue([]);
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
  live.fetchHouseholdAthletes.mockResolvedValue(FAMILY);
};
const asAthlete = (athlete) => {
  live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', role: 'athlete', athleteId: athlete.id, email: 'kid@email.com' });
  live.fetchAthlete.mockResolvedValue(athlete);
};
const asStaff = (role = 'ops') => {
  live.fetchCurrentUser.mockResolvedValue({ uid: 'ops1', role, displayName: 'Luke' });
};

describe('Book a Session: a parent with several children', () => {
  test('the month rows and the booking slots carry maxHandicap - 5 on the reserved block, null on every open one', async () => {
    asParent();
    const month = await mountHook(() => useMonthSessions('2026-11'));
    const rows = month.result.current.data.days.find((d) => d.date === '2026-11-17').sessions;
    // Phil's 3 PM session is not a group block and is not on this list at all.
    expect(rows.map((r) => [r.id, r.time, r.maxHandicap])).toEqual([
      ['2026-11-17-0', '3:00 PM', 5],
      ['2026-11-17-2', '4:00 PM', null],
      ['2026-11-17-3', '5:00 PM', null],
    ]);
    expect(rows.map(reservedTag)).toEqual(['Handicap 5 or better', null, null]);
    await month.unmount();

    const booking = await mountHook(() => useBooking({ today: TODAY }));
    expect(booking.result.current.data.slots.map((s) => [s.id, s.maxHandicap])).toEqual([
      ['2026-11-17-0', 5],
      ['2026-11-17-2', null],
      ['2026-11-17-3', null],
    ]);
    await booking.unmount();
  });

  test('each child row carries the handicap on file, so each is judged separately - and no athlete doc is read again for it', async () => {
    asParent();
    const h = await mountHook(() => useHouseholdAthletes());
    expect(h.result.current.error).toBeNull();
    const rows = h.result.current.data;
    expect(rows.map((r) => [r.id, r.handicap])).toEqual([['jordan', 4], ['reese', 27], ['nico', null]]);
    expect(rows.map((r) => reservedEligible(TUESDAY[0], r))).toEqual([true, false, false]);
    expect(rows.map((r) => reservedEligible(TUESDAY[2], r))).toEqual([true, true, true]);
    expect(live.fetchAthlete).not.toHaveBeenCalled();
    await h.unmount();
  });
});

describe("Book a Session: the athlete's own login", () => {
  test('the membership row carries the handicap off the athlete doc already read', async () => {
    asAthlete({ ...FAMILY[0], handicap: 0 });
    const h = await mountHook(() => useMembership());
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.members).toHaveLength(1);
    expect(h.result.current.data.members[0]).toMatchObject({ athleteId: 'jordan', name: 'Jordan Whitfield', handicap: 0 });
    expect(live.fetchAthlete).toHaveBeenCalledTimes(1);
    await h.unmount();
  });

  test('none on file, or something that is not a whole number, reads as null', async () => {
    for (const handicap of [undefined, null, '4', 4.5]) {
      asAthlete({ ...FAMILY[0], handicap });
      const h = await mountHook(() => useMembership());
      expect(h.result.current.data.members[0].handicap).toBeNull();
      await h.unmount();
    }
  });
});

describe('staff surfaces that list sessions', () => {
  test("the coach's day: each block carries its handicap limit", async () => {
    asStaff('coach');
    live.fetchSessions.mockResolvedValue(TUESDAY);
    const h = await mountHook(() => useCoachDay());
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.blocks.map((b) => [b.sessionId, b.maxHandicap])).toEqual([
      ['2026-11-17-0', 5],
      ['2026-11-17-2', null],
      ['2026-11-17-3', null],
    ]);
    await h.unmount();
  });

  test("the coach's day: each block carries its session's date, whatever the id looks like (QA 2026-11-11)", async () => {
    asStaff('coach');
    live.fetchSessions.mockResolvedValue(TUESDAY.map((s, i) => ({ ...s, id: `qa-${i}` })));
    const h = await mountHook(() => useCoachDay());
    expect(h.result.current.data.blocks.map((b) => [b.sessionId, b.date])).toEqual([
      ['qa-0', '2026-11-17'],
      ['qa-2', '2026-11-17'],
      ['qa-3', '2026-11-17'],
    ]);
    await h.unmount();
  });

  test("the roster: the session's limit rides the read that already fetches its note and status", async () => {
    asStaff('coach');
    live.fetchBookingsBySession.mockResolvedValue([]);
    live.fetchSessionsByIds.mockResolvedValue([TUESDAY[0]]);
    const reserved = await mountHook(() => useSessionAttendance('2026-11-17-0'));
    expect(reserved.result.current.sessionMaxHandicap).toBe(5);
    expect(reserved.result.current.sessionStatus).toBe('scheduled');
    expect(live.fetchSessionsByIds).toHaveBeenCalledTimes(1);
    await reserved.unmount();

    live.fetchSessionsByIds.mockResolvedValue([TUESDAY[2]]);
    const open = await mountHook(() => useSessionAttendance('2026-11-17-2'));
    expect(open.result.current.sessionMaxHandicap).toBeNull();
    await open.unmount();
  });

  test("the roster: the session's seat count rides the same read, and a change to sessions re-reads it", async () => {
    // Walkthrough 2026-11-13: the header kept the count the tap carried.
    asStaff('owner');
    live.fetchBookingsBySession.mockResolvedValue([]);
    live.fetchSessionsByIds.mockResolvedValue([TUESDAY[2]]);
    const h = await mountHook(() => useSessionAttendance('2026-11-17-2'));
    expect(h.result.current.sessionBooked).toBe(3);
    expect(h.result.current.sessionCapacity).toBe(14);
    live.fetchSessionsByIds.mockResolvedValue([{ ...TUESDAY[2], booked: 4 }]);
    await act(async () => { bump('sessions'); });
    await flush();
    expect(h.result.current.sessionBooked).toBe(4);
    await h.unmount();
    // A missing doc, or a count that is not a number: null, never a guess.
    for (const docs of [[], [{ ...TUESDAY[2], booked: '4', capacity: undefined }]]) {
      live.fetchSessionsByIds.mockResolvedValue(docs);
      const gone = await mountHook(() => useSessionAttendance('2026-11-17-2'));
      expect(gone.result.current.sessionBooked).toBeNull();
      expect(gone.result.current.sessionCapacity).toBeNull();
      await gone.unmount();
    }
  });

  test("the admin dashboard: this week's reserved blocks are named beside the block fill, off the same week read", async () => {
    asStaff('owner');
    for (const fetch of [live.fetchAllAthletes, live.fetchPendingEnrollmentRequests, live.fetchNoShowBookingsSince,
      live.fetchContractLogsSince, adapter.fetchAllAssessmentWindows, live.fetchAllHouseholds]) fetch.mockResolvedValue([]);
    live.fetchSessionsInRange.mockResolvedValue([
      session('2026-11-10-0', '2026-11-10', '3:00 PM', { maxHandicap: 5, booked: 4 }),
      session('2026-11-10-1', '2026-11-10', '4:00 PM', { booked: 10 }),
      // A cancelled reserved block is not listed, like every other cancelled block.
      session('2026-11-12-0', '2026-11-12', '3:00 PM', { maxHandicap: 5, status: 'cancelled' }),
    ]);
    const h = await mountHook(() => useAdminDashboard());
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.reservedBlocks).toEqual([
      { sessionId: '2026-11-10-0', date: '2026-11-10', day: 'Tue', time: '3:00 PM', maxHandicap: 5, booked: 4, capacity: 14 },
    ]);
    expect(h.result.current.data.blockFill.find((b) => b.day === 'Tue')).toEqual({ day: 'Tue', pct: 50 });
    // One week read feeds the block fill and the reserved blocks; the only other read is the
    // four weeks the "Fitness with no golf" rows look at (owner 2026-11-13).
    expect(live.fetchSessionsInRange.mock.calls).toEqual([['2026-11-09', '2026-11-15'], ['2026-11-12', '2026-12-09']]);
    await h.unmount();
  });
});

// Review 2026-11-04 (the coach athlete-read fix): the roster's name join,
// the Calendly hold flag on the session read, and the assigned list's retry.
describe("the coach's rosters", () => {
  const fail = (code) => new live.LiveDataError(code, `fetchAthlete: ${code}`);
  const attendance = async (byId) => {
    asStaff('coach');
    live.fetchBookingsBySession.mockResolvedValue([
      { id: 'b1', athleteId: 'jordan', status: 'confirmed' },
      { id: 'b2', athleteId: 'reese', status: 'confirmed' },
    ]);
    live.fetchAthlete.mockImplementation(async (id) => {
      if (byId[id] instanceof Error) throw byId[id];
      return byId[id];
    });
    return mountHook(() => useSessionAttendance('2026-11-17-2'));
  };

  test('every athlete get refused: the refusal, so the screen names the owner', async () => {
    const h = await attendance({ jordan: fail(live.ERR.PERMISSION), reese: fail(live.ERR.PERMISSION) });
    expect(h.result.current.data).toBeNull();
    expect(h.result.current.error.code).toBe('permission-denied');
    await h.unmount();
  });

  test('every athlete get failed for another reason: a retryable error, never a sheet of nameless rows', async () => {
    const offline = await attendance({ jordan: fail(live.ERR.UNAVAILABLE), reese: fail(live.ERR.UNAVAILABLE) });
    expect(offline.result.current.data).toBeNull();
    expect(offline.result.current.error.code).toBe('unavailable');
    await offline.unmount();
    // A removed record beside a failed get is still a failed load.
    const mixed = await attendance({ jordan: fail(live.ERR.NOT_FOUND), reese: fail(live.ERR.UNAVAILABLE) });
    expect(mixed.result.current.error.code).toBe('unavailable');
    await mixed.unmount();
  });

  test('one get failed: that booking keeps its row with name null, the rest load', async () => {
    const h = await attendance({ jordan: FAMILY[0], reese: fail(live.ERR.UNAVAILABLE) });
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.map((r) => [r.bookingId, r.name])).toEqual([['b2', null], ['b1', 'Jordan Whitfield']]);
    await h.unmount();
  });

  test('removed athlete records alone are not a load failure (a retry cannot bring them back): the rows stay', async () => {
    const h = await attendance({ jordan: fail(live.ERR.NOT_FOUND), reese: fail(live.ERR.NOT_FOUND) });
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.map((r) => [r.bookingId, r.name])).toEqual([['b1', null], ['b2', null]]);
    await h.unmount();
  });

  // Staff booking (plan 04-plan-admin-booking.md Task E3): the booking fields
  // the roster's Move and Cancel sheets read, off the docs already fetched.
  test('the roster rows carry what the staff sheets read', async () => {
    asStaff('owner');
    const fields = { householdId: 'hh1', source: null, type: 'training', date: '2026-11-17', periodKey: '2026-11-01', chargedFrom: 'period', comp: true, graceTokenId: null };
    live.fetchBookingsBySession.mockResolvedValue([{ id: 'jordan_s2', athleteId: 'jordan', status: 'confirmed', ...fields }]);
    live.fetchAthlete.mockResolvedValue(FAMILY[0]);
    const h = await mountHook(() => useSessionAttendance('s2'));
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data).toHaveLength(1);
    expect(h.result.current.data[0]).toMatchObject({ bookingId: 'jordan_s2', athleteId: 'jordan', name: 'Jordan Whitfield', ...fields });
    await h.unmount();
  });

  test('a slot held for an unmatched Calendly booking reads as unresolved; any other session, a missing doc or a value that is not true does not', async () => {
    asStaff('owner');
    live.fetchBookingsBySession.mockResolvedValue([]);
    const cal = (over) => session('cal-1', '2026-11-17', '7:00 PM', { type: 'mental', booked: 1, capacity: 1, bookable: false, ...over });
    for (const [docs, expected] of [[[cal({ unresolved: true })], true], [[cal({})], false], [[cal({ unresolved: 'true' })], false], [[], false]]) {
      live.fetchSessionsByIds.mockResolvedValue(docs);
      const h = await mountHook(() => useSessionAttendance('cal-1'));
      expect(h.result.current.sessionUnresolved).toBe(expected);
      await h.unmount();
    }
  });

  test("the coach's assigned list: retry re-reads it after a failed load", async () => {
    asStaff('coach');
    live.fetchCoachAthletes
      .mockRejectedValueOnce(new live.LiveDataError(live.ERR.UNAVAILABLE, 'fetchCoachAthletes: offline'))
      .mockResolvedValue([{ id: 'jordan', name: 'Jordan Whitfield' }]);
    const h = await mountHook(() => useCoachRoster());
    expect(h.result.current.error.code).toBe('unavailable');
    await act(async () => { h.result.current.retry(); });
    await flush();
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.map((a) => a.name)).toEqual(['Jordan Whitfield']);
    expect(live.fetchCoachAthletes).toHaveBeenCalledTimes(2);
    await h.unmount();
  });
});

describe('seed (demo) mode is as it was', () => {
  beforeEach(() => {
    live.isLive.mockReturnValue(false);
  });

  test('the seed season has no reserved block; the seed family carries the three handicap cases', async () => {
    const month = await mountHook(() => useMonthSessions('2026-11'));
    const rows = month.result.current.data.days.flatMap((d) => d.sessions);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.maxHandicap === null)).toBe(true);
    await month.unmount();

    const family = await mountHook(() => useHouseholdAthletes());
    expect(family.result.current.data.map((r) => [r.id, r.handicap])).toEqual([['jordan', 4], ['reese', 27], ['nico', null]]);
    await family.unmount();

    const members = await mountHook(() => useMembership());
    expect(members.result.current.data.members.map((m) => [m.athleteId, m.handicap])).toEqual([['jordan', 4], ['reese', 27], ['nico', null]]);
    await members.unmount();

    const admin = await mountHook(() => useAdminDashboard());
    expect(admin.result.current.data.reservedBlocks).toEqual([]);
    await admin.unmount();
    expect(live.fetchSessionsInRange).not.toHaveBeenCalled();
  });

  test('the staff handicap write is on the hooks seam, and is a local echo here', async () => {
    await expect(hooks.setAthleteHandicap({ athleteId: 'jordan', handicap: 3 })).resolves.toEqual({ athleteId: 'jordan', handicap: 3, simulated: true });
  });
});
