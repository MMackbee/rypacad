/**
 * K04 (Sprint 20, spec 6.1): Yannick's monthly cadence is judged for the
 * SLOT's month, not today's. The rest of hooks/index.js is exercised in the
 * emulator; Firebase is mocked out here.
 *
 * Perf wave B: the live loaders that now read in parallel (liveAthleteDetail,
 * liveBooking and its identity-only path, liveMonthSessions' waitlist join)
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
import { coachingFor, seedSpecialistDays, useAthleteDetail, useBooking, useMonthSessions, useSpecialistSlots } from './index';
import * as live from './live';
import * as signups from './signups';
import * as waitlist from './waitlist';
import { BOOKING_CONFIRMATION } from '../data/seed';
import { addDaysISO } from '../data/calendar';
import { loginStateFor } from '../data/signups';
import { parseISO } from 'date-fns';

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
      // The contract is hidden in tests (no REACT_APP_CONTRACT_ENABLED): the tier part is dropped at the source.
      subline: '12 tokens package',
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

  test('useBooking({ withSlots: false }) as an athlete: identity only, no sessions or package chain', async () => {
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', athleteId: 'a1', email: 'jordan@email.com' });
    live.fetchAthlete.mockResolvedValue({ id: 'a1', householdId: 'h1', packageId: 't-12' });
    live.createBooking.mockResolvedValue({ status: 'confirmed' });

    const h = await mountHook(() => useBooking({ withSlots: false }));
    await settle();
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data).toEqual({
      dates: [],
      slots: [],
      tokens: null,
      seasonNote: null,
      confirmation: { ...BOOKING_CONFIRMATION, email: 'jordan@email.com' },
    });
    expect(h.result.current.bookingFor).toBe('athlete');
    expect(live.fetchAthlete).toHaveBeenCalledTimes(1);
    expect(live.fetchSessionsInRange).not.toHaveBeenCalled();
    expect(live.fetchPackage).not.toHaveBeenCalled();
    expect(live.fetchBookings).not.toHaveBeenCalled();
    expect(live.fetchHousehold).not.toHaveBeenCalled();

    await act(async () => {
      await h.result.current.book({ id: 'phil_1', date: '2099-01-06', type: 'phil' });
    });
    expect(live.createBooking).toHaveBeenCalledWith({
      athleteId: 'a1', sessionId: 'phil_1', date: '2099-01-06', type: 'phil', householdId: 'h1', attendee: undefined,
    });
    // A single tap stamps no createdVia: its booking-confirmed notice still goes.
    expect(live.createBooking.mock.calls[0]).toHaveLength(1);
    await h.unmount();
  });

  test('useBooking({ withSlots: false }) as a parent: one users read, book() takes the chosen child', async () => {
    live.fetchCurrentUser.mockResolvedValue({ uid: 'p1', householdId: 'h1', email: 'dana@email.com' });
    live.createBooking.mockResolvedValue({ status: 'confirmed' });

    const h = await mountHook(() => useBooking({ withSlots: false }));
    await settle();
    expect(h.result.current.bookingFor).toBe('parent');
    expect(live.fetchAthlete).not.toHaveBeenCalled();
    expect(live.fetchSessionsInRange).not.toHaveBeenCalled();

    await act(async () => {
      await h.result.current.book({ id: 'mental_1', date: '2099-01-06', type: 'mental' }, { athleteId: 'a2' });
    });
    expect(live.createBooking).toHaveBeenCalledWith({
      athleteId: 'a2', sessionId: 'mental_1', date: '2099-01-06', type: 'mental', householdId: 'h1', attendee: undefined,
    });
    expect(live.createBooking.mock.calls[0]).toHaveLength(1);
    await h.unmount();
  });

  test('useBooking() as an athlete: athlete + bookings together, then package + household, then the sessions window', async () => {
    const athleteGate = deferred();
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', athleteId: 'a1', email: 'jordan@email.com' });
    live.fetchAthlete.mockReturnValue(athleteGate.promise);
    live.fetchBookings.mockResolvedValue([]);
    live.fetchPackage.mockResolvedValue({ id: 't-12', name: '12 tokens', kind: 'tokens', tokens: 12 });
    live.fetchHousehold.mockResolvedValue({ id: 'h1', periodAnchorDay: 1 });
    live.fetchSessionsInRange.mockResolvedValue([]);

    const h = await mountHook(() => useBooking());
    await settle();
    expect(live.fetchBookings).toHaveBeenCalledWith('a1');
    expect(live.fetchPackage).not.toHaveBeenCalled();

    await act(async () => {
      athleteGate.resolve({ id: 'a1', householdId: 'h1', packageId: 't-12' });
    });
    await settle();
    expect(live.fetchPackage).toHaveBeenCalledWith('t-12');
    expect(live.fetchHousehold).toHaveBeenCalledWith('h1');
    expect(live.fetchSessionsInRange).toHaveBeenCalledTimes(1);
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.bookingFor).toBe('athlete');
    expect(h.result.current.data).toMatchObject({ dates: [], slots: [], seasonNote: null });
    await h.unmount();
  });

  describe('bookRecurring: the window, every single-booking check, a reason per week (repeat report 2026-09-30)', () => {
    const OCT_1 = new Date('2026-10-01T17:00:00Z'); // noon Chicago
    const ELITE_PKG = { id: 'elite', kind: 'elite', tokens: null, windowDays: 45 };
    const tuesday = (date) => ({ id: `t_${date}`, date, time: '4:00 PM', type: 'training', status: 'scheduled', capacity: 8, booked: 0 });
    /** Every Tuesday 4 PM block in [from, to] - the range query's answer. */
    const tuesdaysIn = async (from, to) => {
      const out = [];
      for (let d = from; d <= to; d = addDaysISO(d, 1)) if (parseISO(d).getDay() === 2) out.push(tuesday(d));
      return out;
    };
    const refusal = (reason, message, code = live.ERR.INVALID) => new live.LiveDataError(code, message, null, reason);
    // Fake timers freeze setTimeout, so settle() cannot run; act() drains the promises.
    const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => {}); };
    async function mountAthlete(pkg = ELITE_PKG, now = OCT_1) {
      jest.useFakeTimers('modern');
      jest.setSystemTime(now);
      live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', athleteId: 'a1', email: 'jordan@email.com' });
      live.fetchAthlete.mockResolvedValue({ id: 'a1', householdId: 'h1', packageId: pkg.id });
      live.fetchBookings.mockResolvedValue([]);
      live.fetchPackage.mockResolvedValue(pkg);
      live.fetchHousehold.mockResolvedValue({ id: 'h1', periodAnchorDay: 1 });
      live.fetchSessionsInRange.mockImplementation(tuesdaysIn);
      live.createBooking.mockImplementation(async ({ sessionId }) => ({ id: `a1_${sessionId}`, status: 'confirmed', chargedFrom: 'elite' }));
      const h = await mountHook(() => useBooking());
      await flush();
      return h;
    }
    async function repeat(h, date, untilISO) {
      let out;
      await act(async () => { out = await h.result.current.bookRecurring(tuesday(date), { untilISO }); });
      return out;
    }
    afterEach(() => { jest.useRealTimers(); });

    test('Elite on Oct 1: the fetch and the repeat reach Dec 16; every week goes through createBooking without skipCapCheck', async () => {
      const h = await mountAthlete();
      expect(live.fetchSessionsInRange).toHaveBeenCalledWith('2026-10-01', '2026-12-16');
      const out = await repeat(h, '2026-11-03', '2026-12-16');
      expect(out.windowEnd).toBe('2026-12-16');
      expect(out.booked.map((b) => b.date)).toEqual(['2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01', '2026-12-08', '2026-12-15']);
      expect(out.skipped).toEqual([]);
      expect(out.next).toEqual({ date: '2026-12-22', opensOn: '2026-11-07' });
      // The repeat's own range read (the one bump after the loop re-runs the window fetch too).
      expect(live.fetchSessionsInRange).toHaveBeenCalledWith('2026-11-10', '2026-12-16');
      expect(live.createBooking).toHaveBeenCalledTimes(6);
      // Repeat copies are stamped so the server sends no notice per week (owner report 2026-09-30).
      for (const [, opts] of live.createBooking.mock.calls) expect(opts).toEqual({ silent: true, createdVia: 'repeat' });
      await h.unmount();
    });

    test('a Dec 15 booking on Oct 1 attempts nothing, even asked for the season, and names the next week', async () => {
      const h = await mountAthlete();
      live.fetchSessionsInRange.mockClear();
      expect(await repeat(h, '2026-12-15', '2027-02-27')).toEqual({
        booked: [], skipped: [], windowEnd: '2026-12-16', next: { date: '2026-12-22', opensOn: '2026-11-07' },
      });
      expect(live.createBooking).not.toHaveBeenCalled();
      expect(live.fetchSessionsInRange).not.toHaveBeenCalled();
      await h.unmount();
    });

    test('after Nov 1 the window rolls at 7 AM Chicago (13:00Z in CST)', async () => {
      const h = await mountAthlete(ELITE_PKG, new Date('2026-11-10T12:59:00Z'));
      const early = await repeat(h, '2026-12-15', '2026-12-31');
      expect(early.windowEnd).toBe('2026-12-24');
      expect(early.booked.map((b) => b.date)).toEqual(['2026-12-22']);
      // Dec 29 is the Christmas break (a 10:30 tournament, no 4 PM block): the next week is Jan 5.
      expect(early.next).toEqual({ date: '2027-01-05', opensOn: '2026-11-21' });
      jest.setSystemTime(new Date('2026-11-10T13:00:00Z'));
      expect((await repeat(h, '2026-12-15', '2026-12-31')).windowEnd).toBe('2026-12-25');
      await h.unmount();
    });

    test('a Wednesday on Oct 1: next steps over the Dec 23 and Dec 30 closures to Jan 6', async () => {
      const h = await mountAthlete();
      // Every Wednesday 4 PM block but Thanksgiving's (Nov 25 is closed).
      live.fetchSessionsInRange.mockImplementation(async (from, to) => {
        const out = [];
        for (let d = from; d <= to; d = addDaysISO(d, 1)) if (parseISO(d).getDay() === 3 && d !== '2026-11-25') out.push(tuesday(d));
        return out;
      });
      const out = await repeat(h, '2026-11-04', '2026-12-16');
      expect(out.booked.map((b) => b.date)).toEqual(['2026-11-11', '2026-11-18', '2026-12-02', '2026-12-09', '2026-12-16']);
      expect(out.skipped).toEqual([{ date: '2026-11-25', reason: 'no session' }]);
      expect(out.next).toEqual({ date: '2027-01-06', opensOn: '2026-11-22' });
      await h.unmount();
    });

    test("createBooking's refusals keep their own reasons - never lumped into 'full'", async () => {
      const h = await mountAthlete();
      live.createBooking
        .mockRejectedValueOnce(refusal('one-per-day', "Elite includes one training block a day, and there's already one booked that day."))
        .mockRejectedValueOnce(refusal('no-tokens-left', "This period's tokens are already fully booked (12 of 12)."))
        .mockRejectedValueOnce(refusal(null, 'Missing or insufficient permissions.', live.ERR.PERMISSION))
        .mockRejectedValueOnce(refusal('outside-window', 'That date opens for booking at 7 AM on 2026-10-17.'))
        .mockRejectedValueOnce(refusal(null, 'This athlete already has this session booked.'))
        .mockResolvedValueOnce({ status: 'waitlisted' });
      const out = await repeat(h, '2026-11-03', '2026-12-16');
      expect(out.booked).toEqual([]);
      expect(out.skipped).toEqual([
        { date: '2026-11-10', reason: 'one per day' },
        { date: '2026-11-17', reason: 'period limit' },
        { date: '2026-11-24', reason: 'error', message: 'Missing or insufficient permissions.' },
        { date: '2026-12-01', reason: 'not open yet', opensOn: '2026-10-17' },
        { date: '2026-12-08', reason: 'already booked' },
        { date: '2026-12-15', reason: 'full' },
      ]);
      await h.unmount();
    });

    test('a family-wide refusal (membership paused) stops the loop and rethrows', async () => {
      const h = await mountAthlete();
      live.createBooking
        .mockResolvedValueOnce({ status: 'confirmed', chargedFrom: 'elite' })
        .mockRejectedValueOnce(refusal('membership-inactive', "This household's membership is not active right now."));
      let caught = null;
      await act(async () => {
        await h.result.current.bookRecurring(tuesday('2026-11-03'), { untilISO: '2026-12-16' }).catch((e) => { caught = e; });
      });
      expect(caught?.reason).toBe('membership-inactive');
      expect(live.createBooking).toHaveBeenCalledTimes(2);
      await h.unmount();
    });

    test('held and full sessions and missing weeks skip without an attempt', async () => {
      const h = await mountAthlete();
      live.fetchBookings.mockResolvedValue([
        { sessionId: 't_2026-11-10', status: 'confirmed' },
        { sessionId: 't_2026-11-17', status: 'cancelled' }, // a cancelled row re-books
      ]);
      live.fetchSessionsInRange.mockImplementation(async (from, to) =>
        (await tuesdaysIn(from, to)).filter((s) => s.date !== '2026-12-01').map((s) => (s.date === '2026-11-24' ? { ...s, booked: 8 } : s))
      );
      const out = await repeat(h, '2026-11-03', '2026-12-16');
      expect(out.skipped).toEqual([
        { date: '2026-11-10', reason: 'already booked' },
        { date: '2026-11-24', reason: 'full' },
        { date: '2026-12-01', reason: 'no session' },
      ]);
      expect(out.booked.map((b) => b.date)).toEqual(['2026-11-17', '2026-12-08', '2026-12-15']);
      expect(live.createBooking.mock.calls.map(([b]) => b.date)).toEqual(['2026-11-17', '2026-12-08', '2026-12-15']);
      await h.unmount();
    });
  });

  test("liveMonthSessions: sessions and identity together; every waitlisted row's queue fetched and annotated", async () => {
    const sessionsGate = deferred();
    live.fetchSessionsInRange.mockReturnValue(sessionsGate.promise);
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', athleteId: 'a1' });
    waitlist.fetchWaitlistByAthlete.mockResolvedValue([
      { sessionId: 's1', athleteId: 'a1' },
      { sessionId: 's3', athleteId: 'a1' },
    ]);
    waitlist.fetchWaitlistBySession.mockImplementation(async (id) =>
      id === 's1' ? [{ athleteId: 'x' }, { athleteId: 'a1' }] : [{ athleteId: 'y' }]
    );

    const h = await mountHook(() => useMonthSessions('2099-01'));
    await settle();
    // The identity read went out while the range read is still in flight.
    expect(live.fetchCurrentUser).toHaveBeenCalledTimes(1);

    const session = (id, date) => ({ id, date, time: '4:00 PM', type: 'training', status: 'scheduled', capacity: 8, booked: 8 });
    await act(async () => {
      sessionsGate.resolve([session('s1', '2099-01-06'), session('s2', '2099-01-06'), session('s3', '2099-01-07')]);
    });
    await settle();
    expect(waitlist.fetchWaitlistByAthlete).toHaveBeenCalledWith('a1');
    expect(waitlist.fetchWaitlistBySession.mock.calls.map((c) => c[0]).sort()).toEqual(['s1', 's3']);
    const rows = h.result.current.data.days.flatMap((d) => d.sessions);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.s1).toMatchObject({ waitlisted: true, waitlistPosition: 2 });
    expect(byId.s2.waitlisted).toBeUndefined();
    expect(byId.s3).toMatchObject({ waitlisted: true, waitlistPosition: null });
    await h.unmount();
  });

  test('liveMonthSessions: ONE read over the whole grid (+ the marks lookahead); dayMarks judge every session type', async () => {
    live.fetchCurrentUser.mockResolvedValue({ uid: 'c1', role: 'coach' }); // staff: no waitlist join
    const s = (id, date, type, status = 'scheduled') => ({ id, date, time: '4:00 PM', type, status, capacity: 8, booked: 0 });
    live.fetchSessionsInRange.mockResolvedValue([
      s('t1', '2026-11-07', 'tournament'),
      s('p1', '2026-11-09', 'phil'),
      s('m1', '2026-11-10', 'mental'),
      s('x1', '2026-11-11', 'training', 'cancelled'),
      s('a1', '2026-11-12', 'training'),
      s('d1', '2026-12-02', 'training'),
      s('l1', '2026-12-07', 'training'), // the lookahead week
    ]);
    const h = await mountHook(() => useMonthSessions('2026-11'));
    await settle();
    expect(live.fetchSessionsInRange).toHaveBeenCalledTimes(1);
    expect(live.fetchSessionsInRange).toHaveBeenCalledWith('2026-10-26', '2026-12-13');
    const { days, dayMarks } = h.result.current.data;
    // The boundary week's Dec 2 rides the same read; specialist rows still never reach the group calendar,
    // and neither do the lookahead's rows.
    expect(days.map((d) => d.date)).toEqual(['2026-11-07', '2026-11-12', '2026-12-02']);
    expect(dayMarks['2026-11-07']).toBe('tournament');
    expect(dayMarks['2026-11-09']).toBeUndefined(); // Phil only: not closed
    expect(dayMarks['2026-11-10']).toBeUndefined(); // Yannick only: not closed
    expect(dayMarks['2026-11-11']).toBe('closed'); // its one session was cancelled
    expect(dayMarks['2026-11-12']).toBeUndefined();
    expect(dayMarks['2026-11-08']).toBe('closed');
    expect(dayMarks['2026-12-06']).toBe('closed'); // the grid's last day: the lookahead's Dec 7 proves it synced
    expect(dayMarks['2026-12-07']).toBeUndefined(); // past the grid
    expect(dayMarks['2026-11-02']).toBeUndefined(); // set-up day, before the season
    expect(dayMarks['2026-10-30']).toBeUndefined();
    await h.unmount();
  });

  test('liveMonthSessions: nothing is "Academy closed" past the sync horizon, or before the first sync', async () => {
    live.fetchCurrentUser.mockResolvedValue({ uid: 'c1', role: 'coach' });
    const s = (id, date) => ({ id, date, time: '4:00 PM', type: 'training', status: 'scheduled', capacity: 8, booked: 0 });
    // January, with the 90-day sync run on Oct 14: sessions only through Jan 12.
    live.fetchSessionsInRange.mockResolvedValue([s('a', '2027-01-04'), s('b', '2027-01-12')]);
    const jan = await mountHook(() => useMonthSessions('2027-01'));
    await settle();
    expect(live.fetchSessionsInRange).toHaveBeenLastCalledWith('2026-12-28', '2027-02-07');
    const marks = jan.result.current.data.dayMarks;
    expect(marks['2027-01-03']).toBe('closed'); // the Christmas break, inside the horizon
    expect(marks['2027-01-10']).toBe('closed');
    expect(Object.keys(marks).filter((iso) => iso > '2027-01-12')).toEqual([]);
    await jan.unmount();

    live.fetchSessionsInRange.mockResolvedValue([]);
    const nov = await mountHook(() => useMonthSessions('2026-11'));
    await settle();
    expect(nov.result.current.data.dayMarks).toEqual({});
    expect(nov.result.current.data.days).toEqual([]);
    await nov.unmount();
  });

  test('liveSpecialistDays: each day carries a mark judged on every type the one read returned', async () => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-11-04T15:00:00Z'));
    const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => {}); };
    try {
      live.fetchCurrentUser.mockResolvedValue({ uid: 'p1' }); // a parent with no child picked
      const s = (id, date, type) => ({ id, date, time: '3:00 PM', type, status: 'scheduled', capacity: 6, booked: 0 });
      live.fetchSessionsInRange.mockResolvedValue([
        s('a', '2026-11-04', 'training'),
        s('b', '2026-11-05', 'training'),
        s('c', '2026-11-06', 'phil'),
        s('d', '2026-11-07', 'tournament'),
        s('e', '2026-11-09', 'phil'),
        s('f', '2026-11-12', 'training'), // the latest date the read holds
      ]);
      const h = await mountHook(() => useSpecialistSlots('phil'));
      await flush();
      expect(h.result.current.error).toBeNull();
      expect(live.fetchSessionsInRange).toHaveBeenCalledTimes(1);
      const { days } = h.result.current.data;
      // One read: the window plus the marks lookahead; the days themselves stop at the window.
      expect(live.fetchSessionsInRange).toHaveBeenCalledWith('2026-11-04', addDaysISO(days[days.length - 1].date, 7));
      const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
      expect(byDate['2026-11-04'].mark).toBeNull();
      expect(byDate['2026-11-07'].mark).toBe('tournament');
      expect(byDate['2026-11-07'].slots).toEqual([]); // the tournament is not Phil's slot
      expect(byDate['2026-11-08'].mark).toBe('closed');
      expect(byDate['2026-11-09'].mark).toBeNull();
      expect(byDate['2026-11-09'].slots.map((x) => x.sessionId)).toEqual(['e']);
      expect(byDate['2026-11-10'].mark).toBe('closed');
      // Past Nov 12 the read holds nothing: not synced yet, so never "Academy closed".
      expect(byDate['2026-11-13'].mark).toBeNull();
      expect(byDate['2026-11-15'].mark).toBeNull();
      await h.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});

test('seed useMonthSessions: the whole grid, marked from the generated season', async () => {
  const h = await mountHook(() => useMonthSessions('2026-11'));
  const { days, dayMarks } = h.result.current.data;
  expect(days[0].date).toBe('2026-11-03'); // the season's first day
  expect(days[days.length - 1].date).toBe('2026-12-05'); // December's first Saturday, in the grid
  expect(dayMarks['2026-11-07']).toBe('tournament'); // every Saturday runs the 10-12 tournament
  expect(dayMarks['2026-11-08']).toBe('closed'); // no Sunday blocks
  expect(dayMarks['2026-11-26']).toBe('closed'); // Thanksgiving
  expect(dayMarks['2026-11-27']).toBe('tournament'); // the Post-Thanksgiving tournament wins
  expect(dayMarks['2026-11-03']).toBeUndefined();
  expect(dayMarks['2026-11-02']).toBeUndefined();
  expect(dayMarks['2026-12-06']).toBe('closed');
  await h.unmount();
});
