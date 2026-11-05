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
  // A row from before 2026-11-04: no time kept, nothing held.
  expect(unresolvedLabel({ id: 'ev-1', outcome: 'unresolved', receivedAt: '2026-11-05T10:00' })).toBe('session time not kept, not held: see Calendly · booked Thursday, Nov 5');
  // 2026-11-04: the ledger's invitee + slot. Review 2026-11-04: booked on one day for a session on another, both
  // labelled, and the reason in plain words.
  expect(unresolvedLabel({
    id: 'ev-2', outcome: 'unresolved', receivedAt: '2026-10-20T09:15', reason: 'no-login',
    invitee: { name: 'Jo Schinka', email: 'jo@example.com', athleteName: 'Addie Schinka', parentEmail: null },
    slot: { date: '2026-11-05', time: '7:00 PM', durationMinutes: 45 },
  })).toBe('Addie Schinka · session Thursday, Nov 5 7:00 PM, 45 min · booked Tuesday, Oct 20 by Jo Schinka, jo@example.com · no account with this email');
  // Review 2026-11-04: the length and the Calendly event name tell the 1:1 from another of Yannick's event types.
  expect(unresolvedLabel({
    id: 'ev-4', outcome: 'unresolved', receivedAt: '2026-11-04T10:00', reason: 'no-login', eventName: 'RYP Academy - Mental Game 1:1',
    invitee: { name: 'Jo Schinka', email: 'jo@example.com', athleteName: 'Addie Schinka', parentEmail: null },
    slot: { date: '2026-11-05', time: '7:00 PM', durationMinutes: 30 },
  })).toBe('Addie Schinka · session Thursday, Nov 5 7:00 PM, 30 min (RYP Academy - Mental Game 1:1) · booked Wednesday, Nov 4 by Jo Schinka, jo@example.com · no account with this email');
  // The athlete booked under their own name: no repeated name.
  const addie = (reason) => unresolvedLabel({
    id: 'ev-3', outcome: 'unresolved', receivedAt: '2026-11-02T10:00', reason,
    invitee: { name: 'Addie Schinka', email: 'addie@example.com', athleteName: 'Addie Schinka', parentEmail: null },
    slot: { date: '2026-11-05', time: '7:00 PM', durationMinutes: 45 },
  });
  expect(addie(null)).toBe('Addie Schinka · session Thursday, Nov 5 7:00 PM, 45 min · booked Monday, Nov 2 by addie@example.com');
  expect(addie('ambiguous-household')).toBe('Addie Schinka · session Thursday, Nov 5 7:00 PM, 45 min · booked Monday, Nov 2 by addie@example.com · family found, but not which athlete');
  expect(addie('no-athlete').endsWith(' · family found, but it has no athletes')).toBe(true);
  expect(addie('utm-not-owned').endsWith(" · booked from an athlete's link this email is not linked to")).toBe(true);
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
