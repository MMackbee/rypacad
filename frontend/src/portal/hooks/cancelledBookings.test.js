/**
 * hooks/cancelledBookings.js (spec 2026-11-11 §6): the family cancels that
 * carry a reason, and the moves, shown greyed under a session's attendance
 * list. The SDK and ./live are mocked; the words come from
 * data/bookingChanges.js coachLine. Invented names throughout.
 */
import React from 'react';
import { renderScreen } from '../screens/testRender';

jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'u-coach' } }, db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: (db, name) => ({ collection: name }),
  where: (field, op, value) => ({ where: [field, op, value] }),
  query: (ref, ...filters) => ({ ref, filters }),
  doc: (db, ...path) => ({ path: path.join('/') }),
  getDocs: jest.fn(),
  getDoc: jest.fn(),
}));
const mockLive = { value: true };
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: () => mockLive.value,
  fetchAthlete: jest.fn(),
  fetchSessionsByIds: jest.fn(),
}));
jest.mock('./invalidate', () => ({ __esModule: true, bump: jest.fn(), useInvalidation: () => 0 }));

import { getDoc, getDocs } from 'firebase/firestore';
import { ERR, fetchAthlete, fetchSessionsByIds } from './live';
import { bump } from './invalidate';
import {
  bookingIsCancelled, fetchCancelledBySession, liveCancelledRows, markOrRecheck, useCancelledBookings,
} from './cancelledBookings';

const SESSION = '2026-11-10-0';
const NAMES = {
  jordan: 'Jordan Whitfield',
  nico: 'Nico Whitfield',
  reese: 'Reese Whitfield',
  sam: 'Sam Lee',
  teddy: 'Teddy QA',
  casey: 'Casey QA',
  ava: 'Ava QA',
};
const cancelled = (athleteId, over) => ({
  id: `${athleteId}_${SESSION}`,
  data: () => ({ athleteId, sessionId: SESSION, status: 'cancelled', ...over }),
});
// The seven kinds of cancelled row a session can hold; four of them reach the coach.
const ROWS = [
  cancelled('jordan', { cancelReason: 'member', cancelCategory: 'sick' }),
  cancelled('nico', { cancelReason: 'member', cancelCategory: 'other', cancelNote: 'dentist' }),
  cancelled('reese', { cancelReason: 'member' }),
  cancelled('sam', { cancelReason: 'member', cancelledVia: 'series', cancelCategory: 'school' }),
  cancelled('teddy', { cancelReason: 'session-cancelled' }),
  cancelled('casey', { cancelReason: 'double-spend', cancelledBy: 'system' }),
  cancelled('ava', { cancelReason: 'moved', movedTo: 'ava_2026-11-12-0' }),
];
const S9 = { id: '2026-11-12-0', date: '2026-11-12', time: '4:00 PM', type: 'training' };

beforeEach(() => {
  mockLive.value = true;
  getDocs.mockResolvedValue({ docs: ROWS });
  fetchAthlete.mockImplementation(async (id) => ({ id, name: NAMES[id] }));
  fetchSessionsByIds.mockResolvedValue([S9]);
});

test("one query: this session's cancelled bookings", async () => {
  const rows = await fetchCancelledBySession(SESSION);
  expect(getDocs).toHaveBeenCalledTimes(1);
  expect(getDocs).toHaveBeenCalledWith({
    ref: { collection: 'bookings' },
    filters: [{ where: ['sessionId', '==', SESSION] }, { where: ['status', '==', 'cancelled'] }],
  });
  expect(rows.map((r) => r.id)).toEqual(ROWS.map((r) => r.id));
  expect(rows[0]).toMatchObject({ athleteId: 'jordan', cancelCategory: 'sick' });
});

test('the query needs a session, and a refusal comes back typed', async () => {
  await expect(fetchCancelledBySession()).rejects.toMatchObject({ code: ERR.INVALID });
  expect(getDocs).not.toHaveBeenCalled();
  getDocs.mockRejectedValueOnce({ code: 'permission-denied', message: 'no' });
  await expect(fetchCancelledBySession(SESSION)).rejects.toMatchObject({ code: ERR.PERMISSION });
});

test('family cancels with a reason and moves reach the coach, by name; nothing else does', async () => {
  const rows = await liveCancelledRows(SESSION);
  expect(rows).toEqual([
    { bookingId: `ava_${SESSION}`, athleteId: 'ava', name: 'Ava QA', line: 'Moved to Thu Nov 12, 4:00 PM' },
    { bookingId: `jordan_${SESSION}`, athleteId: 'jordan', name: 'Jordan Whitfield', line: 'Cancelled · Sick' },
    { bookingId: `nico_${SESSION}`, athleteId: 'nico', name: 'Nico Whitfield', line: 'Cancelled · Other: dentist' },
    { bookingId: `sam_${SESSION}`, athleteId: 'sam', name: 'Sam Lee', line: 'Cancelled · School' },
  ]);
  // Names only for the rows shown; the moved row's new session in one read.
  expect(fetchAthlete.mock.calls.map(([id]) => id).sort()).toEqual(['ava', 'jordan', 'nico', 'sam']);
  expect(fetchSessionsByIds).toHaveBeenCalledTimes(1);
  expect(fetchSessionsByIds).toHaveBeenCalledWith(['2026-11-12-0']);
});

test('a moved row whose new session is gone reads "Moved"', async () => {
  fetchSessionsByIds.mockResolvedValue([]);
  const rows = await liveCancelledRows(SESSION);
  expect(rows.find((r) => r.athleteId === 'ava').line).toBe('Moved');
});

