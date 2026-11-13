import React from 'react';
import { renderScreen } from '../screens/testRender';
import NoteEditor from '../components/mental/NoteEditor';

/**
 * The mental hooks in live mode (isLive() true), against mocked Firestore
 * adapters: what reaches the database when Yannick leaves a note, and how
 * the hooks report it. hooks/mental.test.js covers seed mode.
 */
const mockLive = { fetchAthlete: jest.fn(), fetchAllAthletes: jest.fn(), fetchAllHouseholds: jest.fn() };
const mockMental = {
  fetchMentalEntries: jest.fn(), saveMentalEntry: jest.fn(), deleteMentalEntry: jest.fn(),
  // The contract reads: Yannick's page never calls them (owner 2026-11-12/13).
  fetchContractLogsBetween: jest.fn(), fetchCheckinsForAthletes: jest.fn(), fetchContractConfig: jest.fn(),
  fetchMentalBookings: jest.fn(), fetchHouseholdContact: jest.fn(),
};
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  isLive: () => true,
  fetchAthlete: (...a) => mockLive.fetchAthlete(...a),
  fetchAllAthletes: (...a) => mockLive.fetchAllAthletes(...a),
  fetchAllHouseholds: (...a) => mockLive.fetchAllHouseholds(...a),
}));
jest.mock('./mentalLive', () => ({
  ...jest.requireActual('./mentalLive'),
  fetchMentalEntries: (...a) => mockMental.fetchMentalEntries(...a),
  saveMentalEntry: (...a) => mockMental.saveMentalEntry(...a),
  deleteMentalEntry: (...a) => mockMental.deleteMentalEntry(...a),
  fetchContractLogsBetween: (...a) => mockMental.fetchContractLogsBetween(...a),
  fetchCheckinsForAthletes: (...a) => mockMental.fetchCheckinsForAthletes(...a),
  fetchContractConfig: (...a) => mockMental.fetchContractConfig(...a),
  fetchMentalBookings: (...a) => mockMental.fetchMentalBookings(...a),
  fetchHouseholdContact: (...a) => mockMental.fetchHouseholdContact(...a),
}));
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), academyDateISO: () => '2026-11-11' }));
// Yannick's consent reads (plan Task 14): a record, or none, or a refused read.
const mockConsent = { fetchConsent: jest.fn(), fetchAllConsents: jest.fn() };
jest.mock('./mentalConsentLive', () => ({
  ...jest.requireActual('./mentalConsentLive'),
  fetchConsent: (...a) => mockConsent.fetchConsent(...a),
  fetchAllConsents: (...a) => mockConsent.fetchAllConsents(...a),
}));
// eslint-disable-next-line import/first
import { useMentalAthlete, useMentalAthletes, useMentalNote } from './mental';
// eslint-disable-next-line import/first
import { ERR, LiveDataError } from './live';

const STORED = { id: 'intake', athleteId: 'jordan', kind: 'intake', sessionId: null, sessionDate: null, body: 'Stored.', createdAtMs: 1, updatedAtMs: 2 };

beforeEach(() => {
  for (const fn of [...Object.values(mockLive), ...Object.values(mockMental), ...Object.values(mockConsent)]) fn.mockReset();
  mockConsent.fetchConsent.mockResolvedValue(null);
  mockConsent.fetchAllConsents.mockResolvedValue([]);
  mockLive.fetchAthlete.mockResolvedValue({ id: 'jordan', name: 'Jordan Whitfield', householdId: 'whitfield' });
  mockMental.fetchMentalEntries.mockResolvedValue([STORED]);
  mockMental.saveMentalEntry.mockResolvedValue(undefined);
});

function NoteProbe() {
  const n = useMentalNote({ athleteId: 'jordan', entryId: 'intake' });
  if (n.loading) return null;
  return <NoteEditor initialBody={n.entry?.body ?? ''} saveState={n.saveState} savedAt={n.savedAt} onSave={n.save} />;
}

