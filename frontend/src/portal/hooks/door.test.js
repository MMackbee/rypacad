/**
 * The facility door button's client half (spec 7): the phone's location for a
 * press, the press itself (a fresh id each time, never a call offline, in
 * seed mode or without a location), the check that decides the card, and
 * signing the door rules. Plain functions, not jest.fn(): CRA's resetMocks
 * would clear them before every test.
 */
jest.mock('./live', () => ({ ...jest.requireActual('./live'), isLive: () => mockLive }));
jest.mock('./callables', () => ({
  callUnlockDoor: async (payload) => mockCall('callUnlockDoor', payload),
  callSignDoorRules: async (payload) => mockCall('callSignDoorRules', payload),
}));

let mockLive;
let mockCalls;
let mockAnswers;
function mockCall(name, payload) {
  mockCalls.push([name, payload]);
  const answer = mockAnswers[name];
  return typeof answer === 'function' ? answer(payload) : answer;
}

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ERR, LiveDataError } from './live';
import {
  LOCATION_OPTIONS,
  LOCATION_WATCHDOG_MS,
  currentLocation,
  newPressId,
  pressUnlock,
  signDoorRules,
  useDoorPress,
  useDoorStatus,
} from './door';

let online;
let geo;
const position = (lat, lng, accuracy) => ({ coords: { latitude: lat, longitude: lng, accuracy } });
/** A fake navigator.geolocation: `answer(success, failure, options)` decides. */
function setGeolocation(answer) {
  geo = answer ? { calls: [], getCurrentPosition: (ok, fail, opts) => { geo.calls.push(opts); answer(ok, fail, opts); } } : undefined;
}

beforeAll(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  Object.defineProperty(window.navigator, 'geolocation', { configurable: true, get: () => geo });
});

beforeEach(() => {
  mockLive = true;
  mockCalls = [];
  mockAnswers = {};
  online = true;
  setGeolocation((ok) => ok(position(44.97, -93.26, 12)));
});

