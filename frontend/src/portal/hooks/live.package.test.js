/**
 * changePendingPackage (tester S4, 2026-09-30): the family's own package
 * switch before the first payment. Firestore is mocked down to the one
 * updateDoc it makes; firestore.rules' pendingPackageUpdateOk is the real
 * boundary (scripts/verify-rules.mjs taskPackageChange).
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'p1' } }, db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), serverTimestamp: jest.fn(), updateDoc: jest.fn() }));
jest.mock('./invalidate', () => ({ bump: jest.fn() }));

import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { bump } from './invalidate';
import { ERR, changePendingPackage } from './live';

beforeEach(() => {
  jest.clearAllMocks();
  doc.mockImplementation((db, col, id) => `${col}/${id}`);
  serverTimestamp.mockReturnValue('SERVER_TIME');
  updateDoc.mockResolvedValue(undefined);
});

test('writes packageId and the server updatedAt, then bumps athletes (hub and family cards re-read)', async () => {
  await expect(changePendingPackage('a2', 't-6')).resolves.toEqual({ athleteId: 'a2', packageId: 't-6' });
  expect(updateDoc).toHaveBeenCalledWith('athletes/a2', { packageId: 't-6', updatedAt: 'SERVER_TIME' });
  expect(bump).toHaveBeenCalledWith('athletes');
});

test('the single token, an unknown package or no athlete is refused before any write', async () => {
  for (const [id, pkg] of [['a2', 'single'], ['a2', 't-20'], ['a2', undefined], [null, 't-6']]) {
    await expect(changePendingPackage(id, pkg)).rejects.toMatchObject({ code: ERR.INVALID });
  }
  expect(updateDoc).not.toHaveBeenCalled();
  expect(bump).not.toHaveBeenCalled();
});

test('a rules refusal (already paid, not the family) surfaces as permission-denied, nothing bumped', async () => {
  updateDoc.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
  await expect(changePendingPackage('a2', 'elite')).rejects.toMatchObject({ code: ERR.PERMISSION });
  expect(bump).not.toHaveBeenCalled();
});
