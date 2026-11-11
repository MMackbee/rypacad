/**
 * hooks/parallax.js: the per-athlete Parallax intake swings ticks on a
 * training session's attendance screen, live (the adapter is mocked; its
 * shapes are pinned in parallaxLive.test.js) and seed.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: { displayName: null } }, db: {} }));
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchCurrentUser: jest.fn(),
}));
jest.mock('./parallaxLive', () => ({
  ...jest.requireActual('./parallaxLive'),
  __esModule: true,
  fetchIntake: jest.fn(),
  createIntake: jest.fn(),
  deleteIntake: jest.fn(),
  intakeStamp: () => 'NOW',
}));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { auth } from '../../firebase';
import * as live from './live';
import { ERR, LiveDataError } from './live';
import * as adapter from './parallaxLive';
import { clearIntakeCache, useParallaxIntakes } from './parallax';

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
// Under fake timers settle's setTimeout never fires (Global Constraints): flush instead.
const flush = async () => { for (let i = 0; i < 12; i += 1) await act(async () => {}); };
async function mountHook(useHook, wait = settle) {
  const result = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await wait();
  return { result, unmount: () => act(async () => root.unmount()) };
}

const M = { athleteId: 'a1', at: new Date('2026-11-05T21:00:00Z'), by: 'u-luke', byName: 'Luke' };
const on = (ids) => () => useParallaxIntakes(ids, { enabled: true });

beforeEach(() => {
  clearIntakeCache();
  auth.currentUser.displayName = null;
  live.isLive.mockReturnValue(true);
  live.fetchCurrentUser.mockResolvedValue({ uid: 'u-luke', role: 'coach', displayName: 'Luke Smith' });
  adapter.fetchIntake.mockImplementation(async (id) => (id === 'a1' ? M : null));
});

test('disabled reads nothing', async () => {
  const { result, unmount } = await mountHook(() => useParallaxIntakes(['a1'], { enabled: false }));
  expect(result.current.data).toBeNull();
  expect(result.current.loading).toBe(false);
  expect(live.fetchCurrentUser).not.toHaveBeenCalled();
  expect(adapter.fetchIntake).not.toHaveBeenCalled();
  await unmount();
});

test('one read per athlete and the viewer', async () => {
  const { result, unmount } = await mountHook(on(['a1', 'a2']));
  expect(result.current.error).toBeNull();
  expect(result.current.data.byAthlete).toEqual({ a1: M, a2: null });
  expect(result.current.data.viewer).toEqual({ uid: 'u-luke', role: 'coach', byName: 'Luke' });
  expect(adapter.fetchIntake.mock.calls).toEqual([['a1'], ['a2']]);
  await unmount();
});

test('cached per athlete', async () => {
  const first = await mountHook(on(['a1', 'a2']));
  await first.unmount();
  const { result, unmount } = await mountHook(on(['a1', 'a2', 'a3']));
  expect(adapter.fetchIntake).toHaveBeenCalledTimes(3);
  expect(adapter.fetchIntake).toHaveBeenLastCalledWith('a3');
  expect(result.current.data.byAthlete).toEqual({ a1: M, a2: null, a3: null });
  await unmount();
});

test('tick writes the four keys and shows at once', async () => {
  adapter.createIntake.mockResolvedValue({ status: 'done' });
  const { result, unmount } = await mountHook(on(['a1', 'a2']));
  let out;
  await act(async () => { out = await result.current.tick('a2'); });
  expect(out).toBe('done');
  expect(adapter.createIntake).toHaveBeenCalledWith('a2', { athleteId: 'a2', at: 'NOW', by: 'u-luke', byName: 'Luke' });
  expect(result.current.data.byAthlete.a2.by).toBe('u-luke');
  expect(result.current.data.byAthlete.a2.at instanceof Date).toBe(true);
  expect(result.current.data.byAthlete.a1).toEqual(M);
  expect(adapter.fetchIntake).toHaveBeenCalledTimes(2);
  await unmount();
  // The cache holds the tick: the next block's screen shows it without a read.
  const again = await mountHook(on(['a1', 'a2']));
  expect(again.result.current.data.byAthlete.a2.byName).toBe('Luke');
  expect(adapter.fetchIntake).toHaveBeenCalledTimes(2);
  await again.unmount();
});

test('a tick that lost the race shows the first one (Review Focus 4)', async () => {
  const theirs = { ...M, athleteId: 'a2', by: 'u-sam', byName: 'Sam' };
  adapter.createIntake.mockResolvedValue({ status: 'already', milestone: theirs });
  const { result, unmount } = await mountHook(on(['a1', 'a2']));
  let out;
  await act(async () => { out = await result.current.tick('a2'); });
  expect(out).toBe('already');
  expect(result.current.data.byAthlete.a2).toEqual(theirs);
  await unmount();
});

test('a refused tick rejects and changes nothing', async () => {
  adapter.createIntake.mockRejectedValue(new LiveDataError(ERR.UNAVAILABLE, 'offline'));
  const { result, unmount } = await mountHook(on(['a1', 'a2']));
  await act(async () => {
    await expect(result.current.tick('a2')).rejects.toMatchObject({ code: ERR.UNAVAILABLE });
  });
  expect(result.current.data.byAthlete.a2).toBeNull();
  await unmount();
});

test('undo clears', async () => {
  adapter.deleteIntake.mockResolvedValue();
  const { result, unmount } = await mountHook(on(['a1', 'a2']));
  await act(async () => { await result.current.undo('a1'); });
  expect(adapter.deleteIntake).toHaveBeenCalledWith('a1');
  expect(result.current.data.byAthlete.a1).toBeNull();
  await unmount();
  const again = await mountHook(on(['a1']));
  expect(again.result.current.data.byAthlete.a1).toBeNull();
  expect(adapter.fetchIntake).toHaveBeenCalledTimes(2);
  await again.unmount();
});

// The owner cleared the tick on another device while this screen (or the
// cache) still showed it: the delete meets no doc and the rules refuse it.
test('an undo refused because the tick is already gone clears it here', async () => {
  adapter.deleteIntake.mockRejectedValue(new LiveDataError(ERR.PERMISSION, 'no doc'));
  const { result, unmount } = await mountHook(on(['a1']));
  expect(result.current.data.byAthlete.a1).toEqual(M);
  adapter.fetchIntake.mockResolvedValue(null);
  await act(async () => { await result.current.undo('a1'); });
  expect(adapter.fetchIntake).toHaveBeenCalledTimes(2);
  expect(result.current.data.byAthlete.a1).toBeNull();
  await unmount();
  const again = await mountHook(on(['a1']));
  expect(again.result.current.data.byAthlete.a1).toBeNull();
  expect(adapter.fetchIntake).toHaveBeenCalledTimes(2);
  await again.unmount();
});

test('an undo refused while a tick is there rejects and shows the tick as stored', async () => {
  adapter.deleteIntake.mockRejectedValue(new LiveDataError(ERR.PERMISSION, 'late'));
  const { result, unmount } = await mountHook(on(['a1']));
  const theirs = { ...M, by: 'u-sam', byName: 'Sam' };
  adapter.fetchIntake.mockResolvedValue(theirs);
  await act(async () => {
    await expect(result.current.undo('a1')).rejects.toMatchObject({ code: ERR.PERMISSION });
  });
  expect(result.current.data.byAthlete.a1).toEqual(theirs);
  await unmount();
});

test('an undo that fails for another reason rejects without a re-read', async () => {
  adapter.deleteIntake.mockRejectedValue(new LiveDataError(ERR.UNAVAILABLE, 'offline'));
  const { result, unmount } = await mountHook(on(['a1']));
  await act(async () => {
    await expect(result.current.undo('a1')).rejects.toMatchObject({ code: ERR.UNAVAILABLE });
  });
  expect(adapter.fetchIntake).toHaveBeenCalledTimes(1);
  expect(result.current.data.byAthlete.a1).toEqual(M);
  await unmount();
});

test('an owner with no name on file', async () => {
  live.fetchCurrentUser.mockResolvedValue({ uid: 'owner', role: 'owner', displayName: null });
  const first = await mountHook(on(['a1']));
  expect(first.result.current.data.viewer).toEqual({ uid: 'owner', role: 'owner', byName: 'Owner' });
  await first.unmount();
  // The Firebase Auth profile's name comes before the role word.
  auth.currentUser.displayName = 'Pat Lee';
  const second = await mountHook(on(['a1']));
  expect(second.result.current.data.viewer.byName).toBe('Pat');
  await second.unmount();
});

test('the next account on the same device reads the ticks afresh', async () => {
  const first = await mountHook(on(['a1']));
  await first.unmount();
  live.fetchCurrentUser.mockResolvedValue({ uid: 'u-sam', role: 'coach', displayName: 'Sam Lee' });
  const second = await mountHook(on(['a1']));
  expect(adapter.fetchIntake).toHaveBeenCalledTimes(2);
  expect(second.result.current.data.viewer.uid).toBe('u-sam');
  await second.unmount();
});

test('a failed read is not cached', async () => {
  adapter.fetchIntake.mockRejectedValue(new LiveDataError(ERR.PERMISSION, 'no'));
  const first = await mountHook(on(['a1']));
  expect(first.result.current.error.code).toBe(ERR.PERMISSION);
  expect(first.result.current.data).toBeNull();
  await first.unmount();
  adapter.fetchIntake.mockResolvedValue(M);
  const second = await mountHook(on(['a1']));
  expect(adapter.fetchIntake).toHaveBeenCalledTimes(2);
  expect(adapter.fetchIntake).toHaveBeenLastCalledWith('a1');
  expect(second.result.current.data.byAthlete.a1).toEqual(M);
  await second.unmount();
});

test("a tick read ten minutes ago is read again (an owner's clear reaches other screens)", async () => {
  const T = Date.parse('2026-11-12T22:00:00Z');
  jest.useFakeTimers('modern');
  try {
    jest.setSystemTime(T);
    let h = await mountHook(on(['a1']), flush);
    expect(adapter.fetchIntake).toHaveBeenCalledTimes(1);
    await h.unmount();
    jest.setSystemTime(T + 5 * 60000);
    h = await mountHook(on(['a1']), flush);
    expect(adapter.fetchIntake).toHaveBeenCalledTimes(1);
    expect(h.result.current.data.byAthlete.a1).toEqual(M);
    await h.unmount();
    adapter.fetchIntake.mockResolvedValue(null);
    jest.setSystemTime(T + 11 * 60000);
    h = await mountHook(on(['a1']), flush);
    expect(adapter.fetchIntake).toHaveBeenCalledTimes(2);
    expect(adapter.fetchIntake).toHaveBeenLastCalledWith('a1');
    expect(h.result.current.data.byAthlete.a1).toBeNull();
    await h.unmount();
  } finally {
    jest.useRealTimers();
  }
});

test('seed: r1 and r4 ticked', async () => {
  live.isLive.mockReturnValue(false);
  const { result, unmount } = await mountHook(on(['r1', 'r2', 'r4']));
  const { byAthlete, viewer } = result.current.data;
  expect(viewer).toEqual({ uid: 'coach-luke', role: 'coach', byName: 'Luke' });
  expect(byAthlete.r1).toEqual({ athleteId: 'r1', at: new Date('2026-11-03T22:15:00Z'), by: 'coach-luke', byName: 'Luke' });
  expect(byAthlete.r4).toMatchObject({ athleteId: 'r4', by: 'coach-luke', byName: 'Luke' });
  expect(byAthlete.r2).toBeNull();
  let out;
  await act(async () => { out = await result.current.tick('r2'); });
  expect(out).toBe('done');
  expect(result.current.data.byAthlete.r2).toMatchObject({ athleteId: 'r2', by: 'coach-luke', byName: 'Luke' });
  expect(live.fetchCurrentUser).not.toHaveBeenCalled();
  expect(adapter.fetchIntake).not.toHaveBeenCalled();
  expect(adapter.createIntake).not.toHaveBeenCalled();
  await unmount();
  // clearIntakeCache puts the seed back.
  clearIntakeCache();
  const again = await mountHook(on(['r2']));
  expect(again.result.current.data.byAthlete.r2).toBeNull();
  await again.unmount();
});
