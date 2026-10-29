import {
  REQUIRED_MINUTES, UNDER_12_MINUTES, addDays, ageOn, contractMinutesFor, daysBetween, isUnder12,
  weekDaysOf, weekStartFor, weekSummary, weekdaysOf,
} from './contractRule';

describe('contractMinutesFor (spec 4.3: 20 a day, 10 under 12)', () => {
  test('11 years 364 days is 10; the 12th birthday is 20; no dob is 20', () => {
    expect(contractMinutesFor({ dob: '2014-11-12' }, '2026-11-11')).toBe(10);
    expect(contractMinutesFor({ dob: '2014-11-12' }, '2026-11-12')).toBe(20);
    expect(contractMinutesFor({ dob: '2014-11-12' }, '2026-11-13')).toBe(20);
    expect(contractMinutesFor({ dob: null }, '2026-11-11')).toBe(20);
    expect(contractMinutesFor({}, '2026-11-11')).toBe(20);
    expect(contractMinutesFor(null, '2026-11-11')).toBe(20);
    expect(contractMinutesFor({ dob: 'June 2014' }, '2026-11-11')).toBe(20);
    expect(REQUIRED_MINUTES).toBe(20);
    expect(UNDER_12_MINUTES).toBe(10);
  });
  test('isUnder12 and ageOn agree with the seed children', () => {
    expect(isUnder12('2017-09-09', '2026-11-03')).toBe(true);
    expect(isUnder12('2014-03-02', '2026-11-03')).toBe(false);
    expect(isUnder12(null, '2026-11-03')).toBe(false);
    expect(ageOn('2012-06-17', '2026-11-11')).toBe(14);
    expect(ageOn('2017-09-09', '2026-09-08')).toBe(8);
    expect(ageOn('2017-09-09', '2026-09-09')).toBe(9);
    expect(ageOn(null, '2026-11-11')).toBeNull();
  });
});

describe('week math (Monday first, pure ISO arithmetic)', () => {
  test('weekStartFor across a plain week, the Nov 1 2026 DST change and the year end', () => {
    expect(weekStartFor('2026-11-11')).toBe('2026-11-09');
    expect(weekStartFor('2026-11-09')).toBe('2026-11-09');
    expect(weekStartFor('2026-11-15')).toBe('2026-11-09');
    expect(weekStartFor('2026-11-01')).toBe('2026-10-26');
    expect(weekStartFor('2026-11-02')).toBe('2026-11-02');
    expect(weekStartFor('2027-01-01')).toBe('2026-12-28');
    expect(weekStartFor('2027-01-03')).toBe('2026-12-28');
    expect(weekStartFor('2027-01-04')).toBe('2027-01-04');
  });
  test('weekdaysOf is Mon..Fri, weekDaysOf is Mon..Sun', () => {
    expect(weekdaysOf('2026-11-09')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    expect(weekDaysOf('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(weekdaysOf('2026-12-28')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01']);
  });
  test('addDays and daysBetween', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-09', -7)).toBe('2026-11-02');
    expect(daysBetween('2026-11-03', '2026-11-18')).toBe(15);
    expect(daysBetween('2026-11-18', '2026-11-03')).toBe(-15);
    expect(daysBetween('2026-10-26', '2026-11-02')).toBe(7);
  });
});

describe('weekSummary', () => {
  const logs = { '2026-11-09': 20, '2026-11-10': 15, '2026-11-12': 25, '2026-11-14': 60 };
  test('met at or above the requirement, short below, none without a log; weekend logs are ignored', () => {
    const s = weekSummary({ logsByDate: logs, weekStartISO: '2026-11-09', required: 20 });
    expect(s.metDays).toBe(2);
    expect(s.days).toEqual([
      { date: '2026-11-09', state: 'met', minutes: 20 },
      { date: '2026-11-10', state: 'short', minutes: 15 },
      { date: '2026-11-11', state: 'none', minutes: 0 },
      { date: '2026-11-12', state: 'met', minutes: 25 },
      { date: '2026-11-13', state: 'none', minutes: 0 },
    ]);
  });
  test('a per-day requirement: a 12th birthday on Wednesday leaves Monday and Tuesday met at 10', () => {
    const required = (d) => contractMinutesFor({ dob: '2014-11-11' }, d);
    const s = weekSummary({ logsByDate: { '2026-11-09': 10, '2026-11-10': 10, '2026-11-11': 10 }, weekStartISO: '2026-11-09', required });
    expect(s.days.map((d) => d.state)).toEqual(['met', 'met', 'short', 'none', 'none']);
    expect(s.metDays).toBe(2);
  });
  test('no logs is five none', () => {
    const s = weekSummary({ logsByDate: {}, weekStartISO: '2026-11-09', required: 20 });
    expect(s.metDays).toBe(0);
    expect(s.days.every((d) => d.state === 'none' && d.minutes === 0)).toBe(true);
    expect(weekSummary({ logsByDate: undefined, weekStartISO: '2026-11-09', required: 20 }).metDays).toBe(0);
  });
});
