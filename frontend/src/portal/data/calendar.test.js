/**
 * The Oct 10 gate (Sprint 20, spec 5) and the 30-day window defaults - the
 * constants every banner, gate and rules clause agree on.
 */
import {
  BOOKING_OPENS_AT,
  BOOKING_OPENS_LABEL,
  BOOKING_WINDOW_ANCHOR,
  bookingOpen,
  openThrough,
  windowAnchored,
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

describe('window defaults are 30 days', () => {
  test('windowOpensOn defaults to 30', () => {
    expect(windowOpensOn('2026-11-09')).toBe('2026-10-10');
  });
  test('openThrough defaults to 30 (anchor rolls at 7 AM Chicago)', () => {
    // Before Nov 1 the window counts from Nov 1: Oct 10 either side of 7 AM
    // reaches Dec 1. After it, 2026-11-10 13:00Z is 07:00 CST -> Nov 10 + 30.
    expect(openThrough(new Date(BOOKING_OPENS_AT))).toBe('2026-12-01');
    expect(openThrough(new Date(BOOKING_OPENS_AT - 60000))).toBe('2026-12-01');
    expect(openThrough(new Date('2026-11-10T13:00:00Z'))).toBe('2026-12-10');
    expect(openThrough(new Date('2026-11-10T12:59:00Z'))).toBe('2026-12-09');
  });
});

describe('the window is anchored at Nov 1 until then (owner ruling 2026-09-30)', () => {
  test('the anchor is Nov 1 2026', () => {
    expect(BOOKING_WINDOW_ANCHOR).toBe('2026-11-01');
  });
  // Checked against date-fns in America/Chicago across the Nov 1 DST change
  // (07:00 is 12:00Z before it, 13:00Z after).
  test.each([
    ['2026-09-30T17:00:00Z', 45, '2026-12-16'],
    ['2026-09-30T17:00:00Z', 30, '2026-12-01'],
    ['2026-10-10T12:00:00Z', 30, '2026-12-01'],
    ['2026-11-01T12:59:00Z', 45, '2026-12-16'],
    ['2026-11-02T12:59:00Z', 45, '2026-12-16'],
    ['2026-11-02T13:00:00Z', 45, '2026-12-17'],
    ['2026-11-10T13:00:00Z', 30, '2026-12-10'],
  ])('at %s a %i-day window reaches %s', (iso, days, last) => {
    expect(openThrough(new Date(iso), days)).toBe(last);
  });
  test('windowAnchored holds until 07:00 Chicago on Nov 1, then rolls daily', () => {
    expect(windowAnchored(new Date('2026-09-30T17:00:00Z'))).toBe(true);
    expect(windowAnchored(new Date('2026-11-01T12:59:00Z'))).toBe(true);
    expect(windowAnchored(new Date('2026-11-01T13:00:00Z'))).toBe(false);
    expect(windowAnchored(new Date('2026-11-10T13:00:00Z'))).toBe(false);
  });
  test('a locked day still names the day it opens', () => {
    expect(windowOpensOn('2026-12-17', 45)).toBe('2026-11-02');
    expect(windowOpensOn('2026-12-02', 30)).toBe('2026-11-02');
  });
});
