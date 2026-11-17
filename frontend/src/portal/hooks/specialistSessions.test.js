/**
 * A specialist's own day (useSpecialistSessions, speed review F1,
 * 2026-11-17). Phil's view ran one bookings query per upcoming slot (256 in
 * production) after the sessions read, then one athlete read per booking per
 * session: 3 rounds, about 360 requests. Now the sessions range and ONE
 * bookings-by-type query run together, then one deduped athlete join.
 *
 * `legacy` below is the per-session code this replaced, run on the same
 * fixture, so the rows are proved identical, not just similar.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));
// CRA's resetMocks clears these before every test; beforeEach sets them.
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchAthletesByIds: jest.fn(),
  fetchBookingsBySession: jest.fn(),
  fetchSessionsInRange: jest.fn(),
}));
jest.mock('./specialistLive', () => ({ __esModule: true, fetchBookingsByType: jest.fn() }));
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useSpecialistSessions } from './index';
import * as live from './live';
import * as specialistLive from './specialistLive';
import * as calendar from '../data/calendar';
import { dayLabel } from '../data/season';
import { DEFAULT_DURATION_MINUTES } from '../data/schedule';
import { isHiddenSession } from '../data/hiddenSessions';
import { SPECIALISTS } from '../data/specialists';

// Wed Nov 11 2026, 9 AM in Chicago.
const NOW = new Date('2026-11-11T15:00:00Z');
const TODAY = '2026-11-11';

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

const session = (id, date, time, type, over = {}) => ({ id, date, time, type, status: 'scheduled', capacity: 6, booked: 0, ...over });
const SESSIONS = [
  session('p1', '2026-11-12', '4:00 PM', 'phil', { booked: 2 }),
  session('p3', '2026-11-12', '5:00 PM', 'phil'),
  session('p2', '2026-11-13', '4:00 PM', 'phil', { booked: 1 }),
  // Hidden and empty: left out. Hidden with a seat: kept, so its roster opens.
  session('p4', '2026-11-14', '6:00 PM', 'phil', { hidden: true }),
  session('p5', '2026-11-14', '7:00 PM', 'phil', { hidden: true, booked: 1 }),
  session('p6', '2026-11-16', '4:00 PM', 'phil', { status: 'cancelled' }),
  // No capacity or length on the doc: the defaults fill in.
  session('p7', '2026-11-16', '5:00 PM', 'phil', { booked: 1, capacity: undefined, durationMinutes: 60 }),
  // Re-typed by the calendar sync after a family booked it as training.
  session('p8', '2026-11-17', '4:00 PM', 'phil', { booked: 1 }),
  session('t1', '2026-11-12', '4:00 PM', 'training', { booked: 1, capacity: 15 }),
  session('m1', '2026-11-12', '7:00 PM', 'mental', { booked: 1, capacity: 1 }),
  // A Calendly 1:1 the webhook could not place: held, no booking.
  session('cal-held', '2026-11-13', '7:00 PM', 'mental', { booked: 1, capacity: 1, unresolved: true, source: 'calendly' }),
];
const booking = (athleteId, sessionId, type, status, over = {}) => ({ id: `${athleteId}_${sessionId}`, athleteId, sessionId, type, status, householdId: 'h1', ...over });
const BOOKINGS = [
  booking('jordan', 'p1', 'phil', 'confirmed'),
  booking('reese', 'p1', 'phil', 'attended'),
  booking('sage', 'p1', 'phil', 'cancelled'),
  booking('jordan', 'p2', 'phil', 'noshow'),
  booking('nico', 'p5', 'phil', 'confirmed'),
  // An athlete the caller cannot read: the row keeps the seat with no name.
  booking('ghost', 'p7', 'phil', 'confirmed'),
  booking('kai', 'p8', 'training', 'confirmed'),
  // Before today: not on the day view.
  booking('jordan', 'p-past', 'phil', 'attended'),
  booking('jordan', 't1', 'training', 'confirmed'),
  booking('reese', 'm1', 'mental', 'confirmed', { attendee: 'parent' }),
];
const NAMES = { jordan: 'Jordan Whitfield', reese: 'Reese Whitfield', sage: 'Sage Parker', nico: 'Nico Whitfield', kai: 'Kai Moreno' };
const SEATED = ['confirmed', 'attended', 'noshow'];

function wireReads() {
  live.fetchSessionsInRange.mockResolvedValue(SESSIONS);
  specialistLive.fetchBookingsByType.mockImplementation(async (type) => BOOKINGS.filter((b) => b.type === type));
  live.fetchBookingsBySession.mockImplementation(async (id) => BOOKINGS.filter((b) => b.sessionId === id && SEATED.includes(b.status)));
  live.fetchAthletesByIds.mockImplementation(async (ids) => [...new Set(ids)].filter((id) => NAMES[id]).map((id) => ({ id, name: NAMES[id] })));
}

/** The code this replaced (hooks/index.js before 2026-11-17), verbatim but for the imports. */
const SPECIALIST_BY_ID = new Map(SPECIALISTS.map((sp) => [sp.id, sp]));
const byDateThenId = (a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1);
async function legacy(specialistId, today) {
  const sessions = await live.fetchSessionsInRange(today, 'any');
  const mine = sessions
    .filter((s) => s.type === specialistId && s.status !== 'cancelled' && (!isHiddenSession(s) || Number(s.booked ?? 0) > 0))
    .sort(byDateThenId);
  const withRosters = await Promise.all(
    mine.map(async (s) => {
      const bookings = await live.fetchBookingsBySession(s.id);
      const active = bookings.filter((b) => b.status !== 'cancelled');
      const athletes = await live.fetchAthletesByIds(active.map((b) => b.athleteId));
      const nameById = new Map(athletes.map((a) => [a.id, a.name]));
      const unresolved = active.length === 0 && s.unresolved === true;
      return {
        sessionId: s.id,
        date: s.date,
        dayLabel: dayLabel(s.date, today),
        time: s.time,
        booked: unresolved ? 1 : active.length,
        capacity: s.capacity ?? 1,
        unresolved,
        type: s.type,
        durationMinutes: s.durationMinutes ?? (SPECIALIST_BY_ID.get(s.type)?.durationMinutes ?? DEFAULT_DURATION_MINUTES),
        athletes: active.map((b) => ({ athleteId: b.athleteId, name: nameById.get(b.athleteId) ?? null, attendee: b.attendee ?? 'athlete' })),
      };
    })
  );
  return { sessions: withRosters };
}

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(NOW);
  calendar.todayISO.mockReturnValue(TODAY);
  live.isLive.mockReturnValue(true);
  wireReads();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("Phil's day", () => {
  test('the rows are exactly what the per-session reads built', async () => {
    const h = await mountHook(() => useSpecialistSessions('phil'));
    expect(h.result.current.error).toBeNull();
    const rows = h.result.current.data;
    await h.unmount();
    expect(rows).toEqual(await legacy('phil', TODAY));
    // And what that is, so a fixture slip cannot make both sides agree on nothing.
    expect(rows.sessions.map((s) => [s.sessionId, s.booked, s.athletes.map((a) => a.name ?? a.athleteId)])).toEqual([
      ['p1', 2, ['Jordan Whitfield', 'Reese Whitfield']],
      ['p3', 0, []],
      ['p2', 1, ['Jordan Whitfield']],
      ['p5', 1, ['Nico Whitfield']],
      ['p7', 1, ['ghost']],
      ['p8', 1, ['Kai Moreno']],
    ]);
    expect(rows.sessions.find((s) => s.sessionId === 'p7')).toMatchObject({ capacity: 1, durationMinutes: 60, athletes: [{ athleteId: 'ghost', name: null, attendee: 'athlete' }] });
  });

  test('two reads, not one per slot: the sessions range and one bookings query by type, then one athlete join', async () => {
    const h = await mountHook(() => useSpecialistSessions('phil'));
    expect(live.fetchSessionsInRange).toHaveBeenCalledTimes(1);
    expect(live.fetchSessionsInRange).toHaveBeenCalledWith(TODAY, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(specialistLive.fetchBookingsByType).toHaveBeenCalledTimes(1);
    expect(specialistLive.fetchBookingsByType).toHaveBeenCalledWith('phil');
    // Only the re-typed slot, whose seat counter says more than the type query found, is read by id.
    expect(live.fetchBookingsBySession.mock.calls).toEqual([['p8']]);
    expect(live.fetchAthletesByIds).toHaveBeenCalledTimes(1);
    // Deduped, seated bookings on the day's own slots only: no cancelled seat, no past or other-type booking.
    expect([...live.fetchAthletesByIds.mock.calls[0][0]].sort()).toEqual(['ghost', 'jordan', 'kai', 'nico', 'reese']);
    await h.unmount();
  });

  test('the bookings query starts with the sessions read, not after it', async () => {
    let release;
    live.fetchSessionsInRange.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const h = await mountHook(() => useSpecialistSessions('phil'));
    expect(h.result.current.loading).toBe(true);
    expect(specialistLive.fetchBookingsByType).toHaveBeenCalledWith('phil');
    await act(async () => { release(SESSIONS); });
    await flush();
    expect(h.result.current.data.sessions).toHaveLength(6);
    await h.unmount();
  });

  test('a refused bookings read is the screen error, as before', async () => {
    specialistLive.fetchBookingsByType.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const h = await mountHook(() => useSpecialistSessions('phil'));
    expect(h.result.current.data).toBeNull();
    expect(h.result.current.error).toMatchObject({ code: 'permission-denied' });
    await h.unmount();
  });
});

describe("Yannick's day", () => {
  test('mental bookings by type; the held Calendly slot is 1/1 and unresolved and is not read by id', async () => {
    const h = await mountHook(() => useSpecialistSessions('mental'));
    expect(h.result.current.error).toBeNull();
    const rows = h.result.current.data;
    await h.unmount();
    expect(specialistLive.fetchBookingsByType).toHaveBeenCalledWith('mental');
    expect(live.fetchBookingsBySession).not.toHaveBeenCalled();
    expect(rows.sessions.map((s) => [s.sessionId, s.booked, s.capacity, s.unresolved, s.athletes])).toEqual([
      ['m1', 1, 1, false, [{ athleteId: 'reese', name: 'Reese Whitfield', attendee: 'parent' }]],
      ['cal-held', 1, 1, true, []],
    ]);
    expect(rows).toEqual(await legacy('mental', TODAY));
  });
});
