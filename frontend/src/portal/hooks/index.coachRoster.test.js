/**
 * useCoachRoster (speed review, 2026-11-17): the coach's assigned athletes.
 * Owners, ops and the specialists open the Today tab too but have no Students
 * tab, so CoachDashboard turns the read off for them ({ enabled: false }) and
 * it makes neither the users read nor the athletes query.
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
  fetchCoachAthletes: jest.fn(),
  fetchCurrentUser: jest.fn(),
}));

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useCoachRoster } from './index';
import * as live from './live';

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

beforeEach(() => {
  live.isLive.mockReturnValue(true);
  live.fetchCurrentUser.mockResolvedValue({ uid: 'coach1', role: 'coach' });
  live.fetchCoachAthletes.mockResolvedValue([
    { id: 'reese', name: 'Reese Whitfield', dob: '2014-03-02' },
    { id: 'jordan', name: 'Jordan Whitfield', dob: '2012-06-17' },
  ]);
});

test("a coach's roster: the users read, then athletes where coachId == the coach, by name", async () => {
  const h = await mountHook(() => useCoachRoster());
  expect(live.fetchCoachAthletes).toHaveBeenCalledWith('coach1');
  expect(h.result.current.error).toBeNull();
  expect(h.result.current.data.map((a) => a.id)).toEqual(['jordan', 'reese']);
  await h.unmount();
});

test('turned off: no read at all, an empty list that is not loading', async () => {
  const h = await mountHook(() => useCoachRoster({ enabled: false }));
  expect(live.fetchCurrentUser).not.toHaveBeenCalled();
  expect(live.fetchCoachAthletes).not.toHaveBeenCalled();
  expect(h.result.current).toMatchObject({ data: [], loading: false, error: null });
  expect(typeof h.result.current.retry).toBe('function');
  await h.unmount();
});
