import { useEffect, useState } from 'react';

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
 * @param {*} value    Seed value to resolve with (ignored when `source` is set).
 * @param {object} [opts]
 * @param {number} [opts.delay]   Simulated latency, for exercising loading states.
 * @param {*} [opts.error]        Force the error branch, for exercising it.
 * @param {function} [opts.source]  Async source: () => Promise<data>. When set,
 *                                  the seed path is skipped entirely.
 * @param {Array} [opts.deps]     Re-fetch keys for the async source. The source
 *                                re-runs when their JSON changes.
 */
export default function useSeedResource(value, opts = {}) {
  const { delay = 0, error = null, source = null, deps = [] } = opts;
  const isAsync = typeof source === 'function';

  const [state, setState] = useState(() =>
    isAsync || delay > 0
      ? { data: null, loading: true, error: null }
      : { data: value, loading: false, error }
  );

  // Async-source mode. A stale resolution (unmount, or deps changed) is
  // dropped rather than applied - the `live` flag is per-effect-run.
  const depsKey = JSON.stringify(deps);
  useEffect(() => {
    if (!isAsync) return undefined;
    let live = true;
    setState({ data: null, loading: true, error: null });
    Promise.resolve()
      .then(() => source())
      .then((data) => {
        if (live) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (live) setState({ data: null, loading: false, error: err });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAsync, depsKey]);

  // Seed mode - unchanged behavior from before the async mode existed.
  useEffect(() => {
    if (isAsync) return undefined;
    if (delay <= 0) {
      setState({ data: value, loading: false, error });
      return undefined;
    }
    let live = true;
    setState({ data: null, loading: true, error: null });
    const t = setTimeout(() => {
      if (live) setState({ data: value, loading: false, error });
    }, delay);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), delay, error, isAsync]);

  return state;
}
