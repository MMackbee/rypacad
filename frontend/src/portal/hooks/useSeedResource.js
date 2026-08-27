import { useEffect, useState } from 'react';

/**
 * The wired seam.
 *
 * Every portal screen reads its data through a hook, and every one of those
 * hooks resolves through here. Today that means static data out of
 * ../data/seed.js; swapping a hook to the real API means changing its body
 * only - no screen changes, because the returned shape is already the shape an
 * async call produces.
 *
 * `loading` and `error` are real parts of the contract even though seed data
 * never fails. Screens that handle them now will not need retrofitting when the
 * endpoints in docs/portal/design-handoff.md ("Data fetching") are live.
 *
 * @param {*} value    Seed value to resolve with.
 * @param {object} [opts]
 * @param {number} [opts.delay]  Simulated latency, for exercising loading states.
 * @param {*} [opts.error]       Force the error branch, for exercising it.
 */
export default function useSeedResource(value, opts = {}) {
  const { delay = 0, error = null } = opts;
  const [state, setState] = useState(() =>
    delay > 0 ? { data: null, loading: true, error: null } : { data: value, loading: false, error }
  );

  useEffect(() => {
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
  }, [JSON.stringify(value), delay, error]);

  return state;
}
