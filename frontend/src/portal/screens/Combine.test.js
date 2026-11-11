/**
 * The Combine screen (plan Task 5, spec 4): four distance blocks, the
 * history with its inline delete, the read-only view and the load states.
 * useCombine is mocked; its own behavior is pinned in hooks/combine.test.js.
 */
import React from 'react';
import { renderScreen } from './testRender';
import Combine from './Combine';
import { bump } from '../hooks/invalidate';
import {
  COMBINE_DELETE_ERROR, COMBINE_LOAD_ERROR, COMBINE_READ_ONLY_NOTE, COMBINE_SAVE_ERROR, DATE_FUTURE_ERROR, SCORE_ERROR,
  bestIds, combineSummary, sortScores,
} from '../data/combine';

let mockState;
jest.mock('../hooks/combine', () => ({ useCombine: () => mockState }));
jest.mock('../hooks/invalidate', () => ({ ...jest.requireActual('../hooks/invalidate'), bump: jest.fn() }));

const at = (iso) => new Date(iso);
const ROWS = [
  { id: 'a', athleteId: 'jordan', distance: 'u100', score: 640, date: '2026-11-01', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: at('2026-11-01T22:00:00Z') },
  { id: 'b', athleteId: 'jordan', distance: 'u100', score: 655, date: '2026-11-05', enteredBy: 'u-jordan', enteredRole: 'athlete', createdAt: at('2026-11-06T01:00:00Z') },
  { id: 'c', athleteId: 'jordan', distance: 'u100', score: 655, date: '2026-11-09', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: at('2026-11-09T22:00:00Z') },
  { id: 'd', athleteId: 'jordan', distance: 'u100', score: 600, date: '2026-11-10', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: null },
  { id: 'e', athleteId: 'jordan', distance: 'u150', score: 1000, date: '2026-11-10', enteredBy: 'u-dana', enteredRole: 'parent', createdAt: at('2026-11-10T20:00:00Z') },
];

const viewOf = (viewer, canEnter = true) => {
  const summary = combineSummary(ROWS);
  return {
    athlete: { id: 'jordan', name: 'Jordan Whitfield' }, viewer, canEnter, rows: sortScores(ROWS), summary, best: bestIds(summary), today: '2026-11-12',
  };
};

beforeEach(() => {
  mockState = { data: viewOf({ uid: 'u-luke', role: 'coach' }), loading: false, error: null, save: jest.fn(), remove: jest.fn() };
});

