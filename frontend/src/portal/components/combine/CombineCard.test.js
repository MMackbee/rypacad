/**
 * The Combine card on the athlete home and the athlete page (plan Task 6):
 * the latest score per distance and "Combine ›". useCombineCard is mocked;
 * its own behavior is pinned in hooks/combine.test.js.
 */
import React from 'react';
import { renderScreen } from '../../screens/testRender';
import CombineCard from './CombineCard';
import { COMBINE_LOAD_ERROR, combineSummary } from '../../data/combine';

let mockCard;
let mockArgs;
jest.mock('../../hooks/combine', () => ({ useCombineCard: (args) => { mockArgs = args; return mockCard; } }));

const at = (iso) => new Date(iso);
const ROWS = [
  { id: 'a', athleteId: 'jordan', distance: 'u100', score: 640, date: '2026-11-01', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: at('2026-11-01T22:00:00Z') },
  { id: 'b', athleteId: 'jordan', distance: 'u100', score: 655, date: '2026-11-05', enteredBy: 'u-jordan', enteredRole: 'athlete', createdAt: at('2026-11-06T01:00:00Z') },
  { id: 'c', athleteId: 'jordan', distance: 'u100', score: 655, date: '2026-11-09', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: at('2026-11-09T22:00:00Z') },
  { id: 'd', athleteId: 'jordan', distance: 'u100', score: 600, date: '2026-11-10', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: null },
  { id: 'e', athleteId: 'jordan', distance: 'u150', score: 1000, date: '2026-11-10', enteredBy: 'u-dana', enteredRole: 'parent', createdAt: at('2026-11-10T20:00:00Z') },
];

beforeEach(() => {
  mockCard = { data: { athleteId: 'jordan', summary: combineSummary(ROWS) }, loading: false, error: null };
  mockArgs = null;
});

test('latest per distance and the link', async () => {
  const r = await renderScreen(<CombineCard to="/portal/combine" />);
  const text = r.text();
  ['Combine', 'Under 100 yd', '600 · Nov 10', 'Under 125 yd', 'Under 150 yd', '1000 · Nov 10', 'Under 180 yd'].forEach((s) => expect(text).toContain(s));
  expect(text.split('No score yet').length - 1).toBe(2);
  expect(mockArgs).toEqual({ athleteId: null, practice: false });
  await r.click('Combine ›');
  expect(r.location().pathname).toBe('/portal/combine');
  await r.unmount();
});

test('the athlete it was given is the one it reads', async () => {
  const r = await renderScreen(<CombineCard athleteId="a1" to="/portal/combine/a1" />);
  expect(mockArgs).toEqual({ athleteId: 'a1', practice: false });
  await r.click('Combine ›');
  expect(r.location().pathname).toBe('/portal/combine/a1');
  await r.unmount();
});

test('practice, loading and no athlete render nothing', async () => {
  const practice = await renderScreen(<CombineCard practice to="/portal/combine" />);
  expect(practice.container.textContent).toBe('');
  expect(mockArgs).toEqual({ athleteId: null, practice: true });
  await practice.unmount();
  for (const state of [{ data: null, loading: true, error: null }, { data: null, loading: false, error: null }]) {
    mockCard = state;
    const r = await renderScreen(<CombineCard to="/portal/combine" />);
    expect(r.container.textContent).toBe('');
    await r.unmount();
  }
});

test('an error still links', async () => {
  mockCard = { data: null, loading: false, error: new Error('x') };
  const r = await renderScreen(<CombineCard to="/portal/combine" />);
  expect(r.text()).toContain(COMBINE_LOAD_ERROR);
  expect(r.button('Combine ›')).not.toBeNull();
  await r.click('Combine ›');
  expect(r.location().pathname).toBe('/portal/combine');
  await r.unmount();
});
