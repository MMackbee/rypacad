import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useSaveTracker, { PENDING_KEY, SLOW_SAVE_COPY, SLOW_SAVE_MS, dropPending, keepPending, pendingFor } from './assessmentSaves';

async function mountTracker() {
  const result = { current: null };
  function Probe() {
    result.current = useSaveTracker();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  return { result, unmount: () => act(async () => root.unmount()) };
}
const flush = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

beforeEach(() => {
  jest.useFakeTimers();
  try { window.localStorage.clear(); } catch (err) { /* jsdom always has it */ }
});
afterEach(() => { jest.useRealTimers(); });

describe('the save tracker (Review Focus 2: the tablet loses wifi)', () => {
  test('a save not acknowledged in 8 s reads "Not saved yet" and still counts as unsaved', async () => {
    const h = await mountTracker();
    await act(async () => { h.result.current.run('a1:grip', () => new Promise(() => {})); });
    expect(h.result.current.entries['a1:grip']).toEqual({ state: 'saving', message: null });
    expect(h.result.current.unsaved).toBe(1);
    await act(async () => { jest.advanceTimersByTime(SLOW_SAVE_MS - 1); });
    expect(h.result.current.entries['a1:grip'].state).toBe('saving');
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(h.result.current.entries['a1:grip']).toEqual({ state: 'slow', message: SLOW_SAVE_COPY });
    expect(h.result.current.unsaved).toBe(1);
    await h.unmount();
  });

  test('saved clears it; a failure is an error with a retry; the latest save of an entry decides its state', async () => {
    const h = await mountTracker();
    let attempts = 0;
    const flaky = async () => { attempts += 1; if (attempts === 1) throw new Error('offline'); };
    await act(async () => { h.result.current.run('a1:cmj', flaky); });
    await flush();
    expect(h.result.current.entries['a1:cmj']).toEqual({ state: 'error', message: "Didn't save." });
    await act(async () => { h.result.current.retry('a1:cmj'); });
    await flush();
    expect(h.result.current.entries['a1:cmj'].state).toBe('saved');
    expect(attempts).toBe(2);
    let finishFirst;
    await act(async () => { h.result.current.run('a2:grip', () => new Promise((resolve) => { finishFirst = resolve; })); });
    await act(async () => { h.result.current.run('a2:grip', async () => {}); });
    await flush();
    expect(h.result.current.entries['a2:grip'].state).toBe('saved');
    await act(async () => { finishFirst(); });
    await flush();
    expect(h.result.current.entries['a2:grip'].state).toBe('saved');
    expect(h.result.current.unsaved).toBe(0);
    await h.unmount();
  });

  test('closing the tab with an unsaved entry asks first; with everything saved it does not', async () => {
    const h = await mountTracker();
    let finish;
    await act(async () => { h.result.current.run('a1:mcgill', () => new Promise((resolve) => { finish = resolve; })); });
    const ask = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(ask()).toBe(true);
    await act(async () => { finish(); });
    await flush();
    expect(ask()).toBe(false);
    await h.unmount();
  });
});

describe("the device store (Review Focus 2: a reload, or iPad Safari evicting the page, drops the SDK's queued writes)", () => {
  const grip = (right) => ({ kind: 'section', athleteId: 'a1', windowId: '2026-27-baseline', section: 'grip', value: { right } });
  test('an unsaved section is kept until the server has it; only the latest save of it drops it', () => {
    const first = keepPending(grip([30]));
    const second = keepPending(grip([30, 31]));
    expect(first.key).toBe('a1:2026-27-baseline:grip');
    expect(pendingFor([['a1', '2026-27-baseline']]).map((k) => k.value)).toEqual([{ right: [30, 31] }]);
    dropPending(first);
    expect(pendingFor([['a1', '2026-27-baseline']])).toHaveLength(1);
    dropPending(second);
    expect(pendingFor([['a1', '2026-27-baseline']])).toEqual([]);
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
  });
  test('profile and field patches merge, so an earlier patch still waiting is not lost; other windows stay out', () => {
    keepPending({ kind: 'profile', athleteId: 'a1', value: { sex: 'female' } });
    keepPending({ kind: 'profile', athleteId: 'a1', value: { dominantHand: 'right' } });
    keepPending({ kind: 'fields', athleteId: 'a1', windowId: '2026-27-baseline', value: { mcgillDate: '2026-11-05' } });
    keepPending({ kind: 'section', athleteId: 'a2', windowId: '2026-27-mid', section: 'cmj', value: { trials: [] } });
    expect(pendingFor([['a1', '2026-27-baseline']]).map((k) => [k.key, k.value])).toEqual([
      ['a1:profile', { sex: 'female', dominantHand: 'right' }],
      ['a1:2026-27-baseline:fields', { mcgillDate: '2026-11-05' }],
    ]);
  });
  test('storage that is unreadable keeps nothing and never throws', () => {
    window.localStorage.setItem(PENDING_KEY, 'not json');
    expect(pendingFor([['a1', '2026-27-baseline']])).toEqual([]);
    expect(() => keepPending(grip([30]))).not.toThrow();
  });
});
