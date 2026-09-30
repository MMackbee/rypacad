/**
 * firstRunningWeek (review 2026-09-30): Repeat weekly's "come back for
 * {date}" line never names a closure. The Christmas break (Dec 23 - Jan 3)
 * sits right past the Nov 1-anchored Elite window (Dec 16), so stepping over
 * it is the normal case, not a corner.
 */
import { firstRunningWeek } from './season';

describe('firstRunningWeek: the next week a weekly slot actually runs', () => {
  test('an open date is its own answer', () => {
    expect(firstRunningWeek('2026-12-22', '4:00 PM', 'training')).toBe('2026-12-22');
  });

  test('steps over the Christmas break a week at a time; the type defaults to training', () => {
    expect(firstRunningWeek('2026-12-23', '4:00 PM', 'training')).toBe('2027-01-06');
    expect(firstRunningWeek('2026-12-29', '4:00 PM')).toBe('2027-01-05');
    expect(firstRunningWeek('2026-11-25', '4:00 PM')).toBe('2026-12-02'); // Thanksgiving
    expect(firstRunningWeek('2027-02-15', '4:00 PM')).toBe('2027-02-22'); // Presidents' Day
  });

  test('a holiday tournament runs on a closed day; a regular block at another time does not', () => {
    expect(firstRunningWeek('2026-12-29', '10:30 AM', 'tournament')).toBe('2026-12-29');
    // Saturday's 10 AM tournament block is off Thanksgiving weekend (the 10:30 one is an extra).
    expect(firstRunningWeek('2026-11-28', '10:00 AM', 'tournament')).toBe('2026-12-05');
  });

  test("null past the season's last day (Sat, Feb 27)", () => {
    expect(firstRunningWeek('2027-02-27', '9:00 AM')).toBe('2027-02-27');
    expect(firstRunningWeek('2027-03-02', '4:00 PM')).toBeNull();
  });
});