test('browser Back with no blur: the text typed since the last tick still reaches Firestore', async () => {
  const r = await renderScreen(<NoteProbe />, { path: '/portal/mental/jordan/notes/intake' });
  await r.flush();
  expect(r.container.querySelector('textarea').value).toBe('Stored.');
  expect(r.text()).toContain('Saved ·'); // a stored note opens as saved, not "Not saved yet"
  await r.fill('Note', 'Stored. Typed just before Back.');
  expect(r.text()).toContain('Not saved yet');
  expect(mockMental.saveMentalEntry).not.toHaveBeenCalled();
  await r.unmount();
  expect(mockMental.saveMentalEntry).toHaveBeenCalledTimes(1);
  expect(mockMental.saveMentalEntry).toHaveBeenCalledWith(expect.objectContaining({
    athleteId: 'jordan', entryId: 'intake', kind: 'intake', body: 'Stored. Typed just before Back.',
  }));
});

function HookProbe({ use, out }) {
  out.current = use();
  return null;
}

test('a slow save reads saving, then slow after 8 s, then saved with a time (SLOW_SAVE_MS)', async () => {
  jest.useFakeTimers();
  try {
    let resolveSave;
    mockMental.saveMentalEntry.mockImplementation(() => new Promise((res) => { resolveSave = res; }));
    const out = { current: null };
    const r = await renderScreen(<HookProbe out={out} use={() => useMentalNote({ athleteId: 'jordan', entryId: 'intake' })} />, { path: '/x' });
    await r.flush();
    expect(out.current.loading).toBe(false);
    let done;
    await r.act(() => { done = out.current.save('Stored. A slow line.'); });
    expect(out.current.saveState).toBe('saving');
    await r.act(() => { jest.advanceTimersByTime(7999); });
    expect(out.current.saveState).toBe('saving');
    await r.act(() => { jest.advanceTimersByTime(1); });
    expect(out.current.saveState).toBe('slow');
    await r.act(async () => { resolveSave(); await done; });
    expect(out.current.saveState).toBe('saved');
    expect(typeof out.current.savedAt).toBe('number');
    expect(out.current.entry.body).toBe('Stored. A slow line.');
    await r.unmount();
  } finally {
    jest.useRealTimers();
  }
});

test('a failed save reads error, and the next save clears it', async () => {
  mockMental.saveMentalEntry.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
  const out = { current: null };
  const r = await renderScreen(<HookProbe out={out} use={() => useMentalNote({ athleteId: 'jordan', entryId: 'intake' })} />, { path: '/x' });
  await r.flush();
  await r.act(() => out.current.save('Stored. Offline line.'));
  expect(out.current.saveState).toBe('error');
  await r.act(() => out.current.save('Stored. Offline line.'));
  expect(out.current.saveState).toBe('saved');
  expect(mockMental.saveMentalEntry).toHaveBeenCalledTimes(2);
  await r.unmount();
});

test('a confirmed delete while an autosave is in flight: that save may no longer create the note', async () => {
  const pending = [];
  mockMental.saveMentalEntry.mockImplementation(() => new Promise((resolve, reject) => { pending.push({ resolve, reject }); }));
  mockMental.deleteMentalEntry.mockResolvedValue({ id: 'intake' });
  const out = { current: null };
  const r = await renderScreen(<HookProbe out={out} use={() => useMentalNote({ athleteId: 'jordan', entryId: 'intake' })} />, { path: '/x' });
  await r.flush();
  let tick;
  await r.act(() => { tick = out.current.save('Stored. Typed before Delete.'); });
  const { mayCreate } = mockMental.saveMentalEntry.mock.calls[0][0];
  expect(mayCreate()).toBe(true);
  await r.act(() => out.current.remove());
  expect(mayCreate()).toBe(false); // the transaction's retry after the delete is refused, not a create
  await r.act(async () => { pending[0].reject(new LiveDataError(ERR.NOT_FOUND, 'deleted')); await tick; });
  expect(out.current).toMatchObject({ entry: null, saveState: 'idle' });
  // Typing after the delete is a new note: that save may create it.
  await r.act(() => { out.current.save('A new note.'); });
  expect(mockMental.saveMentalEntry.mock.calls[1][0].mayCreate()).toBe(true);
  await r.unmount();
});

