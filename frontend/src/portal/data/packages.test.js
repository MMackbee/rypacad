/**
 * The token math the whole portal hangs off (contract v2.0/2.1; pinned
 * Sprint 16 "rock solid"). periodFor and tokensFor are the ONE derivation
 * the booking gate, the Billing hub, Membership and the booking screens
 * share — these tests are the contract's edge cases written down.
 */
import {
  ALL_PACKAGES, ELITE, PRICES_RELEASED, SIBLING_DISCOUNT_NOTE, SIBLING_DISCOUNT_PCT, SINGLE_TOKEN, TOKEN_PACKAGES,
  normalizeAnchorDay, periodFor, siblingDiscountApplies, tokensFor, windowDaysFor,
} from './packages';
import { SEASON_BOUNDS } from './season';

const T12 = TOKEN_PACKAGES.find((p) => p.id === 't-12');

describe('periodFor', () => {
  test('anchor 1: a calendar month', () => {
    expect(periodFor('2026-09-16', 1)).toEqual({ periodKey: '2026-09-01', periodEnd: '2026-09-30' });
    expect(periodFor('2026-09-01', 1)).toEqual({ periodKey: '2026-09-01', periodEnd: '2026-09-30' });
    expect(periodFor('2026-09-30', 1)).toEqual({ periodKey: '2026-09-01', periodEnd: '2026-09-30' });
  });

  test('anchor 15: the period starts on the 15th and ends the 14th', () => {
    expect(periodFor('2026-09-10', 15)).toEqual({ periodKey: '2026-08-15', periodEnd: '2026-09-14' });
    expect(periodFor('2026-09-14', 15)).toEqual({ periodKey: '2026-08-15', periodEnd: '2026-09-14' });
    expect(periodFor('2026-09-15', 15)).toEqual({ periodKey: '2026-09-15', periodEnd: '2026-10-14' });
  });

  test('anchor 28 across February and a leap year', () => {
    expect(periodFor('2026-02-27', 28)).toEqual({ periodKey: '2026-01-28', periodEnd: '2026-02-27' });
    expect(periodFor('2026-02-28', 28)).toEqual({ periodKey: '2026-02-28', periodEnd: '2026-03-27' });
    expect(periodFor('2028-02-29', 28)).toEqual({ periodKey: '2028-02-28', periodEnd: '2028-03-27' });
  });

  test('year wrap', () => {
    expect(periodFor('2026-01-05', 15)).toEqual({ periodKey: '2025-12-15', periodEnd: '2026-01-14' });
    expect(periodFor('2025-12-31', 1)).toEqual({ periodKey: '2025-12-01', periodEnd: '2025-12-31' });
  });

  test('anchor day is clamped to 1..28 and defaults to 1', () => {
    expect(normalizeAnchorDay(undefined)).toBe(1);
    expect(normalizeAnchorDay(0)).toBe(1);
    expect(normalizeAnchorDay(31)).toBe(28);
    expect(periodFor('2026-09-16')).toEqual(periodFor('2026-09-16', 1));
    expect(periodFor('2026-09-29', 31)).toEqual(periodFor('2026-09-29', 28));
  });
});

