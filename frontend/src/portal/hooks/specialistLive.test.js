/**
 * The one bookings read behind a specialist's own day (speed review F1,
 * 2026-11-17): a single-field equality on `type`, nothing else, so it rides
 * the automatic index and needs no composite.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'phil' } }, db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'col'), getDocs: jest.fn(), query: jest.fn((...a) => a), where: jest.fn((...a) => a),
}));
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ERR } from './live';
import { fetchBookingsByType } from './specialistLive';

const snap = (docs) => ({ docs: docs.map(([id, data]) => ({ id, data: () => data })) });

// CRA's resetMocks strips the factory implementations before every test; put them back.
beforeEach(() => {
  collection.mockImplementation(() => 'col');
  query.mockImplementation((...a) => a);
  where.mockImplementation((...a) => a);
});

test('one query: bookings where type == the specialist, no other filter, rows as stored', async () => {
  getDocs.mockResolvedValue(snap([
    ['jordan_p1', { athleteId: 'jordan', sessionId: 'p1', date: '2026-11-18', type: 'phil', status: 'confirmed' }],
    ['reese_p1', { athleteId: 'reese', sessionId: 'p1', date: '2026-11-18', type: 'phil', status: 'cancelled' }],
  ]));
  const rows = await fetchBookingsByType('phil');
  expect(collection).toHaveBeenCalledWith({}, 'bookings');
  expect(where).toHaveBeenCalledTimes(1);
  expect(where).toHaveBeenCalledWith('type', '==', 'phil');
  expect(getDocs).toHaveBeenCalledTimes(1);
  expect(rows).toEqual([
    { id: 'jordan_p1', athleteId: 'jordan', sessionId: 'p1', date: '2026-11-18', type: 'phil', status: 'confirmed' },
    { id: 'reese_p1', athleteId: 'reese', sessionId: 'p1', date: '2026-11-18', type: 'phil', status: 'cancelled' },
  ]);
});

test('no type: refused before any read', async () => {
  await expect(fetchBookingsByType('')).rejects.toMatchObject({ code: ERR.INVALID });
  expect(getDocs).not.toHaveBeenCalled();
});

test('a refused read surfaces as the portal error, not a raw SDK one', async () => {
  getDocs.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
  await expect(fetchBookingsByType('mental')).rejects.toMatchObject({ name: 'LiveDataError', code: ERR.PERMISSION });
});
