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
    status: { status: 'pending', paused: false, body: 'Jordan can book as soon as checkout is complete.', pendingAthletes: [{ athleteId: 'a1', name: 'Jordan' }] } } };
  const p = await renderScreen(<Membership bare />);
  expect(p.text()).toContain('Payment pending - finish checkout to start booking');
  expect(p.button('Pay now|a1|tier')).not.toBeNull();
  expect(p.button('Add facility access|a1|facility')).toBeNull();
  await p.unmount();
  mockMine = { loading: false, error: null, data: { member: { ...base, billing: { status: 'active', facility: null } }, status: { status: 'active', paused: false, pendingAthletes: [] } } };
  const a = await renderScreen(<Membership bare />);
  expect(a.button('Add facility access|a1|facility')).not.toBeNull();
  await a.unmount();
});
