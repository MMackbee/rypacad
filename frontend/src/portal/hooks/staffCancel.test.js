/**
 * Staff cancel (owner approved 2026-11-12), the call: one staffCancelBooking
 * call for the tapped booking and any ticked brothers and sisters, the
 * reason with it (a note only for Other). Practice mode calls nothing. A
 * refusal rejects with the staff words for its reason, and every outcome
 * reloads the lists that show bookings. Plain functions, not jest.fn():
 * CRA's resetMocks would clear them before every test.
 */
jest.mock('./live', () => ({ isLive: () => mockLive }));
jest.mock('./callables', () => ({
  callStaffCancelBooking: async (payload) => {
    mockSent.push(payload);
    if (mockFail) throw mockFail;
    return mockResult;
  },
}));
jest.mock('./invalidate', () => ({ bump: (name) => mockBumps.push(name) }));

import { staffCancelBookings } from './staffCancel';
import { ALREADY_CHANGED_COPY } from '../data/bookingChanges';
import { STAFF_CANCEL_UNCONFIRMED } from '../data/staffCancel';

let mockLive;
let mockSent;
let mockBumps;
let mockFail;
let mockResult;

beforeEach(() => {
  mockLive = true;
  mockSent = [];
  mockBumps = [];
  mockFail = null;
  mockResult = { sessionId: 's1', cancelled: [{ bookingId: 'jordan_s1', athleteId: 'jordan', cancelledFrom: 'noshow', tokenBack: true }] };
});

const refusal = (reason, message = 'raw') => Object.assign(new Error(message), { code: 'invalid-argument', reason });

test('one call with the ids and the reason, then every booking list reloads', async () => {
  const out = await staffCancelBookings({ bookingIds: ['jordan_s1', 'riley_s1'], reason: { category: 'sick', note: null } });
  expect(mockSent).toEqual([{ bookingIds: ['jordan_s1', 'riley_s1'], category: 'sick' }]);
  expect(out).toEqual(mockResult);
  expect(mockBumps).toEqual(expect.arrayContaining(['bookings', 'sessions', 'waitlist']));
});

test('Other sends its note; a note on any other reason is not sent', async () => {
  await staffCancelBookings({ bookingIds: ['jordan_s1'], reason: { category: 'other', note: 'dentist' } });
  await staffCancelBookings({ bookingIds: ['jordan_s1'], reason: { category: 'school', note: 'stray' } });
  expect(mockSent).toEqual([
    { bookingIds: ['jordan_s1'], category: 'other', note: 'dentist' },
    { bookingIds: ['jordan_s1'], category: 'school' },
  ]);
});

test('a repeated id is sent once', async () => {
  await staffCancelBookings({ bookingIds: ['jordan_s1', 'jordan_s1'], reason: { category: 'sick', note: null } });
  expect(mockSent[0].bookingIds).toEqual(['jordan_s1']);
});

test('practice mode calls nothing and echoes a simulated result', async () => {
  mockLive = false;
  const out = await staffCancelBookings({ bookingIds: ['jordan_s1'], reason: { category: 'sick', note: null } });
  expect(mockSent).toEqual([]);
  expect(mockBumps).toEqual([]);
  expect(out).toEqual({ simulated: true, sessionId: null, cancelled: [{ bookingId: 'jordan_s1' }] });
});

test('already cancelled: the shared words, its reason kept, and the page reloads', async () => {
  mockFail = refusal('already-cancelled');
  const err = await staffCancelBookings({ bookingIds: ['jordan_s1'], reason: { category: 'sick', note: null } }).catch((e) => e);
  expect(err.message).toBe(ALREADY_CHANGED_COPY);
  expect(err.reason).toBe('already-cancelled');
  expect(mockBumps).toContain('bookings');
});

test("a period that is over reads plainly, never the server's raw message", async () => {
  mockFail = refusal('period-over');
  const err = await staffCancelBookings({ bookingIds: ['jordan_s1'], reason: { category: 'sick', note: null } }).catch((e) => e);
  expect(err.message).toBe("That booking's billing period is over - nothing was cancelled.");
  expect(err.message).not.toBe('raw');
});

test('no answer at all: it may have gone through, so the page reloads and says to check', async () => {
  mockFail = Object.assign(new Error('internal'), { code: 'unknown', reason: null });
  const err = await staffCancelBookings({ bookingIds: ['jordan_s1'], reason: { category: 'sick', note: null } }).catch((e) => e);
  expect(err.message).toBe(STAFF_CANCEL_UNCONFIRMED);
  expect(mockBumps).toEqual(expect.arrayContaining(['bookings', 'sessions', 'waitlist']));
});
