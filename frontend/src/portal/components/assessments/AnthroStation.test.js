import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import AnthroStation from './AnthroStation';
import { MODE, StationHarness, stationAthlete } from './testHarness';

const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const station = (athlete, extra = {}) => {
  const saves = [];
  return renderScreen(<StationHarness View={AnthroStation} athlete={athlete} saves={saves} {...extra} />).then((r) => Object.assign(r, { saves }));
};

test('baseline: up to three measures each, the box from the equipment, the finals as they are entered', async () => {
  const r = await station(stationAthlete(), { equipment: { boxHeight: 40 } });
  await type(r, 'Ava Moreno standing height 1', '152.1');
  expect(r.saves[0]).toEqual(['anthro', { standing: [152.1, null, null], mass: [], boxHeight: 40, sittingRaw: [], arm: [], hand: [] }]);
  await type(r, 'Ava Moreno standing height 2', '152.3');
  await type(r, 'Ava Moreno body mass 1', '41.1');
  await type(r, 'Ava Moreno seated height 1', '118.0');
  await type(r, 'Ava Moreno seated height 2', '118.2');
  expect(r.text()).toContain('Standing 152.2 cm · mass 41.1 kg · sitting 78.1 cm · leg 74.1 cm');
  expect(field(r, 'Ava Moreno arm length 1')).toBeNull();
  await r.unmount();
});

test('a third seated measure is asked for when the first two differ by more than 0.4 cm', async () => {
  const r = await station(stationAthlete(), { equipment: { boxHeight: 40 } });
  await type(r, 'Ava Moreno seated height 1', '118.0');
  await type(r, 'Ava Moreno seated height 2', '118.6');
  expect(r.text()).toContain('take a third');
  await type(r, 'Ava Moreno seated height 3', '118.1');
  expect(r.text()).not.toContain('take a third');
  await r.unmount();
});

test('no box height: the seated measures are kept and the coach is told where the box goes', async () => {
  const r = await station(stationAthlete());
  expect(r.text()).toContain('Enter the sitting box height under Equipment.');
  await r.unmount();
});

test('mid-season: standing and mass, the growth check, and a repeat sitting measure offered only past 3 cm', async () => {
  const prior = [{ id: '2026-27-baseline', circuitDate: '2026-11-03', anthro: { standing: [152.2], sittingRaw: [118.1], boxHeight: 40 } }];
  const r = await station(stationAthlete({ kind: 'mid', prior }), { equipment: { boxHeight: 40 } });
  expect(field(r, 'Ava Moreno seated height 1')).toBeNull();
  await type(r, 'Ava Moreno standing height 1', '155.4');
  expect(r.text()).toContain('Standing height +3.2 cm since Nov 3. Over 3 cm: the sitting height on file is stale for the maturity offset.');
  await r.click('Measure sitting height again');
  expect(field(r, 'Ava Moreno seated height 1')).not.toBeNull();
  await r.unmount();
  const small = await station(stationAthlete({ kind: 'mid', prior }), { equipment: { boxHeight: 40 } });
  await type(small, 'Ava Moreno standing height 1', '153.0');
  expect(small.text()).toContain('Standing height +0.8 cm since Nov 3.');
  expect(small.button('Measure sitting height again')).toBeNull();
  await small.unmount();
});

test('segment measures appear only when the setting turns them on', async () => {
  const r = await station(stationAthlete(), { circuitMode: { ...MODE, stations: { ...MODE.stations, segments: true } } });
  expect(field(r, 'Ava Moreno arm length 1')).not.toBeNull();
  expect(field(r, 'Ava Moreno hand length 3')).not.toBeNull();
  await r.unmount();
});
