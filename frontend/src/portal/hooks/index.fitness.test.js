/**
 * "Fitness with no golf" on the admin dashboard (owner 2026-11-13: "yes add
 * a warning row for fitness no golf"): the next four weeks of sessions are
 * read on their own, the orphaned fitness sessions become Outstanding rows
 * after the Attendance rows, and a failed read drops only those rows.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));
// CRA's resetMocks clears these before every test: each test sets its own.
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
import { useAdminDashboard } from './index';

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

const TODAY = '2026-11-10';
// today..today+27: four weeks.
const FITNESS_TO = '2026-12-07';
const ATHLETES = [{ id: 'a1', name: 'Jordan Whitfield', contractMinutes: null, packageId: 't-6' }];
const FITNESS = [
  { id: 'g-1125', date: '2026-11-25', time: '6:00 PM', type: 'training', status: 'scheduled', hidden: true, booked: 0, capacity: 6 },
  { id: 'p-1125', date: '2026-11-25', time: '6:00 PM', type: 'phil', status: 'scheduled', booked: 2, capacity: 6 },
  { id: 'g-1124', date: '2026-11-24', time: '6:00 PM', type: 'training', status: 'scheduled', booked: 3, capacity: 6 },
  { id: 'p-1124', date: '2026-11-24', time: '6:00 PM', type: 'phil', status: 'scheduled', booked: 1, capacity: 6 },
];

/** The week read gets nothing; the four-week read gets `fitness` (a value, or a rejection). */
function sessionsReads(fitness) {
  live.fetchSessionsInRange.mockImplementation(async (from, to) => {
    if (from === TODAY && to === FITNESS_TO) {
      if (fitness instanceof Error) throw fitness;
      return fitness;
    }
    return [];
  });
}

beforeEach(() => {
  calendar.todayISO.mockReturnValue(TODAY);
  live.isLive.mockReturnValue(true);
  live.fetchAllAthletes.mockResolvedValue(ATHLETES);
  for (const f of [live.fetchAllHouseholds, live.fetchContractLogsSince, live.fetchPendingEnrollmentRequests]) {
    f.mockResolvedValue([]);
  }
  live.fetchNoShowBookingsSince.mockResolvedValue([{ id: 'b1', athleteId: 'a1', status: 'noshow', date: '2026-11-02' }]);
  adapter.fetchAllAssessmentWindows.mockResolvedValue([]);
});

test('the orphaned fitness sessions of the next four weeks are rows, after Attendance and before Assessment', async () => {
  sessionsReads(FITNESS);
  const h = await mountHook(() => useAdminDashboard());
  expect(live.fetchSessionsInRange).toHaveBeenCalledWith(TODAY, FITNESS_TO);
  const { outstanding } = h.result.current.data;
  expect(outstanding.map((r) => r.id)).toEqual(['noshow-a1', 'fitness-p-1125', 'baseline-a1']);
  expect(outstanding[1]).toEqual({
    id: 'fitness-p-1125',
    kind: 'fitness',
    athleteId: null,
    who: 'Fitness with no golf · Wed Nov 25, 6:00 PM',
    why: '2 booked · the golf block at this time is hidden',
    tag: 'Fitness',
    tone: 'red',
    packageIds: null,
  });
  await h.unmount();
});

test('a failed four-week read drops only the fitness rows, never the dashboard', async () => {
  sessionsReads(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
  const h = await mountHook(() => useAdminDashboard());
  expect(h.result.current.error).toBeNull();
  expect(h.result.current.data.outstanding.map((r) => r.id)).toEqual(['noshow-a1', 'baseline-a1']);
  expect(h.result.current.data.metrics.enrolled).toBe(1);
  await h.unmount();
});

test('no orphaned fitness session: no fitness row', async () => {
  sessionsReads(FITNESS.filter((s) => s.date === '2026-11-24'));
  const h = await mountHook(() => useAdminDashboard());
  expect(h.result.current.data.outstanding.map((r) => r.kind)).toEqual(['noshow', 'baseline']);
  await h.unmount();
});
