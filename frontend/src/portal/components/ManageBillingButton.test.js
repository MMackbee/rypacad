/**
 * "Manage billing in Stripe" (2026-11-17): the button asks openBillingPortal
 * for a Stripe portal session and sends THIS tab there (never window.open
 * after an await: iOS Safari and the installed app block it as a popup). A
 * failure says so under the button, with the old sign-in link as a fallback
 * when the build has one. Seed and practice modes never call. Plain
 * functions, not jest.fn(): CRA's resetMocks would clear them.
 */
import React, { act } from 'react';
import { renderScreen } from '../screens/testRender';
import ManageBillingButton from './ManageBillingButton';
import { openBillingPortal } from '../hooks/billingPortal';
import { MANAGE_BILLING, OPENING_STRIPE, PORTAL_ERROR_LINE, PORTAL_FALLBACK_LINK } from '../data/billingCopy';
import { VERIFIED, VERIFY_TITLE } from '../data/authCopy';
import { color } from '../tokens';

jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), isLive: () => mockLive }));
jest.mock('../hooks/callables', () => ({
  callOpenBillingPortal: (payload) => {
    mockCalls.push(payload);
    return mockAnswer(payload);
  },
}));
jest.mock('../hooks/invalidate', () => ({ ...jest.requireActual('../hooks/invalidate'), bump: (name) => mockBumps.push(name) }));
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => mockSession }));
// A plain object the tests fill per run, as PayButton.test.js does.
jest.mock('../../firebase', () => ({ auth: {} }));
import { auth } from '../../firebase';

const SESSION = 'https://billing.stripe.com/p/session/test_abc';
const FALLBACK = 'https://billing.stripe.com/p/login/test_x';
let mockLive;
let mockCalls;
let mockAnswer;
let mockBumps;
let mockSession;
let assigned;
let tokenRefreshes;
let visibility;
const realLocation = window.location;

/** A pageshow as the browser fires it; `persisted` is a back-forward cache restore. */
function pageshow(persisted) {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}
function setVisibility(state) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

function refusal(reason, message) {
  const err = new Error(message);
  err.reason = reason;
  return err;
}

beforeEach(() => {
  mockLive = true;
  mockCalls = [];
  mockAnswer = async () => ({ url: SESSION });
  mockBumps = [];
  mockSession = { resendVerification: async () => ({ sent: true }), user: { email: 'dana@email.com' } };
  tokenRefreshes = 0;
  auth.currentUser = { emailVerified: false, reload: async () => {}, getIdToken: async (force) => { if (force) tokenRefreshes += 1; return 'token'; } };
  assigned = [];
  delete window.location;
  window.location = { ...realLocation, assign: (url) => assigned.push(url) };
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});
afterEach(() => {
  window.location = realLocation;
  delete document.visibilityState;
});

test('a tap asks for a portal session and sends this tab to it', async () => {
  const r = await renderScreen(<ManageBillingButton fallbackUrl={FALLBACK} />);
  await r.click(MANAGE_BILLING);
  expect(mockCalls).toEqual([{ returnPath: '/portal/billing' }]);
  expect(assigned).toEqual([SESSION]);
  expect(r.text()).not.toContain(PORTAL_ERROR_LINE);
  expect(r.text()).not.toContain(PORTAL_FALLBACK_LINK); // the fallback is for failures only
  await r.unmount();
});

test('loading: the button says it is opening Stripe and cannot be tapped twice', async () => {
  let answer;
  mockAnswer = () => new Promise((resolve) => { answer = resolve; });
  const r = await renderScreen(<ManageBillingButton />);
  await r.click(MANAGE_BILLING);
  const busy = r.button(OPENING_STRIPE);
  expect(busy).not.toBeNull();
  expect(busy.disabled).toBe(true);
  expect(r.button(MANAGE_BILLING)).toBeNull();
  await r.act(async () => { busy.click(); });
  expect(mockCalls).toHaveLength(1);
  await r.act(async () => { answer({ url: SESSION }); });
  expect(assigned).toEqual([SESSION]);
  await r.unmount();
});

test('a failure: the plain line under the button and the sign-in link as a fallback', async () => {
  mockAnswer = async () => { throw refusal('stripe-error', 'Stripe said something technical.'); };
  const r = await renderScreen(<ManageBillingButton fallbackUrl={FALLBACK} />);
  await r.click(MANAGE_BILLING);
  expect(assigned).toEqual([]);
  expect(r.container.querySelector('[role="alert"]').textContent).toBe(PORTAL_ERROR_LINE);
  expect(r.text()).not.toContain('technical');
  const link = [...r.container.querySelectorAll('a')].find((a) => a.textContent === PORTAL_FALLBACK_LINK);
  expect(link.getAttribute('href')).toBe(FALLBACK);
  expect(link.getAttribute('rel')).toContain('noopener');
  // The button is back for another try, and a success clears the line.
  mockAnswer = async () => ({ url: SESSION });
  await r.click(MANAGE_BILLING);
  expect(assigned).toEqual([SESSION]);
  expect(r.container.querySelector('[role="alert"]')).toBeNull();
  await r.unmount();
});

