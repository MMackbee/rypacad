/**
 * useAthleteBrackets, the Tour score sheet's age-group read (review
 * 2026-11-06): an athlete read with no dob is null in the map, and one the
 * read did not return (no athlete doc, or no read access - fetchAthletesByIds
 * drops both) is listed in `unread` instead, so the sheet never files them
 * as Open. Kept beside index.test.js with its own mock list so the lanes
 * merge cleanly. Invented ids throughout.
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
  fetchAthletesByIds: jest.fn(),
}));

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useAthleteBrackets } from './index';
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

const IDS = ['kid-a', 'kid-b', 'kid-c'];

test('live: no dob is null in the map; an athlete the read did not return is unread, not Open', async () => {
  live.isLive.mockReturnValue(true);
  live.fetchAthletesByIds.mockResolvedValue([{ id: 'kid-a', dob: '2015-11-03' }, { id: 'kid-b', dob: null }]);
  const h = await mountHook(() => useAthleteBrackets(IDS));
  expect(live.fetchAthletesByIds).toHaveBeenCalledWith(IDS);
  expect(h.result.current.data).toEqual({ 'kid-a': '11-14', 'kid-b': null });
  expect(h.result.current.unread).toEqual(['kid-c']);
  expect(h.result.current.error).toBeFalsy();
  await h.unmount();
});

test('live: every athlete read leaves nothing unread', async () => {
  live.isLive.mockReturnValue(true);
  live.fetchAthletesByIds.mockResolvedValue(IDS.map((id) => ({ id, dob: '2016-11-03' })));
  const h = await mountHook(() => useAthleteBrackets(IDS));
  expect(h.result.current.data).toEqual({ 'kid-a': '10U', 'kid-b': '10U', 'kid-c': '10U' });
  expect(h.result.current.unread).toEqual([]);
  await h.unmount();
});

test('seed: nothing read, nothing unread', async () => {
  live.isLive.mockReturnValue(false);
  const h = await mountHook(() => useAthleteBrackets(IDS));
  expect(live.fetchAthletesByIds).not.toHaveBeenCalled();
  expect(h.result.current.data).toEqual({});
  expect(h.result.current.unread).toEqual([]);
  await h.unmount();
});