test('a failed session read keeps the moved row, as "Moved"', async () => {
  fetchSessionsByIds.mockRejectedValue({ code: ERR.UNAVAILABLE });
  const rows = await liveCancelledRows(SESSION);
  expect(rows.map((r) => r.line)).toEqual(['Moved', 'Cancelled · Sick', 'Cancelled · Other: dentist', 'Cancelled · School']);
});

test('a name that cannot be read keeps its row, with name null', async () => {
  fetchAthlete.mockImplementation(async (id) => {
    if (id === 'jordan') throw Object.assign(new Error('no'), { code: ERR.PERMISSION });
    return { id, name: NAMES[id] };
  });
  const rows = await liveCancelledRows(SESSION);
  expect(rows).toHaveLength(4);
  expect(rows.find((r) => r.athleteId === 'jordan')).toEqual({
    bookingId: `jordan_${SESSION}`, athleteId: 'jordan', name: null, line: 'Cancelled · Sick',
  });
});

test('no row to show: no name or session read', async () => {
  getDocs.mockResolvedValue({ docs: [ROWS[2], ROWS[4], ROWS[5]] });
  expect(await liveCancelledRows(SESSION)).toEqual([]);
  expect(fetchAthlete).not.toHaveBeenCalled();
  expect(fetchSessionsByIds).not.toHaveBeenCalled();
});

function Probe({ sessionId }) {
  const state = useCancelledBookings(sessionId);
  return <output>{JSON.stringify({ data: state.data, loading: state.loading })}</output>;
}
const probe = async (sessionId) => {
  const r = await renderScreen(<Probe sessionId={sessionId} />);
  await r.flush();
  const out = JSON.parse(r.text());
  await r.unmount();
  return out;
};

test('the hook: live with a session reads the rows', async () => {
  const out = await probe(SESSION);
  expect(out.loading).toBe(false);
  expect(out.data.map((r) => r.line)).toEqual(['Moved to Thu Nov 12, 4:00 PM', 'Cancelled · Sick', 'Cancelled · Other: dentist', 'Cancelled · School']);
});

test('the hook: seed mode, or no session, is an empty list and reads nothing', async () => {
  mockLive.value = false;
  expect(await probe(SESSION)).toEqual({ data: [], loading: false });
  mockLive.value = true;
  expect(await probe(undefined)).toEqual({ data: [], loading: false });
  expect(getDocs).not.toHaveBeenCalled();
});

// Spec §6: a coach on a stale screen taps IN or OUT on a kid who just
// cancelled. The rules refuse the mark; the screen re-reads and says so.
const REFUSED = () => Object.assign(new Error('updateBookingStatus: Missing or insufficient permissions.'), { code: ERR.PERMISSION });
const stored = (status) => ({ exists: () => true, id: 'jordan_' + SESSION, data: () => ({ athleteId: 'jordan', status }) });

test('bookingIsCancelled reads the one booking; missing or unreadable is false', async () => {
  getDoc.mockResolvedValueOnce(stored('cancelled'));
  expect(await bookingIsCancelled('jordan_' + SESSION)).toBe(true);
  expect(getDoc).toHaveBeenCalledWith({ path: 'bookings/jordan_' + SESSION });
  getDoc.mockResolvedValueOnce(stored('confirmed'));
  expect(await bookingIsCancelled('jordan_' + SESSION)).toBe(false);
  getDoc.mockResolvedValueOnce({ exists: () => false });
  expect(await bookingIsCancelled('jordan_' + SESSION)).toBe(false);
  getDoc.mockRejectedValueOnce({ code: 'unavailable' });
  expect(await bookingIsCancelled('jordan_' + SESSION)).toBe(false);
});

test('markOrRecheck: a mark that lands is false, with no refresh and no read', async () => {
  const mark = jest.fn(async () => ({ id: 'b1', status: 'attended' }));
  expect(await markOrRecheck(mark, 'jordan_' + SESSION, 'attended')).toBe(false);
  expect(mark).toHaveBeenCalledWith('jordan_' + SESSION, 'attended');
  expect(bump).not.toHaveBeenCalled();
  expect(getDoc).not.toHaveBeenCalled();
});

test('markOrRecheck: refused on a booking now cancelled is true, and the lists refresh', async () => {
  getDoc.mockResolvedValueOnce(stored('cancelled'));
  expect(await markOrRecheck(async () => { throw REFUSED(); }, 'jordan_' + SESSION, 'attended')).toBe(true);
  expect(bump).toHaveBeenCalledWith('bookings');
  expect(getDoc).toHaveBeenCalledWith({ path: 'bookings/jordan_' + SESSION });
});

test('markOrRecheck: refused on a booking still confirmed is false (refreshed all the same)', async () => {
  getDoc.mockResolvedValueOnce(stored('confirmed'));
  expect(await markOrRecheck(async () => { throw REFUSED(); }, 'jordan_' + SESSION, 'noshow')).toBe(false);
  expect(bump).toHaveBeenCalledWith('bookings');
});

test('markOrRecheck: any other failure is false without a read, and it never rejects', async () => {
  expect(await markOrRecheck(async () => { throw Object.assign(new Error('offline'), { code: ERR.UNAVAILABLE }); }, 'jordan_' + SESSION, 'attended')).toBe(false);
  expect(getDoc).not.toHaveBeenCalled();
  expect(bump).toHaveBeenCalledWith('bookings');
  getDoc.mockRejectedValueOnce({ code: 'unavailable' });
  expect(await markOrRecheck(() => { throw REFUSED(); }, 'jordan_' + SESSION, 'attended')).toBe(false);
});
