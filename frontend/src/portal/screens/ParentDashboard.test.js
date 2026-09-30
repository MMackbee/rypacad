import React from 'react';
import { renderScreen } from './testRender';
import ParentDashboard from './ParentDashboard';

let mockHub; let mockConfirm;
const mockChange = jest.fn(async (athleteId, packageId) => ({ athleteId, packageId }));
jest.mock('../hooks/packageChange', () => ({ useChangePackage: () => ({ change: mockChange }) }));
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, label }) => <button type="button">{label}|{athleteId}</button> }));
jest.mock('../hooks/billing', () => ({
  __esModule: true,
  default: () => mockHub,
  useBillingHub: () => mockHub,
  usePaymentConfirmation: (id) => (id ? mockConfirm : { state: 'idle', billingStatus: null }),
  STRIPE_PORTAL_URL: null,
}));
jest.mock('../hooks', () => ({
  useHousehold: () => ({ loading: false, error: null, data: { name: 'Whitfield family', date: 'Thu, Oct 1', children: [
    { id: 'a1', name: 'Jordan', ageLine: 'Age 14', standing: { tone: 'green', label: 'On track' }, next: null, contract: null, packageId: 't-12', tokens: null, loginEmail: 'jordan@email.com', login: { state: 'invited', claimedAt: null } },
    { id: 'a2', name: 'Reese', ageLine: 'Age 12', standing: { tone: 'neutral', label: 'New', dashed: true }, next: null, contract: null, packageId: 't-6', tokens: null },
  ], billing: { status: 'ok' } } }),
  // No useMembership mock on purpose (perf wave B): the household's Stripe
  // standing now comes off the hub, and a stray second fetch would crash here.
}));

beforeEach(() => {
  mockConfirm = { state: 'confirming', billingStatus: 'pending' };
  mockHub = { loading: false, error: null, data: {
    household: { id: 'h1' }, portalUrl: null,
    members: [
      { athleteId: 'a1', name: 'Jordan', package: { kind: 'tokens' }, billing: { status: 'active', facility: null } },
      { athleteId: 'a2', name: 'Reese', package: { kind: 'tokens' }, billing: { status: 'pending', facility: null } },
    ],
    status: { status: 'pending', tone: 'yellow', badge: { tone: 'yellow', label: 'Payment pending' }, title: 'Payment pending - finish checkout to start booking',
      body: "Reese can book once checkout is complete (token packages from Sat, Oct 10 at 7 AM). Billed monthly on the 1st once you've paid.", cta: 'Pay now', paused: false, pendingAthletes: [{ athleteId: 'a2', name: 'Reese' }] },
  } };
});

test('pending banner with one Pay now per unpaid athlete; the unpaid card is badged', async () => {
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(r.text()).toContain('Payment pending - finish checkout to start booking');
  expect(r.button('Pay now|a2')).not.toBeNull();
  expect(r.button('Pay now|a1')).toBeNull();
  expect(r.text()).toContain('Payment pending');
  expect(r.text()).toContain('On track');
  // D9: liveChildCard's login field -> the card's login line; Reese has no
  // loginEmail key (legacy shape), so no line at all - not even "Login: none".
  expect(r.text()).toContain('Login: not claimed (jordan@email.com)');
  expect(r.text()).not.toContain('Login: none');
  await r.unmount();
});

test('a past_due household membership on the hub shows the payment banner and ON HOLD cards', async () => {
  mockHub = { loading: false, error: null, data: {
    household: { id: 'h1', membership: { status: 'past_due' } }, portalUrl: null,
    members: [
      { athleteId: 'a1', name: 'Jordan', package: { kind: 'tokens' }, billing: { status: 'active', facility: null } },
      { athleteId: 'a2', name: 'Reese', package: { kind: 'tokens' }, billing: { status: 'active', facility: null } },
    ],
    status: null,
  } };
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(r.text()).toContain("Payment didn't go through");
  expect(r.text()).toContain('On hold');
  expect(r.text()).not.toContain('On track');
  await r.unmount();
});

