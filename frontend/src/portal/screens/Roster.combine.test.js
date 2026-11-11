/**
 * SessionAttendance (screens/Roster.js) on a training session: each row
 * shows the Parallax intake swings tick and the Combine button (spec 3 and
 * 4), and the block's Start session / Close block state survives a trip to
 * Combine and Back (plan, Decided here 11).
 */
import React from 'react';
import { renderScreen } from './testRender';
import { SessionAttendance } from './Roster';
import { clearSessionLocalStatus } from '../hooks/sessionLocalStatus';

let mockStatus;
let mockIntakes;
const mockCalls = [];
const mockLive = { value: true };
jest.mock('../hooks', () => ({
  useCoachRoster: () => ({ data: [], loading: false }),
  useSession: () => ({ data: { type: 'training', blockLabel: 'Block 1 of 3', name: 'Training block', meta: '3:00-4:00 PM', startsIn: 'Starts in 12 min' } }),
  useSessionAttendance: () => ({
    data: [
      { bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'confirmed' },
      { bookingId: 'b2', athleteId: 'a2', name: 'Sam Lee', status: 'confirmed' },
    ],
    loading: false,
    error: null,
    mark: () => {},
    sessionNote: null,
    sessionStatus: mockStatus,
    sessionMaxHandicap: null,
  }),
  genericSessionName: () => 'Training block',
}));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => mockLive.value }));
jest.mock('../hooks/assessments', () => ({ useOpenAssessmentWindows: () => ({ data: { byAthlete: {} }, loading: false, error: null }) }));
jest.mock('../hooks/cancelledBookings', () => ({ useCancelledBookings: () => ({ data: [], loading: false, error: null }), markOrRecheck: async (mark, id, status) => { await mark(id, status); return false; } }));
jest.mock('../hooks/parallax', () => ({
  __esModule: true,
  useParallaxIntakes: (ids, opts) => {
    mockCalls.push({ ids, ...opts });
    return mockIntakes ?? jest.requireActual('../hooks/parallax').useParallaxIntakes(ids, opts);
  },
}));

const block = (type) => ({ date: '2026-11-05', time: '3:00 PM', type, name: type === 'training' ? 'Training block' : 'Session', meta: '2 of 6 booked' });
const roster = (type, props = {}) => renderScreen(<SessionAttendance bare sessionId="2026-11-05-0" block={block(type)} onBack={() => {}} {...props} />);
const checkboxes = (r) => [...r.container.querySelectorAll('[role="checkbox"]')];
const combineButtons = (r) => r.container.querySelectorAll('[aria-label^="Combine:"]');
const lastCall = () => mockCalls[mockCalls.length - 1];

beforeEach(() => {
  mockIntakes = {
    data: {
      byAthlete: { a1: { athleteId: 'a1', at: new Date('2026-11-05T21:00:00Z'), by: 'u-luke', byName: 'Luke' }, a2: null },
      viewer: { uid: 'u-sam', role: 'coach', byName: 'Sam' },
    },
    loading: false,
    error: null,
    tick: jest.fn(async () => 'done'),
    undo: jest.fn(async () => {}),
  };
  mockStatus = 'scheduled';
  mockLive.value = true;
  mockCalls.length = 0;
  clearSessionLocalStatus();
  jest.requireActual('../hooks/parallax').clearIntakeCache();
});

test('a training session: one read for the rows, a tick and Combine per row', async () => {
  const onOpenCombine = jest.fn();
  const r = await roster('training', { showIntake: true, onOpenCombine });
  expect(lastCall()).toEqual({ ids: ['a1', 'a2'], enabled: true });
  expect(r.button('Parallax intake swings: Jordan Whitfield').getAttribute('aria-checked')).toBe('true');
  expect(r.text()).toContain('done Nov 5 · Luke');
  expect(r.button('Parallax intake swings: Sam Lee').getAttribute('aria-checked')).toBe('false');
  await r.click('Parallax intake swings: Sam Lee');
  expect(mockIntakes.tick).toHaveBeenCalledWith('a2');
  await r.click('Combine: Sam Lee');
  expect(onOpenCombine).toHaveBeenCalledWith('a2', 'Sam Lee');
  await r.unmount();
});

