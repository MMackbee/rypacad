import React from 'react';
import { renderScreen } from './testRender';
import AdminDashboard from './AdminDashboard';

jest.mock('../hooks', () => ({
  useAdminDashboard: () => ({ data: { outstanding: [], metrics: { enrolled: 3, enrolledLabel: 'enrolled athletes', fill: '50%', fillLabel: 'fill' }, enrollment: [], blockFill: [], membership: { active: 2, pastDue: 0, lapsed: 0, lapsedHouseholds: [] } } }),
}));
jest.mock('../hooks/billing', () => ({ useHouseholdsDirectory: () => ({ data: [], loading: false, error: null }) }));

test('without useSignups (routing Task 13 not merged) the dashboard still renders', async () => {
  const r = await renderScreen(<AdminDashboard bare role="owner" />);
  expect(r.text()).toContain('Sign-ups · 0 unpaid');
  expect(r.text()).toContain('Pending');
  await r.unmount();
});
