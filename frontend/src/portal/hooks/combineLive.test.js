/**
 * hooks/combineLive.js: the Firestore adapter for athletes/{id}/combineScores
 * (plan Task 4). The SDK is mocked; the rules side is proven by
 * scripts/rules-probes/combine.mjs.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'u-luke' } }, db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), doc: jest.fn(), getDocs: jest.fn(), addDoc: jest.fn(), deleteDoc: jest.fn(),
  serverTimestamp: jest.fn(), query: jest.fn(), where: jest.fn(), orderBy: jest.fn(),
}));
jest.mock('./invalidate', () => ({ bump: jest.fn() }));

import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { bump } from './invalidate';
import { ERR } from './live';
import { COMBINE_KEY, combineStamp, createCombineScore, deleteCombineScore, fetchCombineScores } from './combineLive';

const snap = (docs) => ({ docs: docs.map(([id, data]) => ({ id, data: () => data })) });

// CRA's resetMocks strips the factory implementations before every test; put them back.
beforeEach(() => {
  collection.mockImplementation(() => 'col');
  doc.mockImplementation((db, ...p) => ({ path: p.join('/') }));
  serverTimestamp.mockImplementation(() => 'NOW');
});

test('the invalidation key and the server stamp', () => {
  expect(COMBINE_KEY).toBe('combineScores');
  expect(combineStamp()).toBe('NOW');
});

test("reads one athlete's scores, unfiltered", async () => {
  getDocs.mockResolvedValue(snap([['s1', { distance: 'u100', score: 640 }], ['s2', { distance: 'u150', score: 480 }]]));
  expect(await fetchCombineScores('jordan')).toEqual([
    { id: 's1', distance: 'u100', score: 640 },
    { id: 's2', distance: 'u150', score: 480 },
  ]);
  expect(collection).toHaveBeenCalledWith({}, 'athletes', 'jordan', 'combineScores');
  expect(getDocs).toHaveBeenCalledWith('col');
  expect(query).not.toHaveBeenCalled();
  expect(where).not.toHaveBeenCalled();
  expect(orderBy).not.toHaveBeenCalled();
});

test('creates with addDoc and bumps', async () => {
  const body = { athleteId: 'jordan', distance: 'u100', score: 742 };
  addDoc.mockResolvedValue({ id: 'new-1' });
  expect(await createCombineScore('jordan', body)).toBe('new-1');
  expect(collection).toHaveBeenCalledWith({}, 'athletes', 'jordan', 'combineScores');
  expect(addDoc).toHaveBeenCalledWith('col', body);
  expect(bump).toHaveBeenCalledWith('combineScores');
});

test('deletes by path and bumps', async () => {
  deleteDoc.mockResolvedValue();
  await deleteCombineScore('jordan', 's1');
  expect(deleteDoc).toHaveBeenCalledWith({ path: 'athletes/jordan/combineScores/s1' });
  expect(bump).toHaveBeenCalledWith('combineScores');
});

test('refusals keep their code', async () => {
  getDocs.mockRejectedValue({ code: 'permission-denied', message: 'no' });
  await expect(fetchCombineScores('quinn')).rejects.toMatchObject({ code: ERR.PERMISSION });
  await expect(fetchCombineScores(null)).rejects.toMatchObject({ code: ERR.INVALID });
  addDoc.mockRejectedValue({ code: 'permission-denied', message: 'no' });
  await expect(createCombineScore('quinn', { score: 1 })).rejects.toMatchObject({ code: ERR.PERMISSION });
  await expect(createCombineScore('', { score: 1 })).rejects.toMatchObject({ code: ERR.INVALID });
  deleteDoc.mockRejectedValue({ code: 'permission-denied', message: 'no' });
  await expect(deleteCombineScore('jordan', 's1')).rejects.toMatchObject({ code: ERR.PERMISSION });
  await expect(deleteCombineScore('jordan', null)).rejects.toMatchObject({ code: ERR.INVALID });
  expect(bump).not.toHaveBeenCalled();
});
