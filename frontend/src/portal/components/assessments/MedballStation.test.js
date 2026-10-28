import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import MedballStation, { medballRotation } from './MedballStation';
import { MODE, StationHarness, stationAthlete } from './testHarness';

const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const station = (athlete, extra = {}) => {
  const saves = [];
  return renderScreen(<StationHarness View={MedballStation} athlete={athlete} saves={saves} {...extra} />).then((r) => Object.assign(r, { saves }));
};

test('the rotation names the side and the trials', () => {
  expect(medballRotation([{ position: 1 }, { position: 2 }], MODE)).toBe('Alternate athletes (A, B): 1 practice, then 3 scored throws each, trail side only. Ball starts at the back hip; feet may pivot but not step.');
});

test('the first test of the season assigns the ball by body mass and fixes the method on the profile', async () => {
  const r = await station(stationAthlete({ window: { anthro: { mass: [41.1] } }, profile: { athleteId: 'a', season: '2026-27' } }), { equipment: { radarMethod: 'speed' } });
  expect(r.text()).toContain('Suggested by body mass: 2 kg');
  await type(r, 'Ava Moreno throw 1 (mph)', '28.4');
  expect(r.saves).toEqual([
    ['medball', { massKg: 2, side: 'trail', method: 'speed', throws: [28.4, null, null] }],
    ['profile', { medballMethod: 'speed', medballMassKg: 2, season: '2026-27' }],
  ]);
  await type(r, 'Ava Moreno throw 2 (mph)', '29.1');
  expect(r.saves.filter(([s]) => s === 'profile')).toHaveLength(1);
  expect(r.text()).toContain('Best throw 29.1 mph · 2 kg · trail side');
  await r.unmount();
});

test("this season's method and ball are kept; mixing methods is blocked (Phil)", async () => {
  const profile = { athleteId: 'a', season: '2026-27', medballMethod: 'speed', medballMassKg: 3 };
  const r = await station(stationAthlete({ profile }), { equipment: { radarMethod: 'distance' } });
  expect(r.text()).toContain("Ava Moreno's season method is radar speed; mixing methods is blocked.");
  expect(r.text()).toContain('Ball: 3 kg, assigned at the first test and kept all season.');
  await type(r, 'Ava Moreno throw 1 (mph)', '30');
  expect(r.saves).toEqual([['medball', { massKg: 3, side: 'trail', method: 'speed', throws: [30, null, null] }]]);
  await r.unmount();
});

test('by distance the range is metres, and a ball can be picked when body mass is missing', async () => {
  const r = await station(stationAthlete({ profile: { athleteId: 'a', season: '2026-27' } }), { equipment: { radarMethod: 'distance' } });
  expect(r.text()).toContain('Measure body mass first, or pick a ball.');
  await r.click('Ava Moreno ball: 4 kg');
  await type(r, 'Ava Moreno throw 1 (m)', '30');
  expect(r.text()).toContain('Throw distance is 0-25 m');
  await type(r, 'Ava Moreno throw 1 (m)', '6.4');
  expect(r.saves[0]).toEqual(['medball', { massKg: 4, side: 'trail', method: 'distance', throws: [6.4, null, null] }]);
  await r.unmount();
});
