import {
  athleteLine, filterSignupRows, flagLabel, flaggedCount, loginLabel, paymentLabel, signedUpLabel, unresolvedLabel,
} from './signupsReport';

const rows = [{ householdId: 'h1', unpaid: true, flagged: false }, { householdId: 'h2', unpaid: false, flagged: true }, { householdId: 'h3', unpaid: false, flagged: false }];
test('filters', () => {
  expect(filterSignupRows(rows, 'all').map((r) => r.householdId)).toEqual(['h1', 'h2', 'h3']);
  expect(filterSignupRows(rows, 'unpaid').map((r) => r.householdId)).toEqual(['h1']);
  expect(filterSignupRows(rows, 'flagged').map((r) => r.householdId)).toEqual(['h2']);
});
test('the Flagged count folds in unmatched Calendly bookings (D16)', () => {
  expect(flaggedCount({ all: 3, unpaid: 1, flagged: 1, unresolved: 2 })).toBe(3);
  expect(flaggedCount({ all: 3, unpaid: 1, flagged: 1 })).toBe(1);
  expect(flaggedCount(null)).toBe(0);
  expect(unresolvedLabel({ id: 'ev-1', outcome: 'unresolved', receivedAt: '2026-11-05T10:00' })).toBe('Calendly unresolved · 2026-11-05');
});
test('row lines (spec 7)', () => {
  const a = { name: 'Jordan', age: 14, packageName: '12 tokens', handicap: 12, billing: 'pending', facility: null, login: 'invited-stale', loginEmail: 'j@email.com', loginClaimedAt: null };
  expect(athleteLine(a)).toBe('Jordan · 14 · 12 tokens · hcp 12');
  expect(athleteLine({ ...a, age: null, handicap: null, packageName: null })).toBe('Jordan · no package · no handicap');
  expect(paymentLabel(a)).toBe('Payment pending');
  expect(paymentLabel({ ...a, billing: 'active', facility: 'active' })).toBe('Paid · facility active');
  expect(loginLabel(a)).toBe('Login: invited 7+ days ago (j@email.com)');
  expect(loginLabel({ ...a, login: 'none', loginEmail: null })).toBe('Login: none');
  expect(loginLabel({ ...a, login: 'claimed', loginClaimedAt: '2026-10-02T09:00' })).toMatch(/^Login: claimed .*Oct/);
  expect(flagLabel({ kind: 'booking', id: 'b1', flag: 'over-cap', date: '2026-11-05' })).toBe('Booking over-cap · 2026-11-05');
  expect(flagLabel({ kind: 'calendly', id: 'c1', outcome: 'unresolved', receivedAt: '2026-11-05T10:00' })).toBe('Calendly unresolved · 2026-11-05');
  expect(flagLabel({ kind: 'duplicate', id: 'k1~dad', athleteName: 'Riley Lee', otherHouseholdId: 'dad' })).toBe('Possible duplicate: Riley Lee is also in another family (dad)');
  expect(signedUpLabel('2026-10-01T14:05')).toMatch(/Oct/);
  expect(signedUpLabel(null)).toBe('—');
});
