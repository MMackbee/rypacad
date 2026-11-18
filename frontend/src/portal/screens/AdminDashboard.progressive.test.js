/**
 * The Admin dashboard paints card by card (speed review F6, 2026-11-17):
 * useAdminDashboard fills `data` as each group of reads lands and says per
 * card whether it is still loading (`status`). While its reads are in
 * flight the Outstanding card says so - never "Outstanding · 0", which read
 * as "nobody needs a call" - and a failed read says it failed.
 */
import React from 'react';
import { renderScreen } from './testRender';
import AdminDashboard from './AdminDashboard';

let mockAdmin;
jest.mock('../hooks', () => ({
  useAdminDashboard: () => mockAdmin,
  useSignups: () => ({ loading: false, error: null, data: { counts: { all: 0, unpaid: 0, flagged: 0, unresolved: 0 }, unresolved: [], rows: [] } }),
}));
jest.mock('../hooks/billing', () => ({ useHouseholdsDirectory: () => ({ data: [], loading: false, error: null }) }));
jest.mock('../hooks/mentalConsentStaff', () => ({ useConsentTracker: () => ({ data: [], loading: false, error: null }) }));

const WEEK_ONLY = {
  outstanding: null, metrics: null, enrollment: null, highlightPackage: null, membership: null,
  blockFill: [{ day: 'Mon', pct: 50 }], reservedBlocks: [], filter: { id: 'all', label: 'All tiers' }, weekLabel: 'Week of Monday, Nov 9',
};
const idle = { loading: false, error: null };

afterEach(() => { window.localStorage.clear(); });

test('first paint, nothing landed: Outstanding is loading, not "Outstanding · 0"', async () => {
  mockAdmin = { data: null, loading: true, error: null, status: { outstanding: { loading: true, error: null }, roster: { loading: true, error: null }, week: { loading: true, error: null } } };
  const r = await renderScreen(<AdminDashboard bare role="owner" />);
  expect(r.text()).toContain('Outstanding · …');
  expect(r.text()).not.toContain('Outstanding · 0');
  expect(r.container.querySelector('button[aria-controls="outstanding-rows"]')).toBeNull();
  await r.unmount();
});

test('the week landed first: block fill paints while Outstanding still loads', async () => {
  mockAdmin = { data: WEEK_ONLY, loading: true, error: null, status: { outstanding: { loading: true, error: null }, roster: { loading: true, error: null }, week: idle } };
  const r = await renderScreen(<AdminDashboard bare role="owner" />);
  expect(r.text()).toContain('Block fill this week');
  expect(r.text()).toContain('Outstanding · …');
  expect(r.text()).not.toContain('Outstanding · 0');
  await r.unmount();
});

test("Outstanding's reads failed: it says so, with no count", async () => {
  const err = Object.assign(new Error('unavailable'), { code: 'unavailable' });
  mockAdmin = { data: WEEK_ONLY, loading: false, error: err, status: { outstanding: { loading: false, error: err }, roster: { loading: false, error: err }, week: idle } };
  const r = await renderScreen(<AdminDashboard bare role="owner" />);
  expect(r.text()).toContain("Who needs a call didn't load. Check your connection and try again.");
  expect(r.text()).not.toContain('Outstanding · 0');
  expect(r.text()).not.toContain('Outstanding · …');
  await r.unmount();
});

test('landed with no rows: the plain "Outstanding · 0" label, as before', async () => {
  mockAdmin = { data: { ...WEEK_ONLY, outstanding: [] }, loading: false, error: null, status: { outstanding: idle, roster: idle, week: idle } };
  const r = await renderScreen(<AdminDashboard bare role="owner" />);
  expect(r.text()).toContain('Outstanding · 0');
  expect(r.text()).not.toContain("didn't load");
  await r.unmount();
});
