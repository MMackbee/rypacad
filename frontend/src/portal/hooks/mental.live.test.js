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
  fetchMentalEntries: jest.fn(), saveMentalEntry: jest.fn(),
  fetchContractLogsBetween: jest.fn(), fetchCheckinsForAthletes: jest.fn(), fetchContractConfig: jest.fn(), setCheckin: jest.fn(),
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
  fetchContractLogsBetween: (...a) => mockMental.fetchContractLogsBetween(...a),
  fetchCheckinsForAthletes: (...a) => mockMental.fetchCheckinsForAthletes(...a),
  fetchContractConfig: (...a) => mockMental.fetchContractConfig(...a),
  setCheckin: (...a) => mockMental.setCheckin(...a),
  fetchMentalBookings: (...a) => mockMental.fetchMentalBookings(...a),
  fetchHouseholdContact: (...a) => mockMental.fetchHouseholdContact(...a),
}));
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), academyDateISO: () => '2026-11-11' }));
// eslint-disable-next-line import/first
import { useContractBoard, useMentalAthlete, useMentalNote } from './mental';
// eslint-disable-next-line import/first
import { ERR, LiveDataError } from './live';

const STORED = { id: 'intake', athleteId: 'jordan', kind: 'intake', sessionId: null, sessionDate: null, body: 'Stored.', createdAtMs: 1, updatedAtMs: 2 };

beforeEach(() => {
  for (const fn of [...Object.values(mockLive), ...Object.values(mockMental)]) fn.mockReset();
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

/* ------------------------------------------------------- Contract board -- */

const BOARD_ATHLETES = [
  { id: 'jordan', name: 'Jordan', dob: '2012-06-17', householdId: 'w' },
  { id: 'reese', name: 'Reese', dob: '2014-03-02', householdId: 'w' },
];

function mountBoard() {
  mockLive.fetchAllAthletes.mockResolvedValue(BOARD_ATHLETES);
  mockLive.fetchAllHouseholds.mockResolvedValue([{ id: 'w', name: 'Whitfield family' }]);
  mockMental.fetchContractLogsBetween.mockResolvedValue({});
  mockMental.fetchCheckinsForAthletes.mockResolvedValue([]);
  mockMental.fetchContractConfig.mockResolvedValue({ enabled: true, enabledAt: '2026-10-01' });
  const out = { current: null, loadingSeen: [] };
  const useBoard = () => {
    const b = useContractBoard('2026-11-09');
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
