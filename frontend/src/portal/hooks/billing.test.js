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

import { allPerPurchaseOf, pendingOf, warnMissingPortalUrl } from './billing';

test('pendingOf marks single-token athletes perPurchase and carries the package; allPerPurchaseOf is true only for an all-single household', () => {
  const ids = { single: 'single', tokens: 't-12' };
  const m = (id, kind, status) => ({ athleteId: id, name: id, package: kind ? { id: ids[kind] ?? kind, kind } : null, billing: { status } });
  const members = [m('ava', 'single', 'pending'), m('ben', 'tokens', 'lapsed'), m('cy', 'single', 'active'), m('dee', null, 'pending')];
  expect(pendingOf(members)).toEqual([
    { athleteId: 'ava', name: 'ava', status: 'pending', perPurchase: true, packageId: 'single' },
    { athleteId: 'ben', name: 'ben', status: 'lapsed', perPurchase: false, packageId: 't-12' },
    { athleteId: 'dee', name: 'dee', status: 'pending', perPurchase: false, packageId: null },
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
