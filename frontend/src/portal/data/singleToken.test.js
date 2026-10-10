import {
  availableCount,
  BUY_EXTRA_LABEL,
  BUY_SINGLE_LABEL,
  EXTRA_ASK_GUARDIAN_LINE,
  extraConfirmedLine,
  extraSessionLine,
  extraSessionOffer,
  householdOnHold,
  outOfTokens,
  graceSpendLabel,
  heldLine,
  isSingleTokenId,
  ownLoginMayBuy,
  packageSwitchWarning,
  saleOpen,
  SINGLE_ASK_GUARDIAN_LINE,
  SINGLE_EXPIRES,
  SINGLE_EXPIRES_LABEL,
  SINGLE_NOT_OPEN_LINE,
  SINGLE_NOT_OPEN_MESSAGE,
  SINGLE_NOT_OPEN_NOTE,
  SINGLE_EXPIRES_YEAR_LABEL,
  singleConfirmedLine,
  singleTokenLine,
  tokenDayLabel,
} from './singleToken';
import { BOOKING_OPENS_AT, bookingOpen } from './calendar';
import * as packages from './packages';
import { SEASON_BOUNDS } from './season';

const bought = (id) => ({ id, expiresAt: '2027-02-27', reason: 'single-purchase' });
const bonus = (id) => ({ id, expiresAt: '2026-11-20', reason: 'session-cancelled' });

test('the token is good through the season end, Sat, Feb 27', () => {
  expect(SINGLE_EXPIRES).toBe(SEASON_BOUNDS.end);
  expect(SINGLE_EXPIRES).toBe('2027-02-27');
  expect(SINGLE_EXPIRES_LABEL).toBe('Sat, Feb 27');
  expect(tokenDayLabel('2026-11-20')).toBe('Fri, Nov 20');
});

// Owner ruling 2026-10-01: single tokens go on sale when booking opens, by the
// clock - the same gate token-package booking uses, no second date.
test('saleOpen: closed until Sat, Oct 10, 2026 at 7:00 AM Chicago, open from that instant', () => {
  expect(BOOKING_OPENS_AT).toBe(Date.parse('2026-10-10T12:00:00Z')); // 07:00 CDT
  expect(saleOpen(Date.parse('2026-10-01T17:00:00Z'))).toBe(false);
  expect(saleOpen(BOOKING_OPENS_AT - 1)).toBe(false);
  expect(saleOpen(BOOKING_OPENS_AT)).toBe(true);
  expect(saleOpen(new Date(BOOKING_OPENS_AT))).toBe(true);
  expect(saleOpen(Date.parse('2026-11-03T15:00:00Z'))).toBe(true);
  // The booking gate itself, read for a token package (Elite's early booking never opens the sale).
  for (const t of [BOOKING_OPENS_AT - 1, BOOKING_OPENS_AT]) expect(saleOpen(t)).toBe(bookingOpen(t, packages.SINGLE_TOKEN));
  // The constant it replaced is gone: nothing can flip the sale by hand.
  expect(packages).not.toHaveProperty('SINGLE_ON_SALE');
});

