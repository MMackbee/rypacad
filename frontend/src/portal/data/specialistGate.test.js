import { attendeeContact, calendlyBlockReason, calendlyReach } from './specialistGate';

const ok = { billingStatus: 'active', bookingOpen: true, tokens: { left: 2, unlimited: false, grace: [] }, capReached: false };
test('gate order: billing, open, cadence, tokens (spec 6.1)', () => {
  expect(calendlyBlockReason(ok)).toBeNull();
  expect(calendlyBlockReason({ ...ok, billingStatus: 'pending' })).toBe('billing-pending');
  expect(calendlyBlockReason({ ...ok, billingStatus: 'past_due' })).toBe('membership-inactive');
  expect(calendlyBlockReason({ ...ok, billingStatus: undefined })).toBeNull();
  expect(calendlyBlockReason({ ...ok, bookingOpen: false })).toBe('booking-not-open');
  expect(calendlyBlockReason({ ...ok, capReached: true })).toBe('cap-reached');
  expect(calendlyBlockReason({ ...ok, tokens: { left: 0, unlimited: false, grace: [] } })).toBe('no-tokens-left');
  expect(calendlyBlockReason({ ...ok, tokens: { left: 0, unlimited: false, grace: [{ id: 'g' }] } })).toBeNull();
  expect(calendlyBlockReason({ ...ok, tokens: { left: null, unlimited: true, grace: [] } })).toBeNull();
});
test('this period spent but the next one open (incident 2026-11-01): no block; both spent: the token block as before', () => {
  const base = { billingStatus: 'active', bookingOpen: true, capReached: false };
  const spent = { left: 0, unlimited: false, perPurchase: false, grace: [] };
  expect(calendlyBlockReason({ ...base, tokens: { ...spent, nextPeriod: { periodKey: '2026-12-01', granted: 8, booked: 1, used: 1, reserved: 0, left: 7 } } })).toBeNull();
  expect(calendlyBlockReason({ ...base, tokens: { ...spent, nextPeriod: { periodKey: '2026-12-01', granted: 8, booked: 8, used: 8, reserved: 0, left: 0 } } })).toBe('no-tokens-left');
  expect(calendlyBlockReason({ ...base, tokens: { ...spent, nextPeriod: { periodKey: '2026-12-01', booked: 0 } } })).toBe('no-tokens-left'); // an older shape without a count
  expect(calendlyBlockReason({ ...base, tokens: { ...spent, perPurchase: true, nextPeriod: { periodKey: '2026-12-01', granted: 0, left: 0 } } })).toBe('no-session-token');
  // The earlier gates still win over an open next period.
  expect(calendlyBlockReason({ ...base, capReached: true, tokens: { ...spent, nextPeriod: { periodKey: '2026-12-01', granted: 8, left: 7 } } })).toBe('cap-reached');
});

test('a single-token athlete with none left is told to buy one (ruling 2026-09-29/30)', () => {
  const none = { left: 0, unlimited: false, grace: [], perPurchase: true };
  expect(calendlyBlockReason({ ...ok, tokens: none })).toBe('no-session-token');
  expect(calendlyBlockReason({ ...ok, tokens: { ...none, grace: [{ id: 'single_cs_1', reason: 'single-purchase' }] } })).toBeNull();
  expect(calendlyBlockReason({ ...ok, tokens: { ...none, left: 1 } })).toBeNull(); // an ops comp
  expect(calendlyBlockReason({ ...ok, billingStatus: 'pending', tokens: none })).toBe('billing-pending');
});
test("the attendee's own name and email go to Calendly", () => {
  const athlete = { id: 'a1', name: 'Jordan', loginEmail: null };
  const guardian = { name: 'Dana', email: 'dana@email.com' };
  expect(attendeeContact({ attendee: 'parent', athlete, guardian })).toEqual({ name: 'Dana', email: 'dana@email.com' });
  expect(attendeeContact({ attendee: 'athlete', athlete, guardian })).toEqual({ name: 'Jordan', email: 'dana@email.com' });
  expect(attendeeContact({ attendee: 'athlete', athlete: { ...athlete, loginEmail: 'j@email.com' }, guardian })).toEqual({ name: 'Jordan', email: 'j@email.com' });
});

// Review 2026-11-04 (round 2): the next period is bookable from 7 AM Chicago
// on the 1st (AllowancePools nextPeriodOpen), not from midnight - before then
// the button sent a December-spent family to a January Calendly could not
// charge.
describe('the next period opens at 7 AM Chicago on the 1st', () => {
  const base = { billingStatus: 'active', bookingOpen: true, capReached: false };
  const jan = { periodKey: '2027-01-01', periodEnd: '2027-01-31', granted: 6, booked: 0, reserved: 0, left: 6 };
  const decSpent = { left: 0, unlimited: false, perPurchase: false, grace: [], nextPeriod: jan };
  test('December spent, January counted: closed from midnight to 6:59, open from 7:00', () => {
    expect(calendlyBlockReason({ ...base, tokens: decSpent, now: new Date('2026-12-01T06:00:00Z') })).toBe('next-period-not-open');
    expect(calendlyBlockReason({ ...base, tokens: decSpent, now: new Date('2026-12-01T12:59:00Z') })).toBe('next-period-not-open');
    expect(calendlyBlockReason({ ...base, tokens: decSpent, now: new Date('2026-12-01T13:00:00Z') })).toBeNull();
    // January spent too: the plain token block, at any hour.
    const both = { ...decSpent, nextPeriod: { ...jan, booked: 6, left: 0 } };
    expect(calendlyBlockReason({ ...base, tokens: both, now: new Date('2026-12-01T12:59:00Z') })).toBe('no-tokens-left');
    expect(calendlyBlockReason({ ...base, tokens: both, now: new Date('2026-12-01T13:00:00Z') })).toBe('no-tokens-left');
  });
});

