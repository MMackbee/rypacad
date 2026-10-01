/**
 * Owner ruling R2 (waitlist hardening): a session that has started or is in
 * the past cannot be booked or waitlisted. Judged on the academy's clock.
 */
import { academyClock } from './calendar';
import { dayIsPast, lockPastDays, sessionStarted, waitlistClosed } from './sessionStart';

// 2026-11-12 16:30 in Chicago (CST, UTC-6).
const NOW = new Date('2026-11-12T22:30:00Z');

test('the academy clock reads Chicago, not UTC', () => {
  expect(academyClock(NOW)).toEqual({ date: '2026-11-12', minutes: 16 * 60 + 30 });
  // 00:30 UTC on Nov 13 is still 6:30 PM on Nov 12 in Chicago.
  expect(academyClock(new Date('2026-11-13T00:30:00Z'))).toEqual({ date: '2026-11-12', minutes: 18 * 60 + 30 });
});

test('a session on an earlier day has started; a later day has not', () => {
  expect(sessionStarted({ date: '2026-11-10', time: '4:00 PM' }, NOW)).toBe(true);
  expect(sessionStarted({ date: '2026-11-13', time: '9:00 AM' }, NOW)).toBe(false);
});

test('today: started once its start time has passed, to the minute', () => {
  expect(sessionStarted({ date: '2026-11-12', time: '3:00 PM' }, NOW)).toBe(true);
  expect(sessionStarted({ date: '2026-11-12', time: '4:30 PM' }, NOW)).toBe(true);
  expect(sessionStarted({ date: '2026-11-12', time: '4:31 PM' }, NOW)).toBe(false);
  expect(sessionStarted({ date: '2026-11-12', time: '5:00 PM' }, NOW)).toBe(false);
});

test('today with no readable time is judged by its date alone', () => {
  expect(sessionStarted({ date: '2026-11-12' }, NOW)).toBe(false);
  expect(sessionStarted({ date: '2026-11-11' }, NOW)).toBe(true);
  expect(sessionStarted(null, NOW)).toBe(false);
});

test('the waitlist is closed from the day of the session (no same-day promotion)', () => {
  expect(waitlistClosed({ date: '2026-11-13' }, NOW)).toBe(false);
  expect(waitlistClosed({ date: '2026-11-12' }, NOW)).toBe(true);
  expect(waitlistClosed({ date: '2026-11-10' }, NOW)).toBe(true);
});

test('past days stop being tappable; today and later keep their state', () => {
  expect(dayIsPast('2026-11-11', NOW)).toBe(true);
  expect(dayIsPast('2026-11-12', NOW)).toBe(false);
  expect(lockPastDays({ '2026-11-10': 'available', '2026-11-12': 'available', '2026-11-14': 'available', '2026-11-15': 'open' }, NOW)).toEqual({
    '2026-11-10': 'open',
    '2026-11-12': 'available',
    '2026-11-14': 'available',
    '2026-11-15': 'open',
  });
});
