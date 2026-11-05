import React from 'react';
import { renderScreen } from '../screens/testRender';
import NoteEditor from '../components/mental/NoteEditor';

/**
 * The mental hooks in live mode (isLive() true), against mocked Firestore
 * adapters: what reaches the database when Yannick leaves a note, and how
 * the hooks report it. hooks/mental.test.js covers seed mode.
 */
const mockLive = { fetchAthlete: jest.fn(), fetchAllAthletes: jest.fn(), fetchAllHouseholds: jest.fn(), fetchSessionsInRange: jest.fn() };
const mockMental = {
  fetchMentalEntries: jest.fn(), saveMentalEntry: jest.fn(), deleteMentalEntry: jest.fn(),
  fetchContractLogsBetween: jest.fn(), fetchCheckinsForAthletes: jest.fn(), fetchContractConfig: jest.fn(), setCheckin: jest.fn(),
  setCheckinNote: jest.fn(), fetchBookingsBetween: jest.fn(),
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
  fetchSessionsInRange: (...a) => mockLive.fetchSessionsInRange(...a),
}));
jest.mock('./mentalLive', () => ({
  ...jest.requireActual('./mentalLive'),
  fetchMentalEntries: (...a) => mockMental.fetchMentalEntries(...a),
  saveMentalEntry: (...a) => mockMental.saveMentalEntry(...a),
  deleteMentalEntry: (...a) => mockMental.deleteMentalEntry(...a),
  fetchContractLogsBetween: (...a) => mockMental.fetchContractLogsBetween(...a),
  fetchCheckinsForAthletes: (...a) => mockMental.fetchCheckinsForAthletes(...a),
  fetchContractConfig: (...a) => mockMental.fetchContractConfig(...a),
  setCheckin: (...a) => mockMental.setCheckin(...a),
  setCheckinNote: (...a) => mockMental.setCheckinNote(...a),
  fetchBookingsBetween: (...a) => mockMental.fetchBookingsBetween(...a),
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
import { useContractBoard, useMentalAthlete, useMentalAthletes, useMentalNote } from './mental';
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

/* ------------------------------------------------------- Contract board -- */

const BOARD_ATHLETES = [
  { id: 'jordan', name: 'Jordan', dob: '2012-06-17', householdId: 'w' },
  { id: 'reese', name: 'Reese', dob: '2014-03-02', householdId: 'w' },
];

function mountBoard({ checkins = [], week = '2026-11-09' } = {}) {
  mockLive.fetchAllAthletes.mockResolvedValue(BOARD_ATHLETES);
  mockLive.fetchAllHouseholds.mockResolvedValue([{ id: 'w', name: 'Whitfield family' }]);
  mockMental.fetchContractLogsBetween.mockResolvedValue({});
  mockMental.fetchCheckinsForAthletes.mockResolvedValue(checkins);
  mockMental.fetchContractConfig.mockResolvedValue({ enabled: true, enabledAt: '2026-10-01' });
  mockMental.fetchBookingsBetween.mockResolvedValue([{ id: 'jordan_s-tue', athleteId: 'jordan', sessionId: 's-tue', date: '2026-11-10', type: 'training', status: 'confirmed' }]);
  mockLive.fetchSessionsInRange.mockResolvedValue([{ id: 's-tue', date: '2026-11-10', time: '4:00 PM', type: 'training', status: 'scheduled' }]);
  const out = { current: null, loadingSeen: [] };
  const useBoard = () => {
    const b = useContractBoard(week);
    out.loadingSeen.push(b.loading);
    return b;
  };
  return renderScreen(<HookProbe out={out} use={useBoard} />, { path: '/x' }).then((r) => ({ r, out }));
}
const ids = (list) => (list || []).map((row) => row.athleteId);

test('a Checked in tap moves the row at once and never blanks or re-reads the board', async () => {
  let finishWrite;
  mockMental.setCheckin.mockImplementation(() => new Promise((res) => { finishWrite = res; }));
  const { r, out } = await mountBoard();
  await r.flush();
  expect(ids(out.current.rows.due)).toEqual(['jordan', 'reese']);
  expect(mockLive.fetchAllAthletes).toHaveBeenCalledTimes(1);
  out.loadingSeen.length = 0;
  let write;
  await r.act(() => { write = out.current.setCheckin({ athleteId: 'reese', checkedIn: true }); });
  // Optimistic: moved before the write resolves, and the rows stayed on screen.
  expect(ids(out.current.rows.due)).toEqual(['jordan']);
  expect(ids(out.current.rows.checkedIn)).toEqual(['reese']);
  expect(out.current.rows.checkedIn[0]).toMatchObject({ checkedInThisWeek: true, lastCheckin: '2026-11-11', daysSince: 0 });
  await r.act(async () => { finishWrite({ id: 'reese_2026-11-09', checkedIn: true }); await write; });
  expect(mockMental.setCheckin).toHaveBeenCalledWith({ athleteId: 'reese', weekStartISO: '2026-11-09', checkedIn: true });
  expect(ids(out.current.rows.checkedIn)).toEqual(['reese']);
  expect(out.loadingSeen).not.toContain(true);
  expect(out.current.rows).not.toBeNull();
  expect(mockLive.fetchAllAthletes).toHaveBeenCalledTimes(1);
  // Unchecking is as quick: the row goes back to Due.
  mockMental.setCheckin.mockResolvedValue({ id: 'reese_2026-11-09', checkedIn: false });
  await r.act(() => out.current.setCheckin({ athleteId: 'reese', checkedIn: false }));
  expect(ids(out.current.rows.due)).toEqual(['jordan', 'reese']);
  expect(out.loadingSeen).not.toContain(true);
  await r.unmount();
});

test('a failed Checked in write puts the row back and rejects, so the screen can say so', async () => {
  mockMental.setCheckin.mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));
  const { r, out } = await mountBoard();
  await r.flush();
  let failed = null;
  await r.act(() => out.current.setCheckin({ athleteId: 'jordan', checkedIn: true }).catch((e) => { failed = e; }));
  expect(failed).not.toBeNull();
  expect(ids(out.current.rows.due)).toEqual(['jordan', 'reese']);
  expect(ids(out.current.rows.checkedIn)).toEqual([]);
  await r.unmount();
});

test('the board reads the week\'s bookings and sessions once and shows them as visits, with the family name', async () => {
  const { r, out } = await mountBoard();
  await r.flush();
  expect(mockMental.fetchBookingsBetween).toHaveBeenCalledTimes(1);
  expect(mockMental.fetchBookingsBetween).toHaveBeenCalledWith({ fromISO: '2026-11-09', toISO: '2026-11-15' });
  expect(mockLive.fetchSessionsInRange).toHaveBeenCalledWith('2026-11-09', '2026-11-15');
  const all = [...out.current.rows.due, ...out.current.rows.thisWeek, ...out.current.rows.checkedIn];
  expect(all.find((x) => x.athleteId === 'jordan').visits).toEqual([{ date: '2026-11-10', dow: 'Tue', time: '4:00 PM', type: 'training' }]);
  expect(all.find((x) => x.athleteId === 'reese').visits).toEqual([]);
  expect(all.map((x) => x.familyName)).toEqual(['Whitfield family', 'Whitfield family']);
  await r.unmount();
});

test('a note typed before the tick lands waits for it and shows at once; a refused note puts the old one back; no check-in, no note', async () => {
  let finishWrite;
  mockMental.setCheckin.mockImplementation(() => new Promise((res) => { finishWrite = res; }));
  mockMental.setCheckinNote.mockResolvedValue({ id: 'reese_2026-11-09', note: 'First tee.' });
  const { r, out } = await mountBoard();
  await r.flush();
  let write;
  await r.act(() => { write = out.current.setCheckin({ athleteId: 'reese', checkedIn: true }); });
  let noteWrite;
  await r.act(() => { noteWrite = out.current.setCheckinNote({ athleteId: 'reese', note: '  First tee.  ' }); });
  expect(out.current.rows.checkedIn[0]).toMatchObject({ athleteId: 'reese', checkedInThisWeek: true, note: 'First tee.' });
  expect(mockMental.setCheckinNote).not.toHaveBeenCalled(); // the tick's own write has not landed yet
  await r.act(async () => { finishWrite({ id: 'reese_2026-11-09', checkedIn: true }); await write; await noteWrite; });
  expect(mockMental.setCheckinNote).toHaveBeenCalledWith({ athleteId: 'reese', weekStartISO: '2026-11-09', note: 'First tee.' });
  expect(out.current.rows.checkedIn[0].note).toBe('First tee.');
  expect(mockLive.fetchAllAthletes).toHaveBeenCalledTimes(1); // no re-read for the note either
  // A refused note keeps the note that was there.
  mockMental.setCheckinNote.mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));
  let failed = null;
  await r.act(() => out.current.setCheckinNote({ athleteId: 'reese', note: 'Changed.' }).catch((e) => { failed = e; }));
  expect(failed).not.toBeNull();
  expect(out.current.rows.checkedIn[0].note).toBe('First tee.');
  // A note for a row that is not checked in that week is refused without a write.
  mockMental.setCheckinNote.mockClear();
  await expect(out.current.setCheckinNote({ athleteId: 'jordan', note: 'x' })).rejects.toMatchObject({ code: ERR.NOT_FOUND });
  expect(mockMental.setCheckinNote).not.toHaveBeenCalled();
  await r.unmount();
});

