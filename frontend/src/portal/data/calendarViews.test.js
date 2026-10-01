import {
  CALENDAR_VIEW_KEY,
  MARKS_LOOKAHEAD_DAYS,
  anchorIn,
  dayMarksFor,
  firstAvailableISO,
  isCalendarView,
  isTappableDay,
  monthGridBounds,
  monthStartISO,
  monthWeekStarts,
  monthsApart,
  monthsBetween,
  pickRange,
  slotDayMarks,
  slotDayStates,
  stepGridWeek,
  weekDaysISO,
  weekLabel,
  weekStartISO,
  weeksBetween,
} from './calendarViews';
import * as views from './calendarViews';

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

test('monthGridBounds: Monday of the first row .. Sunday of the last', () => {
  expect(monthGridBounds('2026-11-01')).toEqual({ start: '2026-10-26', end: '2026-12-06' });
  expect(monthGridBounds('2027-02-01')).toEqual({ start: '2027-02-01', end: '2027-02-28' }); // starts on a Monday
  expect(monthGridBounds('2026-12-01')).toEqual({ start: '2026-11-30', end: '2027-01-03' });
  expect(monthGridBounds('2026-11-17')).toEqual(monthGridBounds('2026-11-01'));
});

test('monthsApart and pickRange', () => {
  expect(monthsApart('2026-11-01', '2026-12-02')).toBe(1);
  expect(monthsApart('2026-11-01', '2026-10-30')).toBe(-1);
  expect(monthsApart('2026-12-01', '2027-01-03')).toBe(1);
  expect(monthsApart('2026-11-01', '2026-11-30')).toBe(0);
  const map = { '2026-10-31': 'a', '2026-11-01': 'b', '2026-11-30': 'c', '2026-12-01': 'd' };
  expect(pickRange(map, '2026-11-01', '2026-11-30')).toEqual({ '2026-11-01': 'b', '2026-11-30': 'c' });
  expect(pickRange(undefined, '2026-11-01', '2026-11-30')).toEqual({});
});

describe('stepGridWeek (week view across months)', () => {
  test('stepMonthWeek is gone', () => {
    expect(views.stepMonthWeek).toBeUndefined();
  });
  test('moves ±7 days; the month stays while the Monday is one of its rows', () => {
    expect(stepGridWeek('2026-11-01', '2026-11-02', 1)).toEqual({ monthDelta: 0, weekStart: '2026-11-09' });
    expect(stepGridWeek('2026-11-01', '2026-11-02', -1)).toEqual({ monthDelta: 0, weekStart: '2026-10-26' });
    expect(stepGridWeek('2026-11-01', '2026-11-23', 1)).toEqual({ monthDelta: 0, weekStart: '2026-11-30' });
  });
  test('Nov -> Dec: Nov 30 -> Dec 7 switches to December', () => {
    expect(stepGridWeek('2026-11-01', '2026-11-30', 1)).toEqual({ monthDelta: 1, weekStart: '2026-12-07' });
  });
  test('Dec -> Nov: Dec 7 -> Nov 30 stays in December; Nov 30 -> Nov 23 switches to November', () => {
    expect(stepGridWeek('2026-12-01', '2026-12-07', -1)).toEqual({ monthDelta: 0, weekStart: '2026-11-30' });
    expect(stepGridWeek('2026-12-01', '2026-11-30', -1)).toEqual({ monthDelta: -1, weekStart: '2026-11-23' });
    // November's first row is Oct 26, also October's last row.
    expect(stepGridWeek('2026-11-01', '2026-10-26', -1)).toEqual({ monthDelta: -1, weekStart: '2026-10-19' });
  });
  test('the year end', () => {
    expect(stepGridWeek('2026-12-01', '2026-12-21', 1)).toEqual({ monthDelta: 0, weekStart: '2026-12-28' });
    expect(stepGridWeek('2026-12-01', '2026-12-28', 1)).toEqual({ monthDelta: 1, weekStart: '2027-01-04' });
    expect(stepGridWeek('2027-01-01', '2027-01-04', -1)).toEqual({ monthDelta: 0, weekStart: '2026-12-28' });
    expect(stepGridWeek('2027-01-01', '2026-12-28', -1)).toEqual({ monthDelta: -1, weekStart: '2026-12-21' });
  });
});

