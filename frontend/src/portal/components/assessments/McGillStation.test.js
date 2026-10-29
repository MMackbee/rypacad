import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import McGillStation, { mcgillRotation } from './McGillStation';
import { MODE, StationHarness, stationAthlete } from './testHarness';

const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const station = (athlete) => {
  const saves = [];
  return renderScreen(<StationHarness View={McGillStation} athlete={athlete} saves={saves} />).then((r) => Object.assign(r, { saves }));
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-03T16:00:00Z'));
});
afterEach(() => { jest.useRealTimers(); });

test('the order line, and the note when McGill runs as its own block', () => {
  const two = [{ position: 1 }, { position: 2 }];
  expect(mcgillRotation(two, MODE)).toBe('Each athlete in turn (A, B): trunk flexor, trunk extensor, right side bridge, left side bridge.');
  expect(mcgillRotation(two, { ...MODE, mcgillMode: 'separate' })).toContain('runs McGill as its own block within 14 days');
});

test('the four holds in protocol order; the first hold saved dates the McGill', async () => {
  const r = await station(stationAthlete());
  const starts = [...r.container.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')).filter((l) => l && l.endsWith(': start'));
  expect(starts).toEqual(['Ava Moreno trunk flexor: start', 'Ava Moreno trunk extensor: start', 'Ava Moreno right side bridge: start', 'Ava Moreno left side bridge: start']);
  await r.click('Ava Moreno trunk flexor: start');
  await act(async () => { jest.advanceTimersByTime(120000); });
  await r.click('Ava Moreno trunk flexor: stop');
  expect(r.saves).toEqual([
    ['mcgill', { flexorSec: 120, extensorSec: null, sideRightSec: null, sideLeftSec: null, skippedBackPain: false }],
    ['fields', { mcgillDate: '2026-11-03' }],
  ]);
  await type(r, 'Ava Moreno trunk extensor (s)', '100');
  expect(r.saves.filter(([s]) => s === 'fields')).toHaveLength(1);
  await r.unmount();
});

test('the ratios, flagged as the protocol says, and a capped hold marks its ratios capped', async () => {
  const r = await station(stationAthlete({ window: { mcgill: { flexorSec: 120, extensorSec: 100, sideRightSec: 60, sideLeftSec: 70, skippedBackPain: false }, mcgillDate: '2026-11-03' } }));
  expect(r.text()).toContain('Flexion:extension 1.2 - flag · Right:left 0.86 - flag · Right side:extension 0.6 · Left side:extension 0.7');
  await type(r, 'Ava Moreno trunk extensor (s)', '300');
  expect(r.text()).toContain('300+ (capped)');
  expect(r.text()).toContain('Flexion:extension 0.4 (capped)');
  await r.unmount();
});

test('back pain skips the McGill, and the skip can be undone', async () => {
  const r = await station(stationAthlete());
  await r.click('Ava Moreno: skip, back pain');
  expect(r.saves[0]).toEqual(['mcgill', { flexorSec: null, extensorSec: null, sideRightSec: null, sideLeftSec: null, skippedBackPain: true }]);
  expect(r.text()).toContain('Skipped: back pain. No holds are taken.');
  expect(r.button('Ava Moreno trunk flexor: start')).toBeNull();
  await r.click('Undo skip');
  expect(r.saves.pop()).toEqual(['mcgill', { flexorSec: null, extensorSec: null, sideRightSec: null, sideLeftSec: null, skippedBackPain: false }]);
  await r.unmount();
});

test('a block run more than 14 days after the circuit is warned about, not refused', async () => {
  jest.setSystemTime(new Date('2026-11-20T16:00:00Z'));
  const r = await station(stationAthlete());
  expect(r.text()).toContain('17 days after the circuit (Nov 3). McGill is due within 14 days; this result will be flagged.');
  await type(r, 'Ava Moreno trunk flexor (s)', '88');
  expect(r.saves[1]).toEqual(['fields', { mcgillDate: '2026-11-20' }]);
  await r.unmount();
});

test('a mid-season athlete in a mixed wave is not asked for McGill', async () => {
  const r = await station(stationAthlete({ kind: 'mid' }));
  expect(r.text()).toContain('McGill runs at baseline and end of season only.');
  expect(r.button('Ava Moreno trunk flexor: start')).toBeNull();
  await r.unmount();
});
