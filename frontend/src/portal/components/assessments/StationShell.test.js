import React from 'react';
import { renderScreen } from '../../screens/testRender';
import StationShell, { painStopBefore } from './StationShell';
import { STATIONS } from '../../data/assessmentSettings';

// StationShell reads LETTERS from StartWaveSheet, which imports the Firestore adapter.
jest.mock('../../hooks/assessmentsLive', () => ({ startWave: async () => ({}) }));

const station = (id) => STATIONS.find((s) => s.id === id);
const athlete = (w) => ({ athleteId: 'a', name: 'Ava Moreno', position: 1, window: { id: '2026-27-baseline', ...w } });
const shell = (id, w) => renderScreen(
  <StationShell station={station(id)} athletes={[athlete(w)]} layout="tablet" order={null} entries={{}} onRetry={() => {}} onNotTested={() => {}} renderAthlete={() => 'STATION INPUTS'} />
);

test('not tested at intake - the readiness answer, the not-tested control or a pain stop - skips every later station', async () => {
  for (const w of [{ readiness: { status: 'not-tested', reason: 'ill' } }, { notTested: { readiness: 'ill' } }, { notTested: { readiness: 'pain' } }]) {
    const r = await shell('anthro', w);
    expect(r.text()).not.toContain('STATION INPUTS');
    expect(r.text()).toContain('Not tested at readiness');
    await r.unmount();
  }
  const intake = await shell('intake', { notTested: { readiness: 'pain' } });
  expect(intake.text()).toContain('Stopped for pain. Retest within 7 days; refer per RYP policy.');
  await intake.unmount();
});

test('a pain stop at a station ends the later ones for that athlete; the stations before it are untouched', async () => {
  const w = { notTested: { grip: 'pain' } };
  expect(painStopBefore(w, 'medball').id).toBe('grip');
  expect(painStopBefore(w, 'grip')).toBeNull();
  expect(painStopBefore(w, 'anthro')).toBeNull();
  const later = await shell('jump', w);
  expect(later.text()).toContain('Stopped for pain at Grip. Retest within 7 days; refer per RYP policy.');
  expect(later.text()).not.toContain('STATION INPUTS');
  await later.unmount();
  const before = await shell('anthro', w);
  expect(before.text()).toContain('STATION INPUTS');
  await before.unmount();
});