describe('tokensFor', () => {
  const KEY = '2026-09-01';
  const today = '2026-09-16';
  const booking = (over) => ({ id: 'b', athleteId: 'a', status: 'confirmed', periodKey: KEY, date: '2026-09-20', ...over });

  test('counts non-cancelled bookings of the period, nothing else', () => {
    const bookings = [
      booking({ id: 'b1' }),
      booking({ id: 'b2', status: 'attended' }),
      booking({ id: 'b3', status: 'no-show' }),
      booking({ id: 'b4', status: 'cancelled' }),
      booking({ id: 'b5', periodKey: '2026-10-01' }),
      booking({ id: 'b6', periodKey: '2026-08-01' }),
    ];
    const t = tokensFor(null, T12, bookings, [], [], KEY, { today });
    expect(t).toMatchObject({ granted: 12, used: 3, reserved: 0, left: 9, unlimited: false });
  });

  test('a grace-charged booking never counts as a period spend', () => {
    const bookings = [booking({ id: 'b1' }), booking({ id: 'b2', graceTokenId: 'g1' })];
    const t = tokensFor(null, T12, bookings, [], [{ id: 'g1', expiresAt: '2026-10-01' }], KEY, { today });
    expect(t.used).toBe(1);
    expect(t.left).toBe(11);
    // ...and the token it spent is consumed, so it no longer shows as available.
    expect(t.grace).toEqual([]);
  });

  test('waitlist entries in the period reserve tokens', () => {
    const waitlist = [
      { id: 'w1', periodKey: KEY },
      { id: 'w2', periodKey: '2026-10-01' },
    ];
    const t = tokensFor(null, T12, [booking()], waitlist, [], KEY, { today });
    expect(t).toMatchObject({ used: 1, reserved: 1, left: 10 });
  });

  test('grace tokens: unexpired and unconsumed only, soonest expiry first', () => {
    const grace = [
      { id: 'late', expiresAt: '2026-10-20' },
      { id: 'soon', expiresAt: '2026-09-20' },
      { id: 'expired', expiresAt: '2026-09-15' },
      { id: 'today', expiresAt: today },
      { id: 'spent', expiresAt: '2026-10-01' },
    ];
    const t = tokensFor(null, T12, [booking({ graceTokenId: 'spent' })], [], grace, KEY, { today });
    expect(t.grace.map((g) => g.id)).toEqual(['today', 'soon', 'late']);
  });

  test('an issued grant overrides the package default', () => {
    const t = tokensFor(null, T12, [booking()], [], [], KEY, { today, tokenPeriod: { granted: 14 } });
    expect(t).toMatchObject({ granted: 14, used: 1, left: 13 });
    const none = tokensFor(null, T12, [booking()], [], [], KEY, { today, tokenPeriod: null });
    expect(none.granted).toBe(12);
  });

  test('left floors at zero', () => {
    const bookings = Array.from({ length: 13 }, (_, i) => booking({ id: `b${i}` }));
    const t = tokensFor(null, T12, bookings, [{ id: 'w', periodKey: KEY }], [], KEY, { today });
    expect(t).toMatchObject({ used: 13, reserved: 1, left: 0 });
  });

  test('Elite is unlimited; no package is zero, not unlimited', () => {
    const elite = tokensFor(null, ELITE, [booking()], [], [], KEY, { today });
    expect(elite).toMatchObject({ granted: null, left: null, unlimited: true, used: 1 });
    const none = tokensFor(null, null, [booking()], [], [], KEY, { today });
    expect(none).toMatchObject({ granted: 0, left: 0, unlimited: false, used: 1 });
  });
});

describe('the catalogue after Sprint 20', () => {
  test('token packages and single roll a 30-day window; Elite keeps 45', () => {
    expect(TOKEN_PACKAGES.map((p) => p.windowDays)).toEqual([30, 30, 30]);
    expect(SINGLE_TOKEN.windowDays).toBe(30);
    expect(ELITE.windowDays).toBe(45);
    expect(windowDaysFor(null)).toBe(30);
  });
  test('prices are released and the catalogue carries no Stripe ids', () => {
    expect(PRICES_RELEASED).toBe(true);
    for (const p of ALL_PACKAGES) expect(p).not.toHaveProperty('stripePriceId');
  });
  test('the season starts Nov 3', () => {
    expect(SEASON_BOUNDS.start).toBe('2026-11-03');
  });
});

// The same rule as functions/portal/checkout.js siblingEligible (owner,
// 2026-09-30): two or more monthly athletes, the single token and a lapsed
// membership not counted.
describe('siblingDiscountApplies', () => {
  test('two monthly athletes qualify, pending ones included; one does not', () => {
    expect(SIBLING_DISCOUNT_PCT).toBe(10);
    expect(SIBLING_DISCOUNT_NOTE).toBe('10% sibling discount comes off at checkout.');
    expect(siblingDiscountApplies([{ packageId: 't-16' }, { packageId: 'elite', billing: { status: 'pending' } }])).toBe(true);
    expect(siblingDiscountApplies([{ packageId: 't-6', billing: { status: 'active' } }])).toBe(false);
    expect(siblingDiscountApplies([])).toBe(false);
    expect(siblingDiscountApplies(null)).toBe(false);
  });
  test('the single token, a lapsed membership and no package do not count', () => {
    expect(siblingDiscountApplies([{ packageId: 't-12' }, { packageId: 'single' }])).toBe(false);
    expect(siblingDiscountApplies([{ packageId: 't-12' }, { packageId: 't-6', billing: { status: 'lapsed' } }])).toBe(false);
    expect(siblingDiscountApplies([{ packageId: 't-12' }, { packageId: null }, { packageId: '' }, null])).toBe(false);
    expect(siblingDiscountApplies([{ packageId: 't-12' }, { packageId: 't-6', billing: { status: 'past_due' } }])).toBe(true);
  });
  test('billing-hub members are read by package.id', () => {
    const member = (id, status = 'active') => ({ athleteId: id, package: id ? { id, kind: 'tokens' } : null, billing: { status, facility: null } });
    expect(siblingDiscountApplies([member('t-6'), member('t-12', 'pending')])).toBe(true);
    expect(siblingDiscountApplies([member('t-6'), member(null)])).toBe(false);
    expect(siblingDiscountApplies([member('t-6'), member('t-12', 'lapsed')])).toBe(false);
  });
});
