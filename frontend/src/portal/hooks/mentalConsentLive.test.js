jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'u-dana' } }, db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'col'), doc: jest.fn((db, ...p) => ({ path: p.join('/') })),
  getDoc: jest.fn(), getDocs: jest.fn(), query: jest.fn((...a) => a), where: jest.fn((...a) => a), setDoc: jest.fn(),
  runTransaction: jest.fn(), serverTimestamp: jest.fn(() => 'NOW'),
}));
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { ERR } from './live';
import {
  consentStamp, createConsent, fetchAllConsents, fetchConsent, fetchHouseholdConsents, fetchOwnConsent, updateConsent,
} from './mentalConsentLive';

const snap = (docs) => ({ docs: docs.map(([id, data]) => ({ id, data: () => data })) });

// CRA's resetMocks strips the factory implementations before every test; put them back.
beforeEach(() => {
  jest.clearAllMocks();
  collection.mockImplementation(() => 'col');
  doc.mockImplementation((db, ...p) => ({ path: p.join('/') }));
  query.mockImplementation((...a) => a);
  where.mockImplementation((...a) => a);
  serverTimestamp.mockImplementation(() => 'NOW');
});

test('a parent reads by householdId, never getDoc (Review Focus 2)', async () => {
  getDocs.mockResolvedValue(snap([['ava', { householdId: 'hh', athleteId: 'ava' }]]));
  expect(await fetchHouseholdConsents('hh')).toEqual([{ id: 'ava', householdId: 'hh', athleteId: 'ava' }]);
  expect(where).toHaveBeenCalledWith('householdId', '==', 'hh');
  expect(collection).toHaveBeenCalledWith({}, 'mentalConsents');
  expect(getDoc).not.toHaveBeenCalled();
});

test('an athlete login reads its own doc; a missing one is null', async () => {
  getDoc.mockResolvedValue({ exists: () => false });
  expect(await fetchOwnConsent('max')).toBeNull();
  expect(doc).toHaveBeenCalledWith({}, 'mentalConsents', 'max');
});

test('records come back as stored: Timestamps stay Timestamps (Review Focus 1)', async () => {
  const signedAt = { toMillis: () => 1, seconds: 0, nanoseconds: 1000000 };
  getDoc.mockResolvedValue({ exists: () => true, id: 'ava', data: () => ({ athleteId: 'ava', signedAt }) });
  const record = await fetchConsent('ava');
  expect(record).toEqual({ id: 'ava', athleteId: 'ava', signedAt });
  expect(record.signedAt).toBe(signedAt);
  getDocs.mockResolvedValue(snap([['ava', { athleteId: 'ava' }], ['max', { athleteId: 'max' }]]));
  expect((await fetchAllConsents()).map((r) => r.id)).toEqual(['ava', 'max']);
  expect(where).not.toHaveBeenCalled();
});

test('a refused read keeps its code', async () => {
  getDocs.mockRejectedValueOnce({ code: 'permission-denied', message: 'no' });
  await expect(fetchHouseholdConsents('other')).rejects.toMatchObject({ code: ERR.PERMISSION });
  await expect(fetchHouseholdConsents(null)).rejects.toMatchObject({ code: ERR.INVALID });
});

test('createConsent: setDoc; a refusal over an existing record is "already"', async () => {
  setDoc.mockResolvedValueOnce();
  expect(await createConsent({ athleteId: 'ava', doc: { a: 1 }, reread: jest.fn() })).toEqual({ status: 'signed' });
  expect(setDoc).toHaveBeenCalledWith({ path: 'mentalConsents/ava' }, { a: 1 });
  setDoc.mockRejectedValueOnce({ code: 'permission-denied' });
  const record = { id: 'ava', signer: { name: 'Dana Test' } };
  expect(await createConsent({ athleteId: 'ava', doc: { a: 1 }, reread: async () => record })).toEqual({ status: 'already', record });
  setDoc.mockRejectedValueOnce({ code: 'permission-denied' });
  await expect(createConsent({ athleteId: 'ava', doc: { a: 1 }, reread: async () => null })).rejects.toMatchObject({ code: ERR.PERMISSION });
  setDoc.mockRejectedValueOnce({ code: 'unavailable' });
  const reread = jest.fn();
  await expect(createConsent({ athleteId: 'ava', doc: { a: 1 }, reread })).rejects.toMatchObject({ code: ERR.UNAVAILABLE });
  expect(reread).not.toHaveBeenCalled();
});

test('updateConsent hands the snapshot\'s own data to the builder (Review Focus 1)', async () => {
  const data = { choices: { location: 'B' }, assent: null, history: [] };
  const tx = { get: jest.fn(async () => ({ exists: () => true, data: () => data })), update: jest.fn() };
  runTransaction.mockImplementation((db, fn) => fn(tx));
  const build = jest.fn(() => ({ x: 1 }));
  await updateConsent({ athleteId: 'ava', build });
  expect(build.mock.calls[0][0]).toBe(data);
  expect(tx.update).toHaveBeenCalledWith({ path: 'mentalConsents/ava' }, { x: 1 });
});

test('updateConsent refuses a record that is not there', async () => {
  const tx = { get: jest.fn(async () => ({ exists: () => false })), update: jest.fn() };
  runTransaction.mockImplementation((db, fn) => fn(tx));
  await expect(updateConsent({ athleteId: 'ava', build: () => ({}) })).rejects.toMatchObject({ code: ERR.NOT_FOUND });
  expect(tx.update).not.toHaveBeenCalled();
});

test('the write stamp is the server time', () => {
  expect(consentStamp()).toBe('NOW');
});
