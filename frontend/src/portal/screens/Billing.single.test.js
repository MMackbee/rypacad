import React from 'react';
import { renderScreen } from './testRender';
import Billing from './Billing';
import { hubMemberFor, statusFor } from '../data/billingHub';
import { BOOKING_OPENS_AT } from '../data/calendar';
import { SINGLE_TOKEN, TOKEN_PACKAGES } from '../data/packages';
import { color } from '../tokens';

/**
 * Owner ruling 2026-10-01 ("drop one"): a single-token athlete whose payment
 * is pending sees ONE purchase button on Billing - the hero's Pay now - and
 * a paid-up one sees the meter's Buy. Rendered with the real TokenMeter over
 * real hub members and the real hero status (Billing.test.js mocks the meter).
 */

let mockHub;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label, variant }) => <button type="button" data-variant={variant}>{label}|{athleteId}|{product}</button> }));
jest.mock('../hooks/billing', () => ({ __esModule: true, default: () => mockHub, useBillingHub: () => mockHub, usePaymentConfirmation: () => ({ state: 'idle' }), STRIPE_PORTAL_URL: null }));

const BUY = 'Buy a session token - $65';
const WHEN = 'Single tokens are available from Sat, Oct 10 at 7 AM.';
const ASK = 'Ask a parent or guardian to buy a session token.';
const today = '2026-11-16';
const T12 = TOKEN_PACKAGES.find((p) => p.id === 't-12');
const T6 = TOKEN_PACKAGES.find((p) => p.id === 't-6');

// A child's record (dob 2012): a parent's Billing never reads the age.
const member = (id, name, status, pkg = SINGLE_TOKEN) =>
  hubMemberFor({ athlete: { id, name, dob: '2012-06-17', packageId: pkg.id, billing: { status } }, pkg, anchorDay: 1, today, bookings: [], waitlist: [], graceTokens: [] });
// The rows hooks/billing.js pendingOf lists (that module is mocked here).
const pendingRows = (members) =>
  members
    .filter((m) => m.billing.status === 'pending' || m.billing.status === 'lapsed')
    .map((m) => ({ athleteId: m.athleteId, name: m.name, status: m.billing.status, perPurchase: m.package.kind === 'single', packageId: m.package.id }));
const hubOf = (members) => ({
  loading: false,
  error: null,
  data: {
    household: { id: 'h1', name: 'Whitfield family', anchorDay: 1, membership: null, stripeCustomerId: null },
    portalUrl: null,
    members,
    status: statusFor(null, { anchorDay: 1, pendingAthletes: pendingRows(members), allPerPurchase: members.every((m) => m.package.kind === 'single') }),
  },
});
/** Every checkout button for one athlete's package: the mocked PayButton prints label|athleteId|product. */
const purchaseButtons = (r, id) => [...r.container.querySelectorAll('button')].map((b) => b.textContent).filter((t) => t.endsWith(`|${id}|tier`));

// On sale: the booking-open gate has passed.
beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(BOOKING_OPENS_AT); });
afterEach(() => { jest.restoreAllMocks(); });

test('a pending single athlete has exactly one purchase button: the hero\'s Pay now', async () => {
  for (const status of ['pending', 'lapsed']) {
    mockHub = hubOf([member('ava', 'Ava', status)]);
    const r = await renderScreen(<Billing bare />);
    expect(purchaseButtons(r, 'ava')).toEqual(['Pay now|ava|tier']);
    expect(r.text()).not.toContain(BUY);
    expect(r.text()).not.toContain(WHEN);
    await r.unmount();
  }
});

test('a paid-up single athlete has the meter\'s Buy, and no Pay now', async () => {
  mockHub = hubOf([member('ava', 'Ava', 'active')]);
  const r = await renderScreen(<Billing bare />);
  expect(purchaseButtons(r, 'ava')).toEqual([`${BUY}|ava|tier`]);
  expect(r.text()).not.toContain('Pay now');
  // The parent's view never reads the child's age.
  expect(r.text()).not.toContain(ASK);
  await r.unmount();
});

test('siblings on the single token: the paid-up one buys from the meter, the pending one pays from the hero', async () => {
  mockHub = hubOf([member('ava', 'Ava', 'active'), member('ben', 'Ben', 'pending')]);
  const r = await renderScreen(<Billing bare />);
  expect(purchaseButtons(r, 'ava')).toEqual([`${BUY}|ava|tier`]);
  expect(purchaseButtons(r, 'ben')).toEqual(['Pay now|ben|tier']);
  await r.unmount();
});