test('a delete that fails gives the in-flight save its create back', async () => {
  mockMental.saveMentalEntry.mockImplementation(() => new Promise(() => {}));
  mockMental.deleteMentalEntry.mockRejectedValue(new LiveDataError(ERR.UNAVAILABLE, 'offline'));
  const out = { current: null };
  const r = await renderScreen(<HookProbe out={out} use={() => useMentalNote({ athleteId: 'jordan', entryId: 'intake' })} />, { path: '/x' });
  await r.flush();
  await r.act(() => { out.current.save('Stored. More.'); });
  let failed = null;
  await r.act(() => out.current.remove().catch((e) => { failed = e; }));
  expect(failed).toMatchObject({ code: ERR.UNAVAILABLE });
  expect(mockMental.saveMentalEntry.mock.calls[0][0].mayCreate()).toBe(true);
  await r.unmount();
});

/* ---------------------------------------------------------- One athlete -- */

function mountAthlete(athleteId) {
  mockMental.fetchMentalBookings.mockResolvedValue([]);
  mockMental.fetchMentalEntries.mockResolvedValue([]);
  mockMental.fetchHouseholdContact.mockResolvedValue(null);
  const out = { current: null };
  return renderScreen(<HookProbe out={out} use={() => useMentalAthlete(athleteId)} />, { path: '/x' }).then((r) => ({ r, out }));
}

test('a mistyped or stale athlete id is not found (null data), not a load error', async () => {
  mockLive.fetchAthlete.mockRejectedValue(new LiveDataError(ERR.NOT_FOUND, 'No athletes/does-not-exist doc.'));
  const { r, out } = await mountAthlete('does-not-exist');
  await r.flush();
  expect(out.current).toMatchObject({ data: null, loading: false, error: null });
  await r.unmount();
});

test('any other athlete read failure is still an error', async () => {
  mockLive.fetchAthlete.mockRejectedValue(new LiveDataError(ERR.UNAVAILABLE, 'offline'));
  const { r, out } = await mountAthlete('jordan');
  await r.flush();
  expect(out.current.data).toBeNull();
  expect(out.current.error).toMatchObject({ code: ERR.UNAVAILABLE });
  await r.unmount();
});

// The contract left Yannick's view (owner 2026-11-12/13): the page reads no
// contractLogs or contractCheckins, so a refused contract read cannot blank it.
test('the athlete page reads no contract data', async () => {
  mockLive.fetchAthlete.mockResolvedValue({ id: 'ava', name: 'Ava Test', dob: '2012-05-14', householdId: 'hh' });
  mockMental.fetchMentalBookings.mockResolvedValue([]);
  mockMental.fetchMentalEntries.mockResolvedValue([]);
  mockMental.fetchHouseholdContact.mockResolvedValue({ familyName: 'Test family', guardianName: 'Dana', email: 'dana@example.com', phone: null });
  mockMental.fetchContractLogsBetween.mockRejectedValue(new LiveDataError(ERR.PERMISSION, 'denied'));
  mockMental.fetchCheckinsForAthletes.mockRejectedValue(new LiveDataError(ERR.PERMISSION, 'denied'));
  mockMental.fetchContractConfig.mockRejectedValue(new LiveDataError(ERR.PERMISSION, 'denied'));
  const out = { current: null };
  const r = await renderScreen(<HookProbe out={out} use={() => useMentalAthlete('ava')} />, { path: '/x' });
  await r.flush();
  expect(mockMental.fetchContractLogsBetween).not.toHaveBeenCalled();
  expect(mockMental.fetchCheckinsForAthletes).not.toHaveBeenCalled();
  expect(mockMental.fetchContractConfig).not.toHaveBeenCalled();
  expect(out.current.error).toBeNull();
  expect(out.current.data.athlete).toMatchObject({ id: 'ava', name: 'Ava Test' });
  expect(out.current.data.athlete).not.toHaveProperty('required');
  expect(out.current.data).not.toHaveProperty('contract');
  expect(out.current.data.contact).toMatchObject({ guardianName: 'Dana' });
  await r.unmount();
});

/** The athlete page's other reads, empty: only the athlete and the consent matter below. */
function mountQuiet(athleteId) {
  const out = { current: null };
  return renderScreen(<HookProbe out={out} use={() => useMentalAthlete(athleteId)} />, { path: '/x' }).then((r) => ({ r, out }));
}
function quietAthleteReads(athlete) {
  mockLive.fetchAthlete.mockResolvedValue(athlete);
  mockMental.fetchMentalBookings.mockResolvedValue([]);
  mockMental.fetchMentalEntries.mockResolvedValue([]);
  mockMental.fetchHouseholdContact.mockResolvedValue({ familyName: 'Test family', guardianName: 'Dana', email: 'dana@example.com', phone: null });
}

