/**
 * cancelBooking's written shape (tester Mike, 2026-09-30: cancel a series).
 * A series cancel is the SAME transaction as a single cancel plus
 * cancelledVia 'series', so onBookingCancelled sends no notice per week; a
 * single cancel clears a marker an earlier series cancel may have left.
 * Firebase is mocked out entirely, as in live.test.js.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
// Plain functions, not jest.fn(): CRA's resetMocks would clear them before every test.
jest.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ path: name }),
  doc: (_db, col, id) => ({ path: `${col}/${id}` }),
  deleteField: () => 'DELETE_FIELD',
  serverTimestamp: () => 'SERVER_TIME',
  // mockCommitError: the commit refused after the transaction ran (the rules).
  runTransaction: async (_db, fn) => {
    await fn({ get: async (ref) => mockSnap(ref.path), update: (ref, data) => mockUpdates.push({ path: ref.path, data }) });
    if (mockCommitError) throw mockCommitError;
  },
}));
jest.mock('./invalidate', () => ({ bump: (name) => mockBumps.push(name) }));

const mockDocs = {
  'bookings/a1_s1': { athleteId: 'a1', sessionId: 's1', householdId: 'h1', status: 'confirmed' },
  'bookings/a1_cal': { athleteId: 'a1', sessionId: 's1', householdId: 'h1', status: 'confirmed', source: 'calendly' },
  'sessions/s1': { date: '2026-11-10', time: '4:00 PM', type: 'training', capacity: 8, booked: 3, status: 'scheduled' },
  // Spec 2026-11-11: a cancel until the start, a 1:1 until the day before.
  'bookings/a1_today': { athleteId: 'a1', sessionId: 's0', householdId: 'h1', status: 'confirmed' },
  'sessions/s0': { date: '2026-11-09', time: '4:00 PM', type: 'training', capacity: 8, booked: 3, status: 'scheduled' },
  'bookings/a1_m0': { athleteId: 'a1', sessionId: 'm0', householdId: 'h1', status: 'confirmed', type: 'mental' },
  'sessions/m0': { date: '2026-11-09', time: '4:00 PM', type: 'mental', capacity: 1, booked: 1, status: 'scheduled' },
  'bookings/a1_gone': { athleteId: 'a1', sessionId: 's1', householdId: 'h1', status: 'cancelled', cancelReason: 'member' },
};
const mockUpdates = [];
const mockBumps = [];
let mockCommitError = null;
function mockSnap(path) {
  const data = mockDocs[path];
  return { id: path.split('/')[1], exists: () => Boolean(data), data: () => data };
}

import { auth } from '../../firebase';
import { ERR, cancelBooking } from './live';
import { SERIES_STOP_COPY } from './cancelSeries';

beforeEach(() => {
  // Noon Mon Nov 9 in Chicago: s0 (4:00 PM) is later today, s1 is tomorrow.
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-11-09T18:00:00Z'));
  auth.currentUser = { uid: 'p1' };
  mockUpdates.length = 0;
  mockBumps.length = 0;
  mockCommitError = null;
});
afterEach(() => {
  jest.useRealTimers();
  auth.currentUser = null;
});

test('a single cancel writes no series marker (and clears a stale one), gives the seat back, refreshes', async () => {
  const out = await cancelBooking({ bookingId: 'a1_s1' });
  expect(out).toEqual({ id: 'a1_s1', status: 'cancelled' });
  expect(mockUpdates).toEqual([
    { path: 'bookings/a1_s1', data: { status: 'cancelled', cancelledBy: 'p1', cancelReason: 'member', cancelledVia: 'DELETE_FIELD' } },
    { path: 'sessions/s1', data: { booked: 2 } },
  ]);
  expect(mockBumps).toEqual(['bookings', 'sessions']);
});

test("a series cancel is the same two writes plus cancelledVia 'series'; silent leaves the refresh to the caller", async () => {
  await cancelBooking({ bookingId: 'a1_s1', cancelledVia: 'series', silent: true });
  expect(mockUpdates).toEqual([
    { path: 'bookings/a1_s1', data: { status: 'cancelled', cancelledBy: 'p1', cancelReason: 'member', cancelledVia: 'series' } },
    { path: 'sessions/s1', data: { booked: 2 } },
  ]);
  expect(mockBumps).toEqual([]);
});

test("'series' is the only marker ever written - the rules admit nothing else", async () => {
  await cancelBooking({ bookingId: 'a1_s1', cancelledVia: 'bulk' });
  expect(mockUpdates[0].data.cancelledVia).toBe('DELETE_FIELD');
});

test('a Calendly booking is refused in a series exactly as on its own', async () => {
  await expect(cancelBooking({ bookingId: 'a1_cal', cancelledVia: 'series', silent: true })).rejects.toMatchObject({
    code: ERR.INVALID,
    reason: 'calendly-managed',
  });
  expect(mockUpdates).toEqual([]);
});

describe('a cancel with a reason, until the start (spec 2026-11-11 §4)', () => {
  test('a reason writes its category, removes a stale note, and stamps the server time', async () => {
    await cancelBooking({ bookingId: 'a1_s1', reason: { category: 'sick', note: null } });
    expect(mockUpdates).toEqual([
      {
        path: 'bookings/a1_s1',
        data: { status: 'cancelled', cancelledBy: 'p1', cancelReason: 'member', cancelledVia: 'DELETE_FIELD', cancelCategory: 'sick', cancelNote: 'DELETE_FIELD', cancelledAt: 'SERVER_TIME' },
      },
      { path: 'sessions/s1', data: { booked: 2 } },
    ]);
  });

  test('Other carries its note', async () => {
    await cancelBooking({ bookingId: 'a1_s1', reason: { category: 'other', note: 'dentist' } });
    expect(mockUpdates[0].data).toMatchObject({ cancelCategory: 'other', cancelNote: 'dentist', cancelledAt: 'SERVER_TIME' });
  });

  test('a series week carries the same reason', async () => {
    await cancelBooking({ bookingId: 'a1_s1', cancelledVia: 'series', silent: true, reason: { category: 'school', note: null } });
    expect(mockUpdates[0].data).toEqual({
      status: 'cancelled', cancelledBy: 'p1', cancelReason: 'member', cancelledVia: 'series',
      cancelCategory: 'school', cancelNote: 'DELETE_FIELD', cancelledAt: 'SERVER_TIME',
    });
  });

  test('an unusable reason is refused before any read', async () => {
    await expect(cancelBooking({ bookingId: 'a1_s1', reason: { category: 'bored' } })).rejects.toMatchObject({ code: ERR.INVALID, reason: 'bad-reason' });
    expect(mockUpdates).toEqual([]);
  });

  test('a session that has started is refused inside the transaction', async () => {
    jest.setSystemTime(new Date('2026-11-10T22:30:00Z')); // 4:30 PM Tue Nov 10 in Chicago
    await expect(cancelBooking({ bookingId: 'a1_s1', reason: { category: 'sick', note: null } })).rejects.toMatchObject({
      code: ERR.INVALID,
      reason: 'session-past',
      message: 'This session has already started.',
    });
    expect(mockUpdates).toEqual([]);
  });

  test('a 1:1 on its own day is refused', async () => {
    await expect(cancelBooking({ bookingId: 'a1_m0', reason: { category: 'sick', note: null } })).rejects.toMatchObject({
      code: ERR.INVALID,
      reason: 'mental-day-of',
      message: 'A 1:1 can be cancelled in the app up to the day before.',
    });
    expect(mockUpdates).toEqual([]);
  });

  test('a booking another device already changed', async () => {
    await expect(cancelBooking({ bookingId: 'a1_gone', reason: { category: 'sick', note: null } })).rejects.toMatchObject({
      code: ERR.INVALID,
      reason: 'not-confirmed',
      message: 'This booking was already changed.',
    });
    expect(mockUpdates).toEqual([]);
  });

  test('the rules refusing a cancel today reads as started (a phone clock behind the server)', async () => {
    mockCommitError = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
    await expect(cancelBooking({ bookingId: 'a1_today', reason: { category: 'sick', note: null } })).rejects.toMatchObject({
      code: ERR.INVALID,
      reason: 'session-past',
      message: 'This session has already started.',
    });
    // Tomorrow's session: the refusal is not about the start, so it stays a permission error.
    await expect(cancelBooking({ bookingId: 'a1_s1', reason: { category: 'sick', note: null } })).rejects.toMatchObject({ code: ERR.PERMISSION });
  });
});

test('the codes that stop a series run are the adapter\'s own', () => {
  expect(Object.keys(SERIES_STOP_COPY).sort()).toEqual([ERR.PERMISSION, ERR.UNAVAILABLE, ERR.UNAUTHENTICATED].sort());
});
