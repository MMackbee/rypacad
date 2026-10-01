import React from 'react';
import { renderScreen } from './testRender';
import Billing from './Billing';

let mockHub;
const ADD_FAMILY = 'Add family facility access · $300/month';
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label }) => <button type="button">{label}|{athleteId}|{product}</button> }));
// `buy` is the meter's own Pay/Buy affordance for a single athlete (TokenMeter.test.js covers the button).
jest.mock('../components/TokenMeter', () => ({ __esModule: true, default: ({ member, buy }) => `METER|${member.athleteId}|${buy ? 'buy' : 'view'}` }));
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
  // One family offer, billed on the paid token athlete - never one per child.
  expect(r.button(`${ADD_FAMILY}|a1|facility`)).not.toBeNull();
  expect(r.button(`${ADD_FAMILY}|a2|facility`)).toBeNull();
  expect(r.text().split(ADD_FAMILY)).toHaveLength(2);
  expect(r.text()).not.toContain('facility access:'); // no access yet: the plan rows say nothing
  await r.unmount();
});

describe('family facility access (owner ruling 2026-09-30)', () => {
  const paid = { status: 'active', facility: null };
  const elite = { id: 'elite', name: 'Elite', kind: 'elite', windowDays: 45, price: 999 };

  test('offered once when both athletes are paid, on the first', async () => {
    mockHub.data.members[1] = { ...mockHub.data.members[1], billing: paid };
    const r = await renderScreen(<Billing bare />);
    expect(r.button(`${ADD_FAMILY}|a1|facility`)).not.toBeNull();
    expect(r.text().split(ADD_FAMILY)).toHaveLength(2);
    await r.unmount();
  });

  test('one add-on covers the family: one status card, no offer, every athlete reads as covered', async () => {
    mockHub.data.members[0] = { ...mockHub.data.members[0], billing: paid };
    mockHub.data.members[1] = { ...mockHub.data.members[1], billing: { status: 'active', facility: 'active' }, facilityAccess: true, facilityAccessConsent: true };
    const r = await renderScreen(<Billing bare />);
    expect(r.text().split('Family facility access: active')).toHaveLength(2);
    expect(r.text()).not.toContain(ADD_FAMILY);
    expect(r.text().split('facility access: family add-on')).toHaveLength(3); // Jordan's plan row and Reese's
    await r.unmount();
  });

  test('a live Elite membership covers the family: included, never offered', async () => {
    mockHub.data.members[0] = { ...mockHub.data.members[0], billing: paid };
    mockHub.data.members[1] = { ...mockHub.data.members[1], package: elite, billing: paid };
    const r = await renderScreen(<Billing bare />);
    expect(r.text().split('Included with Elite for your family')).toHaveLength(2);
    expect(r.text()).not.toContain(ADD_FAMILY);
    expect(r.text()).toContain('6 tokens a month · books 30 days out · facility access: Elite');
    expect(r.text()).toContain('Elite · unlimited · books 45 days out · facility access: Elite');
    await r.unmount();
  });

  test('Elite still to be paid: not included yet, and the add-on is not sold to a family about to have it (review 2026-09-30)', async () => {
    mockHub.data.members[1] = { ...mockHub.data.members[1], package: elite };
    const r = await renderScreen(<Billing bare />);
    expect(r.text()).not.toContain(ADD_FAMILY);
    expect(r.text()).not.toContain('Included with Elite');
    expect(r.text()).not.toContain('facility access:');
    await r.unmount();
    // An Elite membership that ended blocks nothing: the paid token athlete is offered the add-on.
    mockHub.data.members[1] = { ...mockHub.data.members[1], billing: { status: 'lapsed', facility: null } };
    const ended = await renderScreen(<Billing bare />);
    expect(ended.button(`${ADD_FAMILY}|a1|facility`)).not.toBeNull();
    await ended.unmount();
  });
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

// Tester Mike 2026-09-30: no talk of tokens for Elite members.
test('a household of Elite athletes only: billed monthly, and nothing about tokens resetting', async () => {
  const elite = { id: 'elite', name: 'Elite', kind: 'elite', windowDays: 45, price: 999 };
  mockHub.data.members = mockHub.data.members.map((m) => ({ ...m, package: elite, tokens: { unlimited: true }, billing: { status: 'active', facility: null } }));
  mockHub.data.status = { status: 'active', tone: 'default', badge: { tone: 'green', label: 'Active' }, title: 'Membership active',
    body: 'Billed monthly on the 1st. Nothing needs attention.', ladder: null, ladderAt: null, cta: null, paused: false, pendingAthletes: [] };
  const r = await renderScreen(<Billing bare />);
  expect(r.text()).toContain('Billed monthly on the 1st.');
  expect(r.text()).not.toContain('Tokens reset the same day');
  await r.unmount();
});

test('staff view never pays', async () => {
  const r = await renderScreen(<Billing bare staff role="owner" householdId="h1" />);
  expect(r.button('Pay now|a2|tier')).toBeNull();
  expect(r.button(`${ADD_FAMILY}|a1|facility`)).toBeNull();
  expect(r.text()).toContain('No family facility access add-on.');
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
    // Their own household: the add-on without the word "family".
    expect(r.button('Add facility access · $300/month|a-self|facility')).not.toBeNull();
    expect(r.text()).not.toMatch(/family facility/i);
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

// Review 2026-10-01: an Elite family holds no tokens, so the load error names none.
test('a failed load says the membership did not load, with no token wording', async () => {
  mockHub = { loading: false, error: new Error('offline'), data: null };
  const r = await renderScreen(<Billing bare />);
  expect(r.text()).toContain("Your membership didn't load. Check your connection and try again.");
  expect(r.text()).not.toMatch(/token/i);
  await r.unmount();
});

describe('the single token (rulings 2026-09-29/30, on sale from the booking-open gate 2026-10-01)', () => {
  const GATE = Date.parse('2026-10-10T12:00:00Z'); // BOOKING_OPENS_AT: Sat, Oct 10 at 7 AM Chicago
  const WHEN = 'Single tokens are available from Sat, Oct 10 at 7 AM.';
  const single = { id: 'single', name: 'Single token', kind: 'single', windowDays: 30, price: 65 };
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(GATE);
    mockHub.data.members = mockHub.data.members.map((m) => ({ ...m, package: single }));
    mockHub.data.status.pendingAthletes = [{ athleteId: 'a2', name: 'Reese', perPurchase: true }];
  });
  afterEach(() => { jest.restoreAllMocks(); });

  test('the Buy button lives on the meter: the payer passes `buy`, the staff view never does', async () => {
    const r = await renderScreen(<Billing bare />);
    expect(r.text()).toContain('METER|a1|buy');
    expect(r.text()).toContain('METER|a2|buy');
    expect(r.text()).not.toContain('Buy a session token'); // never a second button beside the meter's
    expect(r.button('Add facility access|a1|facility')).toBeNull(); // no add-on on a single token
    await r.unmount();
    const staff = await renderScreen(<Billing bare staff role="owner" householdId="h1" />);
    expect(staff.text()).toContain('METER|a1|view');
    expect(staff.text()).not.toContain('METER|a1|buy');
    await staff.unmount();
  });

  test('from the gate on a pending single athlete has Pay now on the hero', async () => {
    const r = await renderScreen(<Billing bare />);
    expect(r.button('Pay now|a2|tier')).not.toBeNull();
    expect(r.text()).not.toContain(WHEN);
    await r.unmount();
  });

  test('before the gate the hero offers no Pay button for a single token, only the line saying when', async () => {
    Date.now.mockReturnValue(GATE - 1);
    // A monthly athlete pending beside them still pays before the gate; the single row says when.
    mockHub.data.status.pendingAthletes = [{ athleteId: 'a2', name: 'Reese', perPurchase: true }, { athleteId: 'a3', name: 'Sam', perPurchase: false }];
    const mixed = await renderScreen(<Billing bare />);
    expect(mixed.button('Pay now|a2|tier')).toBeNull();
    expect(mixed.text().split(WHEN)).toHaveLength(2);
    expect(mixed.button('Pay now|a3|tier')).not.toBeNull();
    await mixed.unmount();
    // An all-single list as the hub hands it over before the gate (billingHub.js statusFor): the body says when, no cta.
    mockHub.data.status = { ...mockHub.data.status, cta: null, pendingAthletes: [{ athleteId: 'a2', name: 'Reese', perPurchase: true }],
      body: `Reese can book once their session token is paid for. ${WHEN} A session token is a one-time $65 payment.` };
    const r = await renderScreen(<Billing bare />);
    expect(r.text().split(WHEN)).toHaveLength(2);
    expect(r.text()).not.toContain('Pay now');
    await r.unmount();
  });
});
