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
