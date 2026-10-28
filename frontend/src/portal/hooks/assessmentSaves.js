/**
 * The wave's save tracker (spec 5: "Every entry saves as typed"; Review
 * Focus 2). A Firestore write made offline neither lands nor fails - it waits
 * in the SDK and is lost if the tab closes - so a coach on gym wifi must see
 * which entries have not reached the server:
 *   saving -> saved, or error (with retry), or - not acknowledged in 8 s -
 *   slow: "Not saved yet. Keep this screen open: it saves when the
 *   connection is back."
 * `unsaved` counts every entry not saved; while it is above 0 closing or
 * reloading the tab asks first, and the wave screen's back link asks too.
 * The latest save of an entry decides its state.
 *
 * iPad Safari ignores the beforeunload prompt, and the Firestore SDK's
 * memory cache drops writes still queued when the page reloads or Safari
 * evicts it. So the wave also keeps every save on this device (localStorage,
 * PENDING_KEY) until the server has it, and re-applies and re-sends what is
 * still there when the wave opens again (screens/AssessmentWave.js).
 * Storage can be missing, full or unreadable: every access is guarded, and a
 * save never waits on it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const SLOW_SAVE_MS = 8000;
export const SLOW_SAVE_COPY = 'Not saved yet. Keep this screen open: it saves when the connection is back.';
const ERROR_COPY = "Didn't save.";

export default function useSaveTracker() {
  const [entries, setEntries] = useState({});
  const runs = useRef({});

  const run = useCallback((key, fn) => {
    const prev = runs.current[key];
    if (prev?.timer) clearTimeout(prev.timer);
    const n = (prev?.n ?? 0) + 1;
    const latest = () => runs.current[key]?.n === n;
    const timer = setTimeout(() => {
      if (latest()) setEntries((all) => (all[key]?.state === 'saving' ? { ...all, [key]: { state: 'slow', message: SLOW_SAVE_COPY } } : all));
    }, SLOW_SAVE_MS);
    runs.current[key] = { n, fn, timer };
    setEntries((all) => ({ ...all, [key]: { state: 'saving', message: null } }));
    return Promise.resolve()
      .then(fn)
      .then(
        () => {
          if (!latest()) return;
          clearTimeout(timer);
          setEntries((all) => ({ ...all, [key]: { state: 'saved', message: null } }));
        },
        () => {
          if (!latest()) return;
          clearTimeout(timer);
          setEntries((all) => ({ ...all, [key]: { state: 'error', message: ERROR_COPY } }));
        }
      );
  }, []);

  const retry = useCallback((key) => {
    const r = runs.current[key];
    if (r) run(key, r.fn);
  }, [run]);

  useEffect(() => () => Object.values(runs.current).forEach((r) => clearTimeout(r.timer)), []);

  const unsaved = Object.values(entries).filter((e) => e.state !== 'saved').length;

  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  return { entries, run, retry, unsaved };
}

/** Unsaved entries kept on this device: { [key]: { key, kind, athleteId, windowId, section, value, stamp } }. */
export const PENDING_KEY = 'ryp.assessments.pending';
let stamps = 0;

function readPending() {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch (err) {
    return {};
  }
}

function writePending(all) {
  try {
    if (Object.keys(all).length) window.localStorage.setItem(PENDING_KEY, JSON.stringify(all));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch (err) {
    /* private mode or full: the in-page tracker still holds the entry */
  }
}

/** One entry's storage key: a window's section, a window's own fields, or the athlete's profile. */
export function pendingKey({ kind, athleteId, windowId, section }) {
  if (kind === 'profile') return `${athleteId}:profile`;
  return `${athleteId}:${windowId}:${kind === 'fields' ? 'fields' : section}`;
}

/**
 * Keep one save until the server has it, and return it as kept. A section is
 * written whole, so it replaces what was kept; a fields or profile patch
 * merges into what is kept, so an earlier patch still waiting is not lost.
 */
export function keepPending(entry) {
  const all = readPending();
  const key = pendingKey(entry);
  const prev = all[key];
  stamps += 1;
  const value = entry.kind !== 'section' && prev ? { ...prev.value, ...entry.value } : entry.value;
  const kept = { ...entry, key, value, stamp: `${Date.now()}-${stamps}` };
  all[key] = kept;
  writePending(all);
  return kept;
}

/** The server has this save: drop it, unless a later save of the same entry is kept. */
export function dropPending(kept) {
  const all = readPending();
  if (all[kept.key] && all[kept.key].stamp === kept.stamp) {
    delete all[kept.key];
    writePending(all);
  }
}

/** What is still kept for these athletes' windows, given as [athleteId, windowId] pairs. */
export function pendingFor(pairs) {
  return Object.values(readPending()).filter((e) => e && pairs.some(([athleteId, windowId]) => e.athleteId === athleteId && (e.kind === 'profile' || e.windowId === windowId)));
}
