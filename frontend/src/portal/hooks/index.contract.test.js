/**
 * Contract lane (2026-09-30): the Behind buffer and the contract window as
 * the live loaders apply them (contract-buffer.md), and the contractStart
 * stamp on a no-tier -> tier start. Kept beside index.test.js with its own
 * mock list so the lanes merge cleanly.
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
  fetchAthlete: jest.fn(),
  fetchAthleteDiagnostics: jest.fn(),
  fetchBookings: jest.fn(),
  fetchContractLogs: jest.fn(),
  fetchCurrentUser: jest.fn(),
  fetchHousehold: jest.fn(),
  fetchHouseholdAthletes: jest.fn(),
  setContractTier: jest.fn(),
}));
jest.mock('./signups', () => ({ ...jest.requireActual('./signups'), __esModule: true, fetchLoginInvite: jest.fn() }));
// "Today" is pinned per test. The seed modules call todayISO() at import, so
// the real one answers until resetMocks clears it before the first test.
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  deriveWhoNeedsCall,
  liveContractState,
  useAthleteDashboard,
  useAthleteTier,
  useContract,
  useHousehold,
} from './index';
import * as live from './live';
import * as calendar from '../data/calendar';
import { SEASON_BOUNDS } from '../data/season';

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

const logsFor = (athleteId, dates) => dates.map((date) => ({ athleteId, date, minutes: 45 }));
const month = (today, dates = []) =>
  calendar.buildContractMonthFromLogs({
    today,
    minutesByDate: new Map(dates.map((d) => [d, 45])),
    contractMinutes: 45,
    startISO: SEASON_BOUNDS.start,
    endISO: SEASON_BOUNDS.end,
  });

describe('liveContractState: the six kinds, in order', () => {
  test('notStarted: no pill, the start date', () => {
    expect(liveContractState(month('2026-10-20'))).toEqual({
      kind: 'notStarted',
      badge: null,
      line: "Your contract starts Tuesday, Nov 3. Days before then don't count for or against you.",
      hint: 'Weekends are not contract days.',
    });
  });
  test('ended: no pill, the end date', () => {
    expect(liveContractState(month('2027-03-10'))).toEqual({
      kind: 'ended',
      badge: null,
      line: "This season's contract ended Saturday, Feb 27.",
      hint: null,
    });
  });
  test('behind: the 6th missed weekday', () => {
    const s = liveContractState(month('2026-11-11'));
    expect(s.kind).toBe('behind');
    expect(s.badge).toEqual({ tone: 'red', label: 'Behind' });
    expect(s.line).toBe('6 days behind with 14 contract days left. Every remaining day has to be logged to make the Commitment Board.');
  });
  test('complete: every contract day logged', () => {
    const weekdays = Object.entries(month('2026-11-30').dayStates)
      .filter(([, st]) => st !== 'weekend' && st !== 'inactive')
      .map(([iso]) => iso);
    const s = liveContractState(month('2026-11-30', weekdays));
    expect(s.kind).toBe('complete');
    expect(s.badge).toEqual({ tone: 'yellow', label: 'Complete' });
    expect(s.line).toBe('All 20 contract days logged. You are on November’s Commitment Board.');
  });
  test('catchup: 1-5 missed is still On track, with a catch-up line', () => {
    const s = liveContractState(month('2026-11-06', ['2026-11-03']));
    expect(s).toEqual({
      kind: 'catchup',
      badge: { tone: 'green', label: 'On track' },
      line: '1 of 3 days due so far — 2 to catch up. Tap a missed day to add a late entry.',
      hint: 'Missed a day? Tap it in the grid to add a late entry.',
    });
  });
  test('ontrack: nothing missed', () => {
    const s = liveContractState(month('2026-11-05', ['2026-11-03', '2026-11-04']));
    expect(s.kind).toBe('ontrack');
    expect(s.badge).toEqual({ tone: 'green', label: 'On track' });
    expect(s.line).toBe('2 of 2 days due so far. 18 contract days left — one miss still keeps the month.');
  });
});

describe('deriveWhoNeedsCall uses the buffer and the window', () => {
  const athletes = [
    { id: 'a1', name: 'Jordan', contractMinutes: 45 },
    { id: 'a2', name: 'Reese', contractMinutes: 45, contractStart: '2026-12-15' },
    { id: 'a3', name: 'Nico', contractMinutes: null },
  ];
  const who = (today, contractLogs = []) =>
    deriveWhoNeedsCall({ athletes, pendingCount: 0, noshowBookings: [], contractLogs, publishedDiagnosticAthleteIds: [], today })
      .contractBehind;

  test('nobody before the season or inside the buffer', () => {
    expect(who('2026-09-30')).toEqual([]);
    expect(who('2026-11-10')).toEqual([]);
  });
  test('listed from the 6th missed weekday; a late entry takes them off again', () => {
    // Reese's contract starts Dec 15: November is outside her window.
    expect(who('2026-11-11')).toEqual([{ athleteId: 'a1', name: 'Jordan', missed: 6, daysLeft: 14 }]);
    expect(who('2026-11-11', logsFor('a1', ['2026-11-04']))).toEqual([]);
  });
  test('a mid-season contractStart is not behind the day after it starts', () => {
    expect(who('2026-12-16').map((r) => r.athleteId)).toEqual(['a1']);
  });
});

describe('live loaders', () => {
  beforeEach(() => {
    live.isLive.mockReturnValue(true);
  });

  const household = async (today, athlete, logs = []) => {
    calendar.todayISO.mockReturnValue(today);
    live.fetchCurrentUser.mockResolvedValue({ uid: 'p1', householdId: 'h1' });
    live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1 });
    live.fetchHouseholdAthletes.mockResolvedValue([{ id: 'a1', name: 'Jordan', householdId: 'h1', packageId: null, contractMinutes: 45, ...athlete }]);
    live.fetchBookings.mockResolvedValue([]);
    live.fetchContractLogs.mockResolvedValue(logs);
    const h = await mountHook(() => useHousehold());
    const child = h.result.current.data.children[0];
    await h.unmount();
    return child;
  };

  test('useHousehold: before the season there is no badge and no percentage', async () => {
    expect(await household('2026-10-20')).toMatchObject({ standing: null, contract: null });
  });
  test('useHousehold: season day 1 is On track with nothing due ("—"); the 6th miss is Behind', async () => {
    expect(await household('2026-11-03')).toMatchObject({ standing: { tone: 'green', label: 'On track' }, contract: null });
    expect(await household('2026-11-11')).toMatchObject({ standing: { tone: 'yellow', label: 'Behind' }, contract: 0 });
    expect(await household('2026-11-11', {}, logsFor('a1', ['2026-11-03', '2026-11-04']))).toMatchObject({
      standing: { tone: 'green', label: 'On track' },
      contract: 33,
    });
  });

  test('useContract: a mid-season contractStart opens the window there', async () => {
    calendar.todayISO.mockReturnValue('2026-12-16');
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', athleteId: 'a1' });
    live.fetchAthlete.mockResolvedValue({ id: 'a1', contractMinutes: 45, contractStart: '2026-12-15' });
    live.fetchContractLogs.mockResolvedValue([]);
    const h = await mountHook(() => useContract());
    const { data } = h.result.current;
    expect(data.dayStates['2026-12-14']).toBe('inactive');
    expect(data.dayStates['2026-12-15']).toBe('missed');
    expect(data.stats).toMatchObject({ missed: 1, dueSoFar: 1 });
    expect(data.state.kind).toBe('catchup');
    await h.unmount();
  });

  test('useAthleteDashboard: the card carries the real badge and kind (K33)', async () => {
    calendar.todayISO.mockReturnValue('2026-11-11');
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', athleteId: 'a1' });
    live.fetchAthlete.mockResolvedValue({ id: 'a1', name: 'Jordan', contractMinutes: 45, packageId: null, householdId: null });
    live.fetchBookings.mockResolvedValue([]);
    live.fetchContractLogs.mockResolvedValue([]);
    live.fetchAthleteDiagnostics.mockResolvedValue([]);
    const h = await mountHook(() => useAthleteDashboard());
    expect(h.result.current.data.contract).toMatchObject({
      kind: 'behind',
      badge: { tone: 'red', label: 'Behind' },
      logged: 0,
      total: 6,
    });
    await h.unmount();
  });

  test('setTier stamps contractStart only on a start', async () => {
    live.setContractTier.mockResolvedValue({});
    const tier = await mountHook(() => useAthleteTier());
    await tier.result.current.setTier('a1', 45, { start: true });
    await tier.result.current.setTier('a1', 90);
    expect(live.setContractTier.mock.calls).toEqual([
      [{ athleteId: 'a1', minutes: 45, start: true }],
      [{ athleteId: 'a1', minutes: 90, start: false }],
    ]);
    await tier.unmount();

    calendar.todayISO.mockReturnValue('2026-10-20');
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', athleteId: 'a2' });
    live.fetchAthlete.mockResolvedValue({ id: 'a2', contractMinutes: null });
    const own = await mountHook(() => useContract());
    await own.result.current.setTier(20, { start: true });
    expect(live.setContractTier).toHaveBeenLastCalledWith({ athleteId: 'a2', minutes: 20, start: true });
    await own.unmount();
  });
});
