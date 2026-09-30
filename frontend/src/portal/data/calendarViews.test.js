import {
  CALENDAR_VIEW_KEY,
  anchorIn,
  firstAvailableISO,
  isCalendarView,
  isTappableDay,
  monthStartISO,
  monthWeekStarts,
  monthsBetween,
  slotDayStates,
  stepMonthWeek,
  weekDaysISO,
  weekLabel,
  weekStartISO,
  weeksBetween,
} from './calendarViews';

test('the storage key and view guard', () => {
  expect(CALENDAR_VIEW_KEY).toBe('ryp.calendarView');
  expect(isCalendarView('month')).toBe(true);
  expect(isCalendarView('week')).toBe(true);
  expect(isCalendarView('day')).toBe(false);
  expect(isCalendarView(null)).toBe(false);
  expect(isCalendarView(undefined)).toBe(false);
});

test('weekStartISO is Monday-first, like the month grid', () => {
  expect(weekStartISO('2026-09-30')).toBe('2026-09-28'); // Wed
  expect(weekStartISO('2026-10-04')).toBe('2026-09-28'); // Sun
  expect(weekStartISO('2026-09-28')).toBe('2026-09-28'); // Mon itself
  expect(weekStartISO('2027-01-01')).toBe('2026-12-28'); // across a year
});

test('weekDaysISO lists Mon..Sun', () => {
  expect(weekDaysISO('2026-09-28')).toEqual([
    '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  ]);
});

test('monthStartISO', () => {
  expect(monthStartISO('2026-11-17')).toBe('2026-11-01');
  expect(monthStartISO('2026-11-01')).toBe('2026-11-01');
});

test('weeksBetween covers every week touching the range', () => {
  expect(weeksBetween('2026-09-30', '2026-10-13')).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
  expect(weeksBetween('2026-10-05', '2026-10-05')).toEqual(['2026-10-05']);
  expect(weeksBetween('2026-10-06', '2026-10-05')).toEqual([]);
});

test('monthsBetween', () => {
  expect(monthsBetween('2026-09-30', '2026-11-14')).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
  expect(monthsBetween('2026-12-15', '2027-01-02')).toEqual(['2026-12-01', '2027-01-01']);
  expect(monthsBetween('2026-10-05', '2026-10-20')).toEqual(['2026-10-01']);
  expect(monthsBetween('2026-11-01', '2026-10-01')).toEqual([]);
});

test('monthWeekStarts are the rows of the month grid', () => {
  expect(monthWeekStarts('2026-11-01')).toEqual([
    '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30',
  ]);
  expect(monthWeekStarts('2026-10-01')).toEqual([
    '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26',
  ]);
});

test('anchorIn takes the first candidate inside the range, else from', () => {
  expect(anchorIn('2026-11-01', '2026-11-30', [null, '2026-09-30', '2026-11-03'])).toBe('2026-11-03');
  expect(anchorIn('2026-11-01', '2026-11-30', ['2026-11-12', '2026-11-03'])).toBe('2026-11-12');
  expect(anchorIn('2026-11-01', '2026-11-30', [undefined, null])).toBe('2026-11-01');
  expect(anchorIn('2026-11-01', '2026-11-30')).toBe('2026-11-01');
});

test('weekLabel names the visible span with an en dash', () => {
  expect(weekLabel('2026-09-28')).toBe('Sep 28 – Oct 4');
  expect(weekLabel('2026-11-02')).toBe('Nov 2 – 8');
  expect(weekLabel('2026-11-30', { from: '2026-11-01', to: '2026-11-30' })).toBe('Nov 30');
  expect(weekLabel('2026-11-30', { from: '2026-12-01', to: '2026-12-31' })).toBe('Dec 1 – 6');
  expect(weekLabel('2026-09-28', { from: '2026-10-01', to: '2026-10-31' })).toBe('Oct 1 – 4');
  expect(weekLabel('2026-12-28')).toBe('Dec 28 – Jan 3');
});

describe('stepMonthWeek', () => {
  test('moves between rows inside a month', () => {
    expect(stepMonthWeek('2026-11-01', '2026-11-02', 1)).toEqual({ monthDelta: 0, weekStart: '2026-11-09' });
    expect(stepMonthWeek('2026-11-01', '2026-11-02', -1)).toEqual({ monthDelta: 0, weekStart: '2026-10-26' });
  });
  test('past the last row lands on the next month first row', () => {
    expect(stepMonthWeek('2026-11-01', '2026-11-30', 1)).toEqual({ monthDelta: 1, weekStart: '2026-11-30' });
    expect(stepMonthWeek('2026-10-01', '2026-10-26', 1)).toEqual({ monthDelta: 1, weekStart: '2026-10-26' });
    expect(stepMonthWeek('2026-12-01', '2026-12-28', 1)).toEqual({ monthDelta: 1, weekStart: '2026-12-28' });
  });
  test('before the first row lands on the previous month last row', () => {
    expect(stepMonthWeek('2026-12-01', '2026-11-30', -1)).toEqual({ monthDelta: -1, weekStart: '2026-11-30' });
    // November's first row is Oct 26, which is also October's last row.
    expect(stepMonthWeek('2026-11-01', '2026-10-26', -1)).toEqual({ monthDelta: -1, weekStart: '2026-10-26' });
    expect(stepMonthWeek('2026-10-01', '2026-09-28', -1)).toEqual({ monthDelta: -1, weekStart: '2026-09-28' });
  });
});

test('firstAvailableISO finds the earliest available day in range', () => {
  const states = { '2026-11-12': 'available', '2026-11-03': 'available', '2026-11-02': 'open', '2026-10-30': 'available' };
  expect(firstAvailableISO(states, '2026-11-01', '2026-11-30')).toBe('2026-11-03');
  expect(firstAvailableISO(states, '2026-12-01', '2026-12-31')).toBeNull();
  expect(firstAvailableISO({}, '2026-11-01', '2026-11-30')).toBeNull();
  expect(firstAvailableISO(undefined, '2026-11-01', '2026-11-30')).toBeNull();
});

test('isTappableDay follows the two variants', () => {
  expect(isTappableDay('booking', 'available')).toBe(true);
  for (const s of ['open', 'weekend', 'logged', 'missed', 'future']) expect(isTappableDay('booking', s)).toBe(false);
  expect(isTappableDay('contract', 'logged')).toBe(true);
  expect(isTappableDay('contract', 'missed')).toBe(true);
  for (const s of ['open', 'weekend', 'future', 'available']) expect(isTappableDay('contract', s)).toBe(false);
});

test('slotDayStates: any slot (even a full one) makes a day available', () => {
  expect(
    slotDayStates([
      { date: '2026-10-02', slots: [{ id: 'a', open: true }] },
      { date: '2026-10-03', slots: [{ id: 'b', open: false }] },
      { date: '2026-10-04', slots: [] },
      { date: '2026-10-05' },
    ])
  ).toEqual({ '2026-10-02': 'available', '2026-10-03': 'available', '2026-10-04': 'open', '2026-10-05': 'open' });
  expect(slotDayStates(undefined)).toEqual({});
});
