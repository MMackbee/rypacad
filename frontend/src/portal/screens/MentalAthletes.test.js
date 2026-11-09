import React from 'react';
import { renderScreen } from './testRender';

let mockRows;
jest.mock('../hooks', () => ({
  useMentalAthletes: () => ({ data: mockRows, loading: false, error: null }),
  useSelfManaged: () => false,
}));
import MentalAthletes from './MentalAthletes';

beforeEach(() => {
  mockRows = [
    { athleteId: 'jordan', name: 'Jordan Whitfield', age: 14, nextSession: '2026-11-17', lastSession: '2026-11-10', hasIntake: true, latestNoteDate: '2026-11-03' },
    { athleteId: 'nico', name: 'Nico Whitfield', age: 9, nextSession: null, lastSession: null, hasIntake: false, latestNoteDate: null },
    { athleteId: 'sage', name: 'Sage Parker', age: null, nextSession: null, lastSession: '2026-11-05', hasIntake: false, latestNoteDate: null },
  ];
});

test('a first-name-only athlete shows the family name first; a full name does not', async () => {
  mockRows = [
    { athleteId: 'brooks', name: 'Brooks', age: 10, familyName: 'Erickson family', nextSession: null, lastSession: null, hasIntake: false, latestNoteDate: null },
    { athleteId: 'jordan', name: 'Jordan Whitfield', age: 14, familyName: 'Whitfield family', nextSession: '2026-11-17', lastSession: null, hasIntake: true, latestNoteDate: null },
  ];
  const r = await renderScreen(<MentalAthletes bare />, { path: '/portal/mental' });
  expect(r.text()).toContain('Erickson family · Age 10 · No 1:1 yet');
  expect(r.text()).toContain('Age 14 · Next 1:1 Nov 17');
  expect(r.text()).not.toContain('Whitfield family');
  r.unmount();
});

test('every athlete, with age, next or last 1:1, intake and latest note', async () => {
  const onOpenAthlete = jest.fn();
  const r = await renderScreen(<MentalAthletes bare onOpenAthlete={onOpenAthlete} />, { path: '/portal/mental' });
  expect(r.text()).toContain('Age 14 · Next 1:1 Nov 17');
  expect(r.text()).toContain('Age 9 · No 1:1 yet');
  expect(r.text()).toContain('Last 1:1 Nov 5');
  expect(r.text()).toContain('Note Nov 3');
  expect(r.text()).toContain('No intake');
  await r.click('Jordan Whitfield');
  expect(onOpenAthlete).toHaveBeenCalledWith('jordan');
  r.unmount();
});

test('search filters by name', async () => {
  const r = await renderScreen(<MentalAthletes bare />, { path: '/portal/mental' });
  await r.fill('Search athletes', 'sage');
  await r.flush();
  expect(r.text()).toContain('Sage Parker');
  expect(r.text()).not.toContain('Jordan Whitfield');
  await r.fill('Search athletes', 'zz');
  await r.flush();
  expect(r.text()).toContain('No athlete matches "zz"');
  r.unmount();
});

describe("consent on Yannick's list (plan Task 14)", () => {
  beforeEach(() => {
    mockRows = [
      { athleteId: 'jordan', name: 'Jordan Whitfield', age: 14, nextSession: '2026-11-17', lastSession: null, hasIntake: true, latestNoteDate: null, consentStatus: 'signed', needsConsent: false },
      { athleteId: 'max', name: 'Max Test', age: 18, nextSession: '2026-11-19', lastSession: null, hasIntake: false, latestNoteDate: null, consentStatus: 'needs-adult', needsConsent: true },
      { athleteId: 'nico', name: 'Nico Whitfield', age: 9, nextSession: null, lastSession: null, hasIntake: false, latestNoteDate: null, consentStatus: 'unsigned', needsConsent: false },
      { athleteId: 'reese', name: 'Reese Whitfield', age: 12, nextSession: '2026-11-12', lastSession: null, hasIntake: false, latestNoteDate: null, consentStatus: 'unsigned', needsConsent: true },
      { athleteId: 'sage', name: 'Sage Parker', age: null, nextSession: null, lastSession: null, hasIntake: false, latestNoteDate: null, consentStatus: 'no-dob', needsConsent: false },
      { athleteId: 'zed', name: 'Zed Test', age: 15, nextSession: null, lastSession: null, hasIntake: false, latestNoteDate: null, consentStatus: null, needsConsent: false },
    ];
  });
  const order = (r) => [...r.container.querySelectorAll('[role="button"][aria-label]')].map((b) => b.getAttribute('aria-label'));
  const rowText = (r, name) => r.container.querySelector(`[role="button"][aria-label="${name}"]`).textContent;

  test('the rows that need consent before a 1:1 come first, under their own label; every row says its status', async () => {
    const r = await renderScreen(<MentalAthletes bare />, { path: '/portal/mental' });
    expect(r.text()).toContain('Needs consent before a session');
    expect(order(r)).toEqual(['Max Test', 'Reese Whitfield', 'Jordan Whitfield', 'Nico Whitfield', 'Sage Parker', 'Zed Test']);
    expect(rowText(r, 'Jordan Whitfield')).toContain('Signed');
    expect(rowText(r, 'Max Test')).toContain('Needs 18+');
    expect(rowText(r, 'Reese Whitfield')).toContain('Not signed');
    expect(rowText(r, 'Sage Parker')).toContain('No date of birth');
    expect(rowText(r, 'Jordan Whitfield')).toContain('Intake');
    expect(rowText(r, 'Zed Test')).toContain('No intake');
    expect(rowText(r, 'Zed Test')).not.toMatch(/Signed|Not signed|Needs 18\+|No date of birth/);
    r.unmount();
  });

  test('the Needs consent chip shows only those rows and toggles back', async () => {
    const r = await renderScreen(<MentalAthletes bare />, { path: '/portal/mental' });
    await r.click('Needs consent');
    expect(order(r)).toEqual(['Max Test', 'Reese Whitfield']);
    expect(r.button('Needs consent').getAttribute('aria-pressed')).toBe('true');
    await r.click('Needs consent');
    expect(order(r)).toHaveLength(6);
    r.unmount();
  });

  test("screen readers hear each row's consent status with its name", async () => {
    const r = await renderScreen(<MentalAthletes bare />, { path: '/portal/mental' });
    const reese = r.container.querySelector('[role="button"][aria-label="Reese Whitfield"]');
    expect(document.getElementById(reese.getAttribute('aria-describedby')).textContent).toBe('Not signed');
    expect(r.container.querySelector('[role="button"][aria-label="Zed Test"]').getAttribute('aria-describedby')).toBeNull();
    r.unmount();
  });

  test('nobody needing consent: no label, the list as before', async () => {
    mockRows = mockRows.map((x) => ({ ...x, needsConsent: false }));
    const r = await renderScreen(<MentalAthletes bare />, { path: '/portal/mental' });
    expect(r.text()).not.toContain('Needs consent before a session');
    expect(order(r)).toEqual(['Jordan Whitfield', 'Max Test', 'Nico Whitfield', 'Reese Whitfield', 'Sage Parker', 'Zed Test']);
    r.unmount();
  });
});
