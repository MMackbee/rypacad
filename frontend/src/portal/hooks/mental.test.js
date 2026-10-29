import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('./live', () => ({ ...jest.requireActual('./live'), isLive: () => false }));
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), academyDateISO: () => '2026-11-11' }));
import { useContractBoard, useMentalAthlete, useMentalAthletes, useMentalNote } from './mental';

function mountHook(useHook) {
  const out = { current: null };
  function Probe() { out.current = useHook(); return null; }
  const div = document.createElement('div');
  const root = createRoot(div);
  return { out, render: async () => { await act(async () => { root.render(<Probe />); }); }, unmount: () => act(() => root.unmount()) };
}
const settle = async (h) => { await h.render(); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

test('seed mode: the Athletes list shows Jordan and Nico with the fixture facts', async () => {
  const h = mountHook(() => useMentalAthletes());
  await settle(h);
  expect(h.out.current.loading).toBe(false);
  expect(h.out.current.data.map((r) => [r.athleteId, r.age, r.hasIntake, r.nextSession != null, r.lastSession != null])).toEqual([
    ['jordan', 14, true, true, true], ['nico', 9, false, false, false],
  ]);
  h.unmount();
});

test('seed mode: the athlete page has the intake, two session notes, three sessions, the contact and the contract summary', async () => {
  const h = mountHook(() => useMentalAthlete('jordan'));
  await settle(h);
  const d = h.out.current.data;
  expect(d.athlete).toMatchObject({ id: 'jordan', age: 14, required: 20 });
  expect(d.contact).toEqual({ familyName: 'Whitfield family', guardianName: 'Dana', email: 'dana@email.com', phone: null });
  expect(d.sessions.map((s) => s.hasNote)).toEqual([false, true, true]);
  expect(d.notes.intake.id).toBe('intake');
  expect(d.notes.sessions).toHaveLength(2);
  expect(d.contract).toMatchObject({ required: 20 });
  expect(d.contract.thisWeek.metDays).toBe(4);
  expect(d.contract.lastCheckin).toBe('2026-11-10');
  h.unmount();
});

test('seed mode: useMentalNote saves locally and reports saved with a time', async () => {
  const h = mountHook(() => useMentalNote({ athleteId: 'nico', entryId: 'intake' }));
  await settle(h);
  expect(h.out.current.entry).toBeNull();
  expect(h.out.current.saveState).toBe('idle');
  await act(async () => { await h.out.current.save('First intake line.'); });
  expect(h.out.current.saveState).toBe('saved');
  expect(typeof h.out.current.savedAt).toBe('number');
  expect(h.out.current.entry.body).toBe('First intake line.');
  await act(async () => { await h.out.current.remove(); });
  expect(h.out.current.entry).toBeNull();
  h.unmount();
});

test('seed mode: a stored note opens as saved, with its last update time', async () => {
  const h = mountHook(() => useMentalNote({ athleteId: 'jordan', entryId: 'intake' }));
  await settle(h);
  expect(h.out.current.entry.id).toBe('intake');
  expect(h.out.current.saveState).toBe('saved');
  expect(h.out.current.savedAt).toBe(h.out.current.entry.updatedAtMs);
  expect(typeof h.out.current.savedAt).toBe('number');
  h.unmount();
});

test('seed mode: the board groups the fixtures and a local check-in moves the row', async () => {
  const h = mountHook(() => useContractBoard('2026-11-09'));
  await settle(h);
  expect(h.out.current.config).toEqual({ enabled: true, enabledAt: '2026-10-26' });
  expect(h.out.current.rows.checkedIn.map((r) => r.athleteId)).toEqual(['jordan']);
  expect(h.out.current.rows.thisWeek.map((r) => r.athleteId)).toEqual(['nico']);
  await act(async () => { await h.out.current.setCheckin({ athleteId: 'nico', checkedIn: true }); });
  expect(h.out.current.rows.checkedIn.map((r) => r.athleteId)).toEqual(['jordan', 'nico']);
  h.unmount();
});
