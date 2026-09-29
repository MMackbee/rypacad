import React from 'react';
import { renderScreen } from '../screens/testRender';
import PayButton, { startCheckout } from './PayButton';

let mockReject = null;
jest.mock('../hooks/callables', () => ({
  callCreateCheckoutSession: async (payload) => {
    if (mockReject) { const e = new Error(mockReject.message); e.reason = mockReject.reason; throw e; }
    return { url: `https://checkout.stripe.test/${payload.athleteId}/${payload.product}` };
  },
}), { virtual: true });
let mockSession;
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => mockSession }));
// The mocked module is a plain object; the test fills auth.currentUser per run (no TDZ: nothing is read at factory time).
jest.mock('../../firebase', () => ({ auth: {} }));
import { auth } from '../../firebase';
let tokenRefreshes = 0;
beforeEach(() => {
  mockReject = null;
  mockSession = { resendVerification: async () => ({ sent: true }) };
  tokenRefreshes = 0;
  auth.currentUser = { reload: async () => {}, getIdToken: async (force) => { if (force) tokenRefreshes += 1; return 'token'; } };
});

test('startCheckout hands the Stripe url to go()', async () => {
  const gone = [];
  await startCheckout({ athleteId: 'a1', product: 'facility', go: (u) => gone.push(u) });
  expect(gone).toEqual(['https://checkout.stripe.test/a1/facility']);
});

test('the button navigates; an unverified password account gets the verify state', async () => {
  const gone = [];
  const r = await renderScreen(<PayButton athleteId="a1" label="Pay now" email="dana@email.com" go={(u) => gone.push(u)} />);
  await r.click('Pay now');
  expect(gone).toEqual(['https://checkout.stripe.test/a1/tier']);
  mockReject = { reason: 'email-unverified', message: 'Verify your email first.' };
  await r.click('Pay now');
  expect(r.text()).toContain('Verify your email to finish');
  expect(r.text()).toContain('We sent a link to dana@email.com from noreply@');
  mockReject = null;
  await r.click("I've verified");
  expect(tokenRefreshes).toBe(1); // a fresh ID token before the retry (review 2026-09-28)
  expect(gone).toHaveLength(2);
  await r.unmount();
});

test('other failures show the message', async () => {
  mockReject = { reason: 'stripe-error', message: 'Checkout is unavailable right now. Try again in a minute.' };
  const r = await renderScreen(<PayButton athleteId="a1" label="Pay now" go={() => {}} />);
  await r.click('Pay now');
  expect(r.text()).toContain('Checkout is unavailable right now. Try again in a minute.');
  await r.unmount();
});
