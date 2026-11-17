/**
 * useDoorPress across two presses (review 2026-11-17 app-1, app-2 and
 * coalesce-kills-long-countdown): a second press while the door is open
 * keeps the countdown that is running, through the wait, a coalesce and a
 * refusal; only an 'opened' answer starts it again. A coalesce onto an open
 * this page is not counting counts down the server's leftSeconds. `retry`
 * turns on once a hold would open the door again (the server's coalesce
 * window: 10 s, or the open time if shorter). Plain functions, not jest.fn():
 * CRA's resetMocks would clear them before every test.
 */
jest.mock('./live', () => ({ ...jest.requireActual('./live'), isLive: () => true }));
jest.mock('./callables', () => ({
  callUnlockDoor: async (payload) => mockCall(payload),
  callSignDoorRules: async () => ({ ok: true }),
}));

let mockCalls;
let mockAnswer;
function mockCall(payload) {
  mockCalls.push(payload);
  return typeof mockAnswer === 'function' ? mockAnswer(payload) : mockAnswer;
}

import fs from 'fs';
import path from 'path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ERR, LiveDataError } from './live';
import { RETRY_AFTER_SECONDS, useDoorPress } from './door';

const SERVER = path.resolve(__dirname, '../../../../functions/portal/door.js');

beforeEach(() => {
  mockCalls = [];
  mockAnswer = { outcome: 'opened', openSeconds: 5 };
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

async function mountPress() {
  const out = { current: null };
  function Probe() {
    out.current = useDoorPress({ staff: true });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  return { out, unmount: () => act(async () => root.unmount()) };
}
const tick = (ms) => act(async () => { jest.advanceTimersByTime(ms); });
const press = (h) => act(async () => { await h.out.current.press(); });
/** Opens the door with `secs` of open time, then lets `after` ms pass. */
async function opened(secs, after = 0) {
  mockAnswer = { outcome: 'opened', openSeconds: secs };
  const h = await mountPress();
  await press(h);
  if (after) await tick(after);
  return h;
}

test("RETRY_AFTER_SECONDS is the server's coalesce window", () => {
  const m = fs.readFileSync(SERVER, 'utf8').match(/COALESCE_MS\s*=\s*(\d+)\s*\*\s*1000\s*;/);
  expect(m).not.toBeNull();
  expect(RETRY_AFTER_SECONDS).toBe(Number(m[1]));
});

describe('a second press while the door is open keeps the countdown', () => {
  test('through the wait and a coalesced answer', async () => {
    const h = await opened(600, 4000);
    expect(h.out.current.left).toBe(596);
    let release;
    mockAnswer = () => new Promise((resolve) => { release = resolve; });
    let second;
    await act(async () => { second = h.out.current.press(); });
    expect(h.out.current.busy).toBe(true);
    expect(h.out.current.left).toBe(596);
    await tick(1000);
    expect(h.out.current.left).toBe(595);
    await act(async () => { release({ outcome: 'coalesced', openSeconds: 600, leftSeconds: 594 }); await second; });
    expect(h.out.current.result).toEqual({ kind: 'outcome', outcome: 'coalesced', openSeconds: 600 });
    expect(h.out.current.left).toBe(595);
    await tick(5000);
    expect(h.out.current.left).toBe(590);
    await h.unmount();
  });

  test('through a refusal', async () => {
    const h = await opened(300, 20000);
    mockAnswer = () => { throw new LiveDataError(ERR.INVALID, 'You need to be at the academy to unlock the door.', null, 'too-far'); };
    await press(h);
    expect(h.out.current.result).toMatchObject({ kind: 'refusal', reason: 'too-far' });
    expect(h.out.current.left).toBe(280);
    await tick(1000);
    expect(h.out.current.left).toBe(279);
    await h.unmount();
  });

  test('an opened answer starts it again from the full open time', async () => {
    const h = await opened(300, 30000);
    await press(h);
    expect(h.out.current.left).toBe(300);
    expect(h.out.current.retry).toBe(false);
    await h.unmount();
  });
});

describe('a coalesce onto an open this page is not counting', () => {
  test("counts down the server's time left", async () => {
    mockAnswer = { outcome: 'coalesced', openSeconds: 600, leftSeconds: 597 };
    const h = await mountPress();
    await press(h);
    expect(h.out.current.left).toBe(597);
    await tick(2000);
    expect(h.out.current.left).toBe(595);
    await h.unmount();
  });

  test('no time left given (a replayed press id), or none that fits: nothing counts', async () => {
    for (const leftSeconds of [undefined, 0, 601, 2.5, '30']) {
      mockAnswer = { outcome: 'coalesced', openSeconds: 600, leftSeconds };
      const h = await mountPress();
      await press(h);
      expect(h.out.current.left).toBe(0);
      expect(h.out.current.retry).toBe(false);
      await h.unmount();
    }
  });

  test('after a countdown ran out, a coalesce with no time left is not "locked again"', async () => {
    const h = await opened(3, 4000);
    expect(h.out.current).toMatchObject({ left: 0, retry: true });
    mockAnswer = { outcome: 'coalesced', openSeconds: 3 };
    await press(h);
    expect(h.out.current).toMatchObject({ left: 0, retry: false });
    await h.unmount();
  });
});

describe('retry: a hold now opens the door again', () => {
  test.each([
    [600, 10],
    [180, 10],
    [10, 10],
    [5, 5],
    [3, 3],
  ])('an open time of %i s: from %i s after the answer, and still after the end', async (secs, after) => {
    const h = await opened(secs, (after - 1) * 1000);
    expect(h.out.current.retry).toBe(false);
    await tick(1000);
    expect(h.out.current.retry).toBe(true);
    expect(h.out.current.left).toBe(secs - after);
    await tick(secs * 1000);
    expect(h.out.current).toMatchObject({ left: 0, retry: true });
    await h.unmount();
  });

  test("a coalesce from the server's time left: counted from the open, not from this answer", async () => {
    mockAnswer = { outcome: 'coalesced', openSeconds: 600, leftSeconds: 595 };
    const h = await mountPress();
    await press(h);
    expect(h.out.current.retry).toBe(false);
    await tick(4000);
    expect(h.out.current.retry).toBe(false);
    await tick(1000);
    expect(h.out.current.retry).toBe(true);
    await h.unmount();
  });

  test('a phone that slept past the window knows at once', async () => {
    const h = await opened(600, 2000);
    jest.setSystemTime(Date.now() + 30000);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(h.out.current).toMatchObject({ left: 568, retry: true });
    await h.unmount();
  });
});