test('the not-yet-on-sale copy names the gate', () => {
  expect(SINGLE_NOT_OPEN_NOTE).toBe('Available Sat, Oct 10 at 7 AM. Pick a monthly package now, or come back then.');
  expect(SINGLE_NOT_OPEN_LINE).toBe('Single tokens are available from Sat, Oct 10 at 7 AM.');
  // Word for word what createCheckoutSession answers (functions/portal/checkout.js, reason 'single-not-open').
  expect(SINGLE_NOT_OPEN_MESSAGE).toBe('Single tokens are available from Sat, Oct 10 at 7 AM. Nothing has been charged.');
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

// Owner ruling 2026-10-01 ("not unless the child is 18+"): on an athlete's own
// login the single token's Pay or Buy button is an adult's.
describe('ownLoginMayBuy: who an athlete login offers the $65 button to', () => {
  const today = '2026-10-12';

  test('18 by date of birth: the day before the birthday is still under 18, the birthday itself is not', () => {
    expect(ownLoginMayBuy({ dob: '2008-10-13', todayISO: today })).toBe(false); // 17 years 364 days
    expect(ownLoginMayBuy({ dob: '2008-10-12', todayISO: today })).toBe(true); // exactly 18 today
    expect(ownLoginMayBuy({ dob: '2008-10-11', todayISO: today })).toBe(true);
    expect(ownLoginMayBuy({ dob: '2012-06-17', todayISO: today })).toBe(false);
    expect(ownLoginMayBuy({ dob: '1990-01-01', todayISO: today })).toBe(true);
    // Born Feb 29: 18 on Mar 1 of a year with no Feb 29.
    expect(ownLoginMayBuy({ dob: '2008-02-29', todayISO: '2026-02-28' })).toBe(false);
    expect(ownLoginMayBuy({ dob: '2008-02-29', todayISO: '2026-03-01' })).toBe(true);
  });

  test('the self-managed adult may, whatever is on file', () => {
    expect(ownLoginMayBuy({ selfManaged: true, todayISO: today })).toBe(true); // no dob
    expect(ownLoginMayBuy({ selfManaged: true, dob: null, todayISO: today })).toBe(true);
    expect(ownLoginMayBuy({ selfManaged: true, dob: '2012-06-17', todayISO: today })).toBe(true);
  });

  test('no date of birth on file, or one that is not a date, counts as under 18', () => {
    expect(ownLoginMayBuy({ todayISO: today })).toBe(false);
    expect(ownLoginMayBuy({ selfManaged: false, dob: null, todayISO: today })).toBe(false);
    expect(ownLoginMayBuy({ dob: '', todayISO: today })).toBe(false);
    expect(ownLoginMayBuy({ dob: '06/17/1990', todayISO: today })).toBe(false);
    expect(ownLoginMayBuy({ dob: '1990-01-01' })).toBe(false); // no clock, no claim
    expect(ownLoginMayBuy()).toBe(false);
    // Only the session's own true counts as self-managed.
    expect(ownLoginMayBuy({ selfManaged: 'yes', todayISO: today })).toBe(false);
  });

  test('the line an under-18 athlete reads instead of the button', () => {
    expect(SINGLE_ASK_GUARDIAN_LINE).toBe('Ask a parent or guardian to buy a session token.');
  });
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
  expect(heldLine({ held: 0 })).toBeNull();
  expect(heldLine(null)).toBeNull();
  expect(heldLine({ held: 1 })).toBe('1 held by a waitlist spot');
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

// The extra session at the member rate (owner, 2026-10-10).
describe('the extra session: the line, and when the meter offers it', () => {
  const T = (id) => packages.TOKEN_PACKAGES.find((p) => p.id === id);
  const PAID = { status: 'active', facility: null, subscribed: true };
  // Out of tokens: the only time the offer shows (see 'only once nothing is left').
  const OUT = { granted: 8, used: 8, reserved: 0, left: 0, unlimited: false, grace: [] };
  const member = (pkg, billing = PAID, tokens = OUT) => ({ athleteId: 'ava', package: pkg, billing, tokens });
  const OPEN = BOOKING_OPENS_AT;

  test('the button, the guardian line and the year on the season end', () => {
    expect(BUY_EXTRA_LABEL).toBe('Buy an extra session');
    expect(EXTRA_ASK_GUARDIAN_LINE).toBe('Ask a parent or guardian to buy an extra session.');
    expect(SINGLE_EXPIRES_YEAR_LABEL).toBe('Sat, Feb 27, 2027');
  });

  test('extraSessionLine names the rate and the package, all five', () => {
    expect(['t-4', 't-6', 't-8', 't-12', 't-16'].map((id) => extraSessionLine(T(id)))).toEqual([
      '$54.75 - your 4-token rate. Good through Sat, Feb 27, 2027.',
      '$49.83 - your 6-token rate. Good through Sat, Feb 27, 2027.',
      '$48.63 - your 8-token rate. Good through Sat, Feb 27, 2027.',
      '$47.42 - your 12-token rate. Good through Sat, Feb 27, 2027.',
      '$44.94 - your 16-token rate. Good through Sat, Feb 27, 2027.',
    ]);
    expect(extraSessionLine(packages.ELITE)).toBeNull();
    expect(extraSessionLine(packages.SINGLE_TOKEN)).toBeNull();
    expect(extraSessionLine(null)).toBeNull();
  });

  test('a paid monthly token member, once on sale: the button and its line', () => {
    expect(extraSessionOffer(member(T('t-8')), { now: OPEN })).toEqual({
      state: 'buy',
      line: '$48.63 - your 8-token rate. Good through Sat, Feb 27, 2027.',
    });
  });

  test('never for Elite, the single token or no package', () => {
    for (const pkg of [packages.ELITE, packages.SINGLE_TOKEN, null]) {
      expect(extraSessionOffer(member(pkg), { now: OPEN })).toBeNull();
    }
  });

  test('never unless the billing is a live, paid subscription', () => {
    for (const billing of [
      { status: 'pending', facility: null },
      { status: 'lapsed', facility: null, subscribed: true },
      { status: 'past_due', facility: null, subscribed: true }, // the card is fixed in Stripe first
      { status: 'active', facility: null }, // no subscription on file (a legacy member)
      { status: 'active', facility: null, oneTime: true, subscribed: true },
      null,
    ]) {
      expect(extraSessionOffer(member(T('t-8'), billing), { now: OPEN })).toBeNull();
    }
  });

  test('never while the family is on hold, nor before the sale opens', () => {
    expect(extraSessionOffer(member(T('t-8')), { now: OPEN, onHold: true })).toBeNull();
    expect(extraSessionOffer(member(T('t-8')), { now: OPEN - 1 })).toBeNull();
    expect(householdOnHold({ membership: { status: 'past_due' } })).toBe(true);
    expect(householdOnHold({ membership: { status: 'lapsed' } })).toBe(true);
    expect(householdOnHold({ membership: { status: 'active' } })).toBe(false);
    expect(householdOnHold({ membership: null })).toBe(false);
    expect(householdOnHold(null)).toBe(false);
  });

  test('an under-18 athlete on their own login reads who buys it', () => {
    expect(extraSessionOffer(member(T('t-6')), { now: OPEN, askGuardian: true })).toEqual({
      state: 'ask',
      line: 'Ask a parent or guardian to buy an extra session.',
    });
    // ...and only where the button itself would show.
    expect(extraSessionOffer(member(T('t-6'), { status: 'pending' }), { now: OPEN, askGuardian: true })).toBeNull();
  });

  test("only once nothing is left to book with: a bought extra is spent before the month's own tokens", () => {
    const T8 = T('t-8');
    expect(extraSessionOffer(member(T8, PAID, { ...OUT, left: 1, used: 7 }), { now: OPEN })).toBeNull();
    expect(extraSessionOffer(member(T8, PAID, { ...OUT, left: 8, used: 0 }), { now: OPEN })).toBeNull();
    // A bonus token, or an extra already bought, is something to book with.
    const bought = { id: 'single_cs_1', expiresAt: '2027-02-27', reason: 'single-purchase' };
    expect(extraSessionOffer(member(T8, PAID, { ...OUT, grace: [bought] }), { now: OPEN })).toBeNull();
    // Every token held by a waitlist spot: nothing left to book with.
    expect(extraSessionOffer(member(T8, PAID, { ...OUT, used: 6, reserved: 2 }), { now: OPEN })?.state).toBe('buy');
    // No position at all: nothing offered.
    expect(extraSessionOffer(member(T8, PAID, null), { now: OPEN })).toBeNull();
    // The guardian line follows the same rule.
    expect(extraSessionOffer(member(T8, PAID, { ...OUT, left: 3 }), { now: OPEN, askGuardian: true })).toBeNull();
  });

  test('outOfTokens: a monthly position with no period or grace token left', () => {
    expect(outOfTokens(OUT)).toBe(true);
    expect(outOfTokens({ ...OUT, left: 1 })).toBe(false);
    expect(outOfTokens({ ...OUT, grace: [{ id: 'g1', expiresAt: '2026-11-20', reason: 'session-cancelled' }] })).toBe(false);
    expect(outOfTokens({ ...OUT, unpaid: true })).toBe(false);
    expect(outOfTokens({ unlimited: true, grace: [] })).toBe(false);
    expect(outOfTokens({ ...OUT, perPurchase: true })).toBe(false);
    expect(outOfTokens({ ...OUT, left: undefined })).toBe(false);
    expect(outOfTokens(null)).toBe(false);
  });

  test('the return line names the extra session token and its expiry', () => {
    expect(extraConfirmedLine(true)).toBe('Payment received - your extra session token is ready to book, good through Sat, Feb 27.');
    expect(extraConfirmedLine(false)).toBe('Payment received - your extra session token is ready. Booking opens Sat, Oct 10 at 7 AM.');
  });
});
