/**
 * F5 (speed work 2026-11-17): stale-while-revalidate inside useSeedResource.
 * A hook that names its resource (`cacheKey`) and passes its invalidation
 * counters as `gens` paints the last value for the SAME key at once and
 * re-reads in the background; a generation bump keeps the data on screen
 * while it re-reads. Data under another key is never shown. The cache is
 * memory only, belongs to the signed-in uid, and goes with sign-out.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useSeedResource from './useSeedResource';
import { resetSession, setSessionScope } from './sessionStore';

const roots = [];

/** A source whose calls resolve only when the test says so. */
function deferredSource() {
  const calls = [];
  const source = (key) => () => new Promise((resolve, reject) => { calls.push({ key, resolve, reject }); });
  return { calls, source, last: () => calls[calls.length - 1] };
}

async function mountHook(initialProps) {
  const seen = [];
  let setProps;
  function Probe() {
    const [props, set] = React.useState(initialProps);
    setProps = set;
    seen.push(useSeedResource(null, props));
    return null;
  }
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  await act(async () => { root.render(<Probe />); });
  return {
    seen,
    now: () => seen[seen.length - 1],
    rerender: async (props) => { await act(async () => { setProps(props); }); },
    unmount: async () => { roots.splice(roots.indexOf(root), 1); await act(async () => root.unmount()); },
  };
}

const settle = async (call, value) => { await act(async () => { call.resolve(value); await Promise.resolve(); }); };

beforeEach(() => { setSessionScope('u-staff'); });
afterEach(async () => {
  while (roots.length) { const root = roots.pop(); await act(async () => root.unmount()); }
  resetSession();
});

test('a return to a screen paints the last value at once, marked refreshing, then the fresh one', async () => {
  const d = deferredSource();
  const opts = () => ({ source: d.source('admin'), deps: ['admin', '2026-11-17'], gens: [0, 0], cacheKey: 'admin-dashboard' });
  const first = await mountHook(opts());
  expect(first.now()).toEqual({ data: null, loading: true, error: null, isRefreshing: false });
  await settle(d.last(), { cards: 1 });
  expect(first.now()).toEqual({ data: { cards: 1 }, loading: false, error: null, isRefreshing: false });
  await first.unmount();

  const back = await mountHook(opts());
  expect(back.seen[0]).toEqual({ data: { cards: 1 }, loading: false, error: null, isRefreshing: true });
  expect(back.seen.every((s) => s.loading === false)).toBe(true);
  expect(d.calls).toHaveLength(2);
  await settle(d.last(), { cards: 2 });
  expect(back.now()).toEqual({ data: { cards: 2 }, loading: false, error: null, isRefreshing: false });
});

test("a different key never shows the other key's data: Phil to Yannick shows loading, not Phil's rows", async () => {
  const d = deferredSource();
  const day = (id) => ({ source: d.source(id), deps: ['specialist-sessions', id, '2026-11-17'], gens: [0, 0], cacheKey: 'specialist-sessions' });
  const h = await mountHook(day('phil'));
  await settle(d.last(), { rows: ['phil-row'] });
  expect(h.now().data).toEqual({ rows: ['phil-row'] });
  const before = h.seen.length;
  await h.rerender(day('mental'));
  const after = h.seen.slice(before);
  expect(after.length).toBeGreaterThan(0);
  for (const s of after) expect(s.data).toBeNull();
  expect(h.now()).toMatchObject({ data: null, loading: true });
  await settle(d.last(), { rows: ['yannick-row'] });
  expect(h.now().data).toEqual({ rows: ['yannick-row'] });
});

test("switching back to a key seen before shows that key's own last value while it re-reads", async () => {
  const d = deferredSource();
  const fam = (id) => ({ source: d.source(id), deps: ['billing-hub', id, '2026-11-17'], gens: [0], cacheKey: 'billing-hub' });
  const h = await mountHook(fam('hh-a'));
  await settle(d.last(), { household: 'A' });
  await h.rerender(fam('hh-b'));
  expect(h.now().data).toBeNull();
  await settle(d.last(), { household: 'B' });
  const before = h.seen.length;
  await h.rerender(fam('hh-a'));
  for (const s of h.seen.slice(before)) expect(s.data).toEqual({ household: 'A' });
  expect(h.now()).toMatchObject({ data: { household: 'A' }, isRefreshing: true });
});

test('a generation bump keeps the data on screen while the source re-runs', async () => {
  const d = deferredSource();
  const opts = (gen) => ({ source: d.source(`gen-${gen}`), deps: ['coach-day', '2026-11-17'], gens: [gen, 0], cacheKey: 'coach-day' });
  const h = await mountHook(opts(0));
  await settle(d.last(), { blocks: 3 });
  const before = h.seen.length;
  await h.rerender(opts(1));
  expect(d.calls).toHaveLength(2);
  for (const s of h.seen.slice(before)) expect(s).toMatchObject({ data: { blocks: 3 }, loading: false });
  expect(h.now().isRefreshing).toBe(true);
  await settle(d.last(), { blocks: 4 });
  expect(h.now()).toEqual({ data: { blocks: 4 }, loading: false, error: null, isRefreshing: false });
});

test('gens without a cacheKey: data stays through a bump, nothing is kept after unmount', async () => {
  const d = deferredSource();
  const opts = (gen) => ({ source: d.source('x'), deps: ['households-directory'], gens: [gen] });
  const h = await mountHook(opts(0));
  await settle(d.last(), ['hh']);
  await h.rerender(opts(1));
  expect(h.now()).toMatchObject({ data: ['hh'], loading: false, isRefreshing: true });
  await settle(d.last(), ['hh', 'hh2']);
  await h.unmount();
  const again = await mountHook(opts(1));
  expect(again.seen[0]).toMatchObject({ data: null, loading: true });
});