describe('currentLocation', () => {
  test('high accuracy, a 10 s timeout and a 30 s old fix at most; answers the shape the server reads', async () => {
    await expect(currentLocation()).resolves.toEqual({ lat: 44.97, lng: -93.26, accuracy: 12 });
    expect(LOCATION_OPTIONS).toEqual({ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
    expect(geo.calls).toEqual([LOCATION_OPTIONS]);
  });

  test('denied, unavailable or a timeout all read location-needed', async () => {
    setGeolocation((ok, fail) => fail({ code: 1, message: 'User denied Geolocation' }));
    const err = await currentLocation().catch((e) => e);
    expect(err).toBeInstanceOf(LiveDataError);
    expect(err.reason).toBe('location-needed');
    expect(err.message).toBe("Turn on Location for this site so the app can check you're at the academy.");
  });

  test('no geolocation on this browser, or a fix with no numbers, reads location-needed', async () => {
    setGeolocation(null);
    await expect(currentLocation()).rejects.toMatchObject({ reason: 'location-needed' });
    setGeolocation((ok) => ok({ coords: { latitude: NaN, longitude: 3, accuracy: 5 } }));
    await expect(currentLocation()).rejects.toMatchObject({ reason: 'location-needed' });
  });

  test('a phone that never answers is given up on at 12 s', async () => {
    jest.useFakeTimers();
    try {
      setGeolocation(() => {});
      const pending = currentLocation().catch((e) => e);
      expect(LOCATION_WATCHDOG_MS).toBe(12000);
      jest.advanceTimersByTime(11999);
      let settled = false;
      pending.then(() => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);
      jest.advanceTimersByTime(1);
      await expect(pending).resolves.toMatchObject({ reason: 'location-needed' });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('newPressId', () => {
  test('fresh every press, and in the form the server accepts', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newPressId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  test('crypto.randomUUID when the browser has it', () => {
    const before = window.crypto;
    Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => '2f1d6a4e-8a8b-4c1e-9d2c-0a1b2c3d4e5f' } });
    try {
      expect(newPressId()).toBe('2f1d6a4e-8a8b-4c1e-9d2c-0a1b2c3d4e5f');
    } finally {
      Object.defineProperty(window, 'crypto', { configurable: true, value: before });
    }
  });
});

describe('pressUnlock', () => {
  test('a family press: the location, a fresh id, one call, the answer', async () => {
    mockAnswers.callUnlockDoor = { outcome: 'opened', openSeconds: 6 };
    await expect(pressUnlock()).resolves.toEqual({ outcome: 'opened', openSeconds: 6 });
    await pressUnlock();
    expect(mockCalls).toHaveLength(2);
    const [[name, first], [, second]] = mockCalls;
    expect(name).toBe('callUnlockDoor');
    expect(Object.keys(first).sort()).toEqual(['location', 'pressId']);
    expect(first.location).toEqual({ lat: 44.97, lng: -93.26, accuracy: 12 });
    expect(first.pressId).not.toBe(second.pressId);
  });

  test('a staff press asks for no location', async () => {
    setGeolocation(() => { throw new Error('should not be asked'); });
    mockAnswers.callUnlockDoor = { outcome: 'opened', openSeconds: 5 };
    await pressUnlock({ staff: true });
    expect(mockCalls).toHaveLength(1);
    expect(Object.keys(mockCalls[0][1])).toEqual(['pressId']);
    expect(geo.calls).toEqual([]);
  });

  test('offline: no location asked, no call, the offline copy', async () => {
    online = false;
    const err = await pressUnlock().catch((e) => e);
    expect(err).toMatchObject({ reason: 'offline', message: "You're offline - the button needs a data connection." });
    expect(mockCalls).toEqual([]);
    expect(geo.calls).toEqual([]);
  });

  test('no location: no call', async () => {
    setGeolocation((ok, fail) => fail({ code: 3, message: 'Timeout expired' }));
    await expect(pressUnlock()).rejects.toMatchObject({ reason: 'location-needed' });
    expect(mockCalls).toEqual([]);
  });

  test('seed mode never calls', async () => {
    mockLive = false;
    await expect(pressUnlock()).rejects.toBeInstanceOf(LiveDataError);
    await expect(pressUnlock({ staff: true })).rejects.toBeInstanceOf(LiveDataError);
    expect(mockCalls).toEqual([]);
  });

  test("a server refusal keeps its reason and words", async () => {
    mockAnswers.callUnlockDoor = () => { throw new LiveDataError(ERR.INVALID, 'You need to be at the academy to unlock the door.', null, 'too-far'); };
    await expect(pressUnlock()).rejects.toMatchObject({ reason: 'too-far', message: 'You need to be at the academy to unlock the door.' });
  });

  test("the SDK's unavailable before any answer is offline; a crash or a timeout carries no reason", async () => {
    mockAnswers.callUnlockDoor = () => { throw new LiveDataError(ERR.UNAVAILABLE, 'unavailable', { code: 'functions/unavailable' }, null); };
    await expect(pressUnlock()).rejects.toMatchObject({ reason: 'offline' });
    mockAnswers.callUnlockDoor = () => { throw new LiveDataError(ERR.UNKNOWN, 'internal', { code: 'functions/internal' }, null); };
    await expect(pressUnlock()).rejects.toMatchObject({ reason: null });
    mockAnswers.callUnlockDoor = () => { throw new LiveDataError(ERR.UNAVAILABLE, 'deadline-exceeded', { code: 'functions/deadline-exceeded' }, null); };
    await expect(pressUnlock()).rejects.toMatchObject({ reason: null });
  });

  test('the network dropping during the call reads offline', async () => {
    mockAnswers.callUnlockDoor = () => {
      online = false;
      throw new LiveDataError(ERR.UNKNOWN, 'internal', { code: 'functions/internal' }, null);
    };
    await expect(pressUnlock()).rejects.toMatchObject({ reason: 'offline' });
  });
});

describe('signDoorRules', () => {
  test('the trimmed name and the current version', async () => {
    mockAnswers.callSignDoorRules = { ok: true, termsVersion: 'door-2026-11-17' };
    await expect(signDoorRules('  Dana Hart ')).resolves.toEqual({ ok: true, termsVersion: 'door-2026-11-17' });
    expect(mockCalls).toEqual([['callSignDoorRules', { name: 'Dana Hart', termsVersion: 'door-2026-11-17' }]]);
  });

  test('a name under 2 or over 120 characters is refused here; seed mode never calls', async () => {
    await expect(signDoorRules(' D ')).rejects.toMatchObject({ reason: 'bad-request' });
    await expect(signDoorRules('x'.repeat(121))).rejects.toMatchObject({ reason: 'bad-request' });
    mockLive = false;
    await expect(signDoorRules('Dana Hart')).rejects.toBeInstanceOf(LiveDataError);
    expect(mockCalls).toEqual([]);
  });
});

/* ---------------------------------------------------------------- hooks -- */

async function mountHook(useHook) {
  const out = { current: null };
  function Probe() {
    out.current = useHook();
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => { root.render(<Probe />); });
  return { out, flush: () => act(async () => {}), unmount: () => act(async () => root.unmount()) };
}

describe('useDoorStatus', () => {
  test('seed mode and practice: no call, nothing to show', async () => {
    mockLive = false;
    const seed = await mountHook(() => useDoorStatus());
    expect(seed.out.current).toMatchObject({ status: null, loading: false, error: null });
    await seed.unmount();
    mockLive = true;
    const practice = await mountHook(() => useDoorStatus({ practice: true }));
    expect(practice.out.current).toMatchObject({ status: null, loading: false });
    await practice.unmount();
    expect(mockCalls).toEqual([]);
  });

  test('live: one check on mount, the answer cleaned up', async () => {
    mockAnswers.callUnlockDoor = { canUnlock: true, reason: null, staff: false, openSeconds: 7 };
    const h = await mountHook(() => useDoorStatus());
    expect(mockCalls).toEqual([['callUnlockDoor', { check: true }]]);
    expect(h.out.current.status).toEqual({ canUnlock: true, reason: null, staff: false, openSeconds: 7 });
    expect(h.out.current.loading).toBe(false);
    await h.unmount();
  });

  test('an open time out of range falls back to 5 s; a missing reason is null', async () => {
    mockAnswers.callUnlockDoor = { canUnlock: false, staff: false, openSeconds: 99 };
    const h = await mountHook(() => useDoorStatus());
    expect(h.out.current.status).toEqual({ canUnlock: false, reason: null, staff: false, openSeconds: 5 });
    await h.unmount();
  });

  test('recheck asks again and keeps the last answer on screen meanwhile', async () => {
    mockAnswers.callUnlockDoor = { canUnlock: false, reason: 'sign-rules', staff: false, openSeconds: 5 };
    const h = await mountHook(() => useDoorStatus());
    let release;
    mockAnswers.callUnlockDoor = () => new Promise((resolve) => { release = resolve; });
    await act(async () => { h.out.current.recheck(); });
    expect(h.out.current.status.reason).toBe('sign-rules');
    expect(h.out.current.loading).toBe(true);
    await act(async () => { release({ canUnlock: true, reason: null, staff: false, openSeconds: 5 }); });
    expect(h.out.current.status).toMatchObject({ canUnlock: true, reason: null });
    expect(mockCalls).toHaveLength(2);
    await h.unmount();
  });

  test('a failed check shows nothing', async () => {
    mockAnswers.callUnlockDoor = () => { throw new LiveDataError(ERR.UNKNOWN, 'internal', null, null); };
    const h = await mountHook(() => useDoorStatus());
    expect(h.out.current.status).toBeNull();
    expect(h.out.current.error).toBeInstanceOf(LiveDataError);
    await h.unmount();
  });
});

describe('useDoorPress', () => {
  test('busy from press to answer; a second press meanwhile is dropped', async () => {
    let release;
    mockAnswers.callUnlockDoor = () => new Promise((resolve) => { release = resolve; });
    const h = await mountHook(() => useDoorPress({ staff: true }));
    let first;
    await act(async () => { first = h.out.current.press(); });
    expect(h.out.current.busy).toBe(true);
    await act(async () => { h.out.current.press(); });
    expect(mockCalls).toHaveLength(1);
    await act(async () => { release({ outcome: 'coalesced', openSeconds: 5 }); await first; });
    expect(h.out.current.busy).toBe(false);
    expect(h.out.current.result).toEqual({ kind: 'outcome', outcome: 'coalesced', openSeconds: 5 });
    await h.unmount();
  });

  test('opened counts the open seconds down to zero', async () => {
    jest.useFakeTimers();
    try {
      mockAnswers.callUnlockDoor = { outcome: 'opened', openSeconds: 3 };
      const h = await mountHook(() => useDoorPress({ staff: true }));
      await act(async () => { await h.out.current.press(); });
      expect(h.out.current.result).toEqual({ kind: 'outcome', outcome: 'opened', openSeconds: 3 });
      expect(h.out.current.left).toBe(3);
      await act(async () => { jest.advanceTimersByTime(1000); });
      expect(h.out.current.left).toBe(2);
      await act(async () => { jest.advanceTimersByTime(5000); });
      expect(h.out.current.left).toBe(0);
      await h.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a refusal is kept with its reason, and handed to onReason', async () => {
    const seen = [];
    mockAnswers.callUnlockDoor = () => { throw new LiveDataError(ERR.INVALID, 'Read and sign the door rules once to turn on Unlock.', null, 'sign-rules'); };
    const h = await mountHook(() => useDoorPress({ onReason: (r) => seen.push(r) }));
    await act(async () => { await h.out.current.press(); });
    expect(h.out.current.result).toEqual({ kind: 'refusal', reason: 'sign-rules', message: 'Read and sign the door rules once to turn on Unlock.' });
    expect(seen).toEqual(['sign-rules']);
    await h.unmount();
  });
});
