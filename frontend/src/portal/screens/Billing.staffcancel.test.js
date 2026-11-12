/**
 * Staff cancel on the Billing staff view (owner approved 2026-11-12): the
 * owner or ops sees Cancel on a Booked or No-show row, the sheet offers the
 * brothers and sisters on the same session, and after the cancel the page
 * says what happened. Parents, athletes and other staff roles never see it.
 * Real TokenMeter over real hub members; the hub and the call are mocked.
 */
import React from 'react';
import { renderScreen } from './testRender';
import Billing from './Billing';
import { hubMemberFor, statusFor } from '../data/billingHub';
import { TOKEN_PACKAGES } from '../data/packages';

let mockHub;
let mockCalls;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ label }) => <button type="button">{label}</button> }));
jest.mock('../hooks/billing', () => ({ __esModule: true, default: () => mockHub, useBillingHub: () => mockHub, usePaymentConfirmation: () => ({ state: 'idle' }), STRIPE_PORTAL_URL: null }));
jest.mock('../hooks/staffCancel', () => ({
  staffCancelBookings: async ({ bookingIds, reason }) => {
    mockCalls.push({ bookingIds, reason });
    return { sessionId: 's1', cancelled: bookingIds.map((bookingId) => ({ bookingId, tokenBack: true })) };
  },
}));

const T6 = TOKEN_PACKAGES.find((p) => p.id === 't-6');
const today = '2026-11-12';
const kid = (id, name, status) =>
  hubMemberFor({
    athlete: { id, name, packageId: T6.id, billing: { status: 'active' } },
    pkg: T6, anchorDay: 1, today, waitlist: [], graceTokens: [],
    bookings: [{ id: `${id}_s1`, athleteId: id, sessionId: 's1', status, periodKey: '2026-11-01', date: '2026-11-10', type: 'training', chargedFrom: 'period' }],
  });
const hubOf = (members) => ({
  loading: false,
  error: null,
  data: { household: { id: 'h1', name: 'Whitfield family', anchorDay: 1, membership: null, stripeCustomerId: null }, portalUrl: null, members, status: statusFor(null, { anchorDay: 1 }) },
});
const cancels = (r) => [...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Cancel');
/** Every meter's "This period" list, opened. */
async function openLists(r) {
  for (const t of [...r.container.querySelectorAll('button[aria-expanded="false"]')]) await r.act(async () => { t.click(); });
}

beforeEach(() => {
  mockCalls = [];
  mockHub = hubOf([kid('jordan', 'Jordan Whitfield', 'noshow'), kid('riley', 'Riley Whitfield', 'noshow'), kid('casey', 'Casey Whitfield', 'confirmed')]);
});

test('the owner and ops see Cancel on each Booked or No-show row', async () => {
  for (const role of ['owner', 'ops']) {
    const r = await renderScreen(<Billing bare staff role={role} householdId="h1" />);
    await openLists(r);
    expect(cancels(r)).toHaveLength(3);
    await r.unmount();
  }
});

test('coaches, specialists and the family never do', async () => {
  for (const role of ['coach', 'mental', 'phil']) {
    const r = await renderScreen(<Billing bare staff role={role} householdId="h1" />);
    await openLists(r);
    expect(cancels(r)).toEqual([]);
    await r.unmount();
  }
  for (const role of ['parent', 'athlete', 'owner']) {
    // Not the staff view: a parent's (or an athlete's own) Billing.
    const r = await renderScreen(<Billing bare role={role} />);
    await openLists(r);
    expect(cancels(r)).toEqual([]);
    await r.unmount();
  }
});

test('Cancel opens the sheet with the brothers unticked; the cancel goes out once and the page says so', async () => {
  const r = await renderScreen(<Billing bare staff role="owner" householdId="h1" />);
  await openLists(r);
  await r.act(async () => { cancels(r)[0].click(); });
  expect(r.text()).toContain('Cancel this booking?');
  expect(r.text()).toContain('Jordan Whitfield · Tue Nov 10 · Training block · No-show');
  expect(r.text()).toContain('Also cancel for');
  const ticks = [...r.container.querySelectorAll('[role="checkbox"]')];
  expect(ticks.map((t) => [t.textContent.trim(), t.getAttribute('aria-checked')])).toEqual([['Riley · No-show', 'false'], ['Casey · Booked', 'false']]);
  await r.click('Riley · No-show');
  await r.click('Casey · Booked');
  await r.click('Sick');
  await r.click('Cancel and give the tokens back');
  expect(mockCalls).toEqual([{ bookingIds: ['jordan_s1', 'riley_s1', 'casey_s1'], reason: { category: 'sick', note: null } }]);
  expect(r.text()).not.toContain('Cancel this booking?');
  expect(r.text()).toContain('Cancelled · Sick - tokens back for Jordan, Riley and Casey.');
  await r.unmount();
});

test('Keep it closes the sheet and the page says nothing', async () => {
  const r = await renderScreen(<Billing bare staff role="ops" householdId="h1" />);
  await openLists(r);
  await r.act(async () => { cancels(r)[1].click(); });
  expect(r.text()).toContain('Riley Whitfield · Tue Nov 10');
  await r.click('Keep it');
  expect(r.text()).not.toContain('Cancel this booking?');
  expect(r.text()).not.toContain('Cancelled ·');
  expect(mockCalls).toEqual([]);
  await r.unmount();
});
