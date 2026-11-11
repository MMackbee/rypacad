/**
 * hooks/parallaxLive.js: one fixed doc per athlete,
 * athletes/{id}/milestones/parallaxIntake (spec 3). The SDK is mocked; the
 * rules side is scripts/rules-probes/combine.mjs.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'u-luke' } }, db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((db, ...p) => ({ path: p.join('/') })),
  getDoc: jest.fn(), setDoc: jest.fn(), deleteDoc: jest.fn(), serverTimestamp: jest.fn(() => 'NOW'),
}));
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ERR } from './live';
import { INTAKE_KEY, createIntake, deleteIntake, fetchIntake, intakeStamp } from './parallaxLive';

const PATH = 'athletes/a1/milestones/parallaxIntake';
const BODY = { athleteId: 'a1', at: 'NOW', by: 'u-luke', byName: 'Luke' };

// CRA's resetMocks strips the factory implementations before every test; put them back.
beforeEach(() => {
  doc.mockImplementation((db, ...p) => ({ path: p.join('/') }));
  serverTimestamp.mockImplementation(() => 'NOW');
});

test('one get per athlete; missing is null', async () => {
  getDoc.mockResolvedValueOnce({ exists: () => false });
  expect(await fetchIntake('a1')).toBeNull();
  expect(getDoc).toHaveBeenCalledWith({ path: PATH });
  const m = { athleteId: 'a1', at: { toMillis: () => 1 }, by: 'u-luke', byName: 'Luke' };
  getDoc.mockResolvedValueOnce({ exists: () => true, id: 'parallaxIntake', data: () => m });
  expect(await fetchIntake('a1')).toEqual(m);
  expect(getDoc).toHaveBeenCalledTimes(2);
});

test('create is a setDoc of the body', async () => {
  setDoc.mockResolvedValueOnce();
  expect(await createIntake('a1', BODY)).toEqual({ status: 'done' });
  expect(setDoc).toHaveBeenCalledWith({ path: PATH }, BODY);
});

test("a tick that is already there answers 'already' (Review Focus 4)", async () => {
  const theirs = { athleteId: 'a1', at: { toMillis: () => 1 }, by: 'u-sam', byName: 'Sam' };
  setDoc.mockRejectedValueOnce({ code: 'permission-denied' });
  getDoc.mockResolvedValueOnce({ exists: () => true, data: () => theirs });
  expect(await createIntake('a1', BODY)).toEqual({ status: 'already', milestone: theirs });
  setDoc.mockRejectedValueOnce({ code: 'permission-denied' });
  getDoc.mockResolvedValueOnce({ exists: () => false });
  await expect(createIntake('a1', BODY)).rejects.toMatchObject({ code: ERR.PERMISSION });
});

test('a refusal for another reason is not re-read', async () => {
  setDoc.mockRejectedValueOnce({ code: 'unavailable' });
  await expect(createIntake('a1', BODY)).rejects.toMatchObject({ code: ERR.UNAVAILABLE });
  expect(getDoc).not.toHaveBeenCalled();
});

test('undo deletes by path', async () => {
  deleteDoc.mockResolvedValueOnce();
  await deleteIntake('a1');
  expect(deleteDoc).toHaveBeenCalledWith({ path: PATH });
  deleteDoc.mockRejectedValueOnce({ code: 'permission-denied' });
  await expect(deleteIntake('a1')).rejects.toMatchObject({ code: ERR.PERMISSION });
});

test('athleteId is required', async () => {
  await expect(fetchIntake()).rejects.toMatchObject({ code: ERR.INVALID });
  await expect(createIntake(null, BODY)).rejects.toMatchObject({ code: ERR.INVALID });
  await expect(deleteIntake('')).rejects.toMatchObject({ code: ERR.INVALID });
  expect(getDoc).not.toHaveBeenCalled();
  expect(setDoc).not.toHaveBeenCalled();
  expect(deleteDoc).not.toHaveBeenCalled();
});

test('the stamp is the server time; the key names the collection', () => {
  expect(intakeStamp()).toBe('NOW');
  expect(INTAKE_KEY).toBe('milestones');
});
