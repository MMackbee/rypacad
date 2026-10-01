import React from 'react';
import { renderScreen } from './testRender';
import AthleteDashboard from './AthleteDashboard';
import { statusFor } from '../data/billingHub';
import { BOOKING_OPENS_AT } from '../data/calendar';

/**
 * Owner ruling 2026-10-01 ("not unless the child is 18+"): on the athlete's
 * own home the pending card's single-token row reads who buys it for an
 * under-18 athlete, and keeps Pay now for an adult. A monthly package's
 * Pay now on a child's home is unchanged. AthleteDashboard.test.js mocks
 * PayButton away; here it prints label|athleteId|product.
 */

let mockMine = { data: null, loading: false, error: null };
let mockSelfManaged = false;
jest.mock('../hooks/packageChange', () => ({ useChangePackage: () => ({ change: async () => ({}) }) }));
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label }) => <button type="button">{label}|{athleteId}|{product}</button> }));
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, useSelfManaged: () => mockSelfManaged }));
jest.mock('../hooks/billing', () => ({
  __esModule: true,
  useMyTokens: () => mockMine,
  usePaymentConfirmation: () => ({ state: 'idle', packageId: null }),
}));
jest.mock('../hooks', () => ({
  useAthleteDashboard: () => ({
    loading: false,
    error: null,
    data: {
      athlete: { name: 'Jordan', fullName: 'Jordan', date: 'Monday, Oct 12', billingStatus: 'pending', tokens: null },
      nextSession: null,
      contract: null,
      onboarding: null,
      diagnosticCaptured: true,
    },
  }),
}));

const WHEN = 'Single tokens are available from Sat, Oct 10 at 7 AM.';
const ASK = 'Ask a parent or guardian to buy a session token.';
const CHILD = '2012-06-17'; // 14
const ADULT = '2000-01-01';

/** useMyTokens' payload for a pending athlete: their own record's dob and the hub status over their one row. */
const pendingMine = ({ dob, packageId }) => ({
  loading: false,
  error: null,
  data: {
    member: { athleteId: 'a1', name: 'Jordan', dob },
    status: statusFor(null, { anchorDay: 1, pendingAthletes: [{ athleteId: 'a1', name: 'Jordan', status: 'pending', perPurchase: packageId === 'single', packageId }] }),
    facilityPending: [],
  },
});
/** Every checkout button for the athlete's package. */
const purchaseButtons = (r) => [...r.container.querySelectorAll('button')].map((b) => b.textContent).filter((t) => t.endsWith('|a1|tier'));

// On sale: the booking-open gate has passed.
beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(BOOKING_OPENS_AT); });
afterEach(() => {
  jest.restoreAllMocks();
  mockSelfManaged = false;
  mockMine = { data: null, loading: false, error: null };
});

test('an under-18 single-token athlete: the pending card says who buys it, with no Pay now', async () => {
  // 14, and no date of birth on file: both read the line.
  for (const dob of [CHILD, null]) {
    mockMine = pendingMine({ dob, packageId: 'single' });
    const r = await renderScreen(<AthleteDashboard bare />);
    expect(r.text()).toContain('Payment pending - finish checkout to start booking');
    expect(r.text().split(ASK)).toHaveLength(2);
    expect(purchaseButtons(r)).toEqual([]);
    expect(r.text()).not.toContain('Pay now');
    // No Change package link either: the rules refuse a child's own package
    // change (firestore.rules pendingPackageUpdateOk: a parent, or the
    // self-managed adult), and it would be the row's only thing to tap.
    expect(r.button('Change package for Jordan')).toBeNull();
    expect(r.text()).not.toContain('Change package');
    await r.unmount();
  }
});

test('a monthly child\'s home still shows its Pay now, exactly as before', async () => {
  for (const packageId of ['t-6', 't-12', 't-16', 'elite']) {
    mockMine = pendingMine({ dob: CHILD, packageId });
    const r = await renderScreen(<AthleteDashboard bare />);
    expect(purchaseButtons(r)).toEqual(['Pay now|a1|tier']);
    expect(r.text()).not.toContain(ASK);
    expect(r.text()).not.toContain(WHEN);
    // The monthly row's package line is unchanged too.
    expect(r.button('Change package for Jordan')).not.toBeNull();
    await r.unmount();
  }
});

test('the Change package link on a single-token row is the self-managed adult\'s alone', async () => {
  mockSelfManaged = true;
  mockMine = pendingMine({ dob: null, packageId: 'single' });
  const self = await renderScreen(<AthleteDashboard bare />);
  expect(self.button('Change package for Jordan')).not.toBeNull();
  await self.unmount();
  // 18 or older by date of birth on a parent's household: Pay now, but the rules still refuse their package change.
  mockSelfManaged = false;
  mockMine = pendingMine({ dob: ADULT, packageId: 'single' });
  const adult = await renderScreen(<AthleteDashboard bare />);
  expect(purchaseButtons(adult)).toEqual(['Pay now|a1|tier']);
  expect(adult.button('Change package for Jordan')).toBeNull();
  await adult.unmount();
});

test('an adult single-token athlete keeps Pay now: self-managed, or 18 or older by date of birth', async () => {
  mockSelfManaged = true;
  mockMine = pendingMine({ dob: null, packageId: 'single' });
  const self = await renderScreen(<AthleteDashboard bare />);
  expect(purchaseButtons(self)).toEqual(['Pay now|a1|tier']);
  expect(self.text()).not.toContain(ASK);
  await self.unmount();
  mockSelfManaged = false;
  mockMine = pendingMine({ dob: ADULT, packageId: 'single' });
  const adult = await renderScreen(<AthleteDashboard bare />);
  expect(purchaseButtons(adult)).toEqual(['Pay now|a1|tier']);
  expect(adult.text()).not.toContain(ASK);
  await adult.unmount();
});

test('before the gate an under-18 single-token athlete reads when, once, like everyone', async () => {
  Date.now.mockReturnValue(BOOKING_OPENS_AT - 1);
  mockMine = pendingMine({ dob: CHILD, packageId: 'single' });
  const r = await renderScreen(<AthleteDashboard bare />);
  expect(r.text().split(WHEN)).toHaveLength(2);
  expect(r.text()).not.toContain(ASK);
  expect(purchaseButtons(r)).toEqual([]);
  await r.unmount();
});
