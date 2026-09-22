/**
 * The owner's suggested age groups (2026-09-22, amendment v2.0.3): Mon/Wed
 * 3 and 5 PM are 13 & up, 4 and 6 PM under 13; Tue/Thu 4 and 6 PM are 13 & up,
 * 5 and 7 PM under 13. A suggestion only - it never gates a booking and never
 * touches a charge - so the tests below pin the mapping, the days and types
 * that carry NO suggestion, and the date/time parsing that decides the day.
 */
import { AGE_GROUPS, AGE_GROUP_BY_DAY, WEEKDAY_BLOCKS, ageGroupFor } from './schedule';

// The week of Mon 2026-09-21 .. Sun 2026-09-27.
const MON = '2026-09-21';
const TUE = '2026-09-22';
const WED = '2026-09-23';
const THU = '2026-09-24';
const FRI = '2026-09-25';
const SAT = '2026-09-26';
const SUN = '2026-09-27';

const group = (date, time, type = 'training') => {
  const g = ageGroupFor({ date, time, type });
  return g ? g.id : null;
};

describe('the owner\'s mapping', () => {
  test('Mon and Wed: 3 and 5 PM are 13 & up, 4 and 6 PM under 13', () => {
    for (const day of [MON, WED]) {
      expect(group(day, '3:00 PM')).toBe('older');
      expect(group(day, '4:00 PM')).toBe('younger');
      expect(group(day, '5:00 PM')).toBe('older');
      expect(group(day, '6:00 PM')).toBe('younger');
    }
  });

  test('Tue and Thu: 4 and 6 PM are 13 & up, 5 and 7 PM under 13', () => {
    for (const day of [TUE, THU]) {
      expect(group(day, '4:00 PM')).toBe('older');
      expect(group(day, '5:00 PM')).toBe('younger');
      expect(group(day, '6:00 PM')).toBe('older');
      expect(group(day, '7:00 PM')).toBe('younger');
    }
  });

  test('the labels families read', () => {
    expect(ageGroupFor({ date: MON, time: '3:00 PM' })).toMatchObject({ label: '13 & up', short: '13+' });
    expect(ageGroupFor({ date: MON, time: '4:00 PM' })).toMatchObject({ label: 'Under 13', short: 'U13' });
    expect(Object.keys(AGE_GROUPS)).toEqual(['older', 'younger']);
  });

  test('every generated Mon-Thu block has a suggestion, and every Fri block has none', () => {
    const at = (hour) => `${((hour + 11) % 12) + 1}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
    for (const [day, iso] of [['Mon', MON], ['Tue', TUE], ['Wed', WED], ['Thu', THU]]) {
      for (const hour of WEEKDAY_BLOCKS[day]) expect(group(iso, at(hour))).not.toBeNull();
    }
    for (const hour of WEEKDAY_BLOCKS.Fri) expect(group(FRI, at(hour))).toBeNull();
  });
});

describe('what carries no suggestion', () => {
  test('Friday, Saturday and Sunday: the owner ruled on Mon-Thu only', () => {
    expect(group(FRI, '3:00 PM')).toBeNull();
    expect(group(FRI, '4:00 PM')).toBeNull();
    expect(group(SAT, '9:00 AM')).toBeNull();
    expect(group(SAT, '12:00 PM')).toBeNull();
    expect(group(SUN, '4:00 PM')).toBeNull();
  });

  test('the reserved Tue/Thu 3 PM hour is unmapped', () => {
    expect(group(TUE, '3:00 PM')).toBeNull();
    expect(group(THU, '3:00 PM')).toBeNull();
    expect(AGE_GROUP_BY_DAY.Tue[15]).toBeUndefined();
  });

  test('only training: tournaments and specialist sessions carry none', () => {
    expect(group(MON, '3:00 PM', 'tournament')).toBeNull();
    expect(group(MON, '3:00 PM', 'phil')).toBeNull();
    expect(group(MON, '3:00 PM', 'mental')).toBeNull();
    expect(group(MON, '3:00 PM', 'adult')).toBeNull();
    // Absent type means a training block, the shape generateSeason produces.
    expect(ageGroupFor({ date: MON, time: '3:00 PM' })).not.toBeNull();
  });

  test('an hour outside the mapping, and a half-hour start, carry none', () => {
    expect(group(MON, '7:00 PM')).toBeNull(); // Mon has no 7 PM block
    expect(group(TUE, '8:00 PM')).toBeNull();
    expect(group(MON, '9:00 AM')).toBeNull();
    expect(group(MON, '4:30 PM')).toBeNull();
  });

  test('missing or unusable input never throws', () => {
    expect(ageGroupFor()).toBeNull();
    expect(ageGroupFor({})).toBeNull();
    expect(ageGroupFor({ date: MON })).toBeNull();
    expect(ageGroupFor({ time: '3:00 PM' })).toBeNull();
    expect(ageGroupFor({ date: 'not-a-date', time: '3:00 PM' })).toBeNull();
    expect(ageGroupFor({ date: MON, time: 'whenever' })).toBeNull();
    expect(ageGroupFor({ date: MON, time: null })).toBeNull();
  });
});

describe('the date is read in local time', () => {
  test('a date string is never shifted to the previous day', () => {
    // `new Date('2026-09-21')` is UTC midnight, which is Sunday evening in
    // Chicago. If the day were read that way, Monday's 3 PM block would fall
    // on Sunday and lose its suggestion.
    expect(group(MON, '3:00 PM')).toBe('older');
    expect(group('2026-11-02', '3:00 PM')).toBe('older'); // Mon, after the DST change
    expect(group('2026-03-09', '4:00 PM')).toBe('younger'); // Mon, after spring forward
  });

  test('noon and midnight do not fold into the wrong hour', () => {
    // parseTimeToMinutes' 12-hour rules: 12 PM is 12:00, 12 AM is 00:00.
    expect(group(SAT, '12:00 PM')).toBeNull(); // Saturday carries none either way
    expect(group(MON, '12:00 AM')).toBeNull();
    expect(group(MON, '12:00 PM')).toBeNull();
  });
});
