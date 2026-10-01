import {
  athleteLine, facilityAccessLabel, filterSignupRows, flagLabel, flaggedCount, loginLabel, paymentLabel, signedUpLabel, unresolvedLabel,
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
  // The add-on is the family's (owner ruling 2026-09-30); it shows on the athlete it bills on.
  expect(paymentLabel({ ...a, billing: 'active', facility: 'active' })).toBe('Paid · family facility active');
  expect(loginLabel(a)).toBe('Login: invited 7+ days ago (j@email.com)');
  expect(loginLabel({ ...a, login: 'none', loginEmail: null })).toBe('Login: none');
  expect(loginLabel({ ...a, login: 'claimed', loginClaimedAt: '2026-10-02T09:00' })).toMatch(/^Login: claimed .*Oct/);
  expect(flagLabel({ kind: 'booking', id: 'b1', flag: 'over-cap', date: '2026-11-05' })).toBe('Booking over-cap · 2026-11-05');
  expect(flagLabel({ kind: 'calendly', id: 'c1', outcome: 'unresolved', receivedAt: '2026-11-05T10:00' })).toBe('Calendly unresolved · 2026-11-05');
  expect(flagLabel({ kind: 'duplicate', id: 'k1~dad', athleteName: 'Riley Lee', otherHouseholdId: 'dad' })).toBe('Possible duplicate: Riley Lee is also in another family (dad)');
  expect(signedUpLabel('2026-10-01T14:05')).toMatch(/Oct/);
  expect(signedUpLabel(null)).toBe('—');
});
test("facility access is the family's: one line for every athlete of a covered household, with the source (review 2026-09-30)", () => {
  const a = (athleteId, packageId, billing, facility = null) => ({ athleteId, packageId, billing, facility });
  expect(facilityAccessLabel({ athletes: [a('a', 't-6', 'active', 'active'), a('b', 't-12', 'pending')] })).toBe('Facility access: family add-on');
  expect(facilityAccessLabel({ athletes: [a('e', 'elite', 'past_due'), a('b', 't-6', 'pending')] })).toBe('Facility access: Elite');
  // The adult who signed up for themselves is their own household.
  expect(facilityAccessLabel({ mode: 'athlete', athletes: [a('a', 't-6', 'active', 'past_due')] })).toBe('Facility access: add-on');
  // Elite not paid yet, an add-on that ended, or nothing to read: no line.
  expect(facilityAccessLabel({ athletes: [a('e', 'elite', 'pending'), a('b', 't-6', 'active', 'lapsed')] })).toBeNull();
  expect(facilityAccessLabel({ athletes: [a('b', 't-6', 'active')] })).toBeNull();
  expect(facilityAccessLabel({ athletes: [] })).toBeNull();
  expect(facilityAccessLabel(null)).toBeNull();
});
