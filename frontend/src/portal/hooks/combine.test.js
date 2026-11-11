/**
 * hooks/combine.js: useCombine and useCombineCard in live mode (the adapter
 * and live.js mocked; the adapter's own shapes are pinned in
 * combineLive.test.js) and in seed mode (plan Task 4).
 */
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchCurrentUser: jest.fn(),
  fetchAthlete: jest.fn(),
}));
jest.mock('./combineLive', () => ({
  ...jest.requireActual('./combineLive'),
  __esModule: true,
  fetchCombineScores: jest.fn(),
  createCombineScore: jest.fn(),
  deleteCombineScore: jest.fn(),
  combineStamp: () => 'NOW',
}));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as live from './live';
import * as adapter from './combineLive';
import { bump } from './invalidate';
import { SEED_COMBINE_VIEWER, seedCombineRows, useCombine, useCombineCard } from './combine';
import { SEED_COMBINE_ATHLETE_ID, combineSummary, sortScores } from '../data/combine';
import { academyDateISO } from '../data/calendar';

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
// Under fake timers `settle` never resolves (hooks/index.hidden.test.js).
const flush = async () => { for (let i = 0; i < 12; i += 1) await act(async () => {}); };
async function mountHook(useHook, { wait = settle } = {}) {
  const result = { current: null, all: [] };
  function Probe() {
    result.current = useHook();
    result.all.push(result.current);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await wait();
  return {
    result,
    rerender: () => act(async () => { root.render(<Probe />); }),
    unmount: () => act(async () => root.unmount()),
  };
}

const at = (iso) => new Date(iso);
const ROWS = [
  { id: 'a', athleteId: 'jordan', distance: 'u100', score: 640, date: '2026-11-01', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: at('2026-11-01T22:00:00Z') },
  { id: 'b', athleteId: 'jordan', distance: 'u100', score: 655, date: '2026-11-05', enteredBy: 'u-jordan', enteredRole: 'athlete', createdAt: at('2026-11-06T01:00:00Z') },
  { id: 'c', athleteId: 'jordan', distance: 'u100', score: 655, date: '2026-11-09', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: at('2026-11-09T22:00:00Z') },
  { id: 'd', athleteId: 'jordan', distance: 'u100', score: 600, date: '2026-11-10', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: null },
  { id: 'e', athleteId: 'jordan', distance: 'u150', score: 1000, date: '2026-11-10', enteredBy: 'u-dana', enteredRole: 'parent', createdAt: at('2026-11-10T20:00:00Z') },
];

describe('live mode', () => {
  beforeEach(() => {
    live.isLive.mockReturnValue(true);
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u-dana', role: 'parent' });
    live.fetchAthlete.mockResolvedValue({ id: 'jordan', name: 'Jordan Whitfield', householdId: 'whitfield' });
    adapter.fetchCombineScores.mockResolvedValue(ROWS);
    adapter.createCombineScore.mockResolvedValue('new-1');
    adapter.deleteCombineScore.mockResolvedValue();
  });

  test('the view for a parent', async () => {
    const h = await mountHook(() => useCombine('jordan'));
    const { data, error, loading } = h.result.current;
    expect(error).toBeNull();
    expect(loading).toBe(false);
    expect(data.athlete).toEqual({ id: 'jordan', name: 'Jordan Whitfield' });
    expect(data.viewer).toEqual({ uid: 'u-dana', role: 'parent' });
    expect(data.canEnter).toBe(true);
    expect(data.rows.map((r) => r.id)).toEqual(['d', 'e', 'c', 'b', 'a']);
    expect(data.summary).toEqual(combineSummary(ROWS));
    expect(data.best).toEqual(['b', 'e']);
    expect(live.fetchAthlete).toHaveBeenCalledWith('jordan');
    expect(adapter.fetchCombineScores).toHaveBeenCalledWith('jordan');
    await h.unmount();
  });

  test("an unreadable athlete keeps the caller's name", async () => {
    live.fetchAthlete.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const h = await mountHook(() => useCombine('jordan', { fallbackName: 'Jordan W' }));
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.athlete).toEqual({ id: 'jordan', name: 'Jordan W' });
    expect(h.result.current.data.rows).toHaveLength(5);
    await h.unmount();
  });

  test('save writes the seven keys as the viewer', async () => {
    const h = await mountHook(() => useCombine('jordan'));
    await act(async () => { await h.result.current.save({ distance: 'u125', score: 700, date: '2026-11-10' }); });
    expect(adapter.createCombineScore).toHaveBeenCalledTimes(1);
    expect(adapter.createCombineScore).toHaveBeenCalledWith('jordan', {
      athleteId: 'jordan', distance: 'u125', score: 700, date: '2026-11-10', enteredBy: 'u-dana', enteredRole: 'parent', createdAt: 'NOW',
    });
    await h.unmount();
  });

  test('ops and mental read but do not enter', async () => {
    for (const viewer of [{ uid: 'u-ops', role: 'ops' }, { uid: 'u-mental', role: 'mental' }]) {
      live.fetchCurrentUser.mockResolvedValue(viewer);
      const h = await mountHook(() => useCombine('jordan'));
      expect(h.result.current.data.viewer).toEqual(viewer);
      expect(h.result.current.data.canEnter).toBe(false);
      expect(h.result.current.data.rows).toHaveLength(5);
      let thrown = null;
      await act(async () => {
        await h.result.current.save({ distance: 'u100', score: 700, date: '2026-11-10' }).catch((e) => { thrown = e; });
      });
      expect(thrown).toMatchObject({ code: live.ERR.INVALID });
      await h.unmount();
    }
    expect(adapter.createCombineScore).not.toHaveBeenCalled();
  });

  test('remove deletes by id', async () => {
    const h = await mountHook(() => useCombine('jordan'));
    await act(async () => { await h.result.current.remove('c'); });
    expect(adapter.deleteCombineScore).toHaveBeenCalledWith('jordan', 'c');
    await h.unmount();
  });

  test('a reload keeps the last view (Review Focus 2)', async () => {
    const h = await mountHook(() => useCombine('jordan'));
    const first = h.result.current.data;
    expect(first.rows).toHaveLength(5);
    let release;
    adapter.fetchCombineScores.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const seen = h.result.all.length;
    await act(async () => { bump('combineScores'); });
    await settle();
    expect(h.result.current.loading).toBe(true);
    expect(h.result.current.data).toEqual(first);
    expect(h.result.all.slice(seen).every((s) => s.data !== null)).toBe(true);
    const added = { ...ROWS[0], id: 'f', score: 700, date: '2026-11-11', createdAt: at('2026-11-11T22:00:00Z') };
    await act(async () => { release([...ROWS, added]); });
    await settle();
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.data.rows.map((r) => r.id)).toEqual(['f', 'd', 'e', 'c', 'b', 'a']);
    await h.unmount();
  });

  // This screen's own writes show before the reload their bump starts lands
  // (2026-11-11 review): the kept view used to show a deleted row, with a
  // Delete the rules then refused, and the old Latest after a save.
  test("this screen's delete leaves the view before the reload lands", async () => {
    const h = await mountHook(() => useCombine('jordan'));
    adapter.fetchCombineScores.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      await h.result.current.remove('d');
      bump('combineScores');
    });
    await settle();
    expect(h.result.current.loading).toBe(true);
    expect(h.result.current.data.rows.map((r) => r.id)).toEqual(['e', 'c', 'b', 'a']);
    expect(h.result.current.data.summary.u100.latest.id).toBe('c');
    await h.unmount();
  });

  test("this screen's save joins the view before the reload lands, once", async () => {
    const h = await mountHook(() => useCombine('jordan'));
    let release;
    adapter.fetchCombineScores.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    await act(async () => {
      await h.result.current.save({ distance: 'u125', score: 700, date: '2026-11-10' });
      bump('combineScores');
    });
    await settle();
    expect(h.result.current.loading).toBe(true);
    const mine = h.result.current.data.rows.find((r) => r.id === 'new-1');
    expect(mine).toMatchObject({ athleteId: 'jordan', distance: 'u125', score: 700, date: '2026-11-10', enteredBy: 'u-dana', enteredRole: 'parent' });
    expect(mine.createdAt instanceof Date).toBe(true);
    expect(h.result.current.data.summary.u125.latest.id).toBe('new-1');
    await act(async () => { release([...ROWS, { ...mine, createdAt: at('2026-11-11T22:00:00Z') }]); });
    await settle();
    expect(h.result.current.data.rows.filter((r) => r.id === 'new-1')).toHaveLength(1);
    // Once a loaded view carries it, the row follows the store: deleted elsewhere, it goes.
    await act(async () => { bump('combineScores'); });
    await settle();
    expect(h.result.current.data.rows.some((r) => r.id === 'new-1')).toBe(false);
    await h.unmount();
  });

  test("a different athlete never shows another athlete's view", async () => {
    let id = 'jordan';
    const h = await mountHook(() => useCombine(id));
    expect(h.result.current.data.athlete.id).toBe('jordan');
    adapter.fetchCombineScores.mockImplementation(() => new Promise(() => {}));
    id = 'sam';
    const seen = h.result.all.length;
    await h.rerender();
    await settle();
    expect(h.result.all.length).toBeGreaterThan(seen);
    expect(h.result.all.slice(seen).every((s) => s.data === null)).toBe(true);
    expect(h.result.current.loading).toBe(true);
    await h.unmount();
    const other = await mountHook(() => useCombine('sam'));
    expect(other.result.all.every((s) => s.data === null)).toBe(true);
    await other.unmount();
  });

  test('today is the Chicago date (Review Focus 3)', async () => {
    jest.useFakeTimers('modern');
    try {
      jest.setSystemTime(new Date('2026-11-13T03:00:00Z')); // 9 PM on Nov 12 in Chicago
      const h = await mountHook(() => useCombine('jordan'), { wait: flush });
      expect(h.result.current.data.today).toBe('2026-11-12');
      await h.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test('the card: the signed-in athlete, a login with no athlete, practice', async () => {
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u-j', role: 'athlete', athleteId: 'jordan' });
    const own = await mountHook(() => useCombineCard({}));
    expect(own.result.current.data).toEqual({ athleteId: 'jordan', summary: combineSummary(ROWS) });
    expect(adapter.fetchCombineScores).toHaveBeenCalledWith('jordan');
    await own.unmount();

    adapter.fetchCombineScores.mockClear();
    live.fetchCurrentUser.mockResolvedValue({ uid: 'u-a2', role: 'athlete', athleteId: null });
    const none = await mountHook(() => useCombineCard({}));
    expect(none.result.current).toMatchObject({ data: null, loading: false, error: null });
    expect(adapter.fetchCombineScores).not.toHaveBeenCalled();
    await none.unmount();

    live.fetchCurrentUser.mockClear();
    const practice = await mountHook(() => useCombineCard({ practice: true }));
    expect(practice.result.current).toMatchObject({ data: null, loading: false });
    expect(live.fetchCurrentUser).not.toHaveBeenCalled();
    expect(adapter.fetchCombineScores).not.toHaveBeenCalled();
    await practice.unmount();

    const given = await mountHook(() => useCombineCard({ athleteId: 'a1' }));
    expect(given.result.current.data.athleteId).toBe('a1');
    expect(adapter.fetchCombineScores).toHaveBeenCalledWith('a1');
    expect(live.fetchCurrentUser).not.toHaveBeenCalled();
    await given.unmount();
  });
});

describe('seed mode', () => {
  beforeEach(() => { live.isLive.mockReturnValue(false); });

  test('rows, save and remove', async () => {
    const today = academyDateISO(new Date());
    const seed = seedCombineRows('jordan', today);
    expect(seed.filter((r) => r.distance === 'u100')).toHaveLength(3);
    expect(seed.filter((r) => r.distance === 'u150')).toHaveLength(1);
    expect(seed.filter((r) => r.distance === 'u125' || r.distance === 'u180')).toHaveLength(0);

    const h = await mountHook(() => useCombine('jordan'));
    expect(h.result.current.data.viewer).toEqual(SEED_COMBINE_VIEWER);
    expect(h.result.current.data.canEnter).toBe(true);
    expect(h.result.current.data.today).toBe(today);
    expect(h.result.current.data.rows).toEqual(sortScores(seed));

    await act(async () => { await h.result.current.save({ distance: 'u180', score: 512, date: today }); });
    await settle();
    const top = h.result.current.data.rows[0];
    expect(top).toMatchObject({ athleteId: 'jordan', distance: 'u180', score: 512, date: today, enteredBy: 'coach-luke', enteredRole: 'coach' });
    expect(h.result.current.data.summary.u180.latest.id).toBe(top.id);

    await act(async () => { await h.result.current.remove(top.id); });
    await settle();
    expect(h.result.current.data.rows).toEqual(sortScores(seed));
    expect(adapter.createCombineScore).not.toHaveBeenCalled();
    expect(adapter.deleteCombineScore).not.toHaveBeenCalled();
    await h.unmount();
  });

  test('seed names (Review Focus 6)', async () => {
    const cases = [
      [() => useCombine('jordan'), 'Jordan Whitfield'],
      [() => useCombine('r2'), 'M. Okonkwo'],
      [() => useCombine('zz', { fallbackName: 'Sam Lee' }), 'Sam Lee'],
      [() => useCombine('zz'), null],
    ];
    for (const [hook, name] of cases) {
      const h = await mountHook(hook);
      expect(h.result.current.data.athlete.name).toBe(name);
      await h.unmount();
    }
  });

  test('the card: the seed athlete, else the one given', async () => {
    const seedCard = await mountHook(() => useCombineCard({}));
    expect(seedCard.result.current.data.athleteId).toBe(SEED_COMBINE_ATHLETE_ID);
    expect(seedCard.result.current.data.summary.u100.latest).not.toBeNull();
    await seedCard.unmount();
    const a1 = await mountHook(() => useCombineCard({ athleteId: 'a1' }));
    expect(a1.result.current.data.athleteId).toBe('a1');
    await a1.unmount();
    expect(live.fetchCurrentUser).not.toHaveBeenCalled();
    expect(adapter.fetchCombineScores).not.toHaveBeenCalled();
  });
});
