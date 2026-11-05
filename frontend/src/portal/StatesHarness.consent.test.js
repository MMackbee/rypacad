import React from 'react';
import { renderScreen } from './screens/testRender';
import { SCREEN_STATES } from './StatesHarness';

/**
 * Yannick's consent in the review harness (2026-10-30 plan Task 16): the
 * flow, the list, his Consent card in each status and the ops paper sheet,
 * all on the seed (no emulator, no network).
 */
const entry = (id) => SCREEN_STATES.find((s) => s.id === id);
const state = (id, label) => entry(id).states.find(([, l]) => l === label);
const NEW = [
  ['CF', 'Reese · minor, step 1', 'Step 1 of 5'],
  ['CF', 'Quinn · 18+ on their own login', 'You are 18 or older and sign for yourself'],
  ['CF', '18+ hand-over on the parent phone', 'Quinn is 18 or older and signs for themself'],
  ['CF', 'Change choices', 'Change choices'],
  ['CL', 'Whitfield family · Reese waiting', "Waiting for Reese's agreement"],
  ['MP', 'Reese · consent needed', 'Send a reminder'],
  ['MP', 'Quinn · 18+ signed', 'Emergency: Sam Parker, test-phone (parent)'],
  ['MP', 'Jordan · needs 18+', 'Recording: needs 18+ signature'],
  ['MP', 'Nico · paper, not transcribed', 'Location: not transcribed'],
  ['09', 'Ops · paper signature', 'Date signed'],
];

test('the consent entries are in the harness', () => {
  expect(entry('CF')).toMatchObject({ title: 'Mental consent flow', role: 'parent · athlete' });
  expect(entry('CF').states.map(([, label]) => label)).toEqual(['Reese · minor, step 1', 'Quinn · 18+ on their own login', '18+ hand-over on the parent phone', 'Change choices']);
  expect(entry('CL')).toMatchObject({ title: 'Mental consent list' });
  for (const [id, label] of NEW) expect(state(id, label)).toBeTruthy();
});

test.each(NEW)('%s · %s mounts on the seed', async (id, label, shows) => {
  const { Screen } = entry(id);
  const [variant, , props] = state(id, label);
  const r = await renderScreen(<Screen variant={variant} {...(props || null)} />, { path: '/portal' });
  await r.flush();
  expect(r.text()).toContain(shows);
  await r.unmount();
});