test('consent on the athlete page: no record reads Not signed', async () => {
  quietAthleteReads({ id: 'ava', name: 'Ava Test', dob: '2012-05-14', householdId: 'hh' });
  const { r, out } = await mountQuiet('ava');
  await r.flush();
  expect(mockConsent.fetchConsent).toHaveBeenCalledWith('ava');
  expect(out.current.data.consent).toMatchObject({ record: null, unavailable: false, summary: { label: 'Not signed', canRemind: true } });
  await r.unmount();
});

test('a refused consent read never blanks the athlete page: the card says unavailable', async () => {
  quietAthleteReads({ id: 'ava', name: 'Ava Test', dob: '2012-05-14', householdId: 'hh' });
  mockConsent.fetchConsent.mockRejectedValue(new LiveDataError(ERR.PERMISSION, 'denied'));
  const { r, out } = await mountQuiet('ava');
  await r.flush();
  expect(out.current.error).toBeNull();
  expect(out.current.data).not.toBeNull();
  expect(out.current.data.consent.unavailable).toBe(true);
  expect(out.current.data.contact).toMatchObject({ guardianName: 'Dana' });
  await r.unmount();
});

test("an 18+ athlete's contact is their login email and the consent's emergency contact", async () => {
  quietAthleteReads({ id: 'max', name: 'Max Test', dob: '2007-03-02', householdId: 'hh', loginEmail: 'max@example.com' });
  mockConsent.fetchConsent.mockResolvedValue({ id: 'max', adult: true, adultSignature: null, signedAt: new Date('2026-10-30T17:00:00Z'), signer: { role: 'athlete', name: 'Max Test' },
    assent: null, choices: { location: 'C', audio: true, driving: null, emergencyContact: { name: 'Lee Test', phone: 'test-phone', relationship: 'aunt' }, parentSessions: false, parentName: null },
    version: '2026-10-30', countersign: null, history: [] });
  const { r, out } = await mountQuiet('max');
  await r.flush();
  expect(out.current.data.contact).toEqual({ familyName: 'Test family', guardianName: null, email: 'max@example.com', phone: null, emergency: { name: 'Lee Test', phone: 'test-phone', relationship: 'aunt' } });
  expect(out.current.data.consent.summary.audience).toBe('athlete');
  await r.unmount();
});

test("the Athletes list joins every record; a refused consent read keeps the list, with no consent line", async () => {
  mockLive.fetchAllAthletes.mockResolvedValue([{ id: 'ava', name: 'Ava Test', dob: '2012-05-14', householdId: 'hh' }]);
  mockLive.fetchAllHouseholds.mockResolvedValue([]);
  mockMental.fetchMentalBookings.mockResolvedValue([]);
  const mentalLive = require('./mentalLive');
  const allBookings = jest.spyOn(mentalLive, 'fetchAllMentalBookings').mockResolvedValue([{ athleteId: 'ava', type: 'mental', status: 'confirmed', date: '2026-11-18' }]);
  const allEntries = jest.spyOn(mentalLive, 'fetchAllMentalEntries').mockResolvedValue([]);
  const list = { current: null };
  const r = await renderScreen(<HookProbe out={list} use={() => useMentalAthletes()} />, { path: '/x' });
  await r.flush();
  expect(list.current.data.map((x) => [x.athleteId, x.consentStatus, x.needsConsent])).toEqual([['ava', 'unsigned', true]]);
  await r.unmount();
  mockConsent.fetchAllConsents.mockRejectedValue(new LiveDataError(ERR.PERMISSION, 'denied'));
  const refused = await renderScreen(<HookProbe out={list} use={() => useMentalAthletes()} />, { path: '/x' });
  await refused.flush();
  expect(list.current.error).toBeNull();
  expect(list.current.data.map((x) => [x.athleteId, x.consentStatus, x.needsConsent])).toEqual([['ava', null, false]]);
  await refused.unmount();
  allBookings.mockRestore();
  allEntries.mockRestore();
});
