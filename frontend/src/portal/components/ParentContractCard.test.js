import React from 'react';
import { renderScreen } from '../screens/testRender';

const mockLog = jest.fn(async () => ({}));
let mockValue;
jest.mock('../hooks', () => ({ useParentContract: () => mockValue, useSelfManaged: () => false }));
import ParentContractCard from './ParentContractCard';

beforeEach(() => {
  jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-11-11T15:00:00'));
  mockValue = {
    month: { month: { start: '2026-11-01', label: 'November 2026', name: 'November' }, dayStates: { '2026-11-09': 'logged', '2026-11-10': 'missed', '2026-11-11': 'open' }, stats: { logged: 1 }, state: { kind: 'ontrack', line: '1 of 2 days due so far.' } },
    loading: false, error: null, logPractice: mockLog, removeLog: jest.fn(), ensureContractStart: jest.fn(), loggedToday: false, todayMinutes: 0, required: 10,
  };
});
afterEach(() => jest.useRealTimers());

test('the card shows the rule, the state line and logs today through the sheet', async () => {
  const r = await renderScreen(<ParentContractCard athleteId="nico" athleteName="Nico" />, { path: '/portal/athlete/nico' });
  expect(r.text()).toContain('10 min a day · Monday to Friday');
  expect(r.text()).toContain('1 of 2 days due so far.');
  await r.click('Log today · 10 min');
  expect(r.text()).toContain('10 min a day is the contract minimum, not a unit');
  await r.click('Enter minutes');
  await r.fill('Minutes practiced', '15');
  await r.click('Save · 15 min');
  await r.flush();
  expect(mockLog).toHaveBeenCalledWith({ minutes: 15, date: undefined });
  expect(r.text()).toContain('Saved');
  await r.unmount();
});

test('logged today shows the total and offers more', async () => {
  mockValue = { ...mockValue, loggedToday: true, todayMinutes: 25 };
  const r = await renderScreen(<ParentContractCard athleteId="nico" athleteName="Nico" />, { path: '/portal/athlete/nico' });
  expect(r.text()).toContain('Logged today · 25 min');
  expect(r.button('+ Add more')).not.toBeNull();
  await r.unmount();
});