test('a note typed on a tick that is then refused is dropped quietly, without a write; the row goes back to what was read', async () => {
  let refuseTick;
  mockMental.setCheckin.mockImplementation(() => new Promise((res, rej) => { refuseTick = rej; }));
  const { r, out } = await mountBoard();
  await r.flush();
  let tick;
  await r.act(() => { tick = out.current.setCheckin({ athleteId: 'reese', checkedIn: true }).catch((e) => e); });
  let note;
  await r.act(() => { note = out.current.setCheckinNote({ athleteId: 'reese', note: 'Typed fast.' }); });
  expect(out.current.rows.checkedIn[0]).toMatchObject({ athleteId: 'reese', note: 'Typed fast.' });
  let outcome;
  await r.act(async () => { refuseTick(Object.assign(new Error('denied'), { code: 'permission-denied' })); await tick; outcome = await note; });
  expect(outcome).toMatchObject({ dropped: true, note: null });
  expect(mockMental.setCheckinNote).not.toHaveBeenCalled();
  expect(ids(out.current.rows.due)).toEqual(['jordan', 'reese']);
  expect(ids(out.current.rows.checkedIn)).toEqual([]);
  await r.unmount();
});

const READ_REESE = [{ id: 'reese_2026-11-09', athleteId: 'reese', weekStart: '2026-11-09', checkedIn: true, by: 'mental', at: '2026-11-10', note: 'Spoke Monday.' }];

