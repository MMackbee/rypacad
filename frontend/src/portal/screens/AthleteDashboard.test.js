import React from 'react';
import { renderScreen } from './testRender';
import AthleteDashboard from './AthleteDashboard';

/**
 * K33: the home screen's Commitment Contract card shows the hook's badge -
 * the Contract screen's own pill - not a hard-coded "On track"; before the
 * contract starts it is the line alone (contract-buffer ruling, 2026-09-30).
 */

let mockContract;
let mockOnboarding = null;
let mockMine = { data: null, loading: false, error: null };
jest.mock('../hooks/packageChange', () => ({ useChangePackage: () => ({ change: async () => ({}) }) }));
let mockTokens = null;
let mockConfirm = { state: 'idle', packageId: null };
let mockSelfManaged = false;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: () => null }));
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, useSelfManaged: () => mockSelfManaged }));
jest.mock('../hooks/billing', () => ({
  __esModule: true,
  useMyTokens: () => mockMine,
  usePaymentConfirmation: () => mockConfirm,
}));
jest.mock('../hooks', () => ({
  useAthleteDashboard: () => ({
    loading: false,
    error: null,
    data: {
      athlete: { name: 'Jordan', fullName: 'Jordan', date: 'Wednesday, Nov 11', billingStatus: 'active', tokens: mockTokens },
      nextSession: null,
      contract: mockContract,
      onboarding: mockOnboarding,
      diagnosticCaptured: true,
    },
  }),
}));

const card = (r) =>
  [...r.container.querySelectorAll('div')].find((d) => d.firstChild?.textContent?.startsWith('Commitment Contract'))?.parentElement;

// Contract ON unless a test says otherwise; the last describe covers it hidden.
beforeEach(() => { process.env.REACT_APP_CONTRACT_ENABLED = 'true'; });
afterEach(() => { delete process.env.REACT_APP_CONTRACT_ENABLED; });

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

test("the facility add-on ticked at sign-up shows on the athlete's own home too (owner 2026-09-30)", async () => {
  mockContract = null;
  const pending = { status: 'pending', title: 'Payment pending', body: null, pendingAthletes: [{ athleteId: 'a1', name: 'Jordan', status: 'pending', packageId: 't-6', perPurchase: false }] };
  mockMine = { loading: false, error: null, data: { status: pending, facilityPending: [{ athleteId: 'a1', name: 'Jordan', state: 'waiting' }] } };
  const w = await renderScreen(<AthleteDashboard bare />);
  // A child's login is part of a family: the add-on is the family's (owner ruling 2026-09-30).
  expect(w.text()).toContain('Family facility access · after the membership is paid');
  await w.unmount();
  mockMine = { loading: false, error: null, data: { status: { status: 'active' }, facilityPending: [{ athleteId: 'a1', name: 'Jordan', state: 'pay' }] } };
  const r = await renderScreen(<AthleteDashboard bare />);
  expect(r.text()).toContain("Family facility access - pay when you're ready");
  await r.unmount();
  // Back from the add-on's own checkout: nothing to pay twice while it confirms.
  const back = await renderScreen(<AthleteDashboard bare />, { path: '/portal/home?paid=a1&product=facility' });
  expect(back.text()).not.toContain("pay when you're ready");
  await back.unmount();
  mockMine = { data: null, loading: false, error: null };
});