describe('dayMarksFor (owner data rule 2026-09-30)', () => {
  const s = (date, type, status = 'scheduled') => ({ id: `${date}-${type}`, date, type, status });

  test('a scheduled tournament marks its day yellow; a cancelled one does not', () => {
    const marks = dayMarksFor([s('2026-11-07', 'tournament'), s('2026-11-07', 'training'), s('2026-11-14', 'tournament', 'cancelled'), s('2026-11-14', 'training')], '2026-11-07', '2026-11-14');
    expect(marks['2026-11-07']).toBe('tournament');
    expect(marks['2026-11-14']).toBeUndefined();
  });

  // A session just past the range: the horizon (see below) then covers the whole range.
  const lookahead = (date) => s(date, 'training');

  test('an in-season day with no scheduled session of ANY type is closed; any type keeps it open', () => {
    const marks = dayMarksFor(
      [s('2026-11-03', 'training'), s('2026-11-04', 'phil'), s('2026-11-05', 'mental'), s('2026-11-06', 'training', 'cancelled'), lookahead('2026-11-09')],
      '2026-11-03',
      '2026-11-08'
    );
    expect(marks).toEqual({ '2026-11-06': 'closed', '2026-11-07': 'closed', '2026-11-08': 'closed' });
  });

  test('a tournament wins over closed (a holiday tournament on a closed day)', () => {
    const marks = dayMarksFor([s('2026-11-27', 'tournament'), lookahead('2026-11-30')], '2026-11-26', '2026-11-28');
    expect(marks).toEqual({ '2026-11-26': 'closed', '2026-11-27': 'tournament', '2026-11-28': 'closed' });
  });

  test('never closed before Nov 3 or after Feb 27, or outside the range read', () => {
    const pre = dayMarksFor([lookahead('2026-11-05')], '2026-10-26', '2026-11-04');
    expect(Object.keys(pre)).toEqual(['2026-11-03', '2026-11-04']);
    const post = dayMarksFor([lookahead('2027-03-08')], '2027-02-22', '2027-03-07');
    expect(Object.keys(post).sort()).toEqual(['2027-02-22', '2027-02-23', '2027-02-24', '2027-02-25', '2027-02-26', '2027-02-27']);
    expect(dayMarksFor([lookahead('2026-11-02')], '2026-10-01', '2026-10-31')).toEqual({});
    // Tournaments count anywhere in the range, season or not.
    expect(dayMarksFor([s('2026-10-24', 'tournament')], '2026-10-19', '2026-10-25')).toEqual({ '2026-10-24': 'tournament' });
    // A session outside [from, to] marks nothing.
    expect(dayMarksFor([s('2026-11-21', 'tournament')], '2026-11-04', '2026-11-04')).toEqual({ '2026-11-04': 'closed' });
    expect(dayMarksFor([s('2026-11-21', 'tournament')], null, null)).toEqual({});
  });

  describe('the sync horizon (review 2026-09-30)', () => {
    test('an empty read marks nothing closed - the season before the first sync', () => {
      expect(dayMarksFor([], '2026-10-26', '2026-12-06')).toEqual({});
      expect(dayMarksFor(undefined, '2026-11-03', '2026-11-30')).toEqual({});
    });

    test('closed stops at the latest date the read holds: a January read synced only to Jan 12', () => {
      // January's grid is Dec 28 .. Jan 31 (plus the lookahead); the 90-day sync reached Jan 12.
      const marks = dayMarksFor([s('2027-01-04', 'training'), s('2027-01-09', 'tournament'), s('2027-01-12', 'training')], '2026-12-28', '2027-01-31');
      expect(marks['2027-01-10']).toBe('closed'); // a Sunday inside the horizon
      expect(marks['2027-01-11']).toBe('closed');
      expect(marks['2027-01-09']).toBe('tournament');
      expect(marks['2027-01-12']).toBeUndefined();
      expect(Object.keys(marks).filter((iso) => iso > '2027-01-12')).toEqual([]); // not synced: never "Academy closed"
      expect(marks['2027-01-01']).toBe('closed'); // a real closure still has sessions after it
    });

    test('a cancelled doc extends the horizon (the sync only cancels inside a window it read)', () => {
      const marks = dayMarksFor([s('2026-11-12', 'training'), s('2026-11-14', 'training', 'cancelled')], '2026-11-12', '2026-11-15');
      expect(marks).toEqual({ '2026-11-13': 'closed', '2026-11-14': 'closed' });
    });

    test("December's grid ends inside the Christmas break: the lookahead's Jan 4 session lets the break be judged", () => {
      const grid = monthGridBounds('2026-12-01'); // Nov 30 .. Jan 3
      const read = [s('2026-12-22', 'training'), s('2026-12-28', 'tournament'), s('2026-12-29', 'tournament')];
      const without = dayMarksFor(read, grid.start, grid.end);
      expect(without['2026-12-23']).toBe('closed'); // the holiday tournaments come after it
      expect(without['2026-12-30']).toBeUndefined();
      expect(without['2027-01-03']).toBeUndefined();
      const withLookahead = dayMarksFor([...read, s('2027-01-04', 'training')], grid.start, grid.end);
      expect(withLookahead['2026-12-28']).toBe('tournament');
      expect(withLookahead['2026-12-30']).toBe('closed');
      expect(withLookahead['2027-01-03']).toBe('closed');
      expect(withLookahead['2027-01-04']).toBeUndefined(); // past the range itself
      expect(MARKS_LOOKAHEAD_DAYS).toBe(7);
    });
  });

  test('slotDayMarks reads the hook-derived mark off each day', () => {
    expect(slotDayMarks([{ date: '2026-11-07', mark: 'tournament' }, { date: '2026-11-08', mark: 'closed' }, { date: '2026-11-09', mark: null }, { date: '2026-11-10' }])).toEqual({
      '2026-11-07': 'tournament',
      '2026-11-08': 'closed',
    });
    expect(slotDayMarks(undefined)).toEqual({});
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
  // 'full' (slots, none open): tappable in booking so the waitlist is reachable; never in the contract calendar.
  expect(isTappableDay('booking', 'full')).toBe(true);
  expect(isTappableDay('contract', 'full')).toBe(false);
  // 'inactive' (a day outside the contract window) is never tappable.
  expect(isTappableDay('contract', 'inactive')).toBe(false);
  expect(isTappableDay('booking', 'inactive')).toBe(false);
});

test('slotDayStates: an open slot makes a day available; all-full is its own tappable state (toggle review)', () => {
  expect(
    slotDayStates([
      { date: '2026-10-02', slots: [{ id: 'a', open: true }] },
      { date: '2026-10-03', slots: [{ id: 'b', open: false }] },
      { date: '2026-10-04', slots: [] },
      { date: '2026-10-05' },
      { date: '2026-10-06', slots: [{ id: 'c', open: false }, { id: 'd', open: true }] },
    ])
  ).toEqual({ '2026-10-02': 'available', '2026-10-03': 'full', '2026-10-04': 'open', '2026-10-05': 'open', '2026-10-06': 'available' });
  expect(slotDayStates(undefined)).toEqual({});
});

test("slotDayStates without a waitlist (Yannick's sessions): a fully booked day opens nothing", () => {
  expect(
    slotDayStates(
      [
        { date: '2026-10-02', slots: [{ id: 'a', open: true }] },
        { date: '2026-10-03', slots: [{ id: 'b', open: false }] },
      ],
      { waitlist: false }
    )
  ).toEqual({ '2026-10-02': 'available', '2026-10-03': 'open' });
});
