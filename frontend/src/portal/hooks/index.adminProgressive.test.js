/**
 * The Admin dashboard, card by card (speed review F6, 2026-11-17). Its eight
 * reads ran in one Promise.all, so no card painted until the slowest landed.
 * They now run as three groups, each its own resource:
 *   roster - athletes + households: enrollment, membership, enrolled count
 *   week   - this week's sessions: block fill, reserved blocks (+ the fill stat)
 *   calls  - enrollments, no-shows, contract logs, assessment windows, the
 *            four-week sessions: with the roster, the Outstanding rows
 * and each card's group says whether it is still loading or failed. Once all
 * three land, the payload is exactly the one-shot payload (GOLDEN below was
 * captured from the code before the split, on this fixture).
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
  fetchAllAthletes: jest.fn(),
  fetchAllHouseholds: jest.fn(),
  fetchContractLogsSince: jest.fn(),
  fetchNoShowBookingsSince: jest.fn(),
  fetchPendingEnrollmentRequests: jest.fn(),
  fetchSessionsInRange: jest.fn(),
}));
jest.mock('./assessmentsLive', () => ({ ...jest.requireActual('./assessmentsLive'), __esModule: true, fetchAllAssessmentWindows: jest.fn() }));
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as live from './live';
import * as adapter from './assessmentsLive';
import * as calendar from '../data/calendar';
import { bump } from './invalidate';
import { useAdminDashboard } from './index';

// Thu Nov 12 2026, 10 AM in Chicago.
const NOW = new Date('2026-11-12T16:00:00Z');
const TODAY = '2026-11-12';
const WEEK = ['2026-11-09', '2026-11-15'];
const FITNESS = [TODAY, '2026-12-09'];

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

const ATHLETES = [
  { id: 'a1', name: 'Jordan Whitfield', householdId: 'whitfield', packageId: 't-6', dob: '2012-06-17' },
  { id: 'a2', name: 'Reese Whitfield', householdId: 'whitfield', packageId: 't-8', dob: '2014-03-02', billingStatus: 'pending' },
  { id: 'a3', name: 'Sage Parker', householdId: 'parker', packageId: 't-6', dob: '2011-04-04', contractStart: '2026-11-09' },
  { id: 'tx', name: 'Max Test', householdId: 'ryp-test-family', packageId: 't-6' },
];
const HOUSEHOLDS = [
  { id: 'whitfield', name: 'Whitfield family' },
  { id: 'parker', name: 'Parker family', membership: { status: 'past_due' } },
  { id: 'moreno', name: 'Moreno family', membership: { status: 'lapsed' } },
  { id: 'ryp-test-family', name: 'RYP Test Family', test: true, membership: { status: 'lapsed' } },
];
const s = (id, date, time, over = {}) => ({ id, date, time, type: 'training', status: 'scheduled', capacity: 10, booked: 5, ...over });
const SESSIONS_WEEK = [
  s('w1', '2026-11-09', '4:00 PM'),
  s('w2', '2026-11-10', '3:00 PM', { maxHandicap: 5, booked: 4, capacity: 8 }),
  s('w3', '2026-11-11', '4:00 PM', { booked: 10 }),
  s('w4', '2026-11-12', '4:00 PM', { status: 'cancelled' }),
  s('w5', '2026-11-13', '4:00 PM', { type: 'phil', capacity: 6 }),
];
const SESSIONS_FITNESS = [
  s('g-1125', '2026-11-25', '6:00 PM', { hidden: true, booked: 0, capacity: 6 }),
  s('p-1125', '2026-11-25', '6:00 PM', { type: 'phil', booked: 2, capacity: 6 }),
];
const PENDING = [{ id: 'e1' }];
const NOSHOWS = [
  { id: 'b1', athleteId: 'a1', status: 'noshow', date: '2026-11-02' },
  { id: 'b2', athleteId: 'a1', status: 'noshow', date: '2026-11-04' },
  { id: 'b3', athleteId: 'a3', status: 'noshow', date: '2026-11-05' },
];
const LOGS = [{ athleteId: 'a1', date: '2026-11-09', minutes: 20 }];
const WINDOWS = [{ id: '2026-27-baseline', athleteId: 'a2', season: '2026-27', kind: 'baseline', status: 'open' }];

/** A promise per read the test resolves by hand, in any order. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function wireReads() {
  live.fetchAllAthletes.mockResolvedValue(ATHLETES);
  live.fetchAllHouseholds.mockResolvedValue(HOUSEHOLDS);
  live.fetchPendingEnrollmentRequests.mockResolvedValue(PENDING);
  live.fetchNoShowBookingsSince.mockResolvedValue(NOSHOWS);
  live.fetchContractLogsSince.mockResolvedValue(LOGS);
  adapter.fetchAllAssessmentWindows.mockResolvedValue(WINDOWS);
  live.fetchSessionsInRange.mockImplementation(async (from, to) => {
    if (from === WEEK[0] && to === WEEK[1]) return SESSIONS_WEEK;
    if (from === FITNESS[0] && to === FITNESS[1]) return SESSIONS_FITNESS;
    throw new Error(`unexpected sessions range ${from}..${to}`);
  });
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

const GOLDEN = require('./index.adminProgressive.golden.json');

test('once every group lands, the payload is exactly the one-shot payload', async () => {
  const h = await mountHook(() => useAdminDashboard());
  expect(h.result.current.error).toBeNull();
  expect(h.result.current.loading).toBe(false);
  expect(h.result.current.data).toEqual(GOLDEN);
  await h.unmount();
});

test('each card group paints as its own reads land; Outstanding says loading until it can be whole', async () => {
  const roster = deferred();
  const week = deferred();
  const calls = deferred();
  live.fetchAllAthletes.mockReturnValue(roster.promise.then(() => ATHLETES));
  live.fetchAllHouseholds.mockReturnValue(roster.promise.then(() => HOUSEHOLDS));
  live.fetchPendingEnrollmentRequests.mockReturnValue(calls.promise.then(() => PENDING));
  live.fetchSessionsInRange.mockImplementation((from) => (from === WEEK[0] ? week.promise.then(() => SESSIONS_WEEK) : Promise.resolve(SESSIONS_FITNESS)));

  const h = await mountHook(() => useAdminDashboard());
  const now = () => h.result.current;
  expect(now().data).toBeNull();
  expect(now().loading).toBe(true);
  expect(now().status.outstanding).toEqual({ loading: true, error: null });

  // This week's sessions first: block fill paints; nothing else is known yet.
  await act(async () => { week.resolve(); });
  await flush();
  expect(now().data.blockFill).toEqual(GOLDEN.blockFill);
  expect(now().data.reservedBlocks).toEqual(GOLDEN.reservedBlocks);
  expect(now().data.membership).toBeNull();
  expect(now().data.metrics).toBeNull();
  expect(now().data.outstanding).toBeNull();
  expect(now().status.outstanding.loading).toBe(true);
  expect(now().loading).toBe(true);

  // The roster: membership, enrollment and the stats; Outstanding still waits on its own reads.
  await act(async () => { roster.resolve(); });
  await flush();
  expect(now().data.membership).toEqual(GOLDEN.membership);
  expect(now().data.enrollment).toEqual(GOLDEN.enrollment);
  expect(now().data.metrics).toEqual(GOLDEN.metrics);
  expect(now().data.outstanding).toBeNull();
  expect(now().status.outstanding).toEqual({ loading: true, error: null });

  await act(async () => { calls.resolve(); });
  await flush();
  expect(now().data).toEqual(GOLDEN);
  expect(now().status.outstanding).toEqual({ loading: false, error: null });
  expect(now().loading).toBe(false);
  await h.unmount();
});

test('a failed group fails only its own cards', async () => {
  live.fetchAllHouseholds.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
  const h = await mountHook(() => useAdminDashboard());
  const { data, status, error, loading } = h.result.current;
  expect(loading).toBe(false);
  expect(error).toMatchObject({ code: 'unavailable' });
  // The roster feeds Outstanding, membership, enrollment and the stats.
  expect(status.outstanding.error).toMatchObject({ code: 'unavailable' });
  expect(status.outstanding.loading).toBe(false);
  expect(data.outstanding).toBeNull();
  expect(data.membership).toBeNull();
  expect(data.metrics).toBeNull();
  // This week's sessions do not need it.
  expect(data.blockFill).toEqual(GOLDEN.blockFill);
  await h.unmount();
});

test('a write re-reads only the groups it can change', async () => {
  const h = await mountHook(() => useAdminDashboard());
  for (const f of [live.fetchAllAthletes, live.fetchAllHouseholds, live.fetchContractLogsSince, live.fetchSessionsInRange]) f.mockClear();
  await act(async () => { bump('contractLogs'); });
  await flush();
  expect(live.fetchContractLogsSince).toHaveBeenCalledTimes(1);
  expect(live.fetchAllAthletes).not.toHaveBeenCalled();
  expect(live.fetchAllHouseholds).not.toHaveBeenCalled();
  expect(live.fetchSessionsInRange.mock.calls).toEqual([FITNESS]);
  expect(h.result.current.data).toEqual(GOLDEN);
  await h.unmount();
});