test('no sign-in link when the build has none; a refusal the server words reads as worded', async () => {
  mockAnswer = async () => { throw refusal('no-customer', 'There is no billing in Stripe for this family yet. It starts with the first payment.'); };
  const r = await renderScreen(<ManageBillingButton fallbackUrl={null} />);
  await r.click(MANAGE_BILLING);
  expect(r.text()).toContain('There is no billing in Stripe for this family yet.');
  expect(r.container.querySelector('a')).toBeNull();
  await r.unmount();
});

test('an unknown failure (no reason, SDK words) reads as the plain line', async () => {
  mockAnswer = async () => { throw new Error('internal'); };
  const r = await renderScreen(<ManageBillingButton fallbackUrl={FALLBACK} />);
  await r.click(MANAGE_BILLING);
  expect(r.container.querySelector('[role="alert"]').textContent).toBe(PORTAL_ERROR_LINE);
  await r.unmount();
});

test('practice mode and seed mode never call the server', async () => {
  const practice = await renderScreen(<ManageBillingButton practice />);
  await practice.click(MANAGE_BILLING);
  expect(mockCalls).toEqual([]);
  expect(assigned).toEqual([]);
  await practice.unmount();
  mockLive = false;
  await expect(openBillingPortal({ go: (u) => assigned.push(u) })).rejects.toMatchObject({ reason: 'not-live' });
  const seed = await renderScreen(<ManageBillingButton />);
  await seed.click(MANAGE_BILLING);
  expect(mockCalls).toEqual([]);
  expect(assigned).toEqual([]);
  await seed.unmount();
});

test('an answer that is not an https url is never followed', async () => {
  const go = (u) => assigned.push(u);
  for (const url of ['data:text/html,hello', 'http://billing.stripe.com/p/session/x', '', null]) {
    mockAnswer = async () => ({ url });
    await expect(openBillingPortal({ go })).rejects.toMatchObject({ reason: 'bad-answer' });
  }
  expect(assigned).toEqual([]);
});

