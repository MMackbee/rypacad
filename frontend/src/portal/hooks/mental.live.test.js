import React from 'react';
import { renderScreen } from '../screens/testRender';
import NoteEditor from '../components/mental/NoteEditor';

/**
 * The mental hooks in live mode (isLive() true), against mocked Firestore
 * adapters: what reaches the database when Yannick leaves a note, and how
 * the hooks report it. hooks/mental.test.js covers seed mode.
 */
const mockLive = { fetchAthlete: jest.fn(), fetchAllAthletes: jest.fn(), fetchAllHouseholds: jest.fn() };
const mockMental = { fetchMentalEntries: jest.fn(), saveMentalEntry: jest.fn() };
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
}));
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), academyDateISO: () => '2026-11-11' }));
// eslint-disable-next-line import/first
import { useMentalNote } from './mental';

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
