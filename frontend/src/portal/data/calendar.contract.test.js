/**
 * The contract window and the Behind buffer (contract-buffer ruling,
 * 2026-09-30): only weekdays inside [start, end] are contract days, and
 * Behind is more than BEHIND_BUFFER_DAYS missed in the current month. Kept
 * beside calendar.test.js (the booking-window lane's file) so the two merge
 * cleanly.
 */
import { BEHIND_BUFFER_DAYS, buildContractMonthFromLogs } from './calendar';
import { SEASON_BOUNDS } from './season';

const WINDOW = { startISO: SEASON_BOUNDS.start, endISO: SEASON_BOUNDS.end };
const build = (today, logs = {}, window = WINDOW) =>
  buildContractMonthFromLogs({ today, minutesByDate: new Map(Object.entries(logs)), contractMinutes: 45, ...window });

test('the buffer is five missed contract days', () => {
  expect(BEHIND_BUFFER_DAYS).toBe(5);
});

test('October, before the season: no contract days, every weekday inactive, not behind', () => {
  const m = build('2026-10-20');
  expect(m).toMatchObject({ contractDays: 0, dueSoFar: 0, missed: 0, logged: 0, daysLeft: 0, behind: false, notStarted: true, ended: false });
  expect(m.dayStates['2026-10-01']).toBe('inactive');
  expect(m.dayStates['2026-10-20']).toBe('inactive');
  expect(m.dayStates['2026-10-30']).toBe('inactive');
  expect(m.dayStates['2026-10-03']).toBe('weekend');
  expect(m.startISO).toBe('2026-11-03');
});

test('Nov 3, season day 1: the Nov 2 set-up day is inactive, nothing missed', () => {
  const m = build('2026-11-03');
  expect(m.dayStates['2026-11-02']).toBe('inactive');
  expect(m.dayStates['2026-11-03']).toBe('open');
  expect(m).toMatchObject({ contractDays: 20, dueSoFar: 0, missed: 0, behind: false, notStarted: false });
});

test('Nov 10 is five missed and not behind; Nov 11 is six missed and behind', () => {
  expect(build('2026-11-10')).toMatchObject({ missed: 5, behind: false });
  expect(build('2026-11-11')).toMatchObject({ missed: 6, behind: true });
});

test('a late entry on Nov 11 brings it back to five missed, not behind', () => {
  const m = build('2026-11-11', { '2026-11-04': 45 });
  expect(m).toMatchObject({ missed: 5, logged: 1, dueSoFar: 6, behind: false });
});

test('a logged day before the start paints logged but counts for nothing', () => {
  const oct = build('2026-10-20', { '2026-10-19': 45 });
  expect(oct.dayStates['2026-10-19']).toBe('logged');
  expect(oct).toMatchObject({ logged: 0, dueSoFar: 0, contractDays: 0, streak: 0 });
  const nov = build('2026-11-04', { '2026-11-02': 45, '2026-11-03': 45 });
  expect(nov.dayStates['2026-11-02']).toBe('logged');
  // Only Nov 3 is a contract day: logged 1, streak 1 (the set-up day is skipped).
  expect(nov).toMatchObject({ logged: 1, dueSoFar: 1, streak: 1 });
  // Real minutes stay real, window or not.
  expect(nov.minutes).toBe(90);
});

test('after Feb 27 the season has ended: March has no contract days', () => {
  const m = build('2027-03-10');
  expect(m).toMatchObject({ contractDays: 0, missed: 0, behind: false, ended: true, notStarted: false });
  expect(m.dayStates['2027-03-01']).toBe('inactive');
  expect(m.endISO).toBe('2027-02-27');
});

test('a mid-season contractStart opens the window there', () => {
  const m = build('2026-12-16', {}, { startISO: '2026-12-15', endISO: SEASON_BOUNDS.end });
  expect(m.dayStates['2026-12-14']).toBe('inactive');
  expect(m.dayStates['2026-12-15']).toBe('missed');
  expect(m).toMatchObject({ missed: 1, behind: false, notStarted: false });
});

test('without a window the builder scores the whole month, as before', () => {
  const m = build('2026-11-11', {}, {});
  expect(m.dayStates['2026-11-02']).toBe('missed');
  expect(m).toMatchObject({ missed: 7, behind: true, notStarted: false, ended: false, startISO: null });
});
