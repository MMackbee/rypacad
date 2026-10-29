import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import GripStation, { gripRotation } from './GripStation';
import { MODE, StationHarness, stationAthlete } from './testHarness';

const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const station = (athlete, extra = {}) => {
  const saves = [];
  return renderScreen(<StationHarness View={GripStation} athlete={athlete} saves={saves} {...extra} />).then((r) => Object.assign(r, { saves }));
};

test('the rotation: pairs on two dynamometers, right then left, three rounds, the circuit rest interval', () => {
  const four = [1, 2, 3, 4].map((position) => ({ position }));
  expect(gripRotation(four, MODE)).toBe('Dynamometer 1: A right, A left, B right, B left · Dynamometer 2: C right, C left, D right, D left - 3 rounds. Rest 15-20 s between same-hand efforts (circuit rest interval).');
  expect(gripRotation(four.slice(0, 1), { ...MODE, trialCounts: { ...MODE.trialCounts, grip: 2 } })).toBe('Dynamometer 1: A right, A left - 2 rounds. Rest 15-20 s between same-hand efforts (circuit rest interval).');
});

test('a refused trial is never sent and never drops the trials beside it (Review Focus 3)', async () => {
  const r = await station(stationAthlete({ position: 3 }), { equipment: { dynamometer1: 'D-07', dynamometer2: 'D-09', handlePosition: '3' } });
  await type(r, 'Ava Moreno grip right 1', '24,5');
  expect(r.saves).toEqual([['grip', { right: [24.5, null, null], left: [], deviceRight: 'D-09', deviceLeft: 'D-09', handlePosition: '3', dominant: null }]]);
  await type(r, 'Ava Moreno grip right 2', '150');
  expect(r.text()).toContain('Grip is 0-100 kg');
  expect(r.saves).toHaveLength(1);
  await type(r, 'Ava Moreno grip right 2', '25.1');
  expect(r.saves[1][1].right).toEqual([24.5, 25.1, null]);
  await r.unmount();
});

test('the dominant hand goes on the window and the profile; the best per hand and per kilo show as trials come in', async () => {
  const r = await station(stationAthlete({ window: { anthro: { mass: [41.1] } } }));
  await r.click('Ava Moreno dominant hand: Right');
  expect(r.saves).toEqual([['grip', expect.objectContaining({ dominant: 'right' })], ['profile', { dominantHand: 'right' }]]);
  await type(r, 'Ava Moreno grip right 1', '25.1');
  await type(r, 'Ava Moreno grip left 1', '23.8');
  expect(r.text()).toContain('Best right 25.1 kg · left 23.8 kg · 0.61 kg/kg (circuit rest interval)');
  await r.unmount();
});

test('the trial count follows the circuit mode', async () => {
  const r = await station(stationAthlete(), { circuitMode: { ...MODE, trialCounts: { ...MODE.trialCounts, grip: 2 } } });
  expect(field(r, 'Ava Moreno grip right 2')).not.toBeNull();
  expect(field(r, 'Ava Moreno grip right 3')).toBeNull();
  await r.unmount();
});
