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

test('seed mode: the Athletes list shows Jordan, Nico, Quinn and Reese with the fixture facts', async () => {
  const h = mountHook(() => useMentalAthletes());
  await settle(h);
  expect(h.out.current.loading).toBe(false);
  expect(h.out.current.data.map((r) => [r.athleteId, r.age, r.hasIntake, r.nextSession != null, r.lastSession != null])).toEqual([
    ['jordan', 14, true, true, true], ['nico', 9, false, false, false], ['quinn', 20, false, false, false], ['reese', 12, false, true, false],
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
  // No check-in yet, 16 days since enabledAt: past OVERDUE_DAYS.
  expect(h.out.current.rows.due.map((r) => r.athleteId)).toEqual(['quinn', 'reese']);
  await act(async () => { await h.out.current.setCheckin({ athleteId: 'nico', checkedIn: true }); });
  expect(h.out.current.rows.checkedIn.map((r) => r.athleteId)).toEqual(['jordan', 'nico']);
  h.unmount();
});

test('seed mode: rows carry that week\'s visits, the family name and the note; a local note sticks to the row', async () => {
  const h = mountHook(() => useContractBoard('2026-11-09'));
  await settle(h);
  const jordan = h.out.current.rows.checkedIn[0];
  expect(jordan.visits.map((v) => `${v.dow} ${v.time} ${v.type}`)).toEqual(['Tue 4:00 PM training', 'Sat 9:00 AM tournament']);
  expect(jordan.familyName).toBe('Whitfield family');
  expect(jordan.note).toBeNull();
  const nico = h.out.current.rows.thisWeek[0];
  expect(nico.visits.map((v) => v.dow)).toEqual(['Thu']); // the cancelled Friday booking is left out
  expect(nico.note).toBeNull(); // last week's note is not this week's
  await expect(h.out.current.setCheckinNote({ athleteId: 'nico', note: 'Too early.' })).rejects.toMatchObject({ code: 'not-found' });
  await act(async () => { await h.out.current.setCheckin({ athleteId: 'nico', checkedIn: true }); });
  await act(async () => { await h.out.current.setCheckinNote({ athleteId: 'nico', note: '  Quick word at pickup. ' }); });
  expect(h.out.current.rows.checkedIn.find((r) => r.athleteId === 'nico').note).toBe('Quick word at pickup.');
  await act(async () => { await h.out.current.setCheckinNote({ athleteId: 'nico', note: '   ' }); });
  expect(h.out.current.rows.checkedIn.find((r) => r.athleteId === 'nico').note).toBeNull();
  h.unmount();
});

test('seed mode: last week\'s check-in note reaches the athlete page', async () => {
  const h = mountHook(() => useMentalAthlete('nico'));
  await settle(h);
  expect(h.out.current.data.contract.lastCheckin).toBe('2026-11-04');
  expect(h.out.current.data.contract.lastCheckinNote).toBe('Caught him after Thursday practice: wants to work on first-tee nerves.');
  h.unmount();
});

test("seed mode: consent on Yannick's rows - Reese needs it before the 1:1 a week out", async () => {
  const h = mountHook(() => useMentalAthletes());
  await settle(h);
  expect(h.out.current.data.map((r) => [r.athleteId, r.consentStatus, r.needsConsent])).toEqual([
    ['jordan', 'signed', false], ['nico', 'unsigned', false], ['quinn', 'signed', false], ['reese', 'unsigned', true],
  ]);
  h.unmount();
});

test("seed mode: an 18+ athlete's page shows the login email and the consent's emergency contact, never the guardian", async () => {
  const q = mountHook(() => useMentalAthlete('quinn'));
  await settle(q);
  expect(q.out.current.data.contact).toEqual({ familyName: 'Parker family', guardianName: null, email: null, phone: null, emergency: { name: 'Sam Parker', phone: 'test-phone', relationship: 'parent' } });
  expect(q.out.current.data.consent.summary.status).toBe('signed');
  expect(q.out.current.data.consent.unavailable).toBe(false);
  q.unmount();
  const j = mountHook(() => useMentalAthlete('jordan'));
  await settle(j);
  expect(j.out.current.data.contact).toEqual({ familyName: 'Whitfield family', guardianName: 'Dana', email: 'dana@email.com', phone: null });
  expect(j.out.current.data.consent.summary.label).toBe('Complete');
  j.unmount();
});

test("seed mode, the review harness only: Jordan on a later UTC date needs the 18+ signature; Nico on paper, not transcribed", async () => {
  const j = mountHook(() => useMentalAthlete('jordan', { demoUtcToday: '2030-07-01' }));
  await settle(j);
  expect(j.out.current.data.consent.summary.status).toBe('needs-adult');
  j.unmount();
  const n = mountHook(() => useMentalAthlete('nico', { demoRecord: 'paper' }));
  await settle(n);
  expect(n.out.current.data.consent.summary.summary).toContain('Location: not transcribed');
  expect(n.out.current.data.consent.summary.summary).toContain('Signed on paper');
  n.unmount();
});
