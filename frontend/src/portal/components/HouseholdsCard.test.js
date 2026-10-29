/**
 * The Households card on the admin dashboard (assessments plan, Addendum 1):
 * the staging test family (test: true, data/testFamily.js) stays in the
 * directory by name, so staff can open it, but is labelled Test and left
 * out of "Households · N". Runs the real directory read (hooks/billing.js)
 * over mocked live fetches.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));
// CRA's resetMocks clears these before every test: each test sets its own.
jest.mock('../hooks/live', () => ({
  ...jest.requireActual('../hooks/live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchAllAthletes: jest.fn(),
  fetchAllHouseholds: jest.fn(),
}));

import React from 'react';
import { renderScreen } from '../screens/testRender';
import * as live from '../hooks/live';
import HouseholdsCard from './HouseholdsCard';

test('a directory with one test household and two real ones shows "Households · 2"; the test family is listed, labelled Test (owner, 2026-10-15)', async () => {
  live.isLive.mockReturnValue(true);
  live.fetchAllHouseholds.mockResolvedValue([
    { id: 'kim', name: 'Kim family' },
    { id: 'ryp-test-family', name: 'RYP Test Family', test: true },
    { id: 'lee', name: 'Lee family', membership: { status: 'past_due' } },
  ]);
  live.fetchAllAthletes.mockResolvedValue([
    { id: 'k1', name: 'Ava Kim', householdId: 'kim', packageId: null },
    { id: 'ryp-test-ava', name: 'Ava Test', householdId: 'ryp-test-family', test: true, packageId: null },
  ]);
  const opened = [];
  const r = await renderScreen(<HouseholdsCard onOpenHousehold={(id) => opened.push(id)} />);
  await r.flush();
  expect(r.text()).toContain('Households · 2');
  const rows = [...r.container.querySelectorAll('button')];
  expect(rows.map((b) => b.querySelector('div > div')?.textContent)).toEqual(['Kim family', 'Lee family', 'RYP Test Family']);
  const badges = (row) => [...row.querySelectorAll('span')].map((s) => s.textContent).filter((t) => t !== '›');
  expect(rows.map(badges)).toEqual([['Active'], ['Past due'], ['Test']]);
  const testRow = rows[2];
  await r.click(testRow.textContent.trim());
  expect(opened).toEqual(['ryp-test-family']);
  await r.unmount();
});

test('with no test household the count is every household', async () => {
  live.isLive.mockReturnValue(true);
  live.fetchAllHouseholds.mockResolvedValue([{ id: 'kim', name: 'Kim family' }, { id: 'lee', name: 'Lee family' }]);
  live.fetchAllAthletes.mockResolvedValue([]);
  const r = await renderScreen(<HouseholdsCard onOpenHousehold={() => {}} />);
  await r.flush();
  expect(r.text()).toContain('Households · 2');
  expect(r.text()).not.toMatch(/\bTest\b/);
  await r.unmount();
});