test("What's next names the add-on as the pending card under it does: the family's on a child's login, plain for the adult on their own (review 2026-09-30)", async () => {
  mockContract = null;
  mockConfirm = { state: 'confirmed', packageId: 't-6' };
  mockMine = { loading: false, error: null, data: { status: { status: 'active' }, facilityPending: [{ athleteId: 'a1', name: 'Jordan', state: 'pay' }] } };
  const child = await renderScreen(<AthleteDashboard bare />, { path: '/portal/home?paid=a1' });
  expect(child.text()).toContain("Family facility access: pay from your home page whenever you're ready.");
  expect(child.text()).toContain("Family facility access - pay when you're ready");
  await child.unmount();
  mockSelfManaged = true;
  const adult = await renderScreen(<AthleteDashboard bare />, { path: '/portal/home?paid=a1' });
  expect(adult.text()).toContain("Facility access: pay from your home page whenever you're ready.");
  expect(adult.text()).toContain("Facility access - pay when you're ready");
  expect(adult.text()).not.toContain('Family facility access');
  await adult.unmount();
  mockSelfManaged = false;
  mockConfirm = { state: 'idle', packageId: null };
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

// Tester Mike 2026-09-30: no talk of tokens for Elite members.
test('the empty state and the package card: token wording for a token athlete, none for Elite', async () => {
  mockContract = null;
  mockTokens = { granted: 6, used: 1, reserved: 0, left: 5, unlimited: false, grace: [], startsOn: null, unpaid: false };
  const member = await renderScreen(<AthleteDashboard bare />);
  expect(member.text()).toContain('Nothing is on your schedule right now - book any open block. Cancelling with notice keeps your token.');
  expect(member.text()).toContain('Tokens this period');
  await member.unmount();

  mockTokens = { unlimited: true, granted: null, left: null, grace: [{ id: 'g1', expiresAt: '2026-12-01', reason: 'session-cancelled' }] };
  const elite = await renderScreen(<AthleteDashboard bare />);
  expect(elite.text()).toContain('Nothing is on your schedule right now - book any open block.');
  expect(elite.text()).toContain('Your package');
  expect(elite.text()).toContain('Elite · unlimited');
  expect(elite.text()).not.toMatch(/token/i);
  await elite.unmount();
  mockTokens = null;
});

// A session token is good all season: its card never says "this period".
test('the tokens card of a single-token athlete is labelled without a period', async () => {
  mockContract = null;
  mockTokens = { granted: 0, used: 0, reserved: 0, left: 0, unlimited: false, perPurchase: true, held: 0, grace: [{ id: 'single_cs_1', expiresAt: '2027-02-27', reason: 'single-purchase', sourceSessionId: null }] };
  const r = await renderScreen(<AthleteDashboard bare />);
  expect(r.text()).toContain('Your session tokens');
  expect(r.text()).toContain('1 session token - good through Sat, Feb 27');
  expect(r.text()).not.toContain('Tokens this period');
  expect(r.text()).not.toContain('Your package');
  await r.unmount();
  mockTokens = null;
});

// Review 2026-10-01: the first-visit walkthrough offer names tokens while the
// contract is hidden - not to an Elite athlete.
test('the walkthrough offer: "see how tokens work" for a token athlete, no token wording for Elite', async () => {
  delete process.env.REACT_APP_CONTRACT_ENABLED;
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
  mockContract = null;
  mockTokens = { granted: 6, used: 1, reserved: 0, left: 5, unlimited: false, grace: [], startsOn: null, unpaid: false };
  const member = await renderScreen(<AthleteDashboard bare />);
  expect(member.text()).toContain('look around your home, book a block, see how tokens work.');
  await member.unmount();

  mockTokens = { unlimited: true, granted: null, left: null, grace: [] };
  const elite = await renderScreen(<AthleteDashboard bare />);
  expect(elite.text()).toContain('look around your home and book a block. Nothing you try in it becomes real.');
  expect(elite.text()).not.toMatch(/token/i);
  await elite.unmount();
  mockTokens = null;
});

describe('Commitment Contract hidden (owner ruling 2026-09-30)', () => {
  const behind = {
    logged: 0, total: 6, month: 'November', pct: 0, kind: 'behind',
    line: '6 days behind with 14 contract days left.', badge: { tone: 'red', label: 'Behind' },
  };
  const checklist = [
    { id: 'enroll', label: 'Enrollment complete', state: 'done' },
    { id: 'contract', label: 'Commitment Contract tier', state: 'todo' },
  ];
  afterEach(() => { mockOnboarding = null; });

  test('on: the card, Log today, the Contract tab and the checklist row, as before', async () => {
    mockContract = behind;
    const r = await renderScreen(<AthleteDashboard bare />);
    expect(card(r)).toBeTruthy();
    expect(r.button('Log today')).not.toBeNull();
    expect(r.button('Contract')).not.toBeNull();
    await r.unmount();
    mockOnboarding = checklist;
    const n = await renderScreen(<AthleteDashboard bare variant="new" />);
    expect(n.text()).toContain('Commitment Contract tier');
    await n.unmount();
  });

  test('off: no card, no badge, no Log today, no Contract tab, no checklist row', async () => {
    delete process.env.REACT_APP_CONTRACT_ENABLED;
    mockContract = behind;
    const r = await renderScreen(<AthleteDashboard bare />);
    expect(card(r)).toBeUndefined();
    expect(r.text()).not.toContain('Commitment Contract');
    expect(r.text()).not.toContain('Behind');
    expect(r.button('Log today')).toBeNull();
    expect(r.button('Contract')).toBeNull();
    expect(r.button('Tour')).not.toBeNull();
    await r.unmount();
    mockOnboarding = checklist;
    const n = await renderScreen(<AthleteDashboard bare variant="new" />);
    expect(n.text()).toContain('Enrollment complete');
    expect(n.text()).not.toContain('Commitment Contract');
    await n.unmount();
  });
});
