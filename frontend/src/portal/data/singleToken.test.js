import {
  availableCount,
  BUY_SINGLE_LABEL,
  graceSpendLabel,
  isSingleTokenId,
  packageSwitchWarning,
  SINGLE_EXPIRES,
  SINGLE_EXPIRES_LABEL,
  singleConfirmedLine,
  singleTokenLine,
} from './singleToken';
import { SEASON_BOUNDS } from './season';

const bought = (id) => ({ id, expiresAt: '2027-02-27', reason: 'single-purchase' });
const bonus = (id) => ({ id, expiresAt: '2026-11-20', reason: 'session-cancelled' });

test('the token is good through the season end, Sat, Feb 27', () => {
  expect(SINGLE_EXPIRES).toBe(SEASON_BOUNDS.end);
  expect(SINGLE_EXPIRES).toBe('2027-02-27');
  expect(SINGLE_EXPIRES_LABEL).toBe('Sat, Feb 27');
});

test('isSingleTokenId matches functions/portal/single.js', () => {
  expect(isSingleTokenId('single_cs_test_1')).toBe(true);
  expect(isSingleTokenId('single_')).toBe(false);
  expect(isSingleTokenId('grace-1')).toBe(false);
  expect(isSingleTokenId(null)).toBe(false);
  expect(isSingleTokenId(undefined)).toBe(false);
  expect(isSingleTokenId(42)).toBe(false);
});

test('the buy label names the one-time price', () => {
  expect(BUY_SINGLE_LABEL).toBe('Buy a session token - $65');
});

test('availableCount is grace plus comp tokens left', () => {
  expect(availableCount(null)).toBe(0);
  expect(availableCount({ grace: [], left: 0 })).toBe(0);
  expect(availableCount({ grace: [bought('single_a')], left: 0 })).toBe(1);
  expect(availableCount({ grace: [bought('single_a'), bonus('g1')], left: 1 })).toBe(3);
  expect(availableCount({ grace: [bought('single_a')], left: null })).toBe(1);
});

test('singleTokenLine: count, expiry and the waitlist hold', () => {
  expect(singleTokenLine({ grace: [bought('single_a')], left: 0, held: 0 })).toBe('1 session token - good through Sat, Feb 27');
  expect(singleTokenLine({ grace: [bought('single_a'), bought('single_b')], left: 0 })).toBe('2 session tokens - good through Sat, Feb 27');
  expect(singleTokenLine({ grace: [], left: 0, held: 0 })).toBe('No session token');
  expect(singleTokenLine({ grace: [], left: 0, held: 1 })).toBe('No session token · 1 held by a waitlist spot');
  expect(singleTokenLine({ grace: [bought('single_a')], left: 0, held: 1 })).toBe('1 session token - good through Sat, Feb 27 · 1 held by a waitlist spot');
  expect(singleTokenLine({ grace: [], left: 0, held: 2 })).toBe('No session token · 2 held by waitlist spots');
});

test('graceSpendLabel names the token the booking spends', () => {
  expect(graceSpendLabel({ grace: [bought('single_a')] })).toBe('a session token');
  expect(graceSpendLabel({ grace: [bonus('g1'), bought('single_a')] })).toBe('a bonus token');
  expect(graceSpendLabel({ grace: [{ id: 'g2', expiresAt: '2026-11-20' }] })).toBe('a bonus token');
});

test('singleConfirmedLine before and after the Oct 10 gate', () => {
  expect(singleConfirmedLine(true)).toBe('Payment received - your session token is ready to book.');
  expect(singleConfirmedLine(false)).toBe('Payment received - your session token is ready. Booking opens Sat, Oct 10 at 7 AM.');
});

test('packageSwitchWarning only for a move to or from the single token', () => {
  expect(packageSwitchWarning('t-6', 'single')).toMatch(/^Switching to Single token: cancel any monthly subscription in Stripe first/);
  expect(packageSwitchWarning('', 'single')).toMatch(/^Switching to Single token/);
  expect(packageSwitchWarning('single', 't-6')).toMatch(/^Switching off Single token/);
  expect(packageSwitchWarning('single', 'elite')).toMatch(/^Switching off Single token/);
  expect(packageSwitchWarning('single', 'single')).toBeNull();
  expect(packageSwitchWarning('t-6', 't-12')).toBeNull();
  expect(packageSwitchWarning('single', '')).toBeNull();
});
