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
      body: "Reese can book as soon as checkout is complete. Billed monthly from the 1st once you've paid.", ladder: null, ladderAt: null, cta: 'Pay now', paused: false, pendingAthletes: [{ athleteId: 'a2', name: 'Reese' }] },
  } };
});

test('pending hero pays, plan and connection copy, facility offer for the paid athlete', async () => {
  const r = await renderScreen(<Billing bare />);
  expect(r.button('Pay now|a2|tier')).not.toBeNull();
  expect(r.text()).toContain("Billed monthly from the 1st once you've paid");
  expect(r.text()).toContain('Your card and invoices are managed in Stripe.');
  expect(r.button('Manage billing in Stripe')).not.toBeNull();
  expect(r.button('Add facility access|a1|facility')).not.toBeNull();
  expect(r.button('Add facility access|a2|facility')).toBeNull();
  await r.unmount();
});

test('a mixed household keeps the monthly plan copy and footer', async () => {
  mockHub.data.members[1] = { ...mockHub.data.members[1], package: { id: 'single', name: 'Single token', kind: 'single', windowDays: 30, price: 65 } };
  const r = await renderScreen(<Billing bare />);
  expect(r.text()).toContain('6 tokens a period · books 30 days out');
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
  expect(r.text()).not.toContain('a period');
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

test('an active single athlete gets an outline Buy button; staff and a pending single never do (ruling 2026-09-29/30)', async () => {
  const single = { id: 'single', name: 'Single token', kind: 'single', windowDays: 30, price: 65 };
  mockHub.data.members = mockHub.data.members.map((m) => ({ ...m, package: single }));
  const r = await renderScreen(<Billing bare />);
  expect(r.button('Buy a session token - $65|a1|tier')).not.toBeNull(); // Jordan, active
  expect(r.button('Buy a session token - $65|a2|tier')).toBeNull(); // Reese, pending: the hero's Pay now instead
  expect(r.button('Add facility access|a1|facility')).toBeNull(); // no add-on on a single token
  await r.unmount();
  const staff = await renderScreen(<Billing bare staff role="owner" householdId="h1" />);
  expect(staff.button('Buy a session token - $65|a1|tier')).toBeNull();
  await staff.unmount();
  // A monthly household never sees it.
  mockHub.data.members = mockHub.data.members.map((m) => ({ ...m, package: { id: 't-6', name: '6 tokens', kind: 'tokens', windowDays: 30, price: 299 } }));
  const monthly = await renderScreen(<Billing bare />);
  expect(monthly.text()).not.toContain('Buy a session token');
  await monthly.unmount();
});
