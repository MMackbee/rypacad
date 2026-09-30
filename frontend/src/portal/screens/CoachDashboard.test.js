import React, { act } from 'react';
import { renderScreen } from './testRender';
import CoachDashboard from './CoachDashboard';

const session = { id: 'nov5-4pm', date: '2026-11-05', time: '4:00 PM', type: 'training', name: 'Training block', capacity: 8, booked: 3 };
let mockRequested;
// Month-aware: November has one session on Nov 5; every other month is empty.
const mockMonth = (m) => {
  mockRequested.push(m);
  const days = m === '2026-11-01' ? [{ date: '2026-11-05', sessions: [session] }] : [];
  return { data: { days }, loading: false, error: null };
};
jest.mock('../hooks', () => ({
  useCoachDay: () => ({ data: { coach: { name: 'Coach', date: '2026-11-04' }, blocks: [] } }),
  useCoachRoster: () => ({ data: [], loading: false }),
  useMonthSessions: (m) => mockMonth(m),
}));

const KEY = 'ryp.calendarView';
const EXPECTED_ROSTER = {
  sessionId: 'nov5-4pm',
  date: '2026-11-05',
  time: '4:00 PM',
  type: 'training',
  name: 'Training block',
  meta: '3 of 8 booked',
};

const pressed = (r, name) => r.button(name)?.getAttribute('aria-pressed');
/** The nav title sits between the prev and next arrows, in either view. */
const navLabel = (r) => (r.button('Previous week') || r.button('Previous month'))?.nextElementSibling?.textContent ?? null;
const td = (r, iso) => r.container.querySelector(`td[data-date="${iso}"]`);
const pill = (r, iso) => r.container.querySelector(`.ryp-week-view [data-date="${iso}"]`);
const tap = async (el) => { await act(async () => { el.click(); }); };
/** The selected day's session card (SessionCard sets cursor: pointer from onClick). */
const sessionCard = (r) =>
  [...r.container.querySelectorAll('div')].find(
    (el) => el.style.cursor === 'pointer' && el.textContent.startsWith('4:00') && el.textContent.includes('Training block')
  ) || null;

async function openSessions(onOpenRoster) {
  const r = await renderScreen(<CoachDashboard bare onOpenRoster={onOpenRoster} />);
  await r.click('Sessions');
  return r;
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
  mockRequested = [];
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-11-04T15:00:00'));
});
afterEach(() => {
  jest.useRealTimers();
});

test('Month is the default, and a day then a session opens that roster', async () => {
  const onOpenRoster = jest.fn();
  const r = await openSessions(onOpenRoster);
  expect(pressed(r, 'Month')).toBe('true');
  expect(r.container.querySelector('.fc')).not.toBeNull();
  expect(navLabel(r)).toBe('November 2026');
  expect(sessionCard(r)).toBeNull();
  await tap(td(r, '2026-11-05'));
  await tap(sessionCard(r));
  expect(onOpenRoster).toHaveBeenCalledTimes(1);
  expect(onOpenRoster).toHaveBeenCalledWith(EXPECTED_ROSTER);
  await r.unmount();
});

test('Week: the same day and session open the identical roster payload', async () => {
  const onOpenRoster = jest.fn();
  const r = await openSessions(onOpenRoster);
  await r.click('Week');
  expect(window.localStorage.getItem(KEY)).toBe('week');
  expect(r.container.querySelector('.fc')).toBeNull();
  expect(navLabel(r)).toBe('Nov 2 – 8');
  await r.click('Thursday, Nov 5');
  expect(pill(r, '2026-11-05').getAttribute('aria-pressed')).toBe('true');
  await tap(sessionCard(r));
  expect(onOpenRoster).toHaveBeenCalledTimes(1);
  expect(onOpenRoster).toHaveBeenCalledWith(EXPECTED_ROSTER);
  await r.unmount();
});

test('Week steps through the month and into the next one', async () => {
  const r = await openSessions(() => {});
  await r.click('Week');
  await r.click('Thursday, Nov 5');
  expect(sessionCard(r)).not.toBeNull();
  for (let i = 0; i < 4; i++) await r.click('Next week');
  expect(navLabel(r)).toBe('Nov 30');
  // Stepping clears the selected day, as the month arrows do.
  expect(sessionCard(r)).toBeNull();
  expect(mockRequested).not.toContain('2026-12-01');
  await r.click('Next week');
  expect(mockRequested).toContain('2026-12-01');
  expect(navLabel(r)).toBe('Dec 1 – 6');
  await r.unmount();
});

test('a week with no sessions shows the week empty copy', async () => {
  const r = await openSessions(() => {});
  expect(r.text()).toContain('Days marked green have sessions');
  await r.click('Week');
  expect(r.text()).toContain('Days marked green have sessions');
  await r.click('Next week');
  expect(navLabel(r)).toBe('Nov 9 – 15');
  expect(r.text()).toContain('No sessions are scheduled this week.');
  expect(r.text()).not.toContain('Days marked green have sessions');
  await r.unmount();
});

test('a stored Week preference opens the Sessions tab in Week', async () => {
  window.localStorage.setItem(KEY, 'week');
  const r = await openSessions(() => {});
  expect(pressed(r, 'Week')).toBe('true');
  expect(r.container.querySelector('.ryp-week-view')).not.toBeNull();
  expect(navLabel(r)).toBe('Nov 2 – 8');
  await r.unmount();
});
