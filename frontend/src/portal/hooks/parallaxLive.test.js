/**
 * hooks/parallaxLive.js: one fixed doc per athlete,
 * athletes/{id}/milestones/parallaxIntake (spec 3). The SDK is mocked; the
 * rules side is scripts/rules-probes/combine.mjs.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'u-luke' } }, db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((db, ...p) => ({ path: p.join('/') })),
  getDoc: jest.fn(), setDoc: jest.fn(), deleteDoc: jest.fn(), runTransaction: jest.fn(), getDocFromServer: jest.fn(), serverTimestamp: jest.fn(() => 'NOW'),
}));
import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { ERR } from './live';
import { INTAKE_KEY, MARK_CHANGED, createIntake, deleteIntake, deviceStamped, expectedMark, fetchIntake, fetchIntakeFromServer, intakeStamp } from './parallaxLive';

const PATH = 'athletes/a1/milestones/parallaxIntake';
const BODY = { athleteId: 'a1', at: 'NOW', by: 'u-luke', byName: 'Luke' };
let stored;
let tx;
const ts = (ms) => ({ toMillis: () => ms });
// A mark as a read returns it: the server's time on it.
const READ = (by = 'u-luke', ms = 1000) => ({ athleteId: 'a1', at: ts(ms), by, byName: 'X' });

// CRA's resetMocks strips the factory implementations before every test; put them back.
beforeEach(() => {
  doc.mockImplementation((db, ...p) => ({ path: p.join('/') }));
  serverTimestamp.mockImplementation(() => 'NOW');
  // The transaction runs its callback against whatever mark is "stored" (null: none).
  stored = null;
  tx = { get: jest.fn(async () => ({ exists: () => stored != null, data: () => stored })), delete: jest.fn() };
  runTransaction.mockImplementation(async (_db, fn) => fn(tx));
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

test('undo deletes by path, in a transaction, when the stored mark is the one shown', async () => {
  stored = READ();
  await deleteIntake('a1', undefined, expectedMark(READ()));
  expect(tx.get).toHaveBeenCalledWith({ path: PATH });
  expect(tx.delete).toHaveBeenCalledWith({ path: PATH });
  expect(deleteDoc).not.toHaveBeenCalled();
  tx.delete.mockClear();
  runTransaction.mockRejectedValueOnce({ code: 'permission-denied' });
  await expect(deleteIntake('a1', undefined, expectedMark(READ()))).rejects.toMatchObject({ code: ERR.PERMISSION });
});

describe('an undo or clear deletes only the mark the screen showed (card 14, round 6)', () => {
  test('a different author stored there: nothing is deleted, the stored mark comes back, and it is not a permission error', async () => {
    stored = READ('u-coach', 5000);
    const err = await deleteIntake('a1', undefined, expectedMark(READ('u-owner', 1000))).catch((e) => e);
    expect(tx.delete).not.toHaveBeenCalled();
    expect(err.reason).toBe(MARK_CHANGED);
    expect(err.code).not.toBe(ERR.PERMISSION);
    expect(err.stored).toEqual(stored);
  });

  test('the same author but a newer server time: a replacement, not the shown mark, so nothing is deleted', async () => {
    stored = READ('u-owner', 9000);
    await expect(deleteIntake('a1', undefined, expectedMark(READ('u-owner', 1000)))).rejects.toMatchObject({ reason: MARK_CHANGED });
    expect(tx.delete).not.toHaveBeenCalled();
  });

  test('a mark this screen ticked itself (device time) is never deleted on the author alone (round 9)', async () => {
    const mine = deviceStamped({ athleteId: 'a1', at: new Date(123), by: 'u-luke', byName: 'Luke' });
    const { getDocFromServer } = jest.requireMock('firebase/firestore');
    // A mark by the same author is stored (re-marked elsewhere): nothing is deleted, it comes back as changed.
    const theirs = READ('u-luke', 99999);
    getDocFromServer.mockResolvedValueOnce({ exists: () => true, data: () => theirs });
    const err = await deleteIntake('a1', undefined, expectedMark(mine)).catch((e) => e);
    expect(err.reason).toBe(MARK_CHANGED);
    expect(err.stored).toEqual(theirs);
    expect(runTransaction).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
    // The server cannot be read: nothing is deleted and the call fails.
    getDocFromServer.mockRejectedValueOnce({ code: 'unavailable' });
    await expect(deleteIntake('a1', undefined, expectedMark(mine))).rejects.toMatchObject({ code: ERR.UNAVAILABLE });
    expect(tx.delete).not.toHaveBeenCalled();
    // The server says the document is gone: a completed undo, nothing to delete.
    getDocFromServer.mockResolvedValueOnce({ exists: () => false });
    await expect(deleteIntake('a1', undefined, expectedMark(mine))).resolves.toBeUndefined();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  test('an author-only expected mark can delete nothing, on any path', async () => {
    stored = READ('u-luke', 1000);
    await expect(deleteIntake('a1', undefined, { by: 'u-luke' })).rejects.toMatchObject({ reason: MARK_CHANGED });
    jest.requireMock('firebase/firestore').getDocFromServer.mockResolvedValue({ exists: () => true, data: () => stored });
    await expect(deleteIntake('a1', undefined, { by: 'u-luke', fromServer: false })).rejects.toMatchObject({ reason: MARK_CHANGED });
    expect(tx.delete).not.toHaveBeenCalled();
  });

  test('the stored mark is gone: no delete and no error', async () => {
    stored = null;
    await expect(deleteIntake('a1', undefined, expectedMark(READ()))).resolves.toBeUndefined();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  test('a screen that shows no mark deletes nothing: a mark that is there comes back as changed', async () => {
    stored = READ();
    await expect(deleteIntake('a1', undefined, null)).rejects.toMatchObject({ reason: MARK_CHANGED });
    expect(tx.delete).not.toHaveBeenCalled();
  });

  test('a call without the shown mark is refused, never a bare delete', async () => {
    stored = READ();
    await expect(deleteIntake('a1')).rejects.toMatchObject({ code: ERR.INVALID });
    expect(tx.delete).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });
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

describe('the fitness assessment mark (hq card 14): the same calls with a doc id', () => {
  const FIT = 'athletes/a1/milestones/fitnessAssessment';

  test('get, create and delete name the fitness doc; the default is still Parallax', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false });
    expect(await fetchIntake('a1', 'fitnessAssessment')).toBeNull();
    expect(getDoc).toHaveBeenLastCalledWith({ path: FIT });
    setDoc.mockResolvedValueOnce();
    expect(await createIntake('a1', BODY, 'fitnessAssessment')).toEqual({ status: 'done' });
    expect(setDoc).toHaveBeenLastCalledWith({ path: FIT }, BODY);
    stored = READ();
    await deleteIntake('a1', 'fitnessAssessment', expectedMark(READ()));
    expect(tx.get).toHaveBeenLastCalledWith({ path: FIT });
    expect(tx.delete).toHaveBeenLastCalledWith({ path: FIT });
    await deleteIntake('a1', undefined, expectedMark(READ()));
    expect(tx.delete).toHaveBeenLastCalledWith({ path: PATH });
  });

  test("a fitness tick that is already there answers 'already' from the fitness doc", async () => {
    const theirs = { athleteId: 'a1', at: { toMillis: () => 1 }, by: 'u-sam', byName: 'Sam' };
    setDoc.mockRejectedValueOnce({ code: 'permission-denied' });
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => theirs });
    expect(await createIntake('a1', BODY, 'fitnessAssessment')).toEqual({ status: 'already', milestone: theirs });
    expect(getDoc).toHaveBeenLastCalledWith({ path: FIT });
  });
});

describe('a tick reads itself back from the server (card 14, round 8)', () => {
  const { getDocFromServer } = jest.requireMock('firebase/firestore');

  test('createIntake returns the stored mark from a server-only read', async () => {
    setDoc.mockResolvedValueOnce();
    const mark = READ();
    getDocFromServer.mockResolvedValueOnce({ exists: () => true, data: () => mark });
    expect(await createIntake('a1', BODY)).toEqual({ status: 'done', milestone: mark });
    expect(getDocFromServer).toHaveBeenCalledWith({ path: PATH });
    expect(getDoc).not.toHaveBeenCalled();
  });

  test('a read-back that rejects is plain done (no milestone key); one the server says is gone is milestone null', async () => {
    setDoc.mockResolvedValue();
    getDocFromServer.mockRejectedValueOnce({ code: 'unavailable' });
    expect(await createIntake('a1', BODY)).toEqual({ status: 'done' });
    getDocFromServer.mockResolvedValueOnce({ exists: () => false });
    expect(await createIntake('a1', BODY)).toEqual({ status: 'done', milestone: null });
  });
});

describe('the server-only read of one mark (card 14, round 11)', () => {
  const { getDocFromServer } = jest.requireMock('firebase/firestore');

  test('returns the stored mark, null when the document is gone, and never calls the cache-capable getDoc', async () => {
    const m = READ();
    getDocFromServer.mockResolvedValueOnce({ exists: () => true, data: () => m });
    expect(await fetchIntakeFromServer('a1')).toEqual(m);
    expect(getDocFromServer).toHaveBeenLastCalledWith({ path: PATH });
    getDocFromServer.mockResolvedValueOnce({ exists: () => false });
    expect(await fetchIntakeFromServer('a1', 'fitnessAssessment')).toBeNull();
    expect(getDocFromServer).toHaveBeenLastCalledWith({ path: 'athletes/a1/milestones/fitnessAssessment' });
    expect(getDoc).not.toHaveBeenCalled();
  });

  test('a failed read throws the wrapped error', async () => {
    getDocFromServer.mockRejectedValueOnce({ code: 'unavailable' });
    await expect(fetchIntakeFromServer('a1')).rejects.toMatchObject({ code: ERR.UNAVAILABLE });
    await expect(fetchIntakeFromServer()).rejects.toMatchObject({ code: ERR.INVALID });
    expect(getDoc).not.toHaveBeenCalled();
  });
});
