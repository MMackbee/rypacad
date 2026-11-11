/**
 * components/combine/TrainingRowExtras.js: what a training session's
 * attendance row adds (spec 3 and 4): the Parallax intake swings tick from
 * the useParallaxIntakes result, and the Combine button.
 */
import React from 'react';
import { renderScreen } from '../../screens/testRender';
import TrainingRowExtras from './TrainingRowExtras';

const LUKE = { uid: 'u-luke', role: 'coach', byName: 'Luke' };
const checkbox = (r) => r.container.querySelector('[role="checkbox"]');

// Built per test: resetMocks strips jest.fn implementations made at module scope.
const intakesOf = (byAthlete, over = {}) => ({
  data: { byAthlete, viewer: LUKE },
  loading: false,
  error: null,
  tick: jest.fn(async () => 'done'),
  undo: jest.fn(async () => {}),
  ...over,
});

const extras = (props) => renderScreen(
  <TrainingRowExtras athleteId="a1" name="Jordan Whitfield" combineName="Jordan Whitfield" role="coach" readOnly={false} {...props} />
);

test('a coach row: tick and Combine', async () => {
  const intakes = intakesOf({ a1: null });
  const onOpenCombine = jest.fn();
  const r = await extras({ intakes, onOpenCombine });
  expect(checkbox(r).getAttribute('aria-checked')).toBe('false');
  await r.click('Parallax intake swings: Jordan Whitfield');
  expect(intakes.tick).toHaveBeenCalledWith('a1');
  await r.click('Combine: Jordan Whitfield');
  expect(onOpenCombine).toHaveBeenCalledWith('a1', 'Jordan Whitfield');
  await r.unmount();
});

test('the coach who just ticked undoes from the row', async () => {
  const intakes = intakesOf({ a1: { athleteId: 'a1', at: new Date(), by: 'u-luke', byName: 'Luke' } });
  const r = await extras({ intakes, onOpenCombine: jest.fn() });
  expect(checkbox(r).getAttribute('aria-checked')).toBe('true');
  await r.click('Parallax intake swings: Jordan Whitfield');
  expect(intakes.undo).toHaveBeenCalledWith('a1');
  expect(intakes.tick).not.toHaveBeenCalled();
  await r.unmount();
});

test('read-only: disabled tick, no Combine', async () => {
  const intakes = intakesOf({ a1: null });
  const r = await extras({ intakes, onOpenCombine: jest.fn(), readOnly: true, role: 'mental' });
  expect(checkbox(r).disabled).toBe(true);
  expect(r.button('Combine: Jordan Whitfield')).toBeNull();
  await r.unmount();
});

test('no intakes: no tick', async () => {
  const r = await extras({ intakes: null, onOpenCombine: jest.fn() });
  expect(checkbox(r)).toBeNull();
  expect(r.button('Combine: Jordan Whitfield')).not.toBeNull();
  await r.unmount();
});

test('an athlete not in the loaded ids shows nothing yet', async () => {
  const r = await extras({ intakes: intakesOf({}), onOpenCombine: jest.fn() });
  expect(checkbox(r)).toBeNull();
  await r.unmount();
  const loading = await extras({ intakes: intakesOf(null, { data: null, loading: true }) });
  expect(checkbox(loading)).toBeNull();
  await loading.unmount();
});

test('a failed read says so on the row', async () => {
  const r = await extras({ intakes: intakesOf(null, { data: null, error: { code: 'permission-denied' } }) });
  expect(checkbox(r)).toBeNull();
  expect(r.text()).toContain("Parallax intake swings didn't load.");
  await r.unmount();
});

test('an unreadable athlete opens Combine with no name', async () => {
  const onOpenCombine = jest.fn();
  const r = await extras({ intakes: null, name: 'Name unavailable', combineName: null, onOpenCombine });
  await r.click('Combine: Name unavailable');
  expect(onOpenCombine).toHaveBeenCalledWith('a1', null);
  await r.unmount();
});

test('neither: renders nothing', async () => {
  const r = await extras({ intakes: null });
  expect(r.text()).toBe('');
  expect(r.container.querySelector('button')).toBeNull();
  await r.unmount();
});
