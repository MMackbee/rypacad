import React from 'react';
import { renderScreen } from './testRender';
import Membership from './Membership';
import { hubMemberFor, statusFor } from '../data/billingHub';
import { BOOKING_OPENS_AT } from '../data/calendar';
import { ELITE, SINGLE_TOKEN, TOKEN_PACKAGES } from '../data/packages';

/**
 * Owner rulings 2026-10-01 on the athlete's own Membership page: the single
 * token's Pay or Buy button is an adult's ("not unless the child is 18+"),
 * and a pending athlete has one button, never two ("drop one"). Rendered
 * with the real TokenMeter and PendingBanner over a real hub member and the
 * real status (Membership.test.js mocks the meter).
 */

let mockMine;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label }) => <button type="button">{label}|{athleteId}|{product}</button> }));
jest.mock('../hooks/billing', () => ({ __esModule: true, default: () => ({}), useMyTokens: () => mockMine, usePaymentConfirmation: () => ({ state: 'idle' }), STRIPE_PORTAL_URL: null }));

const BUY = 'Buy a session token - $65';
const WHEN = 'Single tokens are available from Sat, Oct 10 at 7 AM.';
const ASK = 'Ask a parent or guardian to buy a session token.';
const today = '2026-11-16';
const CHILD = '2012-06-17'; // 14
const ADULT = '2000-01-01';
const T12 = TOKEN_PACKAGES.find((p) => p.id === 't-12');

/** useMyTokens' payload for one athlete, as hooks/billing.js liveMyTokens builds it. */
const mine = ({ dob, status, pkg = SINGLE_TOKEN }) => {
  const member = hubMemberFor({ athlete: { id: 'ava', name: 'Ava', packageId: pkg.id, billing: { status }, ...(dob ? { dob } : {}) }, pkg, anchorDay: 1, today, bookings: [], waitlist: [], graceTokens: [] });
  const unpaid = status === 'pending' || status === 'lapsed';
  const pendingAthletes = unpaid ? [{ athleteId: 'ava', name: 'Ava', status, perPurchase: pkg.kind === 'single', packageId: pkg.id }] : [];
  return { loading: false, error: null, data: { member, status: statusFor(null, { anchorDay: 1, pendingAthletes, allUnlimited: pkg.kind === 'elite' }), facilityPending: [] } };
};
/** Every checkout button for the athlete's package: the mocked PayButton prints label|athleteId|product. */
const purchaseButtons = (r) => [...r.container.querySelectorAll('button')].map((b) => b.textContent).filter((t) => t.endsWith('|ava|tier'));

// On sale: the booking-open gate has passed.
beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(BOOKING_OPENS_AT); });
afterEach(() => { jest.restoreAllMocks(); });

describe('an under-18 athlete on their own login', () => {
  test('paid up: the line where the Buy button would be, and no button', async () => {
    mockMine = mine({ dob: CHILD, status: 'active' });
    expect(mockMine.data.member.dob).toBe(CHILD);
    const r = await renderScreen(<Membership bare />);
    expect(r.text().split(ASK)).toHaveLength(2);
    expect(purchaseButtons(r)).toEqual([]);
    expect(r.text()).not.toContain(BUY);
    await r.unmount();
  });

  test('payment pending: the banner says who buys it, once; no Pay now, and nothing more on the meter', async () => {
    mockMine = mine({ dob: CHILD, status: 'pending' });
    const r = await renderScreen(<Membership bare />);
    expect(r.text()).toContain('Payment pending - finish checkout to start booking');
    expect(r.text().split(ASK)).toHaveLength(2);
    expect(purchaseButtons(r)).toEqual([]);
    expect(r.text()).not.toContain('Pay now');
    expect(r.text()).not.toContain(BUY);
    await r.unmount();
  });

  test('no date of birth on file counts as under 18', async () => {
    mockMine = mine({ dob: null, status: 'active' });
    expect(mockMine.data.member.dob).toBeNull();
    const r = await renderScreen(<Membership bare />);
    expect(r.text().split(ASK)).toHaveLength(2);
    expect(purchaseButtons(r)).toEqual([]);
    await r.unmount();
  });

  test('before the gate they read when, as everyone does, once', async () => {
    Date.now.mockReturnValue(BOOKING_OPENS_AT - 1);
    for (const status of ['pending', 'active']) {
      mockMine = mine({ dob: CHILD, status });
      const r = await renderScreen(<Membership bare />);
      expect(r.text().split(WHEN)).toHaveLength(2);
      expect(r.text()).not.toContain(ASK);
      expect(purchaseButtons(r)).toEqual([]);
      await r.unmount();
    }
  });

  test('a monthly package is unchanged: the pending card still has its Pay now', async () => {
    mockMine = mine({ dob: CHILD, status: 'pending', pkg: T12 });
    const r = await renderScreen(<Membership bare />);
    expect(purchaseButtons(r)).toEqual(['Pay now|ava|tier']);
    expect(r.text()).toContain('Pay to start');
    expect(r.text()).not.toContain(ASK);
    await r.unmount();
    mockMine = mine({ dob: CHILD, status: 'active', pkg: T12 });
    const paid = await renderScreen(<Membership bare />);
    expect(purchaseButtons(paid)).toEqual([]);
    expect(paid.text()).not.toContain(ASK);
    await paid.unmount();
  });

  test('Elite is unchanged, and still reads no token wording', async () => {
    mockMine = mine({ dob: CHILD, status: 'pending', pkg: ELITE });
    const r = await renderScreen(<Membership bare />);
    expect(purchaseButtons(r)).toEqual(['Pay now|ava|tier']);
    expect(r.text()).not.toMatch(/token/i);
    await r.unmount();
  });
});

describe('the adult on their own login', () => {
  test('self-managed and paid up: the meter\'s Buy button', async () => {
    mockMine = mine({ dob: ADULT, status: 'active' });
    const r = await renderScreen(<Membership bare selfManaged />);
    expect(purchaseButtons(r)).toEqual([`${BUY}|ava|tier`]);
    expect(r.text()).not.toContain(ASK);
    await r.unmount();
  });

  test('self-managed and payment pending: only the banner\'s Pay now', async () => {
    for (const status of ['pending', 'lapsed']) {
      mockMine = mine({ dob: ADULT, status });
      const r = await renderScreen(<Membership bare selfManaged />);
      expect(purchaseButtons(r)).toEqual(['Pay now|ava|tier']);
      expect(r.text()).not.toContain(BUY);
      expect(r.text()).not.toContain(ASK);
      await r.unmount();
    }
  });

  test('self-managed with no date of birth on file still buys', async () => {
    mockMine = mine({ dob: null, status: 'active' });
    const r = await renderScreen(<Membership bare selfManaged />);
    expect(purchaseButtons(r)).toEqual([`${BUY}|ava|tier`]);
    await r.unmount();
  });

  test('18 or older by date of birth, on a login that is not self-managed: buys and pays the same', async () => {
    mockMine = mine({ dob: ADULT, status: 'active' });
    const paid = await renderScreen(<Membership bare />);
    expect(purchaseButtons(paid)).toEqual([`${BUY}|ava|tier`]);
    expect(paid.text()).not.toContain(ASK);
    await paid.unmount();
    mockMine = mine({ dob: ADULT, status: 'pending' });
    const pending = await renderScreen(<Membership bare />);
    expect(purchaseButtons(pending)).toEqual(['Pay now|ava|tier']);
    expect(pending.text()).not.toContain(ASK);
    await pending.unmount();
  });
});