test('a refused un-tick does not poison later note saves on that row', async () => {
  mockMental.setCheckin.mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));
  mockMental.setCheckinNote.mockResolvedValue({ id: 'reese_2026-11-09', note: 'Edited.' });
  const { r, out } = await mountBoard({ checkins: READ_REESE });
  await r.flush();
  expect(out.current.rows.checkedIn[0]).toMatchObject({ athleteId: 'reese', note: 'Spoke Monday.' });
  await r.act(() => out.current.setCheckin({ athleteId: 'reese', checkedIn: false }).catch(() => {}));
  expect(out.current.rows.checkedIn[0]).toMatchObject({ athleteId: 'reese', note: 'Spoke Monday.' }); // the refused delete put the read back
  await r.act(() => out.current.setCheckinNote({ athleteId: 'reese', note: 'Edited.' }));
  expect(mockMental.setCheckinNote).toHaveBeenCalledWith({ athleteId: 'reese', weekStartISO: '2026-11-09', note: 'Edited.' });
  expect(out.current.rows.checkedIn[0].note).toBe('Edited.');
  await r.unmount();
});

test('a note on a past week goes to that week\'s check-in', async () => {
  mockMental.setCheckinNote.mockResolvedValue({ id: 'jordan_2026-11-02', note: 'Edited.' });
  const { r, out } = await mountBoard({
    week: '2026-11-02',
    checkins: [{ id: 'jordan_2026-11-02', athleteId: 'jordan', weekStart: '2026-11-02', checkedIn: true, by: 'mental', at: '2026-11-04', note: 'Older.' }],
  });
  await r.flush();
  expect(mockMental.fetchBookingsBetween).toHaveBeenCalledWith({ fromISO: '2026-11-02', toISO: '2026-11-08' });
  expect(out.current.rows.checkedIn[0]).toMatchObject({ athleteId: 'jordan', note: 'Older.' });
  await r.act(() => out.current.setCheckinNote({ athleteId: 'jordan', note: 'Edited.' }));
  expect(mockMental.setCheckinNote).toHaveBeenCalledWith({ athleteId: 'jordan', weekStartISO: '2026-11-02', note: 'Edited.' });
  expect(out.current.rows.checkedIn[0].note).toBe('Edited.');
  expect(mockLive.fetchAllAthletes).toHaveBeenCalledTimes(1);
  await r.unmount();
});

