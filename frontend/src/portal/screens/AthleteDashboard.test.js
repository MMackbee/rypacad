import React from 'react';
import { renderScreen } from './testRender';
import AthleteDashboard from './AthleteDashboard';

/**
 * K33: the home screen's Commitment Contract card shows the hook's badge -
 * the Contract screen's own pill - not a hard-coded "On track"; before the
 * contract starts it is the line alone (contract-buffer ruling, 2026-09-30).
 */

let mockContract;
let mockMine = { data: null, loading: false, error: null };
jest.mock('../hooks/packageChange', () => ({ useChangePackage: () => ({ change: async () => ({}) }) }));
let mockTokens = null;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: () => null }));
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
      athlete: { name: 'Jordan', fullName: 'Jordan', date: 'Wednesday, Nov 11', billingStatus: 'active', tokens: mockTokens },
      nextSession: null,
      contract: mockContract,
      onboarding: null,
      diagnosticCaptured: true,
    },
  }),
}));

const card = (r) =>
  [...r.container.querySelectorAll('div')].find((d) => d.firstChild?.textContent?.startsWith('Commitment Contract'))?.parentElement;

test('a Behind contract shows the red Behind badge, not "On track"', async () => {
  mockContract = {
    logged: 0, total: 6, month: 'November', pct: 0, kind: 'behind',
    line: '6 days behind with 14 contract days left.',
    badge: { tone: 'red', label: 'Behind' },
  };
  const r = await renderScreen(<AthleteDashboard bare />);
  const c = card(r);
  expect(c.textContent).toContain('Behind');
  expect(c.textContent).not.toContain('On track');
  const badge = [...c.querySelectorAll('span')].find((s) => s.textContent === 'Behind');
  expect(badge.style.color).toBe('rgb(255, 68, 68)');
  expect(c.textContent).toContain('of 6 days due · November');
  await r.unmount();
});

test('before the contract starts: no badge and no count, just the line', async () => {
  mockContract = {
    logged: 0, total: 0, month: 'October', pct: 0, kind: 'notStarted', badge: null,
    line: "Your contract starts Tuesday, Nov 3. Days before then don't count for or against you.",
  };
  const r = await renderScreen(<AthleteDashboard bare />);
  const c = card(r);
  expect(c.textContent).toContain('Your contract starts Tuesday, Nov 3.');
  expect(c.textContent).not.toContain('On track');
  expect(c.textContent).not.toContain('days due');
  await r.unmount();
});

test("an unpaid athlete's own pending card can change their package before Pay now (tester S4)", async () => {
  mockContract = null;
  mockMine = { loading: false, error: null, data: { status: { status: 'pending', title: 'Payment pending', body: null,
    pendingAthletes: [{ athleteId: 'a1', name: 'Jordan', status: 'pending', packageId: 't-6', perPurchase: false }] } } };
  const r = await renderScreen(<AthleteDashboard bare />);
  expect(r.text()).toContain('6 tokens · Change package');
  await r.click('Change package for Jordan');
  expect(r.text()).toContain('Change your package');
  await r.click('Keep 6 tokens');
  expect(r.text()).not.toContain('Change your package');
  await r.unmount();
  mockMine = { data: null, loading: false, error: null };
});

test('the tokens card: "Tokens start Nov 1" before the season, "Pay to start" unpaid (tester report 2026-09-30)', async () => {
  mockContract = null;
  const t = (over) => ({ granted: 16, used: 0, reserved: 0, left: 16, unlimited: false, grace: [], startsOn: '2026-11-01', unpaid: false, ...over });
  mockTokens = t();
  const r = await renderScreen(<AthleteDashboard bare />);
  expect(r.text()).toContain('Tokens start Nov 1');
  expect(r.text()).not.toContain('16 left');
  await r.unmount();
  mockTokens = t({ unpaid: true });
  const u = await renderScreen(<AthleteDashboard bare />);
  expect(u.text()).toContain('Pay to start');
  expect(u.text()).not.toContain('of 16 used');
  await u.unmount();
  mockTokens = null;
});
