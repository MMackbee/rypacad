import { useEffect, useMemo, useState } from 'react';
import { cacheTicket, dropCached, readCached, writeCached } from './resourceCache';

/**
 * The wired seam.
 *
 * Every portal screen reads its data through a hook, and every one of those
 * hooks resolves through here. Two modes:
 *
 * - Seed (default): resolves with the static `value` immediately. Swapping a
 *   hook to the real API means changing its body only - no screen changes,
 *   because the returned shape is already the shape an async call produces.
 * - Async source (`opts.source`): the screen sees {data: null, loading: true}
 *   first, then the resolved value or the thrown error. This is how the live
 *   Firestore path in ./live.js flows through the same seam - screens cannot
 *   tell the difference, which is the point.
 *
 * `loading` and `error` are real parts of the contract even though seed data
 * never fails. Screens that handle them now will not need retrofitting when the
 * endpoints in docs/portal/design-handoff.md ("Data fetching") are live.
 *
 * Stale-while-revalidate (F5, speed work 2026-11-17), opt-in per hook:
 * - `gens`: the hook's invalidation counters (useInvalidation), passed apart
 *   from `deps`. A bump re-runs the source but keeps the data on screen,
 *   with `isRefreshing: true`, until the fresh value lands - no blank card
 *   after every write. `deps` alone are the resource's identity.
 * - `cacheKey`: names the resource. Its last value, per identity (cacheKey
 *   plus deps), is kept in memory for the signed-in uid (resourceCache.js),
 *   so a screen opened again paints it at once and re-reads in background.
 * Data is never shown under another identity: when the deps change (Phil to
 * Yannick, household A to B, another child) the hook shows that identity's
 * own cached value or loading, from the very first render. A failed read
 * shows its error, not stale data. A hook passing neither keeps the
 * original contract exactly ({ data, loading, error }, reset on any change).
 *
 * @param {*} value    Seed value to resolve with (ignored when `source` is set).
 * @param {object} [opts]
 * @param {number} [opts.delay]   Simulated latency, for exercising loading states.
 * @param {*} [opts.error]        Force the error branch, for exercising it.
 * @param {function} [opts.source]  Async source: () => Promise<data>. When set,
 *                                  the seed path is skipped entirely.
 * @param {Array} [opts.deps]     Re-fetch keys for the async source. The source
 *                                re-runs when their JSON changes.
 * @param {Array} [opts.gens]     Invalidation generations: re-run, keep the data.
 * @param {string} [opts.cacheKey]  The resource's name, for the shared cache.
 */
export default function useSeedResource(value, opts = {}) {
  const { delay = 0, error = null, source = null, deps = [], gens = null, cacheKey = null } = opts;
  const isAsync = typeof source === 'function';
  const tracked = isAsync && (Array.isArray(gens) || cacheKey != null);
  const cached = isAsync && cacheKey != null;
  const identity = JSON.stringify(cached ? [cacheKey, deps] : deps);
  const runKey = JSON.stringify(Array.isArray(gens) ? [deps, gens] : deps);

  const view = (data, loading, err, refreshing) =>
    tracked ? { data, loading, error: err, isRefreshing: refreshing } : { data, loading, error: err };
  // What this identity shows before its own read lands: its cached value, or loading.
  const start = () => {
    const hit = cached ? readCached(identity) : undefined;
    return { identity, view: hit ? view(hit.data, false, null, true) : view(null, true, null, false) };
  };

  const [state, setState] = useState(() =>
    isAsync
      ? start()
      : { identity: null, view: delay > 0 ? { data: null, loading: true, error: null } : { data: value, loading: false, error } }
  );
  // Never a frame of another identity's data: until the effect below catches
  // up, a changed identity renders its own start.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fallback = useMemo(() => (isAsync && state.identity !== identity ? start() : null), [isAsync, identity, state.identity]);

  // Async-source mode. A stale resolution (unmount, or deps changed) is
  // dropped rather than applied - the `live` flag is per-effect-run.
  useEffect(() => {
    if (!isAsync) return undefined;
    let live = true;
    const ticket = cached ? cacheTicket() : null;
    setState((prev) => {
      const settled = prev.identity === identity && !prev.view.loading && !prev.view.error;
      if (tracked && settled) return prev.view.isRefreshing ? prev : { identity, view: view(prev.view.data, false, null, true) };
      return start();
    });
    Promise.resolve()
      .then(() => source())
      .then((data) => {
        if (ticket) writeCached(identity, data, ticket);
        if (live) setState({ identity, view: view(data, false, null, false) });
      })
      .catch((err) => {
        if (cached) dropCached(identity);
        if (live) setState({ identity, view: view(null, false, err, false) });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAsync, runKey]);

  // Seed mode - unchanged behavior from before the async mode existed.
  useEffect(() => {
    if (isAsync) return undefined;
    if (delay <= 0) {
      setState({ identity: null, view: { data: value, loading: false, error } });
      return undefined;
    }
    let live = true;
    setState({ identity: null, view: { data: null, loading: true, error: null } });
    const t = setTimeout(() => {
      if (live) setState({ identity: null, view: { data: value, loading: false, error } });
    }, delay);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), delay, error, isAsync]);

  return (fallback || state).view;
}