test('sign-out clears the cache: the next account never sees the last one\'s data', async () => {
  const d = deferredSource();
  const opts = () => ({ source: d.source('s'), deps: ['signups'], gens: [0, 0, 0, 0], cacheKey: 'signups' });
  const h = await mountHook(opts());
  await settle(d.last(), { rows: ['family-a'] });
  await h.unmount();
  resetSession();
  setSessionScope('u-other');
  const next = await mountHook(opts());
  expect(next.seen[0]).toMatchObject({ data: null, loading: true });
});

test('a user switch without sign-out clears it too, and a read that started for the last account never lands in the cache', async () => {
  const d = deferredSource();
  const opts = () => ({ source: d.source('c'), deps: ['consent-tracker', '2026-11-17'], gens: [0, 0], cacheKey: 'consent-tracker' });
  const h = await mountHook(opts());
  const slow = d.last();
  setSessionScope('u-second');
  await settle(slow, { rows: ['first-account-row'] });
  await h.unmount();
  const next = await mountHook(opts());
  expect(next.seen[0]).toMatchObject({ data: null, loading: true });
});

test('signed out (no scope): nothing is cached', async () => {
  resetSession();
  const d = deferredSource();
  const opts = () => ({ source: d.source('n'), deps: ['scholarships'], gens: [0], cacheKey: 'scholarships' });
  const h = await mountHook(opts());
  await settle(d.last(), { rows: [] });
  await h.unmount();
  const again = await mountHook(opts());
  expect(again.seen[0]).toMatchObject({ data: null, loading: true });
});

test('a failed refresh shows the error, not the stale data, and drops the cached copy', async () => {
  const d = deferredSource();
  const opts = () => ({ source: d.source('e'), deps: ['admin'], gens: [0], cacheKey: 'admin-dashboard' });
  const h = await mountHook(opts());
  await settle(d.last(), { ok: 1 });
  await h.unmount();
  const back = await mountHook(opts());
  expect(back.seen[0]).toMatchObject({ data: { ok: 1 }, isRefreshing: true });
  const denied = Object.assign(new Error('denied'), { code: 'permission-denied' });
  await act(async () => { d.last().reject(denied); await Promise.resolve(); });
  expect(back.now()).toEqual({ data: null, loading: false, error: denied, isRefreshing: false });
  await back.unmount();
  const third = await mountHook(opts());
  expect(third.seen[0]).toMatchObject({ data: null, loading: true });
});

/*
 * Review 2026-11-17 (F2): reads of one identity can land out of order. A read
 * that started before a write and lands after the post-write read must not
 * put the pre-write value back in the cache (a deleted application, a
 * cancelled booking painted again on the next visit).
 */
describe('an older read landing last', () => {
  const opts = (d, gen) => ({ source: d.source(`gen-${gen}`), deps: ['scholarships'], gens: [gen], cacheKey: 'scholarships' });

  test('never overwrites the newer value in the cache', async () => {
    const d = deferredSource();
    const h = await mountHook(opts(d, 0));
    const older = d.last();
    await h.rerender(opts(d, 1)); // a write bumped the key while the first read was in flight
    await settle(d.last(), { rows: ['after-delete'] });
    await settle(older, { rows: ['after-delete', 'deleted-application'] });
    expect(h.now().data).toEqual({ rows: ['after-delete'] });
    await h.unmount();
    const back = await mountHook(opts(d, 1));
    expect(back.seen[0]).toMatchObject({ data: { rows: ['after-delete'] }, isRefreshing: true });
  });

  test('failing, it does not drop the newer cached value', async () => {
    const d = deferredSource();
    const h = await mountHook(opts(d, 0));
    const older = d.last();
    await h.rerender(opts(d, 1));
    await settle(d.last(), { rows: ['fresh'] });
    await act(async () => { older.reject(Object.assign(new Error('offline'), { code: 'unavailable' })); await Promise.resolve(); });
    expect(h.now().data).toEqual({ rows: ['fresh'] });
    await h.unmount();
    const back = await mountHook(opts(d, 1));
    expect(back.seen[0]).toMatchObject({ data: { rows: ['fresh'] }, isRefreshing: true });
  });

  test('in order, the newer value still replaces the older one', async () => {
    const d = deferredSource();
    const h = await mountHook(opts(d, 0));
    const older = d.last();
    await h.rerender(opts(d, 1));
    await settle(older, { rows: ['before'] });
    await settle(d.last(), { rows: ['after'] });
    await h.unmount();
    const back = await mountHook(opts(d, 1));
    expect(back.seen[0]).toMatchObject({ data: { rows: ['after'] } });
  });
});

test('a hook with neither cacheKey nor gens keeps the old contract exactly', async () => {
  const d = deferredSource();
  const opts = (gen) => ({ source: d.source('plain'), deps: ['plain', gen] });
  const h = await mountHook(opts(0));
  expect(h.seen[0]).toEqual({ data: null, loading: true, error: null });
  await settle(d.last(), 'v1');
  expect(h.now()).toEqual({ data: 'v1', loading: false, error: null });
  await h.rerender(opts(1));
  expect(h.now()).toEqual({ data: null, loading: true, error: null });
  await settle(d.last(), 'v2');
  expect(h.now()).toEqual({ data: 'v2', loading: false, error: null });
});

test('seed mode is untouched', async () => {
  const seen = [];
  function Probe() { seen.push(useSeedResource({ seed: 1 })); return null; }
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  await act(async () => { root.render(<Probe />); });
  expect(seen[seen.length - 1]).toEqual({ data: { seed: 1 }, loading: false, error: null });
});
