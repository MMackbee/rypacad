import React from 'react';
import { renderScreen } from './testRender';
import Membership from './Membership';

let mockMine;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label }) => <button type="button">{label}|{athleteId}|{product}</button> }));
jest.mock('../components/TokenMeter', () => ({ __esModule: true, default: () => 'METER' }));
jest.mock('../hooks/billing', () => ({ __esModule: true, default: () => ({}), useMyTokens: () => mockMine, usePaymentConfirmation: () => ({ state: 'idle' }), STRIPE_PORTAL_URL: null }));

test('pending athlete sees the banner and Pay now; paid athlete sees the facility offer', async () => {
  const base = { athleteId: 'a1', name: 'Jordan', package: { kind: 'tokens', name: '12 tokens' }, tokens: { left: 12 }, coaching: null, contractMinutes: null, facilityAccess: false };
  mockMine = { loading: false, error: null, data: { member: { ...base, billing: { status: 'pending', facility: null } },
    status: { status: 'pending', paused: false, body: "Jordan can book once checkout is complete (token packages from Sat, Oct 10 at 7 AM). Billed monthly on the 1st once you've paid.", pendingAthletes: [{ athleteId: 'a1', name: 'Jordan' }] } } };
  const p = await renderScreen(<Membership bare />);
  expect(p.text()).toContain('Payment pending - finish checkout to start booking');
  expect(p.text()).toContain('Jordan can book once checkout is complete (token packages from Sat, Oct 10 at 7 AM).');
  expect(p.button('Pay now|a1|tier')).not.toBeNull();
  expect(p.button('Add facility access|a1|facility')).toBeNull();
  await p.unmount();
  mockMine = { loading: false, error: null, data: { member: { ...base, billing: { status: 'active', facility: null } }, status: { status: 'active', paused: false, pendingAthletes: [] } } };
  const a = await renderScreen(<Membership bare />);
  expect(a.button('Add facility access|a1|facility')).not.toBeNull();
  await a.unmount();
});

test('the contract tier line shows only with the Commitment Contract on (owner ruling 2026-09-30)', async () => {
  const member = { athleteId: 'a1', name: 'Jordan', package: { kind: 'tokens', name: '12 tokens' }, tokens: { left: 12 }, coaching: null, contractMinutes: 45, facilityAccess: false, billing: { status: 'active', facility: null } };
  mockMine = { loading: false, error: null, data: { member, status: { status: 'active', paused: false, pendingAthletes: [] } } };
  const off = await renderScreen(<Membership bare />);
  expect(off.text()).not.toMatch(/contract/i);
  await off.unmount();
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  try {
    const on = await renderScreen(<Membership bare />);
    await on.click('45 min contract tier · View contract›');
    expect(on.location().pathname).toBe('/portal/contract');
    await on.unmount();
  } finally {
    delete process.env.REACT_APP_CONTRACT_ENABLED;
  }
});

// Owner report (Mike S6 2026-09-30): Home -> Membership is the path the 18+
// athlete took looking for billing; a child's login gets no Billing link.
test('the self-managed athlete has a Billing link beside the tokens card and a Billing tab; a child has neither', async () => {
  const member = { athleteId: 'a1', name: 'Sam', package: { kind: 'tokens', name: '12 tokens' }, tokens: { left: 12 }, coaching: null, contractMinutes: null, facilityAccess: false, billing: { status: 'active', facility: null } };
  mockMine = { loading: false, error: null, data: { member, status: { status: 'active', paused: false, pendingAthletes: [] } } };
  const self = await renderScreen(<Membership bare selfManaged />);
  expect(self.button('Billing')).not.toBeNull(); // the tab
  await self.click('Billing ›');
  expect(self.location().pathname).toBe('/portal/billing');
  await self.unmount();
  const child = await renderScreen(<Membership bare />);
  expect(child.button('Billing ›')).toBeNull();
  expect(child.button('Billing')).toBeNull();
  await child.unmount();
});