test('the self-managed adult\'s own hub: the same one button either way', async () => {
  mockHub = hubOf([member('sam', 'Sam', 'pending')]);
  const pending = await renderScreen(<Billing bare role="athlete" />);
  expect(purchaseButtons(pending, 'sam')).toEqual(['Pay now|sam|tier']);
  expect(pending.text()).not.toContain(ASK);
  await pending.unmount();
  mockHub = hubOf([member('sam', 'Sam', 'active')]);
  const paid = await renderScreen(<Billing bare role="athlete" />);
  expect(purchaseButtons(paid, 'sam')).toEqual([`${BUY}|sam|tier`]);
  expect(paid.text()).not.toContain(ASK);
  await paid.unmount();
});

test('before the gate a pending single athlete has no button, and reads when exactly once', async () => {
  Date.now.mockReturnValue(BOOKING_OPENS_AT - 1);
  mockHub = hubOf([member('ava', 'Ava', 'pending')]);
  const r = await renderScreen(<Billing bare />);
  expect(purchaseButtons(r, 'ava')).toEqual([]);
  expect(r.text().split(WHEN)).toHaveLength(2); // the hero, not the meter too
  await r.unmount();
});

test('the staff view never pays, whatever the athlete owes', async () => {
  mockHub = hubOf([member('ava', 'Ava', 'active'), member('ben', 'Ben', 'pending')]);
  const r = await renderScreen(<Billing bare staff role="owner" householdId="h1" />);
  expect(purchaseButtons(r, 'ava')).toEqual([]);
  expect(purchaseButtons(r, 'ben')).toEqual([]);
  await r.unmount();
});

test('a pending monthly athlete is unchanged: the hero\'s Pay now, and a meter that reads Pay to start', async () => {
  mockHub = hubOf([member('ava', 'Ava', 'pending', T12)]);
  const r = await renderScreen(<Billing bare />);
  expect(purchaseButtons(r, 'ava')).toEqual(['Pay now|ava|tier']);
  expect(r.text()).toContain('Pay to start');
  expect(r.text()).not.toContain(BUY);
  await r.unmount();
});

