/**
 * components/CancelledRows.js (spec 2026-11-11 §6): the greyed rows under a
 * session's attendance list. The hook is mocked; hooks/cancelledBookings.test.js
 * covers what it reads.
 */
import React from 'react';
import { renderScreen } from '../screens/testRender';
import CancelledRows from './CancelledRows';

let mockState;
const mockCalls = [];
jest.mock('../hooks/cancelledBookings', () => ({
  __esModule: true,
  useCancelledBookings: (sessionId) => {
    mockCalls.push(sessionId);
    return mockState;
  },
}));

const ROWS = [
  { bookingId: 'jordan_2026-11-10-0', athleteId: 'jordan', name: 'Jordan Whitfield', line: 'Cancelled · Sick' },
  { bookingId: 'ava_2026-11-10-0', athleteId: 'ava', name: null, line: 'Moved to Thu Nov 12, 4:00 PM' },
];
const list = (r) => r.container.querySelector('[aria-label="Cancelled or moved"]');

beforeEach(() => {
  mockState = { data: ROWS, loading: false, error: null };
  mockCalls.length = 0;
});

test('each row shows its name and line, greyed, with nothing to tap', async () => {
  const r = await renderScreen(<CancelledRows sessionId="2026-11-10-0" />);
  expect(mockCalls).toContain('2026-11-10-0');
  const el = list(r);
  expect(el).not.toBeNull();
  const texts = [...el.children].map((row) => row.textContent);
  expect(texts).toHaveLength(2);
  expect(texts[0]).toContain('Jordan Whitfield');
  expect(texts[0]).toContain('Cancelled · Sick');
  expect(texts[1]).toContain('Name unavailable');
  expect(texts[1]).toContain('Moved to Thu Nov 12, 4:00 PM');
  expect([...el.children].map((row) => row.style.opacity)).toEqual(['0.5', '0.5']);
  expect(el.querySelectorAll('button')).toHaveLength(0);
  expect(r.button('IN')).toBeNull();
  expect(r.button('OUT')).toBeNull();
  await r.unmount();
});

test('the list is a named group, so a screen reader announces it', async () => {
  const r = await renderScreen(<CancelledRows sessionId="2026-11-10-0" />);
  expect(list(r).getAttribute('role')).toBe('group');
  await r.unmount();
});

test('a re-read (every IN/OUT tap) keeps the rows on screen; an error or another session does not', async () => {
  const r = await renderScreen(<CancelledRows sessionId="2026-11-10-0" />);
  mockState = { data: null, loading: true, error: null };
  await r.rerender(<CancelledRows sessionId="2026-11-10-0" />);
  expect(list(r)).not.toBeNull();
  expect(list(r).textContent).toContain('Cancelled · Sick');
  await r.rerender(<CancelledRows sessionId="2026-11-11-0" />);
  expect(list(r)).toBeNull();
  await r.rerender(<CancelledRows sessionId="2026-11-10-0" />);
  mockState = { data: null, loading: false, error: new Error('no') };
  await r.rerender(<CancelledRows sessionId="2026-11-10-0" />);
  expect(list(r)).toBeNull();
  await r.unmount();
});

test('an empty, loading or failed list renders nothing', async () => {
  for (const state of [
    { data: [], loading: false, error: null },
    { data: null, loading: true, error: null },
    { data: null, loading: false, error: new Error('no') },
  ]) {
    mockState = state;
    const r = await renderScreen(<CancelledRows sessionId="2026-11-10-0" />);
    expect(r.container.innerHTML).toBe('');
    await r.unmount();
  }
});
