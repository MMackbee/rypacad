/**
 * The client-side booking gates (Sprint 20, spec 4.4 + 5): pure asserts
 * exported from the adapter so the order and copy are pinned without a
 * Firestore round trip. Firebase is mocked out entirely.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({}));

import { ERR, assertAthleteBillingActive, assertBookingOpen, assertPeriodTokensLeft } from './live';
import { BOOKING_OPENS_AT } from '../data/calendar';
import { assertWithinBookingWindow } from './live';
import { ELITE, TOKEN_PACKAGES } from '../data/packages';

const reasonOf = (fn) => {
  try { fn(); } catch (e) { return [e.code, e.reason, e.message]; }
  return null;
};

describe('assertAthleteBillingActive', () => {
  test('absent and active pass; pending/past_due/lapsed throw billing-pending', () => {
    expect(reasonOf(() => assertAthleteBillingActive({}))).toBeNull();
    expect(reasonOf(() => assertAthleteBillingActive({ billing: { status: 'active' } }))).toBeNull();
    for (const status of ['pending', 'past_due', 'lapsed']) {
      expect(reasonOf(() => assertAthleteBillingActive({ billing: { status } })))
        .toEqual([ERR.INVALID, 'billing-pending', 'Payment pending - finish checkout to start booking']);
    }
  });
});

describe('assertBookingOpen', () => {
  test('token package before the gate throws booking-not-open with the label', () => {
    expect(reasonOf(() => assertBookingOpen({ kind: 'tokens' }, BOOKING_OPENS_AT - 1)))
      .toEqual([ERR.INVALID, 'booking-not-open', 'Booking opens Sat, Oct 10 at 7 AM']);
    expect(reasonOf(() => assertBookingOpen({ kind: 'tokens' }, BOOKING_OPENS_AT))).toBeNull();
    expect(reasonOf(() => assertBookingOpen({ kind: 'elite' }, 0))).toBeNull();
  });
});

describe('assertPeriodTokensLeft names the period it means', () => {
  const t6 = { id: 't-6', tokens: 6 };
  const spent = (key) => Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, status: 'confirmed', periodKey: key }));
  test('this period', () => {
    expect(reasonOf(() => assertPeriodTokensLeft(t6, spent('2026-11-01'), '2026-11-01', undefined, [], '2026-11-01')))
      .toEqual([ERR.INVALID, 'no-tokens-left', "This period's tokens are already fully booked (6 of 6)."]);
  });
  test('next period (borrowed tokens, spec 5)', () => {
    expect(reasonOf(() => assertPeriodTokensLeft(t6, spent('2026-12-01'), '2026-12-01', undefined, [], '2026-11-01')))
      .toEqual([ERR.INVALID, 'no-tokens-left', "Next period's tokens are already fully booked (6 of 6)."]);
  });
  test('a waitlist hold is named; Elite never throws', () => {
    expect(reasonOf(() => assertPeriodTokensLeft(t6, spent('2026-11-01').slice(0, 5), '2026-11-01', undefined, [{ periodKey: '2026-11-01' }], '2026-11-01'))[2])
      .toBe("This period's tokens are already fully booked (5 of 6, 1 held on a waitlist).");
    expect(reasonOf(() => assertPeriodTokensLeft({ id: 'elite', tokens: null }, spent('2026-11-01'), '2026-11-01', undefined, [], '2026-11-01'))).toBeNull();
  });
});

describe('assertWithinBookingWindow counts from Nov 1 until then (owner ruling 2026-09-30)', () => {
  const OCT_1 = new Date('2026-10-01T17:00:00Z');
  test('Elite on Oct 1 books through Dec 16; Dec 17 is outside-window and names Nov 2', () => {
    expect(reasonOf(() => assertWithinBookingWindow(ELITE, '2026-12-16', OCT_1))).toBeNull();
    expect(reasonOf(() => assertWithinBookingWindow(ELITE, '2026-12-17', OCT_1)))
      .toEqual([ERR.INVALID, 'outside-window', 'That date opens for booking at 7 AM on 2026-11-02.']);
  });
  test('a token package reaches Dec 1', () => {
    const t12 = TOKEN_PACKAGES.find((p) => p.id === 't-12');
    expect(reasonOf(() => assertWithinBookingWindow(t12, '2026-12-01', OCT_1))).toBeNull();
    expect(reasonOf(() => assertWithinBookingWindow(t12, '2026-12-02', OCT_1))[1]).toBe('outside-window');
  });
});
