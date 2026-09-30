import React, { act } from 'react';
import { renderScreen } from '../screens/testRender';
import useCalendarView, { readCalendarView, writeCalendarView } from './calendarView';

const KEY = 'ryp.calendarView';

/** Renders the hook; `api.current` is the latest [view, setView]. */
async function mountHook(screenDefault) {
  const api = { current: null };
  function Probe() {
    // No argument at all when screenDefault is undefined, to exercise the hook default.
    const pair = useCalendarView(...(screenDefault === undefined ? [] : [screenDefault]));
    api.current = pair;
    return <span data-view={pair[0]}>{pair[0]}</span>;
  }
  const r = await renderScreen(<Probe />);
  return { r, api };
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
});
afterEach(() => {
  jest.restoreAllMocks();
});

test('empty storage -> the screen default (and month when none is given)', async () => {
  const a = await mountHook('week');
  expect(a.api.current[0]).toBe('week');
  await a.r.unmount();
  const b = await mountHook();
  expect(b.api.current[0]).toBe('month');
  await b.r.unmount();
  const c = await mountHook('agenda');
  expect(c.api.current[0]).toBe('month');
  await c.r.unmount();
});

test('a stored week wins over the screen default', async () => {
  window.localStorage.setItem(KEY, 'week');
  const { r, api } = await mountHook('month');
  expect(api.current[0]).toBe('week');
  await r.unmount();
});

test('an invalid stored value is ignored', async () => {
  window.localStorage.setItem(KEY, 'fortnight');
  expect(readCalendarView()).toBeNull();
  const { r, api } = await mountHook('week');
  expect(api.current[0]).toBe('week');
  await r.unmount();
});

test('setView updates state and writes the key; invalid values are ignored', async () => {
  const { r, api } = await mountHook('month');
  await act(async () => { api.current[1]('week'); });
  expect(api.current[0]).toBe('week');
  expect(r.text()).toBe('week');
  expect(window.localStorage.getItem(KEY)).toBe('week');
  await act(async () => { api.current[1]('year'); });
  expect(api.current[0]).toBe('week');
  expect(window.localStorage.getItem(KEY)).toBe('week');
  await r.unmount();
});

test('the choice carries to the next screen that mounts', async () => {
  const first = await mountHook('month');
  await act(async () => { first.api.current[1]('week'); });
  await first.r.unmount();
  const second = await mountHook('month');
  expect(second.api.current[0]).toBe('week');
  await second.r.unmount();
});

test('getItem throwing -> the default, no crash', async () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(readCalendarView()).toBeNull();
  const { r, api } = await mountHook('week');
  expect(api.current[0]).toBe('week');
  await r.unmount();
});

test('setItem throwing -> state still flips for the session', async () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(() => writeCalendarView('week')).not.toThrow();
  const { r, api } = await mountHook('month');
  await act(async () => { api.current[1]('week'); });
  expect(api.current[0]).toBe('week');
  await r.unmount();
});

test('writeCalendarView ignores invalid values', () => {
  writeCalendarView('day');
  expect(window.localStorage.getItem(KEY)).toBeNull();
  writeCalendarView('month');
  expect(window.localStorage.getItem(KEY)).toBe('month');
});
