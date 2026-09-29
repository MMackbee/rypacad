/**
 * The Oct 10 gate (Sprint 20, spec 5) and the 30-day window defaults - the
 * constants every banner, gate and rules clause agree on.
 */
import { BOOKING_OPENS_AT, BOOKING_OPENS_LABEL, bookingOpen, openThrough, windowOpensOn } from './calendar';

describe('bookingOpen', () => {
  const before = BOOKING_OPENS_AT - 1;
  const at = BOOKING_OPENS_AT;
  test('the gate is 07:00 America/Chicago on Oct 10 2026', () => {
    expect(BOOKING_OPENS_AT).toBe(1791633600000);
    expect(new Date(BOOKING_OPENS_AT).toISOString()).toBe('2026-10-10T12:00:00.000Z');
    expect(BOOKING_OPENS_LABEL).toBe('Fri, Oct 10 at 7 AM');
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
    // 2026-10-10 12:00Z is 07:00 Chicago -> anchor is Oct 10 -> +30 = Nov 9.
    expect(openThrough(new Date(BOOKING_OPENS_AT))).toBe('2026-11-09');
    expect(openThrough(new Date(BOOKING_OPENS_AT - 60000))).toBe('2026-11-08');
  });
});
