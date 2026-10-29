import React from 'react';
import { renderScreen } from './testRender';

let mockBoard;
const mockSetCheckin = jest.fn();
jest.mock('../hooks', () => ({
  useContractBoard: (weekStartISO) => ({ ...mockBoard(weekStartISO), setCheckin: mockSetCheckin, loading: false, error: null }),
  useSelfManaged: () => false,
}));
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), academyDateISO: () => '2026-11-11' }));
import MentalContract from './MentalContract';

const r0 = (id, name, metDays) => ({ athleteId: id, name, age: 12, required: 20, thisWeek: { metDays, days: [] }, lastWeek: { metDays: 0, days: [] }, lastCheckin: null, checkedInThisWeek: false, daysSince: null });
const mockBoardDefault = () => ({ config: { enabled: true, enabledAt: '2026-11-03' }, rows: { due: [], thisWeek: [r0('nico', 'Nico', 2)], checkedIn: [] } });

beforeEach(() => {
  mockBoard = (week) => ({
    config: { enabled: true, enabledAt: '2026-11-03' },
    rows: week === '2026-11-09'
      ? { due: [{ ...r0('reese', 'Reese', 0), daysSince: 22 }], thisWeek: [r0('nico', 'Nico', 2)], checkedIn: [{ ...r0('jordan', 'Jordan', 4), checkedInThisWeek: true }] }
      : { due: [], thisWeek: [r0('jordan', 'Jordan', 5)], checkedIn: [] },
  });
});

test('three groups with counts, the current week, the toggle writes', async () => {
  const r = await renderScreen(<MentalContract bare role="mental" />, { path: '/portal/mental/contract' });
  expect(r.text()).toContain('Week of Nov 9');
  expect(r.text()).toContain('Due for a check-in · 1');
  expect(r.text()).toContain('This week · 1');
  expect(r.text()).toContain('Checked in this week · 1');
  expect(r.button('Next week').disabled).toBe(true);
  await r.click('Checked in · Nico');
  expect(mockSetCheckin).toHaveBeenCalledWith({ athleteId: 'nico', checkedIn: true });
  await r.click('Checked in · Jordan');
  expect(mockSetCheckin).toHaveBeenCalledWith({ athleteId: 'jordan', checkedIn: false });
  r.unmount();
});

test('the week switcher goes back and the empty groups say so', async () => {
  const r = await renderScreen(<MentalContract bare role="mental" />, { path: '/portal/mental/contract' });
  await r.click('Previous week');
  await r.flush();
  expect(r.text()).toContain('Week of Nov 2');
  expect(r.text()).toContain('No one is due');
  expect(r.text()).toContain('No check-ins that week');
  expect(r.button('Next week').disabled).toBe(false);
  r.unmount();
});

test('a past week is labelled as that week, never as this week; Due says it is as of today', async () => {
  const r = await renderScreen(<MentalContract bare role="mental" />, { path: '/portal/mental/contract' });
  await r.click('Previous week');
  await r.flush();
  const text = r.text();
  expect(text).toContain('Due for a check-in, as of today · 0');
  expect(text).toContain('Not checked in that week · 1');
  expect(text).toContain('Checked in that week · 0');
  expect(text).toContain('Week of Nov 2 5/5');
  expect(text).toContain('Week before 0/5');
  expect(text).not.toMatch(/This week|Last week|this week/);
  await r.click('Next week');
  await r.flush();
  expect(r.text()).toContain('This week · 1');
  expect(r.text()).toContain('This week 2/5');
  expect(r.text()).toContain('Last week 0/5');
  r.unmount();
});

test('owner and ops see the board without toggles; the off switch shows a banner', async () => {
  mockBoard = () => ({ ...mockBoardDefault(), config: { enabled: false, enabledAt: null } });
  const r = await renderScreen(<MentalContract bare role="owner" />, { path: '/portal/mental/contract' });
  expect(r.button('Checked in · Nico')).toBeNull();
  expect(r.text()).toContain('The contract switch is off');
  r.unmount();
});