// The extra token at the member rate (owner, 2026-10-10), on the Billing
// hub at ANY time (owner 2026-11-11: "lets just put a add tokens button on
// the billing page"): every paid monthly token member's meter carries Add a
// token, whatever is left this period or next, in place of the conditional
// Buy an extra session - one button there, never two. A bought token is
// spent before the month's own (pin E), so the note says so.
describe('a paid monthly member: Add a token, at any time', () => {
  const ADD = 'Add a token';
  const OLD = 'Buy an extra session';
  const NOTE = 'An added token is spent on the next booking, before monthly tokens.';
  const RATE12 = '$47.42 - your 12-token rate. Good through Sat, Feb 27, 2027.';
  // `used` of the period's tokens booked, and `nextUsed` of December's; all by default.
  // `graceTokens` on file: a bonus, or a token already added.
  const paidMember = (id, name, pkg = T12, used = pkg.tokens, nextUsed = pkg.tokens, nextGrace = 0, graceTokens = []) =>
    hubMemberFor({
      athlete: { id, name, dob: '2012-06-17', packageId: pkg.id, billing: { status: 'active', subscriptionId: `sub_${id}` } },
      pkg, anchorDay: 1, today, waitlist: [], graceTokens,
      bookings: [
        ...Array.from({ length: used }, (_, i) => ({ id: `${id}_b${i}`, athleteId: id, status: 'confirmed', periodKey: '2026-11-01', date: '2026-11-20', sessionId: `s-${i}`, type: 'training' })),
        ...Array.from({ length: nextUsed }, (_, i) => ({ id: `${id}_n${i}`, athleteId: id, status: 'confirmed', periodKey: '2026-12-01', date: '2026-12-04', sessionId: `d-${i}`, type: 'training' })),
        // Paid with a bonus token: booked in December, no December token spent.
        ...Array.from({ length: nextGrace }, (_, i) => ({ id: `${id}_g${i}`, athleteId: id, status: 'confirmed', periodKey: '2026-12-01', date: '2026-12-06', sessionId: `g-${i}`, graceTokenId: `${id}_g${i}`, type: 'training' })),
      ],
    });
  const extraButtons = (r, id) => [...r.container.querySelectorAll('button')].map((b) => b.textContent).filter((t) => t.endsWith(`|${id}|extra`));
  const withMembership = (hub, membership) => ({ ...hub, data: { ...hub.data, household: { ...hub.data.household, membership }, status: statusFor(membership, { anchorDay: 1 }) } });

  /** The button, the rate line and the note, each exactly once on a one-member page. */
  const expectAddToken = (r, id, rate = RATE12) => {
    expect(extraButtons(r, id)).toEqual([`${ADD}|${id}|extra`]);
    expect(r.text().split(rate)).toHaveLength(2);
    expect(r.text().split(NOTE)).toHaveLength(2);
    expect(r.text()).not.toContain(OLD);
  };

  test('out of tokens, the meter offers it at the 12-token rate, and nothing else to pay', async () => {
    mockHub = hubOf([paidMember('ava', 'Ava')]);
    const r = await renderScreen(<Billing bare />);
    expectAddToken(r, 'ava');
    expect(purchaseButtons(r, 'ava')).toEqual([]);
    expect(r.text()).not.toContain('Ask a parent or guardian');
    await r.unmount();
  });

  test('while tokens are left this period', async () => {
    mockHub = hubOf([paidMember('ava', 'Ava', T12, 11)]);
    const r = await renderScreen(<Billing bare />);
    expectAddToken(r, 'ava');
    await r.unmount();
  });

  test('while December has tokens: the meter names December, and the button stays', async () => {
    mockHub = hubOf([paidMember('ava', 'Ava', T12, 12, 2)]);
    const r = await renderScreen(<Billing bare />);
    expectAddToken(r, 'ava');
    expect(r.text()).toContain('December: 10 of 12 left');
    await r.unmount();
  });

  test('the phoned-in shape - the 6-token period all used, December untouched: the button', async () => {
    mockHub = hubOf([paidMember('ava', 'Ava', T6, 6, 0)]);
    const r = await renderScreen(<Billing bare />);
    expect(r.text()).toContain('0of 6 left');
    expect(r.text()).toContain('December: 6 of 6 left');
    expectAddToken(r, 'ava', '$49.83 - your 6-token rate. Good through Sat, Feb 27, 2027.');
    await r.unmount();
  });

  test('a fresh period with nothing booked: the button all the same', async () => {
    mockHub = hubOf([paidMember('ava', 'Ava', T12, 0, 0)]);
    const r = await renderScreen(<Billing bare />);
    expect(r.text()).toContain('12of 12 left');
    expectAddToken(r, 'ava');
    await r.unmount();
  });

  test('no Buy an extra session label anywhere on Billing, and one button per meter, whatever is left', async () => {
    for (const [used, nextUsed] of [[12, 12], [11, 12], [12, 2], [12, 0], [0, 0]]) {
      mockHub = hubOf([paidMember('ava', 'Ava', T12, used, nextUsed), paidMember('ben', 'Ben', T6, 6, 0)]);
      const r = await renderScreen(<Billing bare />);
      expect(r.text()).not.toContain(OLD);
      expect(extraButtons(r, 'ava')).toEqual([`${ADD}|ava|extra`]);
      expect(extraButtons(r, 'ben')).toEqual([`${ADD}|ben|extra`]);
      expect(r.text().split(NOTE)).toHaveLength(3);
      await r.unmount();
    }
  });

  test('a December booking paid with a bonus token spends no December token: the count reads the period spend (review 2026-11-04)', async () => {
    mockHub = hubOf([paidMember('ava', 'Ava', T12, 12, 11, 1)]);
    const r = await renderScreen(<Billing bare />);
    expectAddToken(r, 'ava');
    expect(r.text()).toContain('December: 1 of 12 left');
    // The open evidence beneath it adds up to the same count.
    expect(r.text()).toContain('12 tokens · 11 already booked · 1 on a bonus token');
    await r.unmount();
  });

  test('a family with a failing card or a lapsed membership is offered none, tokens left or not', async () => {
    for (const status of ['past_due', 'lapsed']) {
      for (const used of [12, 3]) {
        mockHub = withMembership(hubOf([paidMember('ava', 'Ava', T12, used)]), { status });
        const r = await renderScreen(<Billing bare />);
        expect(extraButtons(r, 'ava')).toEqual([]);
        expect(r.text()).not.toContain(NOTE);
        expect(r.text()).not.toContain(OLD);
        await r.unmount();
      }
    }
  });

  test('siblings: the paid member has it, the pending one pays from the hero, the staff view never', async () => {
    mockHub = hubOf([paidMember('ava', 'Ava', T12, 4), member('ben', 'Ben', 'pending', T12)]);
    const r = await renderScreen(<Billing bare />);
    expect(extraButtons(r, 'ava')).toEqual([`${ADD}|ava|extra`]);
    expect(extraButtons(r, 'ben')).toEqual([]);
    expect(purchaseButtons(r, 'ben')).toEqual(['Pay now|ben|tier']);
    expect(r.text().split(NOTE)).toHaveLength(2);
    await r.unmount();
    const staff = await renderScreen(<Billing bare staff role="owner" householdId="h1" />);
    expect(extraButtons(staff, 'ava')).toEqual([]);
    expect(staff.text()).not.toContain(NOTE);
    expect(staff.text()).not.toContain(RATE12);
    await staff.unmount();
  });

  test('the self-managed adult\'s own hub offers it too, whatever is left', async () => {
    for (const used of [12, 5]) {
      mockHub = hubOf([paidMember('sam', 'Sam', T12, used)]);
      const r = await renderScreen(<Billing bare role="athlete" />);
      expectAddToken(r, 'sam');
      expect(r.text()).not.toContain('Ask a parent or guardian');
      await r.unmount();
    }
  });

  test('before the sale opens, none', async () => {
    Date.now.mockReturnValue(BOOKING_OPENS_AT - 1);
    mockHub = hubOf([paidMember('ava', 'Ava', T12, 3)]);
    const r = await renderScreen(<Billing bare />);
    expect(extraButtons(r, 'ava')).toEqual([]);
    expect(r.text()).not.toContain(NOTE);
    await r.unmount();
  });

  // Review 2026-11-11: the meter after a purchase, and the button's weight.
  // jsdom drops the size from the `font` shorthand, so the big number is the
  // first toned span that is only digits; it reads a hex color back as rgb().
  const bigNumber = (r) => [...r.container.querySelectorAll('span')].find((el) => el.style.color && /^[0-9]+$/.test(el.textContent));
  const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  const variants = (r, id) => [...r.container.querySelectorAll('button')].filter((b) => b.textContent.endsWith(`|${id}|extra`)).map((b) => b.dataset.variant);
  const added = (id) => ({ id, expiresAt: '2027-02-27', reason: 'single-purchase' });
  // A staff Cancel session mints a bonus good for 30 days: it expires first, so it is spent first.
  const cancelled = { id: 'bonus_1', expiresAt: '2026-11-30', reason: 'session-cancelled', sourceSessionId: '2026-11-12-0' };

  test('a token added beside a sooner bonus is named on its own line, and counted', async () => {
    mockHub = hubOf([paidMember('ava', 'Ava', T6, 2, 0, 0, [cancelled, added('single_cs_1')])]);
    const r = await renderScreen(<Billing bare />);
    expect(r.text()).toContain('4of 6 left');
    expect(r.text()).toContain('block was cancelled');
    expect(r.text()).toContain('Session token - good through Sat, Feb 27');
    await r.unmount();
    // A second one: the line counts both.
    mockHub = hubOf([paidMember('ava', 'Ava', T6, 2, 0, 0, [cancelled, added('single_cs_1'), added('single_cs_2')])]);
    const two = await renderScreen(<Billing bare />);
    expect(two.text()).toContain('block was cancelled');
    expect(two.text()).toContain('2 session tokens - good through Sat, Feb 27');
    expect(two.text()).not.toContain('Session token - good through');
    await two.unmount();
  });

  test('the phoned-in shape after the purchase: the zero stays amber, a token is in hand', async () => {
    mockHub = hubOf([paidMember('ava', 'Ava', T6, 6, 0)]);
    const before = await renderScreen(<Billing bare />);
    expect(bigNumber(before).style.color).toBe(rgb(color.secondary));
    await before.unmount();
    mockHub = hubOf([paidMember('ava', 'Ava', T6, 6, 0, 0, [added('single_cs_1')])]);
    const after = await renderScreen(<Billing bare />);
    expect(after.text()).toContain('0of 6 left');
    expect(after.text()).toContain('Session token - good through Sat, Feb 27');
    expect(after.text()).toContain('December: 6 of 6 left');
    expect(bigNumber(after).style.color).toBe(rgb(color.secondary));
    await after.unmount();
    // December spent too: amber with a token in hand, the red stop with none.
    mockHub = hubOf([paidMember('ava', 'Ava', T6, 6, 6, 0, [added('single_cs_1')])]);
    const held = await renderScreen(<Billing bare />);
    expect(bigNumber(held).style.color).toBe(rgb(color.secondary));
    await held.unmount();
    mockHub = hubOf([paidMember('ava', 'Ava', T6)]);
    const out = await renderScreen(<Billing bare />);
    expect(bigNumber(out).style.color).toBe(rgb(color.error));
    await out.unmount();
  });

  test("primary only with nothing left to book with this period, outline otherwise - as the single token's Buy", async () => {
    const cases = [
      [[T6, 6, 0], 'primary'], // the phoned-in shape
      [[T6, 6, 6], 'primary'], // this period and next spent
      [[T6, 5, 0], 'outline'], // a token left
      [[T6, 0, 0], 'outline'], // a fresh period
      [[T6, 6, 0, 0, [added('single_cs_1')]], 'outline'], // a token already added
      [[T6, 6, 6, 0, [cancelled]], 'outline'], // a bonus in hand
    ];
    for (const [args, variant] of cases) {
      mockHub = hubOf([paidMember('ava', 'Ava', ...args)]);
      const r = await renderScreen(<Billing bare />);
      expect(variants(r, 'ava')).toEqual([variant]);
      await r.unmount();
    }
  });
});
