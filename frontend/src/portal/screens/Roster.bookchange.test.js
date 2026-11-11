import React from 'react';
import { renderScreen } from './testRender';
import { SessionAttendance } from './Roster';

// Spec 2026-11-11 §6: family cancels with their reason, and moves, show
// greyed below the athletes on a session's attendance screen - not counted,
// never marked, and hidden when the academy cancelled the whole session.
// The mock block is Roster.readonly.test.js's; the greyed list's own hook is
// mocked (hooks/cancelledBookings.test.js covers what it reads).
let mockLive;
let mockStatus;
let mockCancelled;
const mockCancelledCalls = [];
// S2: the marks sent, the bookings whose mark the rules refuse, and what the recheck finds.
const mockMarks = [];
let mockRefused;
let mockRecheck;
jest.mock('../hooks', () => ({
  useCoachRoster: () => ({ data: [], loading: false, error: null, retry: () => {} }),
  useSession: () => ({ data: { type: 'training', blockLabel: 'Block 1 of 3', name: 'Training block', meta: '3:00-4:00 PM', startsIn: 'Starts in 12 min' } }),
  useSessionAttendance: () => ({
    data: [
      { bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'confirmed' },
      { bookingId: 'b2', athleteId: 'a2', name: 'Avery Nguyen', status: 'noshow', noshowReason: 'Sick, parent texted' },
      { bookingId: 'b3', athleteId: 'a3', name: 'Sam Ortiz', status: 'attended' },
    ],
    loading: false,
    error: null,
    mark: async (bookingId, status) => {
      mockMarks.push([bookingId, status]);
      if (mockRefused.includes(bookingId)) throw Object.assign(new Error('updateBookingStatus: Missing or insufficient permissions.'), { code: 'permission-denied' });
    },
    setReason: async () => {},
    setSessionNote: async () => {},
    cancelSession: async () => {},
    sessionNote: null,
    sessionStatus: mockStatus,
    sessionMaxHandicap: null,
    sessionUnresolved: false,
  }),
  useTournamentResults: () => ({ data: null, loading: false, error: null, saveResults: async () => {} }),
  genericSessionName: () => 'Training block',
}));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => mockLive }));
jest.mock('../hooks/assessments', () => ({ useOpenAssessmentWindows: () => ({ data: null, loading: false, error: null }) }));
jest.mock('../hooks/cancelledBookings', () => ({
  __esModule: true,
  useCancelledBookings: (sessionId) => {
    mockCancelledCalls.push(sessionId);
    return { data: mockCancelled, loading: false, error: null };
  },
  markOrRecheck: async (mark, id, status) => {
    try {
      await mark(id, status);
      return false;
    } catch {
      return mockRecheck;
    }
  },
}));

const block = { date: '2026-11-03', time: '5:00 PM', type: 'training', name: 'Training block', meta: '3 of 14 booked' };
const roster = (props) => renderScreen(<SessionAttendance bare sessionId="2026-11-03-5" block={block} onBack={() => {}} {...props} />);
const greyed = (r) => r.container.querySelector('[aria-label="Cancelled or moved"]');
// The IN/OUT controls, one pair per row.
const controls = (r) => [...r.container.querySelectorAll('button[aria-pressed]')].filter((b) => ['IN', 'OUT'].includes(b.textContent)).length;
// The three counters, in document order, as "0 In 0 Out 0 Unmarked".
const counters = (r) => {
  const m = r.text().match(/(\d+)\s*In\s*(\d+)\s*Out\s*(\d+)\s*Unmarked/);
  return m ? `${m[1]} In ${m[2]} Out ${m[3]} Unmarked` : '';
};

beforeEach(() => {
  mockLive = true;
  mockStatus = 'scheduled';
  mockCancelled = [
    { bookingId: 'a4_2026-11-03-5', athleteId: 'a4', name: 'Reese Whitfield', line: 'Cancelled · Sick' },
    { bookingId: 'a5_2026-11-03-5', athleteId: 'a5', name: 'Nico Whitfield', line: 'Moved to Thu Nov 12, 4:00 PM' },
  ];
  mockCancelledCalls.length = 0;
  mockMarks.length = 0;
  mockRefused = [];
  mockRecheck = false;
});

test('a live session: the cancelled and moved rows sit below the athletes, inside the roster gutter, uncounted', async () => {
  const r = await roster();
  expect(mockCancelledCalls).toContain('2026-11-03-5');
  const el = greyed(r);
  expect(el).not.toBeNull();
  expect(el.textContent).toContain('Reese Whitfield');
  expect(el.textContent).toContain('Cancelled · Sick');
  expect(el.textContent).toContain('Moved to Thu Nov 12, 4:00 PM');
  // Inside the padded roster block, after the last athlete row.
  const block22 = el.parentElement;
  expect([block22.style.paddingLeft, block22.style.paddingRight]).toEqual(['22px', '22px']);
  expect(block22.lastElementChild).toBe(el);
  expect(r.text().indexOf('Sam Ortiz')).toBeLessThan(r.text().indexOf('Cancelled · Sick'));
  // Counted and marked: the three live rows only.
  expect(counters(r)).toBe('1 In 1 Out 1 Unmarked');
  expect(controls(r)).toBe(6);
  expect(el.querySelectorAll('button')).toHaveLength(0);
  await r.unmount();
});

test('a session the academy cancelled shows no greyed rows', async () => {
  mockStatus = 'cancelled';
  const r = await roster({ role: 'ops' });
  expect(greyed(r)).toBeNull();
  expect(r.text()).not.toContain('Cancelled · Sick');
  expect(r.text()).not.toContain('Moved to');
  await r.unmount();
});

test('the seed roster (no live session) reads no greyed rows', async () => {
  mockLive = false;
  const r = await renderScreen(<SessionAttendance bare onBack={() => {}} />);
  expect(greyed(r)).toBeNull();
  expect(mockCancelledCalls).toEqual([]);
  await r.unmount();
});

// Spec §6: a stale tap on a kid who just cancelled says so instead of failing silently.
const tap = async (r, label, row) => {
  const b = [...r.container.querySelectorAll('button[aria-pressed]')].filter((x) => x.textContent === label)[row];
  await r.act(async () => { b.click(); });
  await r.flush();
};
const status = (r) => r.container.querySelector('[role="status"]');

test('IN on a kid who just cancelled: "<name> cancelled - list updated."', async () => {
  mockRefused = ['b1'];
  mockRecheck = true;
  const r = await roster();
  await tap(r, 'IN', 0);
  expect(mockMarks).toEqual([['b1', 'attended']]);
  expect(status(r)).not.toBeNull();
  expect(status(r).textContent).toBe('Jordan Whitfield cancelled - list updated.');
  // Above the roster rows.
  expect(r.text().indexOf('cancelled - list updated.')).toBeLessThan(r.text().indexOf('Avery Nguyen'));
  // The next mark that lands clears it.
  mockRefused = [];
  await tap(r, 'OUT', 0);
  expect(mockMarks).toEqual([['b1', 'attended'], ['b1', 'noshow']]);
  expect(status(r)).toBeNull();
  await r.unmount();
});

test('a mark that lands, or a refusal on a booking still there, shows no line', async () => {
  const r = await roster();
  await tap(r, 'IN', 0);
  expect(mockMarks).toEqual([['b1', 'attended']]);
  expect(status(r)).toBeNull();
  await r.unmount();
  mockRefused = ['b1'];
  mockRecheck = false;
  const again = await roster();
  await tap(again, 'IN', 0);
  expect(status(again)).toBeNull();
  await again.unmount();
});
