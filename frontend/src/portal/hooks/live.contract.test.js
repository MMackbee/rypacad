/**
 * Contract-buffer Phase 2: setContractTier stamps athletes.contractStart
 * (today in America/Chicago) only when the caller is starting a contract,
 * never on a tier change. Firestore is mocked down to doc/updateDoc; kept
 * beside live.test.js so the two lanes' mock lists merge cleanly.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'p1' } }, db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), updateDoc: jest.fn() }));

import { doc, updateDoc } from 'firebase/firestore';
import { chicagoDateISO, setContractTier } from './live';

beforeEach(() => {
  doc.mockImplementation((db, col, id) => `${col}/${id}`);
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
