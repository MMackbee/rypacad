/**
 * Billing while its hub re-reads (review 2026-11-17, F4). The hub keeps the
 * last data on screen across a re-read - a cached revisit of a family page,
 * or the reload after a save - so the page never drops to the skeleton. That
 * data may be minutes old, so nothing on it acts until the fresh read lands:
 * Cancel, Move, Book, the Manage panel's Issue tokens, the parent's Add a
 * token and Pay all wait. Reading the page (and leaving it) does not, and
 * neither do Manage billing in Stripe and the past-due hero's Update payment
 * method: they open the family's own Stripe portal session, which reads
 * nothing from the hub (merge of the Manage billing button, 2026-11-17).
 */
import React from 'react';
import { renderScreen } from './testRender';
import Billing from './Billing';
import { hubMemberFor, statusFor } from '../data/billingHub';
import { TOKEN_PACKAGES } from '../data/packages';

let mockHub;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ label }) => <button type="button">{label}</button> }));
jest.mock('../hooks/billing', () => ({ __esModule: true, default: () => mockHub, useBillingHub: () => mockHub, usePaymentConfirmation: () => ({ state: 'idle' }), STRIPE_PORTAL_URL: null }));
jest.mock('../components/staffFamily/StaffAthletePanel', () => ({ __esModule: true, default: () => <button type="button">Issue tokens</button> }));
jest.mock('../components/staffFamily/StaffFamilyAdvanced', () => ({ __esModule: true, default: () => <div data-advanced="" /> }));
jest.mock('../hooks/staffCancel', () => ({ staffCancelBookings: async () => ({ sessionId: 's1', cancelled: [] }) }));
// The portal call itself is ManageBillingButton.test.js's; here only whether a tap reaches it.
let mockOpened;
jest.mock('../hooks/billingPortal', () => ({
  __esModule: true,
  openBillingPortal: async (opts) => { mockOpened.push(opts); return 'https://billing.stripe.com/p/session/test'; },
  portalErrorLine: () => 'Stripe did not open.',
}));
beforeEach(() => { mockOpened = []; });

const T6 = TOKEN_PACKAGES.find((p) => p.id === 't-6');
const today = '2026-11-12';
const kid = (id, name) =>
  hubMemberFor({
    athlete: { id, name, packageId: T6.id, billing: { status: 'active' } },
    pkg: T6, anchorDay: 1, today, waitlist: [], graceTokens: [],
    bookings: [{ id: `${id}_s1`, athleteId: id, sessionId: 's1', status: 'confirmed', periodKey: '2026-11-01', date: '2026-11-14', type: 'training', chargedFrom: 'period' }],
  });
const hub = (isRefreshing, { household = {}, status = statusFor(null, { anchorDay: 1 }) } = {}) => ({
  loading: false,
  error: null,
  isRefreshing,
  data: {
    household: { id: 'h1', name: 'Sample family', anchorDay: 1, membership: null, stripeCustomerId: null, ...household },
    portalUrl: null,
    members: [kid('a1', 'Sam Sample'), kid('a2', 'Alex Sample')],
    status,
  },
});
const PAST_DUE = { status: 'past_due' };

/** The page's own controls: not the tab bar, not the back link. */
const controls = (r) => [...r.container.querySelectorAll('button')].filter((b) => !b.closest('nav') && !b.textContent.includes('‹'));
const named = (r, label) => controls(r).filter((b) => b.textContent.trim() === label);
const disabled = (b) => b.matches(':disabled');
async function openLists(r) {
  for (const t of [...r.container.querySelectorAll('button[aria-expanded="false"]')]) await r.act(async () => { t.click(); });
}

