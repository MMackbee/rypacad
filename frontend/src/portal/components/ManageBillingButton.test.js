/**
 * "Manage billing in Stripe" (2026-11-17): the button asks openBillingPortal
 * for a Stripe portal session and sends THIS tab there (never window.open
 * after an await: iOS Safari and the installed app block it as a popup). A
 * failure says so under the button, with the old sign-in link as a fallback
 * when the build has one. Seed and practice modes never call. Plain
 * functions, not jest.fn(): CRA's resetMocks would clear them.
 */
import React from 'react';
import { renderScreen } from '../screens/testRender';
import ManageBillingButton from './ManageBillingButton';
import { openBillingPortal } from '../hooks/billingPortal';
import { MANAGE_BILLING, OPENING_STRIPE, PORTAL_ERROR_LINE, PORTAL_FALLBACK_LINK } from '../data/billingCopy';

jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), isLive: () => mockLive }));
jest.mock('../hooks/callables', () => ({
  callOpenBillingPortal: (payload) => {
    mockCalls.push(payload);
    return mockAnswer(payload);
  },
}));

const SESSION = 'https://billing.stripe.com/p/session/test_abc';
const FALLBACK = 'https://billing.stripe.com/p/login/test_x';
let mockLive;
let mockCalls;
let mockAnswer;
let assigned;
const realLocation = window.location;

function refusal(reason, message) {
  const err = new Error(message);
  err.reason = reason;
  return err;
}

beforeEach(() => {
  mockLive = true;
  mockCalls = [];
  mockAnswer = async () => ({ url: SESSION });
  assigned = [];
  delete window.location;
  window.location = { ...realLocation, assign: (url) => assigned.push(url) };
});
afterEach(() => {
  window.location = realLocation;
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
