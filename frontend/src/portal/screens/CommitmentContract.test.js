import React, { act } from 'react';
import { renderScreen } from './testRender';
import CommitmentContract from './CommitmentContract';

/**
 * Month/Week toggle on the Commitment Contract (owner request 2026-09-30).
 * Month stays the default; Week is one row of the same contract month, handed
 * the same dayStates and the same onSelectDay (setSheetDay), so a tapped day
 * opens the same DaySheet with the same actions in both views.
 */

const KEY = 'ryp.calendarView';

/** October 2026 as the contract hook paints it on Wed Oct 14. */
function mockOctoberStates() {
  const out = {};
  for (let d = 1; d <= 31; d++) {
    const iso = `2026-10-${String(d).padStart(2, '0')}`;
    const dow = new Date(2026, 9, d).getDay();
    if (dow === 0 || dow === 6) out[iso] = 'weekend';
    else if (d < 12) out[iso] = 'missed';
    else if (d === 12) out[iso] = 'logged';
    else if (d === 13) out[iso] = 'missed';
    else if (d === 14) out[iso] = 'open';
    else out[iso] = 'future';
  }
  return out;
}

let mockRemoveLog;
let mockLogPractice;
jest.mock('../hooks', () => ({
  useContract: () => ({
    data: {
      tierMinutes: 45,
      month: { label: 'October 2026', name: 'October', start: '2026-10-01' },
      dayStates: mockOctoberStates(),
      stats: { logged: 1, contractDays: 22, dueSoFar: 10, missed: 9, daysLeft: 12, streak: 0, minutes: 45 },
      state: {
        badge: { tone: 'red', label: 'Behind' },
        line: '9 days behind with 12 contract days left.',
        hint: 'Missed a day? Tap it in the grid to add a late entry.',
      },
      caption: 'Weekends are not contract days.',
    },
    loading: false,
    error: null,
    setTier: async () => ({}),
  }),
  usePracticeLog: () => ({
    data: { loggedToday: false, todayMinutes: 0 },
    totalMinutes: 45,
    logPractice: mockLogPractice,
    removeLog: mockRemoveLog,
  }),
}));

const pressed = (r, name) => r.button(name)?.getAttribute('aria-pressed');
const pill = (r, iso) => r.container.querySelector(`.ryp-week-view [data-date="${iso}"]`);
const weekCells = (r) => [...(r.container.querySelector('.ryp-week-view')?.children ?? [])];
const td = (r, iso) => r.container.querySelector(`td[data-date="${iso}"]`);
const tap = async (el) => { await act(async () => { el.click(); }); };
const logTodayButton = (r) =>
  [...r.container.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Log today')) || null;

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
  mockRemoveLog = jest.fn(async () => {});
  mockLogPractice = jest.fn();
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-10-14T15:00:00'));
});
afterEach(() => { jest.useRealTimers(); });

test('Month is the default: the FullCalendar grid, no month arrows, and a tapped day opens its sheet', async () => {
  const r = await renderScreen(<CommitmentContract bare />);
  expect(pressed(r, 'Month')).toBe('true');
  expect(pressed(r, 'Week')).toBe('false');
  expect(r.container.querySelector('.fc')).not.toBeNull();
  expect(r.container.querySelector('.ryp-week-view')).toBeNull();
  // One contract month: nothing to page through.
  expect(r.button('Previous month')).toBeNull();
  expect(r.button('Next month')).toBeNull();
  expect(r.text()).toContain('Weekends are not contract days.');
  expect(r.text()).toContain('Logged');
  // The month grid still opens the DaySheet from a logged day.
  const cell = td(r, '2026-10-12');
  expect(cell.getAttribute('role')).toBe('button');
  await tap(cell);
  expect(r.button('Remove entry')).not.toBeNull();
  await r.click('Remove entry');
  expect(mockRemoveLog).toHaveBeenCalledWith({ date: '2026-10-12' });
  await r.unmount();
});

