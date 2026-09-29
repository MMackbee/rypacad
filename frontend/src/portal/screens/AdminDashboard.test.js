import React from 'react';
import { renderScreen } from './testRender';
import AdminDashboard from './AdminDashboard';

jest.mock('../hooks', () => ({
  useAdminDashboard: () => ({ data: { outstanding: [], metrics: { enrolled: 3, enrolledLabel: 'enrolled athletes', fill: '50%', fillLabel: 'fill' }, enrollment: [], blockFill: [], membership: { active: 2, pastDue: 0, lapsed: 0, pending: 1, lapsedHouseholds: [] } } }),
  useSignups: () => ({ loading: false, error: null, data: { counts: { all: 2, unpaid: 1, flagged: 0, unresolved: 1 }, unresolved: [{ id: 'c9', outcome: 'unresolved', receivedAt: '2026-11-06T09:00' }], rows: [] } }),
}));
jest.mock('../hooks/billing', () => ({ useHouseholdsDirectory: () => ({ data: [], loading: false, error: null }) }));

test('the Sign-ups card replaces the enrollment queue; Pending is a stat; unmatched bookings count as flagged', async () => {
  const opened = [];
  const r = await renderScreen(<AdminDashboard bare role="owner" onOpenSignups={() => opened.push(1)} />);
  expect(r.text()).toContain('Sign-ups · 1 unpaid');
  expect(r.text()).toContain('2 self-signed households · 1 flagged');
  expect(r.text()).not.toContain('Enrollment queue');
  expect(r.text()).toContain('Pending');
  expect(r.text()).not.toContain('Approve');
  await r.click('Open sign-ups');
  expect(opened).toEqual([1]);
  await r.unmount();
});
