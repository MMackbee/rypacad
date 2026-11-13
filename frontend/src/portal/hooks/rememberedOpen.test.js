import React, { act } from 'react';
import { renderScreen } from '../screens/testRender';
import useRememberedOpen from './rememberedOpen';

const KEY = 'ryp.test.rememberedOpen';

/** Renders the hook; `api.current` is the latest [open, toggle]. */
async function mountHook(defaultOpen) {
  const api = { current: null };
  function Probe() {
    const pair = useRememberedOpen(KEY, defaultOpen);
    api.current = pair;
    return <span>{pair[0] ? 'open' : 'closed'}</span>;
  }
  const r = await renderScreen(<Probe />);
  return { r, api };
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
});
afterEach(() => {
  jest.restoreAllMocks();
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
});

test('nothing stored -> defaultOpen; toggle writes "1" then "0"', async () => {
  const closed = await mountHook(false);
  expect(closed.api.current[0]).toBe(false);
  expect(window.localStorage.getItem(KEY)).toBeNull();
  await act(async () => { closed.api.current[1](); });
  expect(closed.api.current[0]).toBe(true);
  expect(closed.r.text()).toBe('open');
  expect(window.localStorage.getItem(KEY)).toBe('1');
  await act(async () => { closed.api.current[1](); });
  expect(closed.api.current[0]).toBe(false);
  expect(window.localStorage.getItem(KEY)).toBe('0');
  await closed.r.unmount();

  window.localStorage.clear();
  const opened = await mountHook(true);
  expect(opened.api.current[0]).toBe(true);
  await opened.r.unmount();
});

test('stored "1" opens, "0" closes, "yes"/"" fall back to defaultOpen', async () => {
  const cases = [
    ['1', false, true],
    ['1', true, true],
    ['0', true, false],
    ['0', false, false],
    ['yes', false, false],
    ['yes', true, true],
    ['', false, false],
    ['', true, true],
    ['true', false, false],
  ];
  for (const [stored, defaultOpen, expected] of cases) {
    window.localStorage.setItem(KEY, stored);
    const { r, api } = await mountHook(defaultOpen);
    expect([stored, defaultOpen, api.current[0]]).toEqual([stored, defaultOpen, expected]);
    await r.unmount();
  }
});

test('the choice survives a remount (a reload on the same device)', async () => {
  const first = await mountHook(false);
  await act(async () => { first.api.current[1](); });
  await first.r.unmount();
  const second = await mountHook(false);
  expect(second.api.current[0]).toBe(true);
  await second.r.unmount();
});

test('getItem and setItem throwing: starts at defaultOpen, toggle still flips in memory', async () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const { r, api } = await mountHook(false);
  expect(api.current[0]).toBe(false);
  await act(async () => { api.current[1](); });
  expect(api.current[0]).toBe(true);
  expect(r.text()).toBe('open');
  await act(async () => { api.current[1](); });
  expect(api.current[0]).toBe(false);
  expect(setItem).toHaveBeenCalled();
  await r.unmount();

  const open = await mountHook(true);
  expect(open.api.current[0]).toBe(true);
  await open.r.unmount();
});

test('localStorage itself unavailable (the accessor throws): defaultOpen, toggle works', async () => {
  const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    const { r, api } = await mountHook(false);
    expect(api.current[0]).toBe(false);
    await act(async () => { api.current[1](); });
    expect(api.current[0]).toBe(true);
    await r.unmount();
  } finally {
    if (desc) Object.defineProperty(window, 'localStorage', desc);
    else delete window.localStorage;
  }
});
