/**
 * K04 (Sprint 20, spec 6.1): Yannick's monthly cadence is judged for the
 * SLOT's month, not today's. The rest of hooks/index.js is exercised in the
 * emulator; Firebase is mocked out here. liveTokens (single token, owner
 * ruling 2026-09-29/30) runs against mocked ./live, ./waitlist and ./grace
 * fetchers.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));
const mockReads = { grace: [], waitlist: [], tokenPeriod: null, graceError: null, calls: [] };
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  fetchGraceTokensByAthlete: async (id) => {
    mockReads.calls.push(['grace', id]);
    if (mockReads.graceError) throw mockReads.graceError;
    return mockReads.grace;
  },
}));
jest.mock('./waitlist', () => ({
  ...jest.requireActual('./waitlist'),
  fetchWaitlistByAthlete: async (id) => { mockReads.calls.push(['waitlist', id]); return mockReads.waitlist; },
}));
jest.mock('./grace', () => ({
  ...jest.requireActual('./grace'),
  fetchTokenPeriod: async (id, periodKey) => { mockReads.calls.push(['tokenPeriod', id, periodKey]); return mockReads.tokenPeriod; },
}));

import { coachingFor, liveTokens, seedSpecialistDays } from './index';

const mental = (date) => ({ id: date, type: 'mental', status: 'confirmed', date });

test('coachingFor judges the given month, defaulting to today\'s', () => {
  const bookings = [mental('2026-10-14'), mental('2026-11-03')];
  expect(coachingFor(bookings, '2026-10-20')).toEqual({ used: 1, limit: 1, capReached: true });
  expect(coachingFor(bookings, '2026-10-20', null, '2026-11')).toEqual({ used: 1, limit: 1, capReached: true });
  expect(coachingFor(bookings, '2026-10-20', null, '2026-12')).toEqual({ used: 0, limit: 1, capReached: false });
  expect(coachingFor(bookings, '2026-10-20', { kind: 'elite' }, '2026-10')).toEqual({ used: 1, limit: 2, capReached: false });
});

test('seed mental slots are the three 30-minute Yannick times; Phil slots are 45', () => {
  const mentalDay = seedSpecialistDays('mental', '2026-10-06', 30).find((d) => d.slots.length); // Tue
  expect(mentalDay.slots.map((s) => [s.time, s.durationMinutes])).toEqual([['4:00 PM', 30], ['4:30 PM', 30], ['5:00 PM', 30]]);
  const philDay = seedSpecialistDays('phil', '2026-10-05', 30).find((d) => d.slots.length); // Mon
  expect(philDay.slots.every((s) => s.durationMinutes === 45)).toBe(true);
});

describe('liveTokens (single token, owner ruling 2026-09-29/30)', () => {
  const SINGLE = { id: 'single', kind: 'single', tokens: 1 };
  const T6 = { id: 't-6', kind: 'tokens', tokens: 6 };
  const bought = { id: 'single_cs_1', athleteId: 'ava', expiresAt: '2027-02-27', reason: 'single-purchase', sourceSessionId: null };
  beforeEach(() => {
    mockReads.grace = [];
    mockReads.waitlist = [];
    mockReads.tokenPeriod = null;
    mockReads.graceError = null;
    mockReads.calls = [];
  });

  test("reads the athlete's grace tokens, waitlist and this period's tokenPeriods doc", async () => {
    await liveTokens('ava', SINGLE, [], 15, '2026-11-20');
    expect(mockReads.calls).toEqual([['grace', 'ava'], ['waitlist', 'ava'], ['tokenPeriod', 'ava', '2026-11-15']]);
  });

  test('a single athlete with one bought token: grace 1, left 0, perPurchase, the reason joined on', async () => {
    mockReads.grace = [bought];
    const t = await liveTokens('ava', SINGLE, [], 1, '2026-11-20');
    expect(t).toMatchObject({ granted: 0, left: 0, perPurchase: true, held: 0 });
    expect(t.grace).toEqual([{ id: 'single_cs_1', expiresAt: '2027-02-27', reason: 'single-purchase', sourceSessionId: null }]);
    // A waitlist spot holds it.
    mockReads.waitlist = [{ id: 's9_ava', sessionId: 's9', athleteId: 'ava', periodKey: '2026-12-01' }];
    expect(await liveTokens('ava', SINGLE, [], 1, '2026-11-20')).toMatchObject({ grace: [], held: 1 });
  });

  test('an ops comp tokenPeriods doc yields left 1', async () => {
    mockReads.tokenPeriod = { id: 'ava_2026-11-01', granted: 1 };
    expect(await liveTokens('ava', SINGLE, [], 1, '2026-11-20')).toMatchObject({ granted: 1, left: 1, perPurchase: true });
  });

  test('withNext adds nextPeriod; monthly packages keep their grant', async () => {
    const t = await liveTokens('ben', T6, [{ id: 'b1', status: 'confirmed', periodKey: '2026-12-01' }], 1, '2026-11-20', true);
    expect(t).toMatchObject({ granted: 6, left: 6, perPurchase: false, nextPeriod: { periodKey: '2026-12-01', booked: 1 } });
  });

  test('no package reads nothing; a failed grace read rejects instead of showing 0', async () => {
    expect(await liveTokens('ava', null, [], 1, '2026-11-20')).toBeNull();
    expect(mockReads.calls).toEqual([]);
    mockReads.graceError = new Error('permission-denied');
    await expect(liveTokens('ava', SINGLE, [], 1, '2026-11-20')).rejects.toThrow('permission-denied');
  });
});
