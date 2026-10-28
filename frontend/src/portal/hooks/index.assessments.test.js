/**
 * Diagnostic Capture is gone (assessments spec 8): the admin "Diagnostic not
 * entered" row is "Baseline due" now, read from the assessment windows - and
 * a refused windows read (rules that do not grant it yet) drops those
 * rows instead of the whole dashboard.
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
import { deriveWhoNeedsCall, useAdminDashboard } from './index';

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

const ATHLETES = [
  { id: 'a1', name: 'Jordan Whitfield', contractMinutes: null, packageId: 't-6' },
  { id: 'a2', name: 'Reese Whitfield', contractMinutes: null, packageId: 't-6' },
];

test('deriveWhoNeedsCall: every athlete with no baseline window is "Baseline due"; unknown lists nobody', () => {
  const who = (baselineAthleteIds) =>
    deriveWhoNeedsCall({ athletes: ATHLETES, pendingCount: 0, noshowBookings: [], contractLogs: [], baselineAthleteIds, today: '2026-11-10' });
  expect(who(['a2']).baselineDue).toEqual([{ athleteId: 'a1', name: 'Jordan Whitfield' }]);
  expect(who(null).baselineDue).toEqual([]);
  expect('missingDiagnostic' in who([])).toBe(false);
});

describe('the admin dashboard', () => {
  beforeEach(() => {
    calendar.todayISO.mockReturnValue('2026-11-10');
    live.isLive.mockReturnValue(true);
    live.fetchAllAthletes.mockResolvedValue(ATHLETES);
    for (const f of [live.fetchAllHouseholds, live.fetchContractLogsSince, live.fetchNoShowBookingsSince, live.fetchPendingEnrollmentRequests, live.fetchSessionsInRange]) {
      f.mockResolvedValue([]);
    }
  });

  test('"Baseline due" for an athlete with no baseline window this season (an open one counts as tested)', async () => {
    adapter.fetchAllAssessmentWindows.mockResolvedValue([{ id: '2026-27-baseline', athleteId: 'a2', season: '2026-27', kind: 'baseline', status: 'open' }]);
    const h = await mountHook(() => useAdminDashboard());
    expect(h.result.current.data.outstanding).toEqual([
      { id: 'baseline-a1', kind: 'baseline', athleteId: 'a1', who: 'Jordan Whitfield', why: 'Baseline due', tag: 'Assessment', tone: 'yellow', packageIds: null },
    ]);
    await h.unmount();
  });

  test('a baseline from last season does not count, as on the assessments list', async () => {
    adapter.fetchAllAssessmentWindows.mockResolvedValue([{ id: '2025-26-baseline', athleteId: 'a2', season: '2025-26', kind: 'baseline', status: 'complete' }]);
    const h = await mountHook(() => useAdminDashboard());
    expect(h.result.current.data.outstanding.map((r) => r.id)).toEqual(['baseline-a1', 'baseline-a2']);
    await h.unmount();
  });

  test('a refused windows read drops those rows, never the dashboard', async () => {
    adapter.fetchAllAssessmentWindows.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const h = await mountHook(() => useAdminDashboard());
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.outstanding).toEqual([]);
    expect(h.result.current.data.metrics.enrolled).toBe(2);
    await h.unmount();
  });
});