// Review 2026-11-04 (round 2): Calendly takes any date, so the button stood
// for a later month whose cap was free without asking whether that month had
// tokens, or was in the season at all ("Pick a time in March" in February).
describe("where a Calendly time can go: each day's month cap and its own tokens, inside the season", () => {
  const day = (date) => ({ date, slots: [] });
  const capBooked = (...months) => (date) => months.includes(date.slice(0, 7));
  const never = () => false;

  test('November booked, December free with tokens: the first December day', () => {
    const days = [day('2026-11-04'), day('2026-11-30'), day('2026-12-01'), day('2026-12-31')];
    const reach = calendlyReach(days, { capReachedOn: capBooked('2026-11'), tokensSpentOn: never });
    expect(reach.openDay.date).toBe('2026-12-01');
    expect(reach.capOpenDay.date).toBe('2026-12-01');
    expect(reach.capMonths).toEqual(['2026-11']);
  });

  test("November booked, December's tokens spent: nothing open; December is the first month whose cap is free", () => {
    const days = [day('2026-11-04'), day('2026-12-01'), day('2026-12-31')];
    const reach = calendlyReach(days, { capReachedOn: capBooked('2026-11'), tokensSpentOn: (d) => d >= '2026-12-01' });
    expect(reach.openDay).toBeNull();
    expect(reach.capOpenDay.date).toBe('2026-12-01');
  });

  test('February booked: March is past the season (Feb 27) and never offered', () => {
    const days = [day('2027-02-10'), day('2027-02-27'), day('2027-02-28'), day('2027-03-01'), day('2027-03-31')];
    const reach = calendlyReach(days, { capReachedOn: capBooked('2027-02'), tokensSpentOn: never });
    expect(reach.openDay).toBeNull();
    expect(reach.capOpenDay).toBeNull();
    expect(reach.capMonths).toEqual(['2027-02']);
  });

  test('no days in hand: no reach, and the gate judges today alone', () => {
    expect(calendlyReach([], { capReachedOn: never, tokensSpentOn: never })).toBeNull();
    expect(calendlyReach(undefined, { capReachedOn: never, tokensSpentOn: never })).toBeNull();
  });
});

describe('the gate over a reach', () => {
  // Today's own flag (capReached) is the fallback without days; a reach decides.
  const base = { billingStatus: 'active', bookingOpen: true, capReached: true, now: new Date('2026-11-04T16:00:00Z') };
  const dec = { periodKey: '2026-12-01', periodEnd: '2026-12-31', granted: 8, booked: 8, reserved: 0, left: 0 };
  const tokens = { left: 3, unlimited: false, perPurchase: false, grace: [], nextPeriod: dec };

  test("an open day keeps the button; with every month's cap booked, the cap", () => {
    expect(calendlyBlockReason({ ...base, tokens, reach: { openDay: { date: '2026-12-01' }, capOpenDay: { date: '2026-12-01' }, capMonths: ['2026-11'] } })).toBeNull();
    expect(calendlyBlockReason({ ...base, tokens, reach: { openDay: null, capOpenDay: null, capMonths: ['2026-11', '2026-12'] } })).toBe('cap-reached');
  });

  test("November's cap booked and December's tokens spent: the later period's tokens close it", () => {
    expect(calendlyBlockReason({ ...base, tokens, reach: { openDay: null, capOpenDay: { date: '2026-12-01' }, capMonths: ['2026-11'] } })).toBe('next-period-spent');
  });

  test("this period spent where the cap is free: this period's own token reasons", () => {
    const spent = { ...tokens, left: 0, nextPeriod: { ...dec, booked: 0, left: 8 } };
    // December counted and open, but its cap is booked: no time to pick.
    const reach = { openDay: null, capOpenDay: { date: '2026-11-04' }, capMonths: ['2026-12'] };
    expect(calendlyBlockReason({ ...base, tokens: spent, reach })).toBe('no-tokens-left');
    expect(calendlyBlockReason({ ...base, tokens: { ...spent, perPurchase: true }, reach })).toBe('no-session-token');
  });

  test('billing and the Oct 10 gate still come first', () => {
    const reach = { openDay: { date: '2026-12-01' }, capOpenDay: { date: '2026-12-01' }, capMonths: [] };
    expect(calendlyBlockReason({ ...base, tokens, reach, billingStatus: 'pending' })).toBe('billing-pending');
    expect(calendlyBlockReason({ ...base, tokens, reach, bookingOpen: false })).toBe('booking-not-open');
  });
});