test('?paid= shows the confirming state, then payment received', async () => {
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a2&cs=cs_1' });
  expect(r.text()).toContain('Confirming your payment...');
  await r.unmount();
  mockConfirm = { state: 'confirmed', billingStatus: 'active' };
  const c = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a2' });
  expect(c.text()).toMatch(/Payment received - /);
  await c.unmount();
});

describe("What's next under Payment received (owner decision 2026-09-30)", () => {
  let clock;
  beforeEach(() => { clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-05T18:00:00Z')); });
  afterEach(() => clock.mockRestore());

  test('token package: opens Oct 10, sessions Nov 3, the unclaimed login - no season link for a parent', async () => {
    mockConfirm = { state: 'confirmed', billingStatus: 'active', packageId: 't-12' };
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a1&cs=cs_1' });
    const text = r.text();
    expect(text).toContain("What's next");
    expect(text.indexOf('Payment received')).toBeLessThan(text.indexOf("What's next"));
    expect(text).toContain('Booking opens Sat, Oct 10 at 7 AM - book any training block, tournament or Phil session then.');
    expect(text).toContain('Sessions start Tue, Nov 3.');
    expect(text).toContain(`Jordan can sign in at ${window.location.host}/portal/signin with jordan@email.com.`);
    expect(text).not.toContain('See the season calendar');
    expect(text).not.toMatch(/we emailed|we'll email|check your email/i);
    await r.unmount();
  });

  test('Elite: book now, and the button opens the book-for-kid chooser for that athlete', async () => {
    mockConfirm = { state: 'confirmed', billingStatus: 'active', packageId: 'elite' };
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a2' });
    // Date.now() is pinned to Oct 5 above: the window counts from Nov 1.
    expect(r.text()).toContain('Reese can book now - training, tournaments and Phil, through Wed, Dec 16.');
    expect(r.text()).not.toContain('sign in at');
    expect(r.text()).not.toContain('Book for Reese');
    await r.click("Book Reese's first session");
    expect(r.text()).toContain('Book for Reese');
    await r.unmount();
  });

  test('no card while confirming, and none for a facility add-on payment', async () => {
    mockConfirm = { state: 'confirming', billingStatus: 'pending', packageId: null };
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a1' });
    expect(r.text()).not.toContain("What's next");
    await r.unmount();
    mockConfirm = { state: 'confirmed', billingStatus: 'active', packageId: 't-12' };
    const f = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a1&product=facility&cs=cs_2' });
    expect(f.text()).toMatch(/Payment received - /);
    expect(f.text()).not.toContain("What's next");
    await f.unmount();
  });
});

test('a never-paid athlete can change package from the pending card before Pay now (tester S4); a lapsed one cannot', async () => {
  mockHub.data.status.pendingAthletes = [
    { athleteId: 'a2', name: 'Reese', status: 'pending', packageId: 'elite', perPurchase: false },
    { athleteId: 'a3', name: 'Nico', status: 'pending', packageId: 't-6', perPurchase: false },
    { athleteId: 'a1', name: 'Jordan', status: 'lapsed', packageId: 't-12', perPurchase: false },
  ];
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(r.text()).toContain('ReeseElite · Change package');
  expect(r.text()).toContain('Nico6 tokens · Change package');
  expect(r.text()).not.toContain('12 tokens · Change package');
  expect(r.text()).not.toContain("Change Reese's package");
  // Two unpaid children: two links a screen reader tells apart by name.
  expect(r.button('Change package for Reese')).not.toBeNull();
  expect(r.button('Change package for Jordan')).toBeNull();
  await r.click('Change package for Nico');
  expect(r.text()).toContain("Change Nico's package");
  expect(r.text()).not.toContain("Change Reese's package");
  await r.click('16 tokens');
  await r.click('Save package');
  expect(mockChange).toHaveBeenCalledWith('a3', 't-16');
  expect(r.text()).not.toContain("Change Nico's package");
  await r.unmount();
});