const screen = (props = {}) => renderScreen(<Combine bare athleteId="jordan" onBack={() => {}} {...props} />);
const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const count = (text, part) => text.split(part).length - 1;
const deleteButtons = (r) => [...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Delete');
const rowEl = (r, id) => r.container.querySelector(`[data-score-id="${id}"]`);

test('the header and four blocks', async () => {
  const r = await screen();
  const text = r.text();
  ['Jordan Whitfield', 'Combine', 'Under 100 yd', 'Under 125 yd', 'Under 150 yd', 'Under 180 yd'].forEach((s) => expect(text).toContain(s));
  expect(text).toContain('Best 655 · Nov 5');
  expect(text).toContain('Latest 600 · Nov 10');
  expect(text).toContain('Best 1000 · Nov 10');
  expect(count(text, 'No score yet')).toBe(2);
  expect(field(r, 'Under 100 yd score').getAttribute('inputmode')).toBe('numeric');
  const date = field(r, 'Under 100 yd date');
  expect(date.getAttribute('type')).toBe('date');
  expect(date.value).toBe('2026-11-12');
  expect(date.getAttribute('max')).toBe('2026-11-12');
  expect(date.getAttribute('min')).toBe('2026-09-13');
  await r.unmount();
});

test("a score out of range is refused with the spec's copy", async () => {
  const r = await screen();
  for (const typed of ['1001', '742.5']) {
    await r.fill('Under 100 yd score', typed);
    await r.click('Save Under 100 yd');
    expect(r.text()).toContain(SCORE_ERROR);
  }
  expect(mockState.save).not.toHaveBeenCalled();
  await r.unmount();
});

test('a date after today is refused', async () => {
  const r = await screen();
  await r.fill('Under 100 yd score', '742');
  await r.fill('Under 100 yd date', '2026-11-13');
  await r.click('Save Under 100 yd');
  expect(r.text()).toContain(DATE_FUTURE_ERROR);
  expect(mockState.save).not.toHaveBeenCalled();
  await r.unmount();
});

test("a valid score saves once with today's date", async () => {
  mockState.save.mockResolvedValue();
  const r = await screen();
  await r.fill('Under 100 yd score', '742');
  await r.click('Save Under 100 yd');
  expect(mockState.save).toHaveBeenCalledTimes(1);
  expect(mockState.save).toHaveBeenCalledWith({ distance: 'u100', score: 742, date: '2026-11-12' });
  expect(field(r, 'Under 100 yd score').value).toBe('');
  expect(field(r, 'Under 100 yd date').value).toBe('2026-11-12');
  expect(r.text()).not.toContain(SCORE_ERROR);
  await r.unmount();
});

test('a double tap saves once (Review Focus 1)', async () => {
  mockState.save.mockReturnValue(new Promise(() => {}));
  const r = await screen();
  await r.fill('Under 100 yd score', '742');
  await r.click('Save Under 100 yd');
  await r.click('Save Under 100 yd');
  expect(mockState.save).toHaveBeenCalledTimes(1);
  const save = r.button('Save Under 100 yd');
  expect(save.textContent).toContain('Saving…');
  expect(save.disabled).toBe(true);
  await r.unmount();
});

test('a failed save says so and keeps the score', async () => {
  mockState.save.mockRejectedValue(new Error('offline'));
  const r = await screen();
  await r.fill('Under 125 yd score', '700');
  await r.click('Save Under 125 yd');
  expect(r.text()).toContain(COMBINE_SAVE_ERROR);
  expect(field(r, 'Under 125 yd score').value).toBe('700');
  await r.unmount();
});

test('a draft in another block survives a save (Review Focus 2)', async () => {
  mockState.save.mockResolvedValue();
  const r = await screen();
  await r.fill('Under 125 yd score', '700');
  await r.fill('Under 100 yd score', '742');
  await r.click('Save Under 100 yd');
  const newRow = { id: 'f', athleteId: 'jordan', distance: 'u100', score: 742, date: '2026-11-12', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: null };
  mockState = { ...mockState, loading: true, data: { ...mockState.data, rows: [newRow, ...mockState.data.rows] } };
  await r.rerender(<Combine bare athleteId="jordan" onBack={() => {}} />);
  expect(field(r, 'Under 125 yd score').value).toBe('700');
  expect(r.text()).not.toContain('Loading');
  expect(rowEl(r, 'f')).not.toBeNull();
  await r.unmount();
});

test('history: newest first, role words, one Best per distance', async () => {
  const r = await screen();
  const ids = [...r.container.querySelectorAll('[data-score-id]')].map((el) => el.getAttribute('data-score-id'));
  expect(ids).toEqual(['d', 'e', 'c', 'b', 'a']);
  const e = rowEl(r, 'e').textContent;
  expect(e).toContain('1000');
  expect(e).not.toContain('1,000');
  expect(e).toContain('Parent');
  expect(e).toContain('Under 150 yd');
  expect(e).toContain('Nov 10');
  expect(rowEl(r, 'b').textContent).toContain('Athlete');
  expect(rowEl(r, 'a').textContent).toContain('Coach');
  const withBest = ids.filter((id) => rowEl(r, id).textContent.includes('Best'));
  expect(withBest).toEqual(['e', 'b']);
  await r.unmount();
});

test('delete asks inline, Keep keeps', async () => {
  const confirm = jest.spyOn(window, 'confirm');
  mockState.remove.mockResolvedValue();
  const r = await screen();
  expect(deleteButtons(r)).toHaveLength(3);
  expect(['a', 'c', 'd'].every((id) => rowEl(r, id).querySelector('button'))).toBe(true);
  expect(rowEl(r, 'b').querySelector('button')).toBeNull();
  await r.click('Delete 600 · Under 100 yd · Nov 10');
  expect(r.text()).toContain('Delete this score?');
  await r.click('Keep');
  expect(r.text()).not.toContain('Delete this score?');
  expect(mockState.remove).not.toHaveBeenCalled();
  await r.click('Delete 600 · Under 100 yd · Nov 10');
  await r.click('Delete this score');
  expect(mockState.remove).toHaveBeenCalledTimes(1);
  expect(mockState.remove).toHaveBeenCalledWith('d');
  expect(confirm).not.toHaveBeenCalled();
  confirm.mockRestore();
  await r.unmount();
});

test('a failed delete says so', async () => {
  mockState.remove.mockRejectedValue(new Error('offline'));
  const r = await screen();
  await r.click('Delete 640 · Under 100 yd · Nov 1');
  await r.click('Delete this score');
  expect(r.text()).toContain(COMBINE_DELETE_ERROR);
  await r.unmount();
});

test('ops reads only', async () => {
  mockState.data = viewOf({ uid: 'u-ops', role: 'ops' }, false);
  const r = await screen();
  const inputs = [...r.container.querySelectorAll('input')];
  expect(inputs.filter((i) => (i.getAttribute('aria-label') || '').endsWith('score'))).toHaveLength(0);
  expect([...r.container.querySelectorAll('button')].filter((b) => /^Save/.test(b.textContent.trim()) || /^Save/.test(b.getAttribute('aria-label') || ''))).toHaveLength(0);
  expect(r.text()).toContain(COMBINE_READ_ONLY_NOTE);
  expect(r.text()).toContain('Best 655 · Nov 5');
  expect(r.container.querySelectorAll('[data-score-id]')).toHaveLength(5);
  expect(deleteButtons(r)).toHaveLength(0);
  await r.unmount();

  mockState.data = viewOf({ uid: 'owner', role: 'owner' });
  const owner = await screen();
  expect(deleteButtons(owner)).toHaveLength(5);
  await owner.unmount();
});

test("a failed load says so, and Try again reloads", async () => {
  mockState = { ...mockState, data: null, loading: false, error: new Error('x') };
  const r = await screen();
  expect(r.text()).toContain(COMBINE_LOAD_ERROR);
  expect(r.button('Try again')).not.toBeNull();
  await r.click('Try again');
  expect(bump).toHaveBeenCalledWith('combineScores');
  await r.unmount();
});

test("loading shows the caller's name", async () => {
  mockState = { ...mockState, data: null, loading: true, error: null };
  const r = await screen({ fallbackName: 'Sam Lee' });
  expect(r.text()).toContain('Sam Lee');
  expect(r.text()).toContain('Loading…');
  expect(field(r, 'Under 100 yd score')).toBeNull();
  await r.unmount();
});

test('Back goes back (Review Focus 9)', async () => {
  const onBack = jest.fn();
  const r = await screen({ onBack });
  await r.click('‹ Back');
  expect(onBack).toHaveBeenCalledTimes(1);
  await r.unmount();
});
