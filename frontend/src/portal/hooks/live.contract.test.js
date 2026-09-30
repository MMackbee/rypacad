/**
 * Contract-buffer Phase 2: setContractTier stamps athletes.contractStart
 * (today in America/Chicago) only when the caller is starting a contract,
 * never on a tier change, and approveEnrollmentRequest stamps it for a kid
 * approved onto a tier. Firestore is mocked down to what those two touch;
 * kept beside live.test.js so the two lanes' mock lists merge cleanly.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'p1' } }, db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), doc: jest.fn(), getDoc: jest.fn(), getDocs: jest.fn(), query: jest.fn(),
  serverTimestamp: jest.fn(), setDoc: jest.fn(), updateDoc: jest.fn(), where: jest.fn(), writeBatch: jest.fn(),
}));

import { doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { approveEnrollmentRequest, chicagoDateISO, setContractTier } from './live';

let autoId = 0;
beforeEach(() => {
  autoId = 0;
  // doc(db, col, id) is a path; doc(collectionRef) is a new auto-id ref.
  doc.mockImplementation((db, col, id) => (col ? `${col}/${id}` : { id: `new${++autoId}` }));
  updateDoc.mockResolvedValue(undefined);
});
afterEach(() => { jest.useRealTimers(); });

test('chicagoDateISO is the academy day, not the UTC one', () => {
  // 04:30Z on Oct 1 is 23:30 CDT on Sep 30; 05:30Z is 00:30 CDT on Oct 1.
  expect(chicagoDateISO(new Date('2026-10-01T04:30:00Z'))).toBe('2026-09-30');
  expect(chicagoDateISO(new Date('2026-10-01T05:30:00Z'))).toBe('2026-10-01');
});

test('a start writes the tier and contractStart together', async () => {
  jest.useFakeTimers('modern');
  // 04:00Z Nov 3 is 22:00 CST on Nov 2 - the Chicago date, not UTC's.
  jest.setSystemTime(new Date('2026-11-03T04:00:00Z'));
  await expect(setContractTier({ athleteId: 'a1', minutes: 45, start: true }))
    .resolves.toEqual({ athleteId: 'a1', contractMinutes: 45, contractStart: '2026-11-02' });
  expect(updateDoc).toHaveBeenCalledWith('athletes/a1', { contractMinutes: 45, contractStart: '2026-11-02' });
});

test('a tier change, or clearing the tier, leaves contractStart alone', async () => {
  await setContractTier({ athleteId: 'a1', minutes: 90 });
  expect(updateDoc).toHaveBeenLastCalledWith('athletes/a1', { contractMinutes: 90 });
  await setContractTier({ athleteId: 'a1', minutes: null, start: true });
  expect(updateDoc).toHaveBeenLastCalledWith('athletes/a1', { contractMinutes: null });
});

const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });

test('rules without contractStart (frontend ahead of the rules deploy): a start retries with the tier alone', async () => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-12-15T18:00:00Z'));
  updateDoc.mockRejectedValueOnce(denied()).mockResolvedValueOnce(undefined);
  await expect(setContractTier({ athleteId: 'a1', minutes: 45, start: true }))
    .resolves.toEqual({ athleteId: 'a1', contractMinutes: 45 });
  expect(updateDoc.mock.calls).toEqual([
    ['athletes/a1', { contractMinutes: 45, contractStart: '2026-12-15' }],
    ['athletes/a1', { contractMinutes: 45 }],
  ]);
});

test('a refusal is not retried when there is no contractStart to drop, or it is not permission-denied', async () => {
  updateDoc.mockRejectedValueOnce(denied());
  await expect(setContractTier({ athleteId: 'a1', minutes: 90 })).rejects.toMatchObject({ code: 'permission-denied' });
  expect(updateDoc).toHaveBeenCalledTimes(1);

  updateDoc.mockReset();
  updateDoc.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
  await expect(setContractTier({ athleteId: 'a1', minutes: 45, start: true })).rejects.toMatchObject({ code: 'unavailable' });
  expect(updateDoc).toHaveBeenCalledTimes(1);
});

test('a start refused again after the retry throws permission-denied (not the parent, say)', async () => {
  updateDoc.mockRejectedValue(denied());
  await expect(setContractTier({ athleteId: 'a1', minutes: 45, start: true })).rejects.toMatchObject({ code: 'permission-denied' });
  expect(updateDoc).toHaveBeenCalledTimes(2);
});

test('approving an enrollment stamps contractStart on a kid with a tier, not on one without', async () => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-12-15T18:00:00Z'));
  const batch = { set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) };
  writeBatch.mockReturnValue(batch);
  getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({
      guardian: { name: 'Dana Whitfield', email: 'dana@example.com', phone: null },
      athletes: [{ name: 'Ava', contractMinutes: 45 }, { name: 'Ben', contractMinutes: null }],
    }),
  });
  getDocs.mockResolvedValue({ empty: true, docs: [] });
  setDoc.mockResolvedValue(undefined);

  await approveEnrollmentRequest('g1');
  const athletes = batch.set.mock.calls.map(([, data]) => data).filter((d) => 'contractMinutes' in d);
  expect(athletes).toHaveLength(2);
  expect(athletes[0]).toMatchObject({ name: 'Ava', contractMinutes: 45, contractStart: '2026-12-15' });
  expect(athletes[1]).toMatchObject({ name: 'Ben', contractMinutes: null });
  expect(athletes[1]).not.toHaveProperty('contractStart');
});
