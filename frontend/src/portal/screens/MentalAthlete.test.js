import React from 'react';
import { renderScreen } from './testRender';

let mockData;
jest.mock('../hooks', () => ({
  useMentalAthlete: () => ({ data: mockData, loading: false, error: null }),
  useSelfManaged: () => false,
}));
// The Consent card's three actions (plan Task 14), never reached here.
jest.mock('../hooks/mentalConsent', () => ({ countersignConsent: jest.fn(), withdrawRecording: jest.fn(), sendConsentReminder: jest.fn() }));
import MentalAthlete from './MentalAthlete';

beforeEach(() => {
  mockData = {
    athlete: { id: 'jordan', name: 'Jordan Whitfield', age: 14, dob: '2012-06-17', householdId: 'whitfield' },
    contact: { familyName: 'Whitfield family', guardianName: 'Dana', email: 'dana@email.com', phone: '612-555-0100' },
    sessions: [
      { sessionId: 'cal-c', date: '2026-11-17', time: '5:00 PM', status: 'confirmed', attendee: 'athlete', hasNote: false },
      { sessionId: 'cal-b', date: '2026-11-10', time: '4:30 PM', status: 'attended', attendee: 'parent', hasNote: true },
    ],
    notes: { intake: null, sessions: [{ id: 'cal-b', sessionDate: '2026-11-10', updatedAtMs: 1 }], free: [{ id: 'free-k3x9', updatedAtMs: 2, body: 'Call Dana about tee times.' }] },
  };
});

/** The header line under the name. */
const ageLine = (r) => [...r.container.querySelectorAll('div')].find((el) => el.children.length === 0 && /^Age /.test(el.textContent))?.textContent ?? null;
// The contract left Yannick's view (owner 2026-11-12/13): no card, no daily minutes.
const CONTRACT_TEXT = ['Contract', 'This week', 'Never checked in', 'Last check-in', 'min a day'];

test('header, contact, intake, sessions with chips and other notes; no contract', async () => {
  const onOpenNote = jest.fn();
  const r = await renderScreen(<MentalAthlete bare athleteId="jordan" onOpenNote={onOpenNote} />, { path: '/portal/mental/jordan' });
  expect(ageLine(r)).toBe('Age 14');
  expect(r.text()).toContain('Whitfield family · Dana · dana@email.com · 612-555-0100');
  expect(r.container.querySelector('a[href="mailto:dana@email.com"]')).not.toBeNull();
  expect(r.text()).toContain('Nov 10 · 4:30 PM · Attended · Parent attending');
  for (const t of CONTRACT_TEXT) expect(r.text()).not.toContain(t);
  await r.click('Write intake note');
  expect(onOpenNote).toHaveBeenCalledWith({ entryId: 'intake', sessionDate: null, athleteName: 'Jordan Whitfield' });
  await r.click('Edit note');
  expect(onOpenNote).toHaveBeenCalledWith({ entryId: 'cal-b', sessionDate: '2026-11-10', athleteName: 'Jordan Whitfield' });
  await r.click('Note');
  expect(onOpenNote).toHaveBeenCalledWith({ entryId: 'cal-c', sessionDate: '2026-11-17', athleteName: 'Jordan Whitfield' });
  await r.click('New note');
  expect(onOpenNote.mock.calls.at(-1)[0].entryId).toMatch(/^free-[a-z0-9]{8}$/);
  expect(onOpenNote.mock.calls.at(-1)[0].athleteName).toBe('Jordan Whitfield');
  r.unmount();
});

test('no contact: no contact line', async () => {
  mockData = { ...mockData, contact: null };
  const r = await renderScreen(<MentalAthlete bare athleteId="jordan" />, { path: '/portal/mental/jordan' });
  expect(r.text()).not.toContain('Whitfield family');
  expect(ageLine(r)).toBe('Age 14');
  r.unmount();
});

test('a payload that still carries the old contract fields shows none of them', async () => {
  mockData = {
    ...mockData,
    athlete: { ...mockData.athlete, required: 20 },
    contract: { thisWeek: { metDays: 4, days: [] }, lastCheckin: '2026-11-10', lastCheckinNote: 'Wants to work on first-tee nerves.', required: 20 },
  };
  const r = await renderScreen(<MentalAthlete bare athleteId="jordan" />, { path: '/portal/mental/jordan' });
  expect(ageLine(r)).toBe('Age 14');
  for (const t of [...CONTRACT_TEXT, 'Note:', 'first-tee nerves']) expect(r.text()).not.toContain(t);
  r.unmount();
});

describe('the Consent card on the athlete page (plan Task 14)', () => {
  const summary = { status: 'unsigned', label: 'Not signed', summary: null, recording: 'Recording: no', canCountersign: false, canRemind: true, canWithdraw: false, audience: 'household' };

  test('the Consent card sits between Intake and Sessions', async () => {
    mockData = { ...mockData, consent: { record: null, summary, unavailable: false } };
    const r = await renderScreen(<MentalAthlete bare athleteId="jordan" />, { path: '/portal/mental/jordan' });
    const text = r.text();
    expect(text.indexOf('Intake')).toBeLessThan(text.indexOf('Consent'));
    expect(text.indexOf('Consent')).toBeLessThan(text.indexOf('Sessions'));
    expect(text).toContain('Send a reminder');
    r.unmount();
  });

  test("an 18+ athlete's contact line shows the login email and the emergency contact, not the guardian", async () => {
    mockData = {
      ...mockData,
      athlete: { ...mockData.athlete, id: 'quinn', name: 'Quinn Parker', age: 20 },
      contact: { familyName: 'Parker family', guardianName: null, email: 'quinn@example.com', phone: null, emergency: { name: 'Sam Parker', phone: 'test-phone', relationship: 'parent' } },
      consent: { record: null, summary: { ...summary, status: 'signed', label: 'Signed', summary: 'Signed Oct 30 by Quinn Parker (athlete, 18+)', canRemind: false, audience: 'athlete' }, unavailable: false },
    };
    const r = await renderScreen(<MentalAthlete bare athleteId="quinn" />, { path: '/portal/mental/quinn' });
    expect(r.text()).toContain('Parker family · quinn@example.com');
    expect(r.text()).toContain('Emergency: Sam Parker, test-phone (parent)');
    expect(r.text()).not.toContain('dana@email.com');
    r.unmount();
  });

  test('no consent in the payload (an older hook): no card', async () => {
    const r = await renderScreen(<MentalAthlete bare athleteId="jordan" />, { path: '/portal/mental/jordan' });
    expect(r.text()).not.toContain('Send a reminder');
    r.unmount();
  });
});
