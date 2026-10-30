jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'mental' } }, db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'col'), collectionGroup: jest.fn(() => 'group'), doc: jest.fn((db, ...p) => ({ path: p.join('/') })),
  getDoc: jest.fn(), getDocs: jest.fn(), query: jest.fn((...a) => a), where: jest.fn((...a) => a), setDoc: jest.fn(), deleteDoc: jest.fn(),
  updateDoc: jest.fn(), deleteField: jest.fn(() => 'DELETE'),
  runTransaction: jest.fn(), serverTimestamp: jest.fn(() => 'NOW'),
}));
import { collection, collectionGroup, deleteDoc, deleteField, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { ERR } from './live';
import {
  fetchAllMentalEntries, fetchBookingsBetween, fetchContractConfig, fetchContractLogsBetween, fetchHouseholdContact, saveMentalEntry, setCheckin, setCheckinNote,
} from './mentalLive';

const snap = (docs) => ({ docs: docs.map(([id, data]) => ({ id, data: () => data })) });
const ts = (ms) => ({ toMillis: () => ms });

// CRA's resetMocks strips the factory implementations before every test; put them back.
beforeEach(() => {
  jest.clearAllMocks();
  collection.mockImplementation(() => 'col');
  collectionGroup.mockImplementation(() => 'group');
  doc.mockImplementation((db, ...p) => ({ path: p.join('/') }));
  query.mockImplementation((...a) => a);
  where.mockImplementation((...a) => a);
  serverTimestamp.mockImplementation(() => 'NOW');
  deleteField.mockImplementation(() => 'DELETE');
});

test('fetchAllMentalEntries is one unfiltered collection-group read with plain ms timestamps', async () => {
  getDocs.mockResolvedValue(snap([['intake', { athleteId: 'jordan', kind: 'intake', sessionId: null, sessionDate: null, body: 'i', createdAt: ts(1), updatedAt: ts(2) }]]));
  const rows = await fetchAllMentalEntries();
  expect(collectionGroup).toHaveBeenCalledWith({}, 'entries');
  expect(where).not.toHaveBeenCalled();
  expect(rows).toEqual([{ id: 'intake', athleteId: 'jordan', kind: 'intake', sessionId: null, sessionDate: null, body: 'i', createdAtMs: 1, updatedAtMs: 2 }]);
});

test('saveMentalEntry creates with createdBy/createdAt once, then updates body, sessionDate, updatedBy, updatedAt only', async () => {
  const tx = { get: jest.fn(), set: jest.fn(), update: jest.fn() };
  runTransaction.mockImplementation((db, fn) => fn(tx));
  tx.get.mockResolvedValueOnce({ exists: () => false });
  const created = await saveMentalEntry({ athleteId: 'jordan', entryId: 'cal-a', kind: 'session', sessionId: 'cal-a', sessionDate: '2026-11-10', body: 'First.' });
  expect(created).toEqual({ id: 'cal-a', created: true });
  expect(tx.set).toHaveBeenCalledWith({ path: 'mentalNotes/jordan/entries/cal-a' }, {
    athleteId: 'jordan', kind: 'session', sessionId: 'cal-a', sessionDate: '2026-11-10', body: 'First.', createdBy: 'mental', updatedBy: 'mental', createdAt: 'NOW', updatedAt: 'NOW',
  });
  tx.get.mockResolvedValueOnce({ exists: () => true });
  const edited = await saveMentalEntry({ athleteId: 'jordan', entryId: 'cal-a', kind: 'session', sessionId: 'cal-a', sessionDate: '2026-11-10', body: 'Second.' });
  expect(edited).toEqual({ id: 'cal-a', created: false });
  expect(tx.update).toHaveBeenCalledWith({ path: 'mentalNotes/jordan/entries/cal-a' }, { body: 'Second.', sessionDate: '2026-11-10', updatedBy: 'mental', updatedAt: 'NOW' });
});

test('saveMentalEntry asks mayCreate on every attempt and never recreates a note a delete removed under it', async () => {
  const tx = { get: jest.fn(), set: jest.fn(), update: jest.fn() };
  let allowed = true;
  // The SDK re-runs the function when the note changed under it: the first
  // attempt read the note, the confirmed delete landed, the retry finds none.
  runTransaction.mockImplementation(async (db, fn) => {
    tx.get.mockResolvedValueOnce({ exists: () => true });
    await fn(tx);
    allowed = false;
    tx.get.mockResolvedValueOnce({ exists: () => false });
    return fn(tx);
  });
  await expect(saveMentalEntry({ athleteId: 'jordan', entryId: 'intake', kind: 'intake', body: 'Typed.', mayCreate: () => allowed }))
    .rejects.toMatchObject({ code: ERR.NOT_FOUND });
  expect(tx.update).toHaveBeenCalledTimes(1);
  expect(tx.set).not.toHaveBeenCalled();
});

test('saveMentalEntry refuses a body over 8000 characters before any write', async () => {
  await expect(saveMentalEntry({ athleteId: 'jordan', entryId: 'intake', kind: 'intake', sessionId: null, sessionDate: null, body: 'x'.repeat(8001) })).rejects.toMatchObject({ code: ERR.INVALID });
  expect(runTransaction).not.toHaveBeenCalled();
});

test('setCheckin true writes the pinned doc; false deletes it', async () => {
  await setCheckin({ athleteId: 'jordan', weekStartISO: '2026-11-09', checkedIn: true });
  expect(setDoc).toHaveBeenCalledWith({ path: 'contractCheckins/jordan_2026-11-09' }, { athleteId: 'jordan', weekStart: '2026-11-09', checkedIn: true, by: 'mental', at: 'NOW' });
  await setCheckin({ athleteId: 'jordan', weekStartISO: '2026-11-09', checkedIn: false });
  expect(deleteDoc).toHaveBeenCalledWith({ path: 'contractCheckins/jordan_2026-11-09' });
});

test('setCheckinNote is a partial update of note only; a blank note removes the field; over 500 characters is refused before any write', async () => {
  expect(await setCheckinNote({ athleteId: 'jordan', weekStartISO: '2026-11-09', note: '  Talked about the first tee.  ' })).toEqual({ id: 'jordan_2026-11-09', note: 'Talked about the first tee.' });
  expect(updateDoc).toHaveBeenCalledWith({ path: 'contractCheckins/jordan_2026-11-09' }, { note: 'Talked about the first tee.' });
  expect(setDoc).not.toHaveBeenCalled();
  expect(await setCheckinNote({ athleteId: 'jordan', weekStartISO: '2026-11-09', note: '   ' })).toEqual({ id: 'jordan_2026-11-09', note: null });
  expect(updateDoc).toHaveBeenLastCalledWith({ path: 'contractCheckins/jordan_2026-11-09' }, { note: 'DELETE' });
  updateDoc.mockClear();
  await expect(setCheckinNote({ athleteId: 'jordan', weekStartISO: '2026-11-09', note: 'x'.repeat(501) })).rejects.toMatchObject({ code: ERR.INVALID });
  expect(updateDoc).not.toHaveBeenCalled();
});

test('fetchBookingsBetween is a date range only: any athlete, any type, rows as stored', async () => {
  getDocs.mockResolvedValue(snap([['jordan_s1', { athleteId: 'jordan', sessionId: 's1', date: '2026-11-10', type: 'training', status: 'confirmed' }]]));
  const rows = await fetchBookingsBetween({ fromISO: '2026-11-09', toISO: '2026-11-15' });
  expect(where).toHaveBeenCalledWith('date', '>=', '2026-11-09');
  expect(where).toHaveBeenCalledWith('date', '<=', '2026-11-15');
  expect(where).not.toHaveBeenCalledWith('athleteId', expect.anything(), expect.anything());
  expect(where).not.toHaveBeenCalledWith('type', expect.anything(), expect.anything());
  expect(rows).toEqual([{ id: 'jordan_s1', athleteId: 'jordan', sessionId: 's1', date: '2026-11-10', type: 'training', status: 'confirmed' }]);
});

test('fetchContractLogsBetween is a date range only and groups minutes by athlete and date', async () => {
  getDocs.mockResolvedValue(snap([
    ['jordan_2026-11-09', { athleteId: 'jordan', date: '2026-11-09', minutes: 20 }],
    ['nico_2026-11-09', { athleteId: 'nico', date: '2026-11-09', minutes: 10 }],
    ['sage_2026-11-09', { athleteId: 'sage', date: '2026-11-09', minutes: 20 }],
  ]));
  const out = await fetchContractLogsBetween({ athleteIds: ['jordan', 'nico'], fromISO: '2026-11-02', toISO: '2026-11-15' });
  expect(where).toHaveBeenCalledWith('date', '>=', '2026-11-02');
  expect(where).toHaveBeenCalledWith('date', '<=', '2026-11-15');
  expect(where).not.toHaveBeenCalledWith('athleteId', expect.anything(), expect.anything());
  expect(out).toEqual({ jordan: { '2026-11-09': 20 }, nico: { '2026-11-09': 10 } });
});

test('fetchHouseholdContact returns four fields and nothing else; null when refused', async () => {
  getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ name: 'Whitfield family', guardian: { name: 'Dana', email: 'dana@email.com', phone: '612-555-0100' }, stripeCustomerId: 'cus_1', membership: { status: 'active' } }) });
  expect(await fetchHouseholdContact('whitfield')).toEqual({ familyName: 'Whitfield family', guardianName: 'Dana', email: 'dana@email.com', phone: '612-555-0100' });
  getDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
  expect(await fetchHouseholdContact('other')).toBeNull();
});

test('fetchContractConfig: missing doc is off', async () => {
  getDoc.mockResolvedValueOnce({ exists: () => false });
  expect(await fetchContractConfig()).toEqual({ enabled: false, enabledAt: null });
  getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ enabled: true, enabledAt: '2026-11-10' }) });
  expect(await fetchContractConfig()).toEqual({ enabled: true, enabledAt: '2026-11-10' });
});