// Review 2026-11-17 UX-1/UX-6: after a successful call the button waits for the page to leave. When it does not leave,
// or comes back, the button must come back too - a button stuck on "Opening Stripe" is the "broken" report again.
describe('coming back from Stripe', () => {
  test('a back-forward cache restore (Back from Stripe): the label is back and Billing reloads', async () => {
    const r = await renderScreen(<ManageBillingButton />);
    await r.click(MANAGE_BILLING);
    expect(assigned).toEqual([SESSION]);
    expect(r.button(OPENING_STRIPE)).not.toBeNull(); // waiting for the page to leave
    await r.act(async () => { window.dispatchEvent(pageshow(false)); }); // a first load is not a return
    expect(r.button(OPENING_STRIPE)).not.toBeNull();
    await r.act(async () => { window.dispatchEvent(pageshow(true)); });
    expect(r.button(MANAGE_BILLING)).not.toBeNull();
    expect(mockBumps).toEqual(['billing']);
    await r.unmount();
  });

  test('the page never unloaded (the installed app shows Stripe over it): visible again, the label is back and Billing reloads', async () => {
    const r = await renderScreen(<ManageBillingButton />);
    await r.click(MANAGE_BILLING);
    await r.act(async () => setVisibility('hidden')); // Stripe covers the app: not a return
    expect(r.button(OPENING_STRIPE)).not.toBeNull();
    await r.act(async () => setVisibility('visible'));
    expect(r.button(MANAGE_BILLING)).not.toBeNull();
    expect(mockBumps).toEqual(['billing']);
    // Focus back on the window is a return too.
    await r.click(MANAGE_BILLING);
    await r.act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(r.button(MANAGE_BILLING)).not.toBeNull();
    expect(mockBumps).toEqual(['billing', 'billing']);
    await r.unmount();
  });

  test('the load was stopped (Esc, Stop) and nothing else happens: the button is back 10 s after the tap, with nothing to reload', async () => {
    jest.useFakeTimers();
    try {
      const r = await renderScreen(<ManageBillingButton />);
      await r.click(MANAGE_BILLING);
      await r.act(async () => { jest.advanceTimersByTime(9999); });
      expect(r.button(OPENING_STRIPE)).not.toBeNull();
      await r.act(async () => { jest.advanceTimersByTime(1); });
      expect(r.button(MANAGE_BILLING)).not.toBeNull();
      expect(mockBumps).toEqual([]);
      await r.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test('switching tabs while Stripe is still being asked is not a return: still busy, one call, then Stripe', async () => {
    let answer;
    mockAnswer = () => new Promise((resolve) => { answer = resolve; });
    const r = await renderScreen(<ManageBillingButton />);
    await r.click(MANAGE_BILLING);
    await r.act(async () => { setVisibility('hidden'); setVisibility('visible'); window.dispatchEvent(new Event('focus')); });
    const busy = r.button(OPENING_STRIPE);
    expect(busy).not.toBeNull();
    expect(busy.disabled).toBe(true);
    expect(mockBumps).toEqual([]);
    await r.act(async () => { answer({ url: SESSION }); });
    expect(mockCalls).toHaveLength(1);
    expect(assigned).toEqual([SESSION]);
    await r.unmount();
  });
});

// Review UX-5: a parent who gives up and moves to another tab is never pulled out to Stripe seconds later.
test('the button is gone before Stripe answers: nothing navigates', async () => {
  let answer;
  mockAnswer = () => new Promise((resolve) => { answer = resolve; });
  const r = await renderScreen(<ManageBillingButton />);
  await r.click(MANAGE_BILLING);
  await r.unmount();
  await act(async () => { answer({ url: SESSION }); });
  expect(assigned).toEqual([]);
});

// Review UX-4: busy is seen and heard.
test('busy: aria-busy on the button, the words in a status region, and a spinner drawn in the outline button\'s own colour', async () => {
  let answer;
  mockAnswer = () => new Promise((resolve) => { answer = resolve; });
  const r = await renderScreen(<ManageBillingButton />);
  expect(r.button(MANAGE_BILLING).getAttribute('aria-busy')).toBe('false');
  const status = r.container.querySelector('[role="status"]');
  expect(status.textContent).toBe('');
  await r.click(MANAGE_BILLING);
  const busy = r.button(OPENING_STRIPE);
  expect(busy.getAttribute('aria-busy')).toBe('true');
  expect(r.container.querySelector('[role="status"]')).toBe(status); // the same live region, now speaking
  expect(status.textContent).toBe(OPENING_STRIPE);
  const spinner = busy.querySelector('span[aria-hidden="true"]');
  expect(spinner.style.borderTopColor.toUpperCase()).toBe(color.text.toUpperCase()); // not black on the near-black card
  await r.act(async () => { answer({ url: SESSION }); });
  await r.unmount();
});

// Review F2: a family whose billing sits on more than one Stripe customer gets one button per customer.
test("a named button asks for that athlete's portal; the label and the hero's variant are the caller's", async () => {
  const r = await renderScreen(<ManageBillingButton athleteId="a2" label="Update payment method for Reese" variant="danger" height={50} />);
  const b = r.button('Update payment method for Reese');
  expect(b.style.height).toBe('50px');
  await r.click('Update payment method for Reese');
  expect(mockCalls).toEqual([{ returnPath: '/portal/billing', athleteId: 'a2' }]);
  expect(assigned).toEqual([SESSION]);
  await r.unmount();
});

test("refusals a retry cannot fix read in the server's own words", async () => {
  for (const [reason, message] of [
    ['several-customers', "Your family's billing is on more than one Stripe account. Contact the academy to update your card."],
    ['customer-missing', 'Your billing record in Stripe could not be found. Contact the academy.'],
    ['portal-not-set-up', 'Managing billing in Stripe is not switched on yet. Contact the academy to update your card.'],
  ]) {
    mockAnswer = async () => { throw refusal(reason, message); };
    const r = await renderScreen(<ManageBillingButton fallbackUrl={FALLBACK} />);
    await r.click(MANAGE_BILLING);
    expect(r.container.querySelector('[role="alert"]').textContent).toBe(message);
    await r.unmount();
  }
});

// Review SEC-1: the server refuses an unverified password login, as checkout does; the button sends them to the
// same verify step PayButton shows.
describe('an email that is not verified yet', () => {
  const UNVERIFIED = () => refusal('email-unverified', 'Verify your email to manage billing in Stripe.');

  test('the verify card, then "I\'ve verified" refreshes the token and opens Stripe', async () => {
    mockAnswer = async () => { throw UNVERIFIED(); };
    const r = await renderScreen(<ManageBillingButton fallbackUrl={FALLBACK} />);
    await r.click(MANAGE_BILLING);
    expect(mockCalls).toHaveLength(1); // still unverified on reload: no pointless retry
    expect(r.text()).toContain(VERIFY_TITLE);
    expect(r.text()).toContain('We sent a link to dana@email.com');
    expect(r.text()).not.toContain(PORTAL_FALLBACK_LINK); // the sign-in link would skip the proof
    expect(assigned).toEqual([]);
    mockAnswer = async () => ({ url: SESSION });
    await r.click(VERIFIED);
    expect(tokenRefreshes).toBe(1);
    expect(assigned).toEqual([SESSION]);
    await r.unmount();
  });

  test('verified in another tab: one retry with a fresh token, no card', async () => {
    auth.currentUser.emailVerified = true;
    let refusals = 1;
    mockAnswer = async () => {
      if (refusals > 0) { refusals -= 1; throw UNVERIFIED(); }
      return { url: SESSION };
    };
    const r = await renderScreen(<ManageBillingButton />);
    await r.click(MANAGE_BILLING);
    expect(mockCalls).toHaveLength(2);
    expect(tokenRefreshes).toBe(1);
    expect(assigned).toEqual([SESSION]);
    expect(r.text()).not.toContain(VERIFY_TITLE);
    await r.unmount();
  });
});
