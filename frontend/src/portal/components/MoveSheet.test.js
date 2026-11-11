/**
 * The Move sheet (spec 2026-11-11 §5): open sessions of the same kind under
 * their days, a question naming both times, one move per tap. A refusal never
 * claims more than it knows: about the new session, back to a reloaded list;
 * about the booking itself, a line and Close; no answer at all, "check your
 * list".
 */
import React, { act } from 'react';
import MoveSheet, { moveQuestion, moveRefusalCopy, moveTitle } from './MoveSheet';
import { renderScreen } from '../screens/testRender';

let mockOptions;
let mockMove;
const mockOptionCalls = [];
const mockMoves = [];
const mockBumps = [];
jest.mock('../hooks/move', () => ({
  useMoveOptions: (row, reloadKey = 0) => {
    mockOptionCalls.push([row.bookingId, reloadKey]);
    return mockOptions;
  },
  moveBooking: (args) => {
    mockMoves.push(args);
    return mockMove(args);
  },
}));
jest.mock('../hooks/invalidate', () => ({ bump: (name) => mockBumps.push(name) }));

const ROW = { id: 's1', bookingId: 'b1', date: '2026-11-10', time: '4:00', meridiem: 'PM', type: 'training', name: 'Training block' };
const OPTION = { id: 's2', date: '2026-11-12', time: '4:00', meridiem: 'PM', fullTime: '4:00 PM', type: 'training', name: 'Training block', capacityLabel: '9 left' };
const DAYS = { days: [{ iso: '2026-11-12', label: 'Thu, Nov 12', sessions: [OPTION] }] };
const refusal = (reason, message = 'x') => Object.assign(new Error(message), { code: 'invalid-argument', reason });

async function mount(props = {}) {
  const calls = { close: 0, moved: [] };
  const r = await renderScreen(
    <MoveSheet row={ROW} name="Jordan Whitfield" onClose={() => { calls.close += 1; }} onMoved={(res) => { calls.moved.push(res); }} {...props} />
  );
  return { ...r, calls };
}

beforeEach(() => {
  mockOptions = { data: DAYS, loading: false, error: null };
  mockMove = async (args) => ({ bookingId: `jordan_${args.toSessionId}` });
  mockOptionCalls.length = 0;
  mockMoves.length = 0;
  mockBumps.length = 0;
});

test('the titles, by kind', () => {
  expect(moveTitle('training')).toBe('Move to another Training block');
  expect(moveTitle('tournament')).toBe('Move to another Tour event');
  expect(moveTitle('phil')).toBe('Move to another Phil session');
});

test('the question names both times, and the athlete when there is one', () => {
  expect(moveQuestion({ name: 'Jordan', from: ROW, to: OPTION })).toBe('Move Jordan from Tue Nov 10, 4:00 PM to Thu Nov 12, 4:00 PM?');
  expect(moveQuestion({ name: null, from: ROW, to: OPTION })).toBe('Move from Tue Nov 10, 4:00 PM to Thu Nov 12, 4:00 PM?');
});

test('loading, a load that failed, and nothing to move to', async () => {
  mockOptions = { data: null, loading: true, error: null };
  const loading = await mount();
  expect(loading.text()).toContain('Finding open sessions...');
  await loading.unmount();
  mockOptions = { data: null, loading: false, error: new Error('offline') };
  const failed = await mount();
  expect(failed.text()).toContain("Open sessions didn't load. Check your connection and try again.");
  await failed.unmount();
  mockOptions = { data: { days: [] }, loading: false, error: null };
  const empty = await mount();
  expect(empty.text()).toContain('No open sessions like this in your booking window.');
  await empty.unmount();
});

test('the options under their day; a tap asks; Keep it goes back to the list', async () => {
  const r = await mount();
  expect(r.text()).toContain('Move to another Training block');
  expect(r.text()).toContain('Thu, Nov 12');
  expect(r.text()).toContain('9 left');
  await r.click('Thu, Nov 12 4:00 PM');
  expect(r.text()).toContain('Move Jordan from Tue Nov 10, 4:00 PM to Thu Nov 12, 4:00 PM?');
  expect(r.button('Move')).not.toBeNull();
  await r.click('Keep it');
  expect(r.text()).not.toContain('Move Jordan from');
  expect(r.text()).toContain('Thu, Nov 12');
  expect(mockMoves).toEqual([]);
  await r.unmount();
});

test('Move moves once on a double tap, then hands back the result (Review Focus 3)', async () => {
  const r = await mount();
  await r.click('Thu, Nov 12 4:00 PM');
  const move = r.button('Move');
  await act(async () => { move.click(); move.click(); });
  expect(mockMoves).toEqual([{ bookingId: 'b1', toSessionId: 's2' }]);
  expect(r.calls.moved).toEqual([{ bookingId: 'jordan_s2' }]);
  await r.unmount();
});

