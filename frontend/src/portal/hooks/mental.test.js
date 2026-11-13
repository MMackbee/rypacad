import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('./live', () => ({ ...jest.requireActual('./live'), isLive: () => false }));
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), academyDateISO: () => '2026-11-11' }));
import { useMentalAthlete, useMentalAthletes, useMentalNote } from './mental';

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

test('seed mode: the athlete page has the intake, two session notes, three sessions and the contact, and no contract', async () => {
  const h = mountHook(() => useMentalAthlete('jordan'));
  await settle(h);
  const d = h.out.current.data;
  expect(d.athlete).toMatchObject({ id: 'jordan', age: 14 });
  expect(d.contact).toEqual({ familyName: 'Whitfield family', guardianName: 'Dana', email: 'dana@email.com', phone: null });
  expect(d.sessions.map((s) => s.hasNote)).toEqual([false, true, true]);
  expect(d.notes.intake.id).toBe('intake');
  expect(d.notes.sessions).toHaveLength(2);
  // The contract left Yannick's view (owner 2026-11-12/13): the payload carries none of it.
  expect(d.athlete).not.toHaveProperty('required');
  expect(d).not.toHaveProperty('contract');
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
  expect(n.out.current.data.consent.summary.summary).toContain('Emergency contact: not transcribed');
  n.unmount();
});
