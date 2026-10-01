/**
 * hooks/elite.js: whether a token sentence has a reader (tester Mike
 * 2026-09-30: no talk of tokens for Elite members).
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchAthlete: jest.fn(),
  fetchCurrentUser: jest.fn(),
  fetchHouseholdAthletes: jest.fn(),
}));

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import useAllElite, { fetchAllElite } from './elite';
import * as live from './live';

test("an athlete's own login answers for itself", async () => {
  live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', role: 'athlete', athleteId: 'a1' });
  live.fetchAthlete.mockResolvedValue({ id: 'a1', packageId: 'elite' });
  expect(await fetchAllElite()).toBe(true);
  live.fetchAthlete.mockResolvedValue({ id: 'a1', packageId: 't-12' });
  expect(await fetchAllElite()).toBe(false);
  live.fetchAthlete.mockResolvedValue({ id: 'a1' });
  expect(await fetchAllElite()).toBe(false);
});

test('a parent: every athlete must be Elite; one token child keeps the wording; staff are never Elite', async () => {
  live.fetchCurrentUser.mockResolvedValue({ uid: 'p1', role: 'parent', householdId: 'h1' });
  live.fetchHouseholdAthletes.mockResolvedValue([{ id: 'a1', packageId: 'elite' }, { id: 'a2', packageId: 'elite' }]);
  expect(await fetchAllElite()).toBe(true);
  live.fetchHouseholdAthletes.mockResolvedValue([{ id: 'a1', packageId: 'elite' }, { id: 'a2', packageId: 't-6' }]);
  expect(await fetchAllElite()).toBe(false);
  live.fetchHouseholdAthletes.mockResolvedValue([]);
  expect(await fetchAllElite()).toBe(false);
  live.fetchCurrentUser.mockResolvedValue({ uid: 'c1', role: 'coach' });
  expect(await fetchAllElite()).toBe(false);
});

describe('useAllElite', () => {
  async function mount(opts) {
    const seen = [];
    const result = { current: undefined };
    function Probe() {
      result.current = useAllElite(opts);
      seen.push(result.current);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<Probe />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    // `first`: what the very first render returned, before any read resolved.
    return { first: seen[0], result, unmount: () => act(async () => root.unmount()) };
  }

  test('seed mode and a disabled hook are false at once, with nothing read', async () => {
    const seed = await mount();
    expect(seed.first).toBe(false);
    await seed.unmount();
    live.isLive.mockReturnValue(true);
    const off = await mount({ enabled: false });
    expect(off.first).toBe(false);
    expect(live.fetchCurrentUser).not.toHaveBeenCalled();
    await off.unmount();
  });

  test('live: null while it loads, then the answer; a failed read is false', async () => {
    live.isLive.mockReturnValue(true);
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', role: 'athlete', athleteId: 'a1' });
    live.fetchAthlete.mockResolvedValue({ id: 'a1', packageId: 'elite' });
    const h = await mount();
    expect(h.first).toBeNull();
    expect(h.result.current).toBe(true);
    await h.unmount();

    live.fetchCurrentUser.mockRejectedValue(new Error('offline'));
    const failed = await mount();
    expect(failed.result.current).toBe(false);
    await failed.unmount();
  });
});
