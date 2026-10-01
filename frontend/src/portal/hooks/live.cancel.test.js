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
  runTransaction: async (_db, fn) =>
    fn({ get: async (ref) => mockSnap(ref.path), update: (ref, data) => mockUpdates.push({ path: ref.path, data }) }),
}));
jest.mock('./invalidate', () => ({ bump: (name) => mockBumps.push(name) }));

const mockDocs = {
  'bookings/a1_s1': { athleteId: 'a1', sessionId: 's1', householdId: 'h1', status: 'confirmed' },
  'bookings/a1_cal': { athleteId: 'a1', sessionId: 's1', householdId: 'h1', status: 'confirmed', source: 'calendly' },
  'sessions/s1': { date: '2026-11-10', time: '4:00 PM', type: 'training', capacity: 8, booked: 3, status: 'scheduled' },
};
const mockUpdates = [];
const mockBumps = [];
function mockSnap(path) {
  const data = mockDocs[path];
  return { id: path.split('/')[1], exists: () => Boolean(data), data: () => data };
}

import { auth } from '../../firebase';
import { ERR, cancelBooking } from './live';
import { SERIES_STOP_COPY } from './cancelSeries';

beforeEach(() => {
  auth.currentUser = { uid: 'p1' };
  mockUpdates.length = 0;
  mockBumps.length = 0;
});
afterEach(() => {
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

test('the codes that stop a series run are the adapter\'s own', () => {
  expect(Object.keys(SERIES_STOP_COPY).sort()).toEqual([ERR.PERMISSION, ERR.UNAVAILABLE, ERR.UNAUTHENTICATED].sort());
});
