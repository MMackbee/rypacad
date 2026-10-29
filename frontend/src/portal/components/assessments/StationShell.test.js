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

test("the per-athlete badge is this station's saves; a profile or not-tested save made elsewhere shows only while it is not on the server", async () => {
  const at = (id, entries, w = {}) => renderScreen(
    <StationShell station={station(id)} athletes={[athlete(w)]} layout="tablet" order={null} entries={entries} onRetry={() => {}} onNotTested={() => {}} renderAthlete={() => 'STATION INPUTS'} />
  );
  const saved = { state: 'saved', message: null };
  const elsewhere = { 'a:profile': saved, 'a:notTested': saved, 'a:fields': saved };
  const grip = await at('grip', elsewhere);
  expect(grip.text()).not.toContain('Saved');
  await grip.unmount();
  const typed = await at('grip', { ...elsewhere, 'a:grip': saved });
  expect(typed.text()).toContain('Saved');
  await typed.unmount();
  const intake = await at('intake', { 'a:profile': saved });
  expect(intake.text()).toContain('Saved');
  await intake.unmount();
  const failed = await at('grip', { 'a:profile': { state: 'error', message: 'Not saved.' } });
  expect(failed.text()).toContain('Not saved.');
  await failed.unmount();
  const marked = await at('grip', { 'a:notTested': saved }, { notTested: { grip: 'ill' } });
  expect(marked.text()).toContain('Saved');
  await marked.unmount();
});