test('Tour event, Phil and mental sessions show neither and read nothing', async () => {
  for (const type of ['tournament', 'phil', 'mental']) {
    mockCalls.length = 0;
    const r = await roster(type, { showIntake: true, onOpenCombine: jest.fn() });
    expect(lastCall().enabled).toBe(false);
    expect(checkboxes(r)).toHaveLength(0);
    expect(combineButtons(r)).toHaveLength(0);
    await r.unmount();
  }
});

test('read-only (Yannick, ops): the tick is shown disabled, no Combine', async () => {
  for (const role of ['mental', 'ops']) {
    const r = await roster('training', { showIntake: true, onOpenCombine: jest.fn(), readOnly: true, role });
    expect(checkboxes(r)).toHaveLength(2);
    expect(checkboxes(r).every((b) => b.disabled)).toBe(true);
    expect(r.text()).toContain('done Nov 5 · Luke');
    expect(combineButtons(r)).toHaveLength(0);
    await r.unmount();
  }
});

test('ops on a writable roster still cannot tick', async () => {
  const r = await roster('training', { showIntake: true, role: 'ops' });
  expect(checkboxes(r)).toHaveLength(2);
  expect(checkboxes(r).every((b) => b.disabled)).toBe(true);
  await r.unmount();
});

test('without showIntake: no tick and no read; Combine still offered', async () => {
  const r = await roster('training', { onOpenCombine: jest.fn() });
  expect(lastCall().enabled).toBe(false);
  expect(checkboxes(r)).toHaveLength(0);
  expect(r.button('Combine: Jordan Whitfield')).not.toBeNull();
  await r.unmount();
});

test('a cancelled session shows neither and reads nothing', async () => {
  mockStatus = 'cancelled';
  const r = await roster('training', { showIntake: true, onOpenCombine: jest.fn() });
  expect(lastCall().enabled).toBe(false);
  expect(checkboxes(r)).toHaveLength(0);
  expect(combineButtons(r)).toHaveLength(0);
  await r.unmount();
});

// Live mode with no session id (a typed or bookmarked /portal/attendance)
// shows the demo rows: nothing on them may read or write real athletes.
test('live, no session: the demo rows read no ticks and offer no Combine', async () => {
  const r = await roster('training', { sessionId: undefined, showIntake: true, onOpenCombine: jest.fn() });
  expect(lastCall().ids).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  expect(lastCall().enabled).toBe(false);
  expect(checkboxes(r)).toHaveLength(0);
  expect(combineButtons(r)).toHaveLength(0);
  await r.unmount();
});

test('seed: the real hook ticks r1 and r4 (Review Focus 6)', async () => {
  mockLive.value = false;
  mockIntakes = null;
  const r = await roster('training', { sessionId: undefined, showIntake: true });
  expect(lastCall()).toEqual({ ids: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], enabled: true });
  expect(r.button('Parallax intake swings: A. Nguyen').getAttribute('aria-checked')).toBe('true');
  expect(r.button('Parallax intake swings: J. Whitfield').getAttribute('aria-checked')).toBe('true');
  expect(r.text()).toContain('done Nov 3 · Luke');
  expect(r.button('Parallax intake swings: M. Okonkwo').getAttribute('aria-checked')).toBe('false');
  await r.unmount();
});

test("the block's Start state survives a trip to Combine (Review Focus 9)", async () => {
  const onOpenCombine = jest.fn();
  const first = await roster('training', { showIntake: true, onOpenCombine });
  await first.click('Start session');
  expect(first.text()).toContain('Close block');
  await first.unmount();
  const back = await roster('training', { showIntake: true, onOpenCombine });
  expect(back.text()).toContain('Close block');
  expect(back.button('Start session')).toBeNull();
  await back.unmount();
  const other = await roster('training', { showIntake: true, onOpenCombine, sessionId: '2026-11-06-0' });
  expect(other.button('Start session')).not.toBeNull();
  await other.unmount();
});

test('a roster with no session id keeps its Start state to itself', async () => {
  mockLive.value = false;
  const first = await roster('training', { sessionId: undefined });
  await first.click('Start session');
  expect(first.text()).toContain('Close block');
  await first.unmount();
  const again = await roster('training', { sessionId: undefined });
  expect(again.button('Start session')).not.toBeNull();
  await again.unmount();
});