test('the family page: Cancel, Move, Book and Issue tokens wait while the hub re-reads, and come back when it lands', async () => {
  mockHub = hub(false);
  const r = await renderScreen(<Billing bare staff role="owner" householdId="h1" />);
  await openLists(r);
  const acts = () => [...named(r, 'Cancel'), ...named(r, 'Move'), ...named(r, 'Book a session'), ...named(r, 'Issue tokens')];
  expect(named(r, 'Cancel')).toHaveLength(2);
  expect(named(r, 'Issue tokens')).toHaveLength(2);
  expect(acts().length).toBeGreaterThanOrEqual(6);
  expect(acts().some(disabled)).toBe(false);

  mockHub = hub(true);
  await r.rerender(<Billing bare staff role="owner" householdId="h1" />);
  expect(r.text()).toContain('Sam Sample');
  expect(acts().length).toBeGreaterThanOrEqual(6);
  expect(acts().every(disabled)).toBe(true);
  await r.act(async () => { named(r, 'Cancel')[0].click(); });
  expect(r.text()).not.toContain('Cancel this booking?');
  // The back link and the tab bar still leave the page.
  expect([...r.container.querySelectorAll('button')].filter((b) => b.closest('nav') || b.textContent.includes('‹')).some(disabled)).toBe(false);

  mockHub = hub(false);
  await r.rerender(<Billing bare staff role="owner" householdId="h1" />);
  expect(acts().some(disabled)).toBe(false);
  await r.act(async () => { named(r, 'Cancel')[0].click(); });
  expect(r.text()).toContain('Cancel this booking?');
  await r.unmount();
});

test("a parent's Billing: every control on the page waits while the hub re-reads", async () => {
  mockHub = hub(false);
  const r = await renderScreen(<Billing bare />);
  expect(controls(r).length).toBeGreaterThan(0);
  expect(controls(r).some(disabled)).toBe(false);
  mockHub = hub(true);
  await r.rerender(<Billing bare />);
  expect(r.text()).toContain('Sam Sample');
  expect(controls(r).every(disabled)).toBe(true);
  await r.unmount();
});

describe("the family's own Stripe portal never waits on the re-read", () => {
  const others = (r, label) => controls(r).filter((b) => b.textContent.trim() !== label);

  test('Manage billing in Stripe stays usable while everything else waits, and a tap opens the portal', async () => {
    mockHub = hub(false, { household: { stripeCustomerId: 'cus_test' } });
    const r = await renderScreen(<Billing bare />);
    expect(named(r, 'Manage billing in Stripe')).toHaveLength(1);
    mockHub = hub(true, { household: { stripeCustomerId: 'cus_test' } });
    await r.rerender(<Billing bare />);
    expect(r.text()).toContain('Sam Sample');
    expect(disabled(named(r, 'Manage billing in Stripe')[0])).toBe(false);
    expect(others(r, 'Manage billing in Stripe').length).toBeGreaterThan(0);
    expect(others(r, 'Manage billing in Stripe').every(disabled)).toBe(true);
    await r.click('Manage billing in Stripe');
    expect(mockOpened).toHaveLength(1);
    await r.unmount();
  });

  test("past due: the hero's Update payment method stays usable while the hub re-reads", async () => {
    const pastDue = (refreshing) =>
      hub(refreshing, { household: { stripeCustomerId: 'cus_test', membership: PAST_DUE }, status: statusFor(PAST_DUE, { anchorDay: 1 }) });
    mockHub = pastDue(false);
    const r = await renderScreen(<Billing bare />);
    expect(named(r, 'Update payment method')).toHaveLength(1);
    mockHub = pastDue(true);
    await r.rerender(<Billing bare />);
    expect(disabled(named(r, 'Update payment method')[0])).toBe(false);
    expect(disabled(named(r, 'Manage billing in Stripe')[0])).toBe(false);
    await r.click('Update payment method');
    expect(mockOpened).toHaveLength(1);
    await r.unmount();
  });

  test("pending: the hero's Pay now still waits (a checkout reads what the hub says is unpaid)", async () => {
    const pending = (refreshing) =>
      hub(refreshing, { status: statusFor(null, { anchorDay: 1, pendingAthletes: [{ athleteId: 'a1', name: 'Sam Sample', packageId: T6.id, status: 'pending' }] }) });
    mockHub = pending(false);
    const r = await renderScreen(<Billing bare />);
    expect(named(r, 'Pay now')).toHaveLength(1);
    expect(disabled(named(r, 'Pay now')[0])).toBe(false);
    mockHub = pending(true);
    await r.rerender(<Billing bare />);
    expect(disabled(named(r, 'Pay now')[0])).toBe(true);
    await r.unmount();
  });

  test('the family page: staff get no portal button, and every control still waits', async () => {
    mockHub = hub(true, { household: { stripeCustomerId: 'cus_test' } });
    const r = await renderScreen(<Billing bare staff role="owner" householdId="h1" />);
    await openLists(r);
    expect(named(r, 'Manage billing in Stripe')).toHaveLength(0);
    expect(controls(r).filter((b) => b.getAttribute('aria-expanded') == null).every(disabled)).toBe(true);
    await r.unmount();
  });
});
