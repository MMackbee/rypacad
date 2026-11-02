/**
 * The Oct 10 gate (Sprint 20, spec 5) and the whole-month booking window
 * (owner ruling 2026-11-02) - the constants every banner, gate and rules
 * clause agree on.
 */
import {
  BOOKING_OPENS_AT,
  BOOKING_OPENS_LABEL,
  bookingOpen,
  openThrough,
  windowOpensOn,
} from './calendar';

describe('bookingOpen', () => {
  const before = BOOKING_OPENS_AT - 1;
  const at = BOOKING_OPENS_AT;
  test('the gate is 07:00 America/Chicago on Oct 10 2026', () => {
    expect(BOOKING_OPENS_AT).toBe(1791633600000);
    expect(new Date(BOOKING_OPENS_AT).toISOString()).toBe('2026-10-10T12:00:00.000Z');
    expect(BOOKING_OPENS_LABEL).toBe('Sat, Oct 10 at 7 AM');
  });
  test('closed before, open at and after, for a token package', () => {
    const t6 = { id: 't-6', kind: 'tokens' };
    expect(bookingOpen(before, t6)).toBe(false);
    expect(bookingOpen(at, t6)).toBe(true);
    expect(bookingOpen(at + 1, t6)).toBe(true);
  });
  test('Elite is open at any time; no package is gated like a token package', () => {
    expect(bookingOpen(before, { id: 'elite', kind: 'elite' })).toBe(true);
    expect(bookingOpen(before, null)).toBe(false);
    expect(bookingOpen(before, undefined)).toBe(false);
  });
  test('accepts a Date as well as millis', () => {
    expect(bookingOpen(new Date(before), { kind: 'tokens' })).toBe(false);
    expect(bookingOpen(new Date(at), { kind: 'tokens' })).toBe(true);
  });
});

describe('the window is whole calendar months, a further month opening at 7 AM Chicago on the 1st (owner ruling 2026-11-02)', () => {
  test('defaults to one month, counted from today after 7 AM Chicago and from yesterday before it', () => {
    // 2026-11-10 13:00Z is 07:00 CST: November counts, so through Dec 31. A
    // minute earlier Nov 9 counts - still November, still Dec 31.
    expect(openThrough(new Date('2026-11-10T13:00:00Z'))).toBe('2026-12-31');
    expect(openThrough(new Date('2026-11-10T12:59:00Z'))).toBe('2026-12-31');
    expect(windowOpensOn('2026-12-02')).toBe('2026-11-01');
  });
  // Checked in America/Chicago (CST, UTC-6, for the whole Nov-Feb season).
  test.each([
    ['2026-11-02T13:00:00Z', 1, '2026-12-31'], // a token family on Nov 2: all of December
    ['2026-11-02T13:00:00Z', 2, '2027-01-31'], // Elite on Nov 2: all of January too
    ['2026-11-30T23:00:00Z', 1, '2026-12-31'], // Nov 30, 5 PM Chicago: still November
    ['2026-12-01T12:59:00Z', 1, '2026-12-31'], // Dec 1, 6:59 AM Chicago: yesterday counts
    ['2026-12-01T13:00:00Z', 1, '2027-01-31'], // Dec 1, 7 AM Chicago: January opens
    ['2026-12-01T13:00:00Z', 2, '2027-02-28'], // Elite on Dec 1: all of February
    ['2026-10-01T17:00:00Z', 1, '2026-11-30'],
    ['2026-10-01T17:00:00Z', 2, '2026-12-31'],
    ['2027-01-15T18:00:00Z', 2, '2027-03-31'],
  ])('at %s a %i-month window reaches %s', (iso, months, last) => {
    expect(openThrough(new Date(iso), months)).toBe(last);
  });
  test('a locked day opens on the 1st of a month, the window length back', () => {
    expect(windowOpensOn('2027-01-07', 1)).toBe('2026-12-01');
    expect(windowOpensOn('2027-01-07', 2)).toBe('2026-11-01');
    expect(windowOpensOn('2027-02-27', 2)).toBe('2026-12-01');
    expect(windowOpensOn('2026-12-31', 1)).toBe('2026-11-01');
  });
});
