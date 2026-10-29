import React, { act, useState } from 'react';
import { renderScreen } from '../../screens/testRender';
import HoldTimer from './HoldTimer';

let commits;
function Host({ initial = null }) {
  const [value, setValue] = useState(initial);
  return <HoldTimer label="Ava Moreno trunk flexor" value={value} onCommit={(v) => { commits.push(v); setValue(v); }} />;
}

beforeEach(() => {
  commits = [];
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-03T16:00:00Z'));
});
afterEach(() => { jest.useRealTimers(); });

test('start, then stop: the hold is the time between, to 0.1 s', async () => {
  const r = await renderScreen(<Host />);
  expect(r.text()).toContain('-');
  await r.click('Ava Moreno trunk flexor: start');
  await act(async () => { jest.advanceTimersByTime(62400); });
  expect(r.text()).toContain('62 s');
  await r.click('Ava Moreno trunk flexor: stop');
  expect(commits).toEqual([62.4]);
  expect(r.text()).toContain('62.4 s');
  expect(r.button('Time again')).not.toBeNull();
  await r.unmount();
});

test('a tablet that sleeps mid-hold loses no time: the hold is measured from the clock, not the ticks', async () => {
  const r = await renderScreen(<Host />);
  await r.click('Ava Moreno trunk flexor: start');
  jest.setSystemTime(new Date('2026-11-03T16:01:30Z'));
  await r.click('Ava Moreno trunk flexor: stop');
  expect(commits).toEqual([90]);
  await r.unmount();
});

test('the hold stops itself at 300 s and reads "300+ (capped)"', async () => {
  const r = await renderScreen(<Host />);
  await r.click('Ava Moreno trunk flexor: start');
  await act(async () => { jest.advanceTimersByTime(301000); });
  expect(commits).toEqual([300]);
  expect(r.text()).toContain('300+ (capped)');
  expect(r.button('Ava Moreno trunk flexor: stop')).toBeNull();
  await r.unmount();
});

test('a stopwatch time can be typed instead, within 0-300 s', async () => {
  const r = await renderScreen(<Host />);
  await r.fill('Ava Moreno trunk flexor (s)', '75');
  await act(async () => { r.container.querySelector('[aria-label="Ava Moreno trunk flexor (s)"]').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(commits).toEqual([75]);
  expect(r.text()).toContain('75 s');
  await r.unmount();
});
