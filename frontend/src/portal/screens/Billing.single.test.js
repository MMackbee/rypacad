import React from 'react';
import { renderScreen } from './testRender';
import Billing from './Billing';
import { hubMemberFor, statusFor } from '../data/billingHub';
import { BOOKING_OPENS_AT } from '../data/calendar';
import { SINGLE_TOKEN, TOKEN_PACKAGES } from '../data/packages';

/**
 * Owner ruling 2026-10-01 ("drop one"): a single-token athlete whose payment
 * is pending sees ONE purchase button on Billing - the hero's Pay now - and
 * a paid-up one sees the meter's Buy. Rendered with the real TokenMeter over
 * real hub members and the real hero status (Billing.test.js mocks the meter).
 */

let mockHub;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label }) => <button type="button">{label}|{athleteId}|{product}</button> }));
jest.mock('../hooks/billing', () => ({ __esModule: true, default: () => mockHub, useBillingHub: () => mockHub, usePaymentConfirmation: () => ({ state: 'idle' }), STRIPE_PORTAL_URL: null }));

const BUY = 'Buy a session token - $65';
const WHEN = 'Single tokens are available from Sat, Oct 10 at 7 AM.';
const ASK = 'Ask a parent or guardian to buy a session token.';
const today = '2026-11-16';
const T12 = TOKEN_PACKAGES.find((p) => p.id === 't-12');

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

// The extra session at the member rate (owner, 2026-10-10): a paid monthly
// token member's meter on the parent's Billing hub, once the period's
// tokens are all used (a bought extra is spent before them).
describe('a paid monthly member: Buy an extra session', () => {
  const EXTRA = 'Buy an extra session';
  // `used` of the period's tokens booked; all of them by default.
  const paidMember = (id, name, pkg = T12, used = pkg.tokens) =>
    hubMemberFor({
      athlete: { id, name, dob: '2012-06-17', packageId: pkg.id, billing: { status: 'active', subscriptionId: `sub_${id}` } },
      pkg, anchorDay: 1, today, waitlist: [], graceTokens: [],
      bookings: Array.from({ length: used }, (_, i) => ({ id: `${id}_b${i}`, athleteId: id, status: 'confirmed', periodKey: '2026-11-01', date: '2026-11-20', sessionId: `s-${i}`, type: 'training' })),
    });
  const extraButtons = (r, id) => [...r.container.querySelectorAll('button')].map((b) => b.textContent).filter((t) => t.endsWith(`|${id}|extra`));
  const withMembership = (hub, membership) => ({ ...hub, data: { ...hub.data, household: { ...hub.data.household, membership }, status: statusFor(membership, { anchorDay: 1 }) } });

  test('out of tokens, the meter offers it at the 12-token rate, and nothing else to pay', async () => {
    mockHub = hubOf([paidMember('ava', 'Ava')]);
    const r = await renderScreen(<Billing bare />);
    expect(extraButtons(r, 'ava')).toEqual([`${EXTRA}|ava|extra`]);
    expect(r.text()).toContain('$47.42 - your 12-token rate. Good through Sat, Feb 27, 2027.');
    expect(purchaseButtons(r, 'ava')).toEqual([]);
    expect(r.text()).not.toContain('Ask a parent or guardian');
    await r.unmount();
  });

  test('not while tokens are left this period', async () => {
    mockHub = hubOf([paidMember('ava', 'Ava', T12, 11)]);
    const r = await renderScreen(<Billing bare />);
    expect(extraButtons(r, 'ava')).toEqual([]);
    expect(r.text()).not.toContain('12-token rate');
    await r.unmount();
  });

  test('a family with a failing card or a lapsed membership is offered none', async () => {
    for (const status of ['past_due', 'lapsed']) {
      mockHub = withMembership(hubOf([paidMember('ava', 'Ava')]), { status });
      const r = await renderScreen(<Billing bare />);
      expect(extraButtons(r, 'ava')).toEqual([]);
      await r.unmount();
    }
  });

  test('siblings: the paid member has it, the pending one pays from the hero, the staff view never', async () => {
    mockHub = hubOf([paidMember('ava', 'Ava'), member('ben', 'Ben', 'pending', T12)]);
    const r = await renderScreen(<Billing bare />);
    expect(extraButtons(r, 'ava')).toEqual([`${EXTRA}|ava|extra`]);
    expect(extraButtons(r, 'ben')).toEqual([]);
    expect(purchaseButtons(r, 'ben')).toEqual(['Pay now|ben|tier']);
    await r.unmount();
    const staff = await renderScreen(<Billing bare staff role="owner" householdId="h1" />);
    expect(extraButtons(staff, 'ava')).toEqual([]);
    await staff.unmount();
  });

  test('the self-managed adult\'s own hub offers it too', async () => {
    mockHub = hubOf([paidMember('sam', 'Sam')]);
    const r = await renderScreen(<Billing bare role="athlete" />);
    expect(extraButtons(r, 'sam')).toEqual([`${EXTRA}|sam|extra`]);
    await r.unmount();
  });
});
