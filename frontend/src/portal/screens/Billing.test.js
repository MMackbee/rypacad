import React from 'react';
import { renderScreen } from './testRender';
import Billing from './Billing';

let mockHub;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label }) => <button type="button">{label}|{athleteId}|{product}</button> }));
jest.mock('../components/TokenMeter', () => ({ __esModule: true, default: () => 'METER' }));
jest.mock('../hooks/billing', () => ({ __esModule: true, default: () => mockHub, useBillingHub: () => mockHub, usePaymentConfirmation: () => ({ state: 'idle' }), STRIPE_PORTAL_URL: 'https://billing.stripe.test/p/x' }));

beforeEach(() => {
  const m = (id, name, billing) => ({ athleteId: id, name, package: { id: 't-6', name: '6 tokens', kind: 'tokens', windowDays: 30, price: 299 }, tokens: { left: 6 }, coaching: null, contractMinutes: null, facilityAccess: false, billing });
  mockHub = { loading: false, error: null, data: {
    household: { id: 'h1', name: 'Whitfield family', anchorDay: 1, membership: null, stripeCustomerId: 'cus_1' }, portalUrl: 'https://billing.stripe.test/p/x',
    members: [m('a1', 'Jordan', { status: 'active', facility: null }), m('a2', 'Reese', { status: 'pending', facility: null })],
    status: { status: 'pending', tone: 'yellow', badge: { tone: 'yellow', label: 'Payment pending' }, title: 'Payment pending - finish checkout to start booking',
      body: "Reese can book once checkout is complete (token packages from Sat, Oct 10 at 7 AM). Billed monthly on the 1st once you've paid.", ladder: null, ladderAt: null, cta: 'Pay now', paused: false, pendingAthletes: [{ athleteId: 'a2', name: 'Reese' }] },
  } };
});

test('pending hero pays, plan and connection copy, facility offer for the paid athlete', async () => {
  const r = await renderScreen(<Billing bare />);
  expect(r.button('Pay now|a2|tier')).not.toBeNull();
  expect(r.text()).toContain("Billed monthly from the 1st once you've paid");
  expect(r.text()).toContain('Reese can book once checkout is complete (token packages from Sat, Oct 10 at 7 AM).');
  expect(r.text()).toContain('Your card and invoices are managed in Stripe.');
  expect(r.button('Manage billing in Stripe')).not.toBeNull();
  expect(r.button('Add facility access|a1|facility')).not.toBeNull();
  expect(r.button('Add facility access|a2|facility')).toBeNull();
  await r.unmount();
});

test('a mixed household keeps the monthly plan copy and footer', async () => {
  mockHub.data.members[1] = { ...mockHub.data.members[1], package: { id: 'single', name: 'Single token', kind: 'single', windowDays: 30, price: 65 } };
  const r = await renderScreen(<Billing bare />);
  // Bills monthly, and says so the way the package cards do (UX #5: never 'a period').
  expect(r.text()).toContain('6 tokens a month · books 30 days out');
  expect(r.text()).not.toContain('a period');
  expect(r.text()).toContain('Single token · one-time · books 30 days out · One-time $65 per session token');
  expect(r.text()).toContain('Billed monthly on the 1st. Tokens reset the same day.');
  await r.unmount();
});

test('an all-single household reads one-time and has no monthly footer', async () => {
  const single = { id: 'single', name: 'Single token', kind: 'single', windowDays: 30, price: 65 };
  mockHub.data.members = mockHub.data.members.map((m) => ({ ...m, package: single }));
  mockHub.data.status = { status: 'active', tone: 'default', badge: { tone: 'green', label: 'Active' }, title: 'Membership active',
    body: 'Session tokens are one-time payments - nothing bills monthly.', ladder: null, ladderAt: null, cta: null, paused: false };
  const r = await renderScreen(<Billing bare />);
  expect(r.text()).toContain('Single token · one-time');
  expect(r.text()).toContain('One-time $65 per session token'); // Reese's pending row
  expect(r.text()).not.toMatch(/a (period|month)\b/);
  expect(r.text()).not.toContain('Billed monthly');
  expect(r.text()).not.toContain('Tokens reset the same day');
  await r.unmount();
});

test('staff view never pays', async () => {
  const r = await renderScreen(<Billing bare staff role="owner" householdId="h1" />);
  expect(r.button('Pay now|a2|tier')).toBeNull();
  expect(r.button('Add facility access|a1|facility')).toBeNull();
  await r.unmount();
});

test('the contract tier line shows only with the Commitment Contract on (owner ruling 2026-09-30)', async () => {
  const off = await renderScreen(<Billing bare />);
  expect(off.text()).not.toMatch(/contract/i);
  await off.unmount();
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  try {
    const on = await renderScreen(<Billing bare />);
    expect(on.button('No contract tier yet · View athlete›')).not.toBeNull();
    await on.unmount();
  } finally {
    delete process.env.REACT_APP_CONTRACT_ENABLED;
  }
});

// Owner report (Mike S6 2026-09-30): the 18+ athlete who signed up for
// themselves is a one-member household and their own payer.
describe('the self-managed athlete (role athlete, one-member household)', () => {
  const tabs = (r) => [...r.container.querySelectorAll('nav button')].map((b) => b.textContent);
  beforeEach(() => {
    mockHub.data.household = { id: 'hh-self', name: 'Sam Rivera', anchorDay: 1, membership: null, stripeCustomerId: 'cus_self' };
    mockHub.data.members = [{ ...mockHub.data.members[0], athleteId: 'a-self', name: 'Sam' }];
    mockHub.data.status = { status: 'active', tone: 'default', badge: { tone: 'green', label: 'Active' }, title: 'Membership active',
      body: 'Billed monthly on the 1st. Nothing needs attention.', ladder: null, ladderAt: null, cta: null, paused: false, pendingAthletes: [] };
  });

  test('facility add-on, the Stripe portal and the plan, under the athlete tab bar with Billing lit', async () => {
    const r = await renderScreen(<Billing bare role="athlete" />);
    expect(r.text()).toContain('Sam');
    expect(r.button('Add facility access|a-self|facility')).not.toBeNull();
    expect(r.text()).toContain('Your card and invoices are managed in Stripe.');
    expect(r.button('Manage billing in Stripe')).not.toBeNull();
    expect(r.text()).toContain('6 tokens a month · books 30 days out');
    expect(r.text()).not.toContain('No linked athletes');
    expect(tabs(r)).toEqual(['Home', 'Schedule', 'Billing', 'Tour', 'Settings']);
    expect(r.button('Billing').getAttribute('aria-current')).toBe('page');
    expect(r.button('Reservations')).toBeNull();
    await r.unmount();
  });

  test("a parent's Billing keeps the parent tab bar", async () => {
    const r = await renderScreen(<Billing bare />);
    expect(tabs(r)).toEqual(['Home', 'Reservations', 'Billing', 'Tour', 'Settings']);
    await r.unmount();
  });

  test('with the contract on, their contract line opens their own Contract, not the parent-only athlete page', async () => {
    process.env.REACT_APP_CONTRACT_ENABLED = 'true';
    try {
      const r = await renderScreen(<Billing bare role="athlete" />);
      await r.click('No contract tier yet · View contract›');
      expect(r.location().pathname).toBe('/portal/contract');
      await r.unmount();
    } finally {
      delete process.env.REACT_APP_CONTRACT_ENABLED;
    }
  });
});
