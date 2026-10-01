import React from 'react';
import { renderScreen } from '../screens/testRender';
import PayButton, { startCheckout } from './PayButton';
import { VERIFY_EMAIL_SENDER } from '../data/authCopy';
import { SINGLE_NOT_OPEN_MESSAGE } from '../data/singleToken';

let mockReject = null;
let mockRejectTimes = Infinity; // how many calls mockReject refuses before checkout succeeds
let mockCalls = 0;
// Not `virtual`: the module exists, and a virtual mock missed whenever an
// earlier file in the same worker had resolved the real module (the
// resolver's module-id cache is per worker, keyed without the virtual map).
jest.mock('../hooks/callables', () => ({
  callCreateCheckoutSession: async (payload) => {
    mockCalls += 1;
    if (mockReject && mockCalls <= mockRejectTimes) { const e = new Error(mockReject.message); e.reason = mockReject.reason; throw e; }
    return { url: `https://checkout.stripe.test/${payload.athleteId}/${payload.product}` };
  },
})); // not `virtual` (the file exists): see Registration.test.js
let mockSession;
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => mockSession }));
// The mocked module is a plain object; the test fills auth.currentUser per run (no TDZ: nothing is read at factory time).
jest.mock('../../firebase', () => ({ auth: {} }));
import { auth } from '../../firebase';
let tokenRefreshes = 0;
beforeEach(() => {
  mockReject = null;
  mockRejectTimes = Infinity;
  mockCalls = 0;
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
  expect(r.text()).toContain(`We sent a link to dana@email.com from ${VERIFY_EMAIL_SENDER}. Open it, then tap I've verified. Not in your inbox? Check Spam or Junk.`);
  mockReject = null;
  await r.click("I've verified");
  expect(tokenRefreshes).toBe(1); // a fresh ID token before the retry (review 2026-09-28)
  expect(gone).toHaveLength(2);
  await r.unmount();
});

const UNVERIFIED = { reason: 'email-unverified', message: 'Verify your email to pay.' };

test('verified in another tab: the first refusal reloads, refreshes the token and retries - no verify card (UX P-04)', async () => {
  const gone = [];
  auth.currentUser.emailVerified = true; // the reload finds the link was opened
  mockReject = UNVERIFIED;
  mockRejectTimes = 1; // the stale token is refused once; the fresh one passes
  const r = await renderScreen(<PayButton athleteId="a1" label="Pay now" email="dana@email.com" go={(u) => gone.push(u)} />);
  await r.click('Pay now');
  expect(mockCalls).toBe(2);
  expect(tokenRefreshes).toBe(1);
  expect(gone).toEqual(['https://checkout.stripe.test/a1/tier']);
  expect(r.text()).not.toContain('Verify your email to finish');
  await r.unmount();
});

test('the verify card shows only when the retry with a fresh token is refused too', async () => {
  auth.currentUser.emailVerified = true;
  mockReject = UNVERIFIED; // refuses every call
  const r = await renderScreen(<PayButton athleteId="a1" label="Pay now" email="dana@email.com" go={() => {}} />);
  await r.click('Pay now');
  expect(mockCalls).toBe(2); // refused, then refused again after the refresh
  expect(tokenRefreshes).toBe(1);
  expect(r.text()).toContain('Verify your email to finish');
  await r.unmount();
});

test('a genuinely unverified account gets the card after one call (no pointless retry)', async () => {
  auth.currentUser.emailVerified = false;
  mockReject = UNVERIFIED;
  const r = await renderScreen(<PayButton athleteId="a1" label="Pay now" email="dana@email.com" go={() => {}} />);
  await r.click('Pay now');
  expect(mockCalls).toBe(1);
  expect(tokenRefreshes).toBe(0);
  expect(r.text()).toContain('Verify your email to finish');
  await r.unmount();
});

test('the verify card is full width even in a 132px button slot, and names the signed-in email when none is passed (UX P-05)', async () => {
  mockSession = { ...mockSession, user: { email: 'pat@email.com' } };
  mockReject = UNVERIFIED;
  const r = await renderScreen(
    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
      <PayButton athleteId="a1" label="Pay now" go={() => {}} style={{ width: 132, flex: 'none' }} />
    </div>
  );
  expect(r.button('Pay now').parentElement.style.width).toBe('132px'); // the button keeps the caller's slot
  await r.click('Pay now');
  const title = [...r.container.querySelectorAll('*')].find((el) => el.textContent === 'Verify your email to finish');
  const card = title.parentElement;
  expect(card.style.width).toBe('100%');
  expect(card.style.flex).toBe('1 1 100%');
  expect(r.text()).toContain(`We sent a link to pat@email.com from ${VERIFY_EMAIL_SENDER}.`);
  await r.unmount();
});

test('other failures show the message', async () => {
  mockReject = { reason: 'stripe-error', message: 'Checkout is unavailable right now. Try again in a minute.' };
  const r = await renderScreen(<PayButton athleteId="a1" label="Pay now" go={() => {}} />);
  await r.click('Pay now');
  expect(r.text()).toContain('Checkout is unavailable right now. Try again in a minute.');
  await r.unmount();
});

// Owner ruling 2026-10-01: single tokens go on sale when booking opens. Every
// screen hides the button until then, but the server is the gate: a tab whose
// clock runs ahead still reaches it, is refused before any Stripe call, and
// the family reads the server's own words. Nothing navigates, nothing retries.
test("the server's single-not-open refusal is shown word for word and the browser stays put", async () => {
  expect(SINGLE_NOT_OPEN_MESSAGE).toBe('Single tokens are available from Sat, Oct 10 at 7 AM. Nothing has been charged.');
  mockReject = { reason: 'single-not-open', message: SINGLE_NOT_OPEN_MESSAGE };
  const gone = [];
  const r = await renderScreen(<PayButton athleteId="sol" label="Buy a session token - $65" go={(u) => gone.push(u)} />);
  await r.click('Buy a session token - $65');
  expect(r.text()).toContain(SINGLE_NOT_OPEN_MESSAGE);
  expect(r.text()).not.toContain('Verify your email to finish');
  expect(gone).toEqual([]);
  expect(mockCalls).toBe(1);
  // From the gate on the same tap opens checkout.
  mockReject = null;
  await r.click('Buy a session token - $65');
  expect(gone).toEqual(['https://checkout.stripe.test/sol/tier']);
  await r.unmount();
});
