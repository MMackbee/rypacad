/**
 * F5 call sites (speed work 2026-11-17): the hot staff hooks name their
 * resource (cacheKey) and pass their invalidation counters apart (gens), so
 * a revisit paints at once and a write never blanks the card. `deps` must
 * carry only the resource's identity - a generation number in it would
 * make every bump a "different key" (back to loading).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockCalls = [];
jest.mock('./useSeedResource', () => ({
  __esModule: true,
  default: (value, opts) => {
    mockCalls.push(opts);
    return { data: null, loading: true, error: null, isRefreshing: false };
  },
}));

import { useAdminDashboard, useCoachDay, useSpecialistSessions } from './index';
import useBillingHub, { useHouseholdsDirectory } from './billing';
import useSignups from './signups';
import { useConsentTracker } from './mentalConsentStaff';
import useScholarships from './scholarships';

beforeEach(() => { process.env.REACT_APP_PORTAL_LIVE_DATA = 'true'; mockCalls.length = 0; });
afterEach(() => { process.env.REACT_APP_PORTAL_LIVE_DATA = 'false'; });

async function optsOf(useHook) {
  function Probe() { useHook(); return null; }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await act(async () => root.unmount());
  return mockCalls[mockCalls.length - 1];
}

const cases = [
  ['admin dashboard', () => useAdminDashboard(), 'admin-dashboard', 7],
  ["a specialist's sessions", () => useSpecialistSessions('phil'), 'specialist-sessions', 2],
  ['the coach day', () => useCoachDay(), 'coach-day', 2],
  ["a family's billing hub (staff)", () => useBillingHub({ householdId: 'hh-1' }), 'billing-hub', 7],
  ['the households directory', () => useHouseholdsDirectory(), 'households-directory', 2],
  ['sign-ups', () => useSignups(), 'signups', 4],
  ['the consent tracker', () => useConsentTracker(), 'consent-tracker', 2],
  ['scholarships', () => useScholarships(), 'scholarships', 1],
];

test.each(cases)('%s names its resource, keeps identity in deps and generations in gens', async (_name, useHook, key, gensCount) => {
  const opts = await optsOf(useHook);
  expect(typeof opts.source).toBe('function');
  expect(opts.cacheKey).toBe(key);
  expect(Array.isArray(opts.gens)).toBe(true);
  expect(opts.gens).toHaveLength(gensCount);
  expect(opts.gens.every((g) => typeof g === 'number')).toBe(true);
  expect(opts.deps.some((d) => typeof d === 'number')).toBe(false);
});

test("the identity carries what tells one resource from another: the specialist, the household", async () => {
  expect((await optsOf(() => useSpecialistSessions('phil'))).deps).toContain('phil');
  expect((await optsOf(() => useSpecialistSessions('mental'))).deps).toContain('mental');
  expect((await optsOf(() => useBillingHub({ householdId: 'hh-a' }))).deps).toContain('hh-a');
});
