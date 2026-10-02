import React from 'react';
import { renderScreen } from './testRender';
import AdminDashboard from './AdminDashboard';

/*
 * The Scholarship applications card is the owner's alone (2026-10-01).
 * Mounting it IS the read of scholarshipApplications (useScholarships), which
 * firestore.rules refuses to every other role, so "ops does not see it" has
 * to mean "ops never calls the hook" - counted here.
 */
let mockScholarships;
let mockScholarshipReads;
jest.mock('../hooks', () => ({
  useAdminDashboard: () => ({ data: { outstanding: [], metrics: { enrolled: 3, enrolledLabel: 'enrolled athletes', fill: '50%', fillLabel: 'fill' }, enrollment: [], blockFill: [], membership: { active: 2, pastDue: 0, lapsed: 0, pending: 1, lapsedHouseholds: [] } } }),
  useSignups: () => ({ loading: false, error: null, data: { counts: { all: 2, unpaid: 1, flagged: 0, unresolved: 0 }, unresolved: [], rows: [] } }),
  useScholarships: () => { mockScholarshipReads += 1; return mockScholarships; },
}));
jest.mock('../hooks/billing', () => ({ useHouseholdsDirectory: () => ({ data: [], loading: false, error: null }) }));

beforeEach(() => {
  mockScholarshipReads = 0;
  mockScholarships = { loading: false, error: null, data: { rows: [], counts: { new: 2, approved: 3, declined: 1, all: 6 } } };
});

test('an owner sees the card with the count of new applications, and the button opens them', async () => {
  const opened = [];
  const r = await renderScreen(<AdminDashboard bare role="owner" onOpenScholarships={() => opened.push(1)} />);
  expect(r.text()).toContain('Scholarship applications · 2 new');
  expect(r.text()).toContain('6 received · 3 approved · 1 declined.');
  expect(mockScholarshipReads).toBeGreaterThan(0);
  await r.click('Open applications');
  expect(opened).toEqual([1]);
  await r.unmount();
});

test('ops: no card, no scholarship read, and the dashboard is the one ops has today', async () => {
  const today = await renderScreen(<AdminDashboard bare role="ops" onOpenSignups={() => {}} />);
  const before = today.container.innerHTML;
  await today.unmount();
  // Even handed the owner's destination, an ops dashboard mounts nothing of it.
  const r = await renderScreen(<AdminDashboard bare role="ops" onOpenSignups={() => {}} onOpenScholarships={() => {}} />);
  expect(r.text()).not.toMatch(/scholarship/i);
  expect(r.button('Open applications')).toBeNull();
  expect(r.container.innerHTML).toBe(before);
  expect(r.text()).toContain('Sign-ups · 1 unpaid');
  expect(mockScholarshipReads).toBe(0);
  await r.unmount();
});

test('an owner with no destination supplied (the harness, or a session still resolving): no card, no read', async () => {
  const r = await renderScreen(<AdminDashboard bare role="owner" />);
  expect(r.text()).not.toMatch(/scholarship/i);
  expect(mockScholarshipReads).toBe(0);
  await r.unmount();
});

test('loading and a failed load are said plainly; the way in stays', async () => {
  mockScholarships = { loading: true, error: null, data: null };
  const loading = await renderScreen(<AdminDashboard bare role="owner" onOpenScholarships={() => {}} />);
  expect(loading.text()).toContain('Scholarship applications · …');
  expect(loading.text()).not.toContain('0 new');
  await loading.unmount();
  mockScholarships = { loading: false, error: new Error('fetchScholarshipApplications: unavailable'), data: null };
  const failed = await renderScreen(<AdminDashboard bare role="owner" onOpenScholarships={() => {}} />);
  expect(failed.text()).toContain("Applications didn't load.");
  expect(failed.text()).not.toMatch(/unavailable|0 new/);
  expect(failed.button('Open applications')).not.toBeNull();
  await failed.unmount();
});