test('the new session just filled: back to the list, reloaded, nothing moved (Review Focus 8)', async () => {
  mockMove = async () => { throw refusal('full', 'That session just filled.'); };
  const r = await mount();
  await r.click('Thu, Nov 12 4:00 PM');
  await r.click('Move');
  expect(r.text()).toContain('This session just filled. Nothing was changed.');
  expect(mockOptionCalls.some(([, key]) => key === 1)).toBe(true);
  expect(r.text()).toContain('Thu, Nov 12');
  expect(r.calls.moved).toEqual([]);
  await r.unmount();
});

test('a refusal line goes when another session is picked; Keep it shows the list without it', async () => {
  mockMove = async () => { throw refusal('full', 'That session just filled.'); };
  const r = await mount();
  await r.click('Thu, Nov 12 4:00 PM');
  await r.click('Move');
  expect(r.text()).toContain('This session just filled. Nothing was changed.');
  await r.click('Thu, Nov 12 4:00 PM');
  expect(r.text()).not.toContain('Nothing was changed.');
  await r.click('Keep it');
  expect(r.text()).toContain('Thu, Nov 12');
  expect(r.text()).not.toContain('Nothing was changed.');
  await r.unmount();
});

test('the booking has started: the line and Close (Review Focus 4)', async () => {
  mockMove = async () => { throw refusal('already-started'); };
  const r = await mount();
  await r.click('Thu, Nov 12 4:00 PM');
  await r.click('Move');
  expect(r.text()).toContain('This session has already started. Nothing was changed.');
  expect([...r.container.querySelectorAll('button')].map((b) => b.textContent.trim())).toEqual(['Close']);
  await r.click('Close');
  expect(r.calls.close).toBe(1);
  await r.unmount();
});

test('a line without a full stop gets one before "Nothing was changed."', async () => {
  mockMove = async () => { throw refusal('calendly-managed'); };
  const r = await mount();
  await r.click('Thu, Nov 12 4:00 PM');
  await r.click('Move');
  expect(r.text()).toContain("Cancel or reschedule from Calendly's email. Nothing was changed.");
  await r.unmount();
});

test('another device changed it: says so alone, and the lists refresh', async () => {
  mockMove = async () => { throw refusal('not-confirmed'); };
  const r = await mount();
  await r.click('Thu, Nov 12 4:00 PM');
  await r.click('Move');
  expect(r.text()).toContain('This booking was already changed.');
  expect(r.text()).not.toContain('Nothing was changed.');
  expect(mockBumps).toEqual(['bookings']);
  await r.unmount();
});

test('no answer from the server: check the list, both lists refresh, only Close', async () => {
  mockMove = async () => { throw Object.assign(new Error('deadline-exceeded'), { code: 'unavailable', reason: null }); };
  const r = await mount();
  await r.click('Thu, Nov 12 4:00 PM');
  await r.click('Move');
  expect(r.text()).toContain("We couldn't confirm the move. Check your list before trying again.");
  expect(mockBumps).toEqual(['bookings', 'sessions', 'waitlist']);
  expect([...r.container.querySelectorAll('button')].map((b) => b.textContent.trim())).toEqual(['Close']);
  await r.unmount();
});

test('an athlete\'s own login is asked without a name', async () => {
  const r = await mount({ name: undefined });
  await r.click('Thu, Nov 12 4:00 PM');
  expect(r.text()).toContain('Move from Tue Nov 10, 4:00 PM to Thu Nov 12, 4:00 PM?');
  await r.unmount();
});

test('nothing in the sheet mentions a token', async () => {
  const r = await mount();
  expect(r.text()).not.toMatch(/token/i);
  await r.click('Thu, Nov 12 4:00 PM');
  expect(r.text()).not.toMatch(/token/i);
  await r.unmount();
});

test('moveRefusalCopy: its own lines, then the booking copy, then the message', () => {
  expect(moveRefusalCopy({ reason: 'mental-no-move' })).toBe("A 1:1 can't be moved in the app.");
  expect(moveRefusalCopy({ reason: 'not-confirmed' })).toBe('This booking was already changed.');
  expect(moveRefusalCopy({ reason: 'session-past' })).toBe('That session has already started.');
  expect(moveRefusalCopy({ reason: 'already-started' })).toBe('This session has already started.');
  expect(moveRefusalCopy({ reason: 'full' })).toBe('This session just filled.');
  // The new session's period, which may not be this one (late November into December).
  expect(moveRefusalCopy({ reason: 'no-tokens-left' })).toBe('No tokens left for that period.');
  expect(moveRefusalCopy({ reason: 'something-new', message: 'Plain words.' })).toBe('Plain words.');
  expect(moveRefusalCopy({})).toBe("The move didn't go through.");
});
