/**
 * hooks/billing.js' Sprint 20 guard (spec 4.4: REACT_APP_STRIPE_PORTAL_URL
 * is REQUIRED in production): a live build without it warns ONCE per page
 * load; seed mode and a set URL never warn. Firebase is mocked out. The
 * ?paid= confirmation hook runs against a mocked ./live (the single-token
 * return, owner ruling 2026-09-29/30).
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));
const mockLive = { athlete: null, grace: [], reads: [] };
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  isLive: () => true,
  fetchAthlete: async (id) => { mockLive.reads.push(`athlete:${id}`); return mockLive.athlete; },
  fetchGraceTokensByAthlete: async (id) => { mockLive.reads.push(`grace:${id}`); return mockLive.grace; },
}));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { allPerPurchaseOf, pendingOf, usePaymentConfirmation, warnMissingPortalUrl } from './billing';

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

describe('usePaymentConfirmation (the ?paid= return)', () => {
  function Probe({ athleteId, cs, single, onState }) {
    onState(usePaymentConfirmation(athleteId, { cs, single }));
    return null;
  }
  async function mount(props) {
    const states = [];
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => { root.render(<Probe {...props} onState={(s) => states.push(s)} />); });
    return { last: () => states[states.length - 1], unmount: () => act(async () => { root.unmount(); }) };
  }
  // One poll: fire the due timer, then let the awaited read settle.
  const poll = (ms) => act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });

  beforeEach(() => {
    jest.useFakeTimers('modern');
    mockLive.athlete = null;
    mockLive.grace = [];
    mockLive.reads = [];
  });
  afterEach(() => { jest.useRealTimers(); });

  test('a single return waits for graceTokens/single_<cs>, even when the athlete is already active', async () => {
    mockLive.athlete = { id: 'ava', packageId: 'single', billing: { status: 'active', oneTime: true } };
    mockLive.grace = [{ id: 'single_cs_old', athleteId: 'ava', reason: 'single-purchase' }];
    const h = await mount({ athleteId: 'ava', cs: 'cs_new', single: true });
    await poll(0);
    expect(h.last().state).toBe('confirming');
    expect(mockLive.reads).toEqual(['grace:ava']); // the athlete's billing proves nothing here
    mockLive.grace = [...mockLive.grace, { id: 'single_cs_new', athleteId: 'ava', reason: 'single-purchase' }];
    await poll(5000);
    expect(h.last()).toMatchObject({ state: 'confirmed', billingStatus: 'active', packageId: 'single' });
    await h.unmount();
  });

  test('the monthly return confirms on billingStatusOf - a one-time buyer on t-6 stays confirming', async () => {
    mockLive.athlete = { id: 'ben', packageId: 't-6', billing: { status: 'active', oneTime: true } };
    const h = await mount({ athleteId: 'ben', cs: 'cs_sub', single: false });
    await poll(0);
    expect(h.last().state).toBe('confirming');
    expect(mockLive.reads).toEqual(['athlete:ben']);
    mockLive.athlete = { id: 'ben', packageId: 't-6', billing: { status: 'active', oneTime: false } };
    await poll(5000);
    expect(h.last()).toMatchObject({ state: 'confirmed', packageId: 't-6' });
    await h.unmount();
  });

  test('a confirmation is remembered per Checkout Session: a second purchase polls again', async () => {
    mockLive.grace = [{ id: 'single_cs_1', athleteId: 'cy' }];
    const first = await mount({ athleteId: 'cy', cs: 'cs_1', single: true });
    await poll(0);
    expect(first.last().state).toBe('confirmed');
    await first.unmount();
    mockLive.reads = [];
    const again = await mount({ athleteId: 'cy', cs: 'cs_1', single: true });
    expect(again.last().state).toBe('confirmed'); // answered from memory
    await poll(0);
    expect(mockLive.reads).toEqual([]);
    await again.unmount();
    const second = await mount({ athleteId: 'cy', cs: 'cs_2', single: true });
    await poll(0);
    expect(second.last().state).toBe('confirming'); // single_cs_2 is not there yet
    expect(mockLive.reads).toEqual(['grace:cy']);
    await second.unmount();
  });
});
