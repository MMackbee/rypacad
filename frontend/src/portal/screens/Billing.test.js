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

test('staff view never pays', async () => {
  const r = await renderScreen(<Billing bare staff role="owner" householdId="h1" />);
  expect(r.button('Pay now|a2|tier')).toBeNull();
  expect(r.button('Add facility access|a1|facility')).toBeNull();
  await r.unmount();
});
