import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import JumpStation, { jumpRotation } from './JumpStation';
import { MODE, StationHarness, stationAthlete } from './testHarness';

const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const station = (athlete, extra = {}) => {
  const saves = [];
  return renderScreen(<StationHarness View={JumpStation} athlete={athlete} saves={saves} {...extra} />).then((r) => Object.assign(r, { saves }));
};
const last = (r, section) => r.saves.filter(([s]) => s === section).pop()[1];

test('the rotation: practice, scored jumps in rotation, then the 10/5 sets', () => {
  expect(jumpRotation([{ position: 1 }, { position: 2 }], MODE)).toBe('CMJ: 1 practice, then 2 scored, in rotation (A, B) - everyone jumps before anyone repeats. 10/5: 1 practice set, then 2 scored sets of 10.');
});

test('CMJ with RSImod typed from Smart2Move: each trial saves with the plate software and rate', async () => {
  const r = await station(stationAthlete({ window: { anthro: { mass: [41.1] } } }), { equipment: { plateSoftware: 'Smart2Move 4.2', samplingHz: 1000 } });
  expect(field(r, 'Ava Moreno CMJ 1 time to take-off (ms)')).toBeNull();
  await type(r, 'Ava Moreno CMJ 1 height (cm)', '31.2');
  expect(last(r, 'cmj')).toEqual({ trials: [{ heightCm: 31.2, rsiMod: null, timeToTakeoffMs: null, peakPowerW: null, peakPowerWkg: null, asymmetryPct: null }, null], software: 'Smart2Move 4.2', samplingHz: 1000 });
  await type(r, 'Ava Moreno CMJ 1 RSImod', '0.41');
  await type(r, 'Ava Moreno CMJ 2 height (cm)', '32.0');
  await type(r, 'Ava Moreno CMJ 2 peak power (W)', '2150');
  expect(r.text()).toContain('Best CMJ 32 cm · RSImod 0.41 · 2150 W · 52.3 W/kg');
  await type(r, 'Ava Moreno CMJ 1 RSImod', '2.5');
  expect(r.text()).toContain('RSImod is 0-2');
  await r.unmount();
});

test('CMJ with RSImod computed: time to take-off is typed instead and RSImod follows', async () => {
  const r = await station(stationAthlete(), { circuitMode: { ...MODE, rsiModEntry: 'computed' } });
  expect(field(r, 'Ava Moreno CMJ 1 RSImod')).toBeNull();
  await type(r, 'Ava Moreno CMJ 1 height (cm)', '35');
  await type(r, 'Ava Moreno CMJ 1 time to take-off (ms)', '800');
  expect(r.text()).toContain('RSImod 0.44');
  await r.unmount();
});

test('10/5 per set: a set over 250 ms contact is flagged and not reported', async () => {
  const r = await station(stationAthlete());
  await type(r, 'Ava Moreno 10/5 set 1 RSI best 5', '2.31');
  await type(r, 'Ava Moreno 10/5 set 1 contact time (ms)', '198');
  await type(r, 'Ava Moreno 10/5 set 2 RSI best 5', '2.45');
  await type(r, 'Ava Moreno 10/5 set 2 contact time (ms)', '262');
  expect(last(r, 'hop')).toEqual({ sets: [{ rsiBest5: 2.31, gctMs: 198 }, { rsiBest5: 2.45, gctMs: 262 }] });
  expect(r.text()).toContain('Set 2: contact time 262 ms is over 250 ms. Coach the pattern; this set is not reported.');
  expect(r.text()).toContain('Best 10/5 RSI 2.31');
  await r.unmount();
});

test('10/5 every hop: ten RSIs and contact times per set, scored as the best five', async () => {
  const r = await station(stationAthlete(), { circuitMode: { ...MODE, hopEntry: 'per-hop' } });
  await type(r, 'Ava Moreno 10/5 set 1 hop 1 RSI', '2.1');
  expect(last(r, 'hop')).toEqual({ sets: [{ hopRsi: [2.1, null, null, null, null, null, null, null, null, null], hopGctMs: [] }, null] });
  for (const [i, v] of [[2, '2.3'], [3, '1.9'], [4, '2.4'], [5, '2.2']]) await type(r, `Ava Moreno 10/5 set 1 hop ${i} RSI`, v);
  for (const i of [1, 2, 3, 4, 5]) await type(r, `Ava Moreno 10/5 set 1 hop ${i} contact time (ms)`, '200');
  expect(r.text()).toContain('Best 10/5 RSI 2.18');
  expect(field(r, 'Ava Moreno 10/5 set 2 hop 10 RSI')).not.toBeNull();
  await r.unmount();
});

test('a circuit with the 10/5 switched off in settings shows only the CMJ', async () => {
  const r = await station(stationAthlete(), { circuitMode: { ...MODE, stations: { ...MODE.stations, hop: false } } });
  expect(field(r, 'Ava Moreno CMJ 1 height (cm)')).not.toBeNull();
  expect(field(r, 'Ava Moreno 10/5 set 1 RSI best 5')).toBeNull();
  await r.unmount();
});
