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
jest.mock('../components/PayButton', () => ({ __esModule: true, default: () => null }));
jest.mock('../hooks/billing', () => ({
  __esModule: true,
  useMyTokens: () => ({ data: null, loading: false, error: null }),
  usePaymentConfirmation: () => ({ state: 'idle', packageId: null }),
}));
jest.mock('../hooks', () => ({
  useAthleteDashboard: () => ({
    loading: false,
    error: null,
    data: {
      athlete: { name: 'Jordan', fullName: 'Jordan', date: 'Wednesday, Nov 11', billingStatus: 'active', tokens: null },
      nextSession: null,
      contract: mockContract,
      onboarding: mockOnboarding,
      diagnosticCaptured: true,
    },
  }),
}));

const card = (r) =>
  [...r.container.querySelectorAll('div')].find((d) => d.firstChild?.textContent?.startsWith('Commitment Contract'))?.parentElement;

// Contract ON here; AthleteDashboard.off.test.js covers it hidden.
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
