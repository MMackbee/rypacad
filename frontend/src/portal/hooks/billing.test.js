/**
 * hooks/billing.js' Sprint 20 guard (spec 4.4: REACT_APP_STRIPE_PORTAL_URL
 * is REQUIRED in production): a live build without it warns ONCE per page
 * load; seed mode and a set URL never warn. Firebase is mocked out.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));
// CRA's resetMocks clears these before every test: isLive() reads falsy (seed)
// unless a test turns it on.
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchBookings: jest.fn(),
  fetchGraceTokensByAthlete: jest.fn(),
  fetchHousehold: jest.fn(),
  fetchHouseholdAthletes: jest.fn(),
  fetchPackage: jest.fn(),
  fetchSessionsByIds: jest.fn(),
}));
jest.mock('./grace', () => ({ ...jest.requireActual('./grace'), __esModule: true, fetchTokenPeriod: jest.fn() }));
jest.mock('./waitlist', () => ({ ...jest.requireActual('./waitlist'), __esModule: true, fetchWaitlistByAthlete: jest.fn() }));
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import useBillingHub, { allPerPurchaseOf, pendingOf, tokensStartOf, warnMissingPortalUrl } from './billing';
import * as live from './live';
import * as grace from './grace';
import * as waitlist from './waitlist';
import * as calendar from '../data/calendar';

test('tokensStartOf: the first period start while any member is pre-season (tester report 2026-09-30)', () => {
  const m = (preSeason, start) => ({ period: { preSeason, start } });
  expect(tokensStartOf([m(false, '2026-09-01'), m(true, '2026-11-01')])).toBe('2026-11-01');
  // All Elite (their period stays current) and every period from Nov 1 on: the reset title stands.
  expect(tokensStartOf([m(false, '2026-09-01')])).toBeNull();
  expect(tokensStartOf([m(false, '2026-12-01'), { period: null }])).toBeNull();
  expect(tokensStartOf([])).toBeNull();
});

test('pendingOf marks single-token athletes perPurchase; allPerPurchaseOf is true only for an all-single household', () => {
  const m = (id, kind, status) => ({ athleteId: id, name: id, package: kind ? { kind } : null, billing: { status } });
  const members = [m('ava', 'single', 'pending'), m('ben', 'tokens', 'lapsed'), m('cy', 'single', 'active'), m('dee', null, 'pending')];
  expect(pendingOf(members)).toEqual([
    { athleteId: 'ava', name: 'ava', status: 'pending', perPurchase: true },
    { athleteId: 'ben', name: 'ben', status: 'lapsed', perPurchase: false },
    { athleteId: 'dee', name: 'dee', status: 'pending', perPurchase: false },
  ]);
  expect(allPerPurchaseOf([m('ava', 'single', 'active'), m('cy', 'single', 'pending')])).toBe(true);
  expect(allPerPurchaseOf(members)).toBe(false);
  expect(allPerPurchaseOf([m('ben', 'elite', 'active')])).toBe(false);
  expect(allPerPurchaseOf([])).toBe(false);
});

test('warnMissingPortalUrl fires once, only live, only when the URL is missing', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(warnMissingPortalUrl({ live: false, url: null })).toBe(false);
  expect(warnMissingPortalUrl({ live: true, url: 'https://billing.stripe.com/p/login/test_x' })).toBe(false);
  expect(warn).not.toHaveBeenCalled();
  expect(warnMissingPortalUrl({ live: true, url: null })).toBe(true);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain('REACT_APP_STRIPE_PORTAL_URL');
  expect(warnMissingPortalUrl({ live: true, url: null })).toBe(false); // once per page load
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

// Kept after the warn test: a live hub load spends the once-per-load warning.
test('the live hub counts and labels an October booking under November (review 2026-09-30)', async () => {
  calendar.todayISO.mockReturnValue('2026-10-20');
  live.isLive.mockReturnValue(true);
  live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1 });
  live.fetchHouseholdAthletes.mockResolvedValue([{ id: 'a1', name: 'Jordan', householdId: 'h1', packageId: 't-16' }]);
  live.fetchPackage.mockResolvedValue({ id: 't-16', name: '16 tokens', kind: 'tokens', tokens: 16 });
  live.fetchBookings.mockResolvedValue([
    { id: 'a1_phil', sessionId: 'phil-1024', date: '2026-10-24', periodKey: '2026-10-01', status: 'confirmed', type: 'phil' },
  ]);
  live.fetchGraceTokensByAthlete.mockResolvedValue([]);
  live.fetchSessionsByIds.mockResolvedValue([{ id: 'phil-1024', date: '2026-10-24', type: 'phil', label: 'Performance with Phil', time: '4:00' }]);
  grace.fetchTokenPeriod.mockResolvedValue(null);
  waitlist.fetchWaitlistByAthlete.mockResolvedValue([]);

  const result = { current: null };
  function Probe() {
    result.current = useBillingHub({ householdId: 'h1' });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(result.current.error).toBeNull();
  const [jordan] = result.current.data.members;
  expect(jordan.tokens).toMatchObject({ granted: 16, used: 1, left: 15, startsOn: '2026-11-01' });
  expect(live.fetchSessionsByIds).toHaveBeenCalledWith(['phil-1024']);
  expect(jordan.spent).toEqual([expect.objectContaining({ id: 'a1_phil', label: 'Performance with Phil', time: '4:00' })]);
  await act(async () => root.unmount());
});