test("Week shows today's row and a tapped day opens the same DaySheet actions", async () => {
  const r = await renderScreen(<CommitmentContract bare />);
  await r.click('Week');
  expect(pressed(r, 'Week')).toBe('true');
  expect(window.localStorage.getItem(KEY)).toBe('week');
  expect(r.container.querySelector('.fc')).toBeNull();
  expect(r.text()).toContain('Oct 12 – 18');
  // The caption and legend stay under the grid.
  expect(r.text()).toContain('Weekends are not contract days.');

  // Logged day -> Remove entry, through the same removeLog as the month grid.
  expect(pill(r, '2026-10-12').tagName).toBe('BUTTON');
  await r.click('Monday, Oct 12');
  expect(r.button('Remove entry')).not.toBeNull();
  await r.click('Remove entry');
  expect(mockRemoveLog).toHaveBeenCalledWith({ date: '2026-10-12' });
  expect(r.button('Remove entry')).toBeNull();

  // Missed day -> Add late entry, which opens the LogSheet for that day.
  await r.click('Tuesday, Oct 13');
  expect(r.button('Add late entry')).not.toBeNull();
  await r.click('Add late entry');
  expect(r.button('Add late entry')).toBeNull();
  expect(r.text()).toContain('Log practice · October 13');

  // Open (today) and future days are painted, not tappable.
  expect(pill(r, '2026-10-14').tagName).toBe('DIV');
  expect(pill(r, '2026-10-14').getAttribute('data-state')).toBe('open');
  expect(pill(r, '2026-10-15').tagName).toBe('DIV');
  expect(pill(r, '2026-10-15').getAttribute('data-state')).toBe('future');
  expect(r.button('Wednesday, Oct 14')).toBeNull();
  expect(r.button('Thursday, Oct 15')).toBeNull();
  await r.unmount();
});

test('Week nav is bounded to the contract month, with days outside it blank', async () => {
  const r = await renderScreen(<CommitmentContract bare />);
  await r.click('Week');
  await r.click('Previous week');
  expect(r.text()).toContain('Oct 5 – 11');
  await r.click('Previous week');
  expect(r.text()).toContain('Oct 1 – 4');
  const cells = weekCells(r);
  expect(cells).toHaveLength(7);
  // Mon Sep 28 - Wed Sep 30 are blank placeholders; Oct 1 - 4 paint.
  for (const c of cells.slice(0, 3)) {
    expect(c.getAttribute('aria-hidden')).toBe('true');
    expect(c.hasAttribute('data-date')).toBe(false);
  }
  expect(cells[3].getAttribute('data-date')).toBe('2026-10-01');
  expect(r.button('Previous week').disabled).toBe(true);
  expect(r.button('Next week').disabled).toBe(false);

  for (let i = 0; i < 4; i++) await r.click('Next week');
  expect(r.text()).toContain('Oct 26 – 31');
  expect(r.button('Next week').disabled).toBe(true);
  // Sun Nov 1 is outside the month: blank.
  expect(weekCells(r)[6].getAttribute('aria-hidden')).toBe('true');
  await r.unmount();
});

test('a stored Week choice opens the screen in Week view', async () => {
  window.localStorage.setItem(KEY, 'week');
  const r = await renderScreen(<CommitmentContract bare />);
  expect(pressed(r, 'Week')).toBe('true');
  expect(r.container.querySelector('.ryp-week-view')).not.toBeNull();
  expect(r.container.querySelector('.fc')).toBeNull();
  expect(r.text()).toContain('Oct 12 – 18');
  await r.click('Month');
  expect(r.container.querySelector('.fc')).not.toBeNull();
  expect(window.localStorage.getItem(KEY)).toBe('month');
  await r.unmount();
});

test('practice mode in Week view: Log today paints today logged and fires onLogged', async () => {
  window.localStorage.setItem(KEY, 'week');
  const onLogged = jest.fn();
  const r = await renderScreen(<CommitmentContract bare practice onLogged={onLogged} />);
  expect(pill(r, '2026-10-14').getAttribute('data-state')).toBe('open');
  await tap(logTodayButton(r));
  expect(onLogged).toHaveBeenCalledWith({ iso: '2026-10-14' });
  expect(pill(r, '2026-10-14').getAttribute('data-state')).toBe('logged');
  expect(mockLogPractice).not.toHaveBeenCalled();
  // Practice keeps the DaySheet read-only, as in the month grid.
  await r.click('Wednesday, Oct 14');
  expect(r.button('Remove entry')).not.toBeNull();
  await r.click('Remove entry');
  expect(mockRemoveLog).not.toHaveBeenCalled();
  await r.unmount();
});