test('a refused note then a refused un-tick leaves the row on what was read, never on the unconfirmed note', async () => {
  let refuseNote;
  let refuseTick;
  mockMental.setCheckinNote.mockImplementation(() => new Promise((res, rej) => { refuseNote = rej; }));
  mockMental.setCheckin.mockImplementation(() => new Promise((res, rej) => { refuseTick = rej; }));
  const { r, out } = await mountBoard({ checkins: READ_REESE });
  await r.flush();
  let note;
  await r.act(() => { note = out.current.setCheckinNote({ athleteId: 'reese', note: 'Unconfirmed.' }).catch((e) => e); });
  expect(out.current.rows.checkedIn[0].note).toBe('Unconfirmed.');
  let tick;
  await r.act(() => { tick = out.current.setCheckin({ athleteId: 'reese', checkedIn: false }).catch((e) => e); });
  expect(ids(out.current.rows.checkedIn)).toEqual([]);
  await r.act(async () => { refuseNote(Object.assign(new Error('offline'), { code: 'unavailable' })); await note; });
  await r.act(async () => { refuseTick(Object.assign(new Error('offline'), { code: 'unavailable' })); await tick; });
  expect(out.current.rows.checkedIn[0]).toMatchObject({ athleteId: 'reese', checkedInThisWeek: true, note: 'Spoke Monday.' });
  await r.unmount();
});

/** Two quick taps on Jordan's row (check, then uncheck) with both writes held; returns their settlers. */
async function twoTaps(r, out) {
  const writes = [];
  mockMental.setCheckin.mockImplementation(() => new Promise((resolve, reject) => { writes.push({ resolve, reject }); }));
  const taps = [];
  await r.act(() => { taps.push(out.current.setCheckin({ athleteId: 'jordan', checkedIn: true }).catch(() => 'refused')); });
  await r.act(() => { taps.push(out.current.setCheckin({ athleteId: 'jordan', checkedIn: false }).catch(() => 'refused')); });
  expect(ids(out.current.rows.due)).toEqual(['jordan', 'reese']);
  const refuse = (i) => r.act(async () => { writes[i].reject(Object.assign(new Error('denied'), { code: 'permission-denied' })); await taps[i]; });
  const land = (i, checkedIn) => r.act(async () => { writes[i].resolve({ id: 'jordan_2026-11-09', checkedIn }); await taps[i]; });
  return { refuse, land };
}

test('two quick taps on one row, both refused: the row shows what was read, not the first tap', async () => {
  const { r, out } = await mountBoard();
  await r.flush();
  const { refuse } = await twoTaps(r, out);
  await refuse(0);
  await refuse(1);
  expect(ids(out.current.rows.due)).toEqual(['jordan', 'reese']);
  expect(ids(out.current.rows.checkedIn)).toEqual([]);
  await r.unmount();
});

test('two quick taps on one row, the first lands and the second is refused: the row shows the first', async () => {
  const { r, out } = await mountBoard();
  await r.flush();
  const { refuse, land } = await twoTaps(r, out);
  await land(0, true);
  await refuse(1);
  expect(ids(out.current.rows.checkedIn)).toEqual(['jordan']);
  await r.unmount();
});

test('the second tap refused before the first write lands (session gone): the row ends on the write that landed', async () => {
  const { r, out } = await mountBoard();
  await r.flush();
  const { refuse, land } = await twoTaps(r, out);
  await refuse(1);
  expect(ids(out.current.rows.checkedIn)).toEqual([]); // nothing has landed yet
  await land(0, true);
  expect(ids(out.current.rows.checkedIn)).toEqual(['jordan']);
  await r.unmount();
});

/* ---------------------------------------------------------- One athlete -- */

function mountAthlete(athleteId) {
  mockMental.fetchMentalBookings.mockResolvedValue([]);
  mockMental.fetchMentalEntries.mockResolvedValue([]);
  mockMental.fetchContractLogsBetween.mockResolvedValue({});
  mockMental.fetchCheckinsForAthletes.mockResolvedValue([]);
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

/** The athlete page's other reads, empty: only the athlete and the consent matter below. */
function mountQuiet(athleteId) {
  const out = { current: null };
  return renderScreen(<HookProbe out={out} use={() => useMentalAthlete(athleteId)} />, { path: '/x' }).then((r) => ({ r, out }));
}
function quietAthleteReads(athlete) {
  mockLive.fetchAthlete.mockResolvedValue(athlete);
  mockMental.fetchMentalBookings.mockResolvedValue([]);
  mockMental.fetchMentalEntries.mockResolvedValue([]);
  mockMental.fetchContractLogsBetween.mockResolvedValue({});
  mockMental.fetchCheckinsForAthletes.mockResolvedValue([]);
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
