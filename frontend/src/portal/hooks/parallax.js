/**
 * Parallax intake swings on a training session's attendance screen
 * (docs/portal/plans/2026-11-11-parallax-combine/00-spec.md 3): one tick per
 * athlete, read once per row athlete and cached per athleteId for the app's
 * lifetime, so the next block's roster costs no read for athletes already
 * seen. An entry read more than INTAKE_UNDO_MS ago is read again on the next
 * mount, so an owner's clear reaches other coaches' open screens within ten
 * minutes (plan, Decided here 15). A write or forgetIntake that touches an athlete after its
 * answer was taken (a read, or the fresh cache) sends that athlete back for another read before the
 * load answers (at most three passes in all); an answer is cached only when nothing touched the
 * athlete during its own read.
 * A mounted screen is also told when one of its athletes is touched by anyone but itself (the roster's
 * write landing, which can come at any time, even after the list is on screen) and reads that athlete
 * again (from the server only), showing it through its override. A re-read that fails is owed: it is tried
 * again after 5 seconds, 20 seconds, then every 60 seconds for as long as the screen is open, and also when
 * the browser reports it is back online (an extra trigger, never a budget). A newer notice starts the wait
 * again from 5 seconds; a success, unmounting or the athlete leaving the list drops what is owed. A failed read is never cached, and the
 * next account on the same device starts from an empty cache (2026-11-11 review).
 *
 * Never imports hooks/index.js or hooks/useAuthSession.js (screen tests mock
 * both partially): the viewer comes from live.js fetchCurrentUser.
 *
 * A tick or undo shows at once through a component-state override over the
 * loaded data (and updates the cache), so no reload blanks the roster's ticks.
 * Seed mode (isLive() false): r1 and r4 of the demo roster are ticked by Luke.
 */
import { useEffect, useRef, useState } from 'react';
import useSeedResource from './useSeedResource';
import { ERR, LiveDataError, fetchCurrentUser, isLive } from './live';
import { auth } from '../../firebase';
import { MARK_CHANGED, createIntake, deleteIntake, deviceStamped, expectedMark, fetchIntake, fetchIntakeFromServer, intakeStamp } from './parallaxLive';
import { INTAKE_UNDO_MS, intakeByName, intakeDoc } from '../data/combine';

/** athleteId -> { milestone: milestone|null, readAt: ms }: successful reads and this app's own writes only. */
const cache = new Map();
/** The account the cache was filled for. */
let cacheUid = null;

export const SEED_INTAKE_VIEWER = { uid: 'coach-luke', role: 'coach', byName: 'Luke' };
const SEED_AT = new Date('2026-11-03T22:15:00Z');
const seedTick = (athleteId) => ({ athleteId, at: SEED_AT, by: SEED_INTAKE_VIEWER.uid, byName: SEED_INTAKE_VIEWER.byName });
const freshSeed = () => new Map(['r1', 'r4'].map((id) => [id, seedTick(id)]));
let seed = freshSeed();

/** Empties the live cache and puts the seed ticks back (tests). */
export function clearIntakeCache() {
  cache.clear();
  listeners.clear();
  cacheUid = null;
  seed = freshSeed();
}

/** How many mounted attendance screens are listening (tests). */
export function listenerCount() {
  return listeners.size;
}

/** Forgets one athlete's entry, so the next screen open reads it again (the roster calls this after it writes that athlete's tick). */
export function forgetIntake(athleteId) {
  cache.delete(athleteId);
  moved(athleteId);
}

/** athleteId -> how many times a write or a forget has touched that athlete's entry: a read that started before one is stale. */
/** Waits before the retries of a failed re-read: 5 s, 20 s, then every 60 s, for as long as the screen is open. */
const RETRY_MS = [5000, 20000, 60000];
/** athleteId -> how many times a write or a forget has touched that athlete's entry: a read that started before one is stale. */
const writes = new Map();
/** Mounted attendance hooks: (athleteId, causedBy) => void, told whenever an athlete's entry is touched. */
const listeners = new Set();
/** `causedBy` is the hook whose own tick or undo it was (it already shows that answer), or null (the roster, a forget). */
function moved(athleteId, causedBy = null) {
  writes.set(athleteId, (writes.get(athleteId) || 0) + 1);
  listeners.forEach((listen) => listen(athleteId, causedBy));
}
const writeCount = (athleteId) => writes.get(athleteId) || 0;

const isFresh = (entry, now) => Boolean(entry) && now - entry.readAt <= INTAKE_UNDO_MS;

async function loadIntakes(ids) {
  const user = await fetchCurrentUser();
  if (user.uid !== cacheUid) {
    cache.clear();
    cacheUid = user.uid;
  }
  const now = Date.now();
  // answers: what each athlete shows; taken: the athlete's write counter when its answer was taken.
  const answers = new Map();
  const taken = new Map();
  const readOne = async (id) => {
    const before = writeCount(id);
    const milestone = await fetchIntake(id);
    answers.set(id, milestone);
    taken.set(id, before);
    // Cached only when nothing touched the athlete during this read.
    if (writeCount(id) === before) cache.set(id, { milestone, readAt: Date.now() });
  };
  ids.filter((id) => isFresh(cache.get(id), now)).forEach((id) => {
    answers.set(id, cache.get(id).milestone);
    taken.set(id, writeCount(id));
  });
  await Promise.all(ids.filter((id) => !answers.has(id)).map(readOne));
  // A write or forget that touched an athlete after its answer was taken makes that answer stale, whether
  // it came from a read or from the cache: read those athletes again, in at most two more passes.
  for (let pass = 1; pass < 3; pass += 1) {
    const stale = ids.filter((id) => writeCount(id) !== taken.get(id));
    if (!stale.length) break;
    await Promise.all(stale.map(readOne));
  }
  return {
    byAthlete: Object.fromEntries(ids.map((id) => [id, answers.has(id) ? answers.get(id) : cache.get(id)?.milestone ?? null])),
    // The write counter each answer was taken at: the hook checks it when it subscribes (no gap).
    counters: Object.fromEntries(ids.map((id) => [id, taken.get(id)])),
    viewer: {
      uid: user.uid,
      role: user.role,
      byName: intakeByName({ displayName: user.displayName, authName: auth.currentUser?.displayName, role: user.role }),
    },
  };
}

/**
 * @param {string[]} athleteIds  The roster's athletes (order and repeats do not matter).
 * @param {{ enabled?: boolean }} [opts]  Off (the default) reads nothing and gives `data` null.
 * @returns {{ data: { byAthlete: object, viewer: { uid, role, byName } }|null, loading, error,
 *   tick: (athleteId) => Promise<'done'|'already'>, undo: (athleteId) => Promise<void> }}
 */
export function useParallaxIntakes(athleteIds, { enabled = false } = {}) {
  const ids = [...new Set((athleteIds || []).filter(Boolean))].sort();
  const liveMode = isLive();
  const live = liveMode && enabled;
  const seedValue = !liveMode && enabled
    ? { byAthlete: Object.fromEntries(ids.map((id) => [id, seed.get(id) ?? null])), viewer: SEED_INTAKE_VIEWER }
    : null;
  const state = useSeedResource(
    seedValue,
    live ? { source: () => loadIntakes(ids), deps: ['parallax-intake', enabled, ids.join(',')] } : undefined
  );
  const [overrides, setOverrides] = useState({});

  const show = (athleteId, milestone) => setOverrides((o) => ({ ...o, [athleteId]: milestone }));
  const self = useRef({});
  const remember = (athleteId, milestone) => {
    moved(athleteId, self.current);
    cache.set(athleteId, { milestone, readAt: Date.now() });
    show(athleteId, milestone);
  };

  // While mounted with its answers, the hook is told when one of its athletes is touched by anyone else
  // (the roster's write landing, a forget) and reads that athlete again, showing the answer through its
  // override: no blank, no other row reloads. On subscribing it first checks the athletes whose counter
  // moved since their answer was taken, so no write falls between the load and the subscription.
  const idsKey = ids.join(',');
  const counters = state.data?.counters;
  useEffect(() => {
    if (!live || !counters) return undefined;
    const mine = new Set(idsKey.split(',').filter(Boolean));
    const me = self.current;
    const running = new Set();
    // athleteId -> { used, timer }: a failed re-read still owed; used counts the timed retries already made.
    const owed = new Map();
    // Athletes whose read was in flight when a newer notice came: if it fails, the wait starts again at 5 seconds.
    const restart = new Set();
    let active = true;
    let listening = false; // the window listener is on only while something is owed
    const delayFor = (used) => RETRY_MS[Math.min(used, RETRY_MS.length - 1)];
    const drop = (id) => {
      const entry = owed.get(id);
      if (entry) clearTimeout(entry.timer);
      owed.delete(id);
      if (!owed.size && listening) {
        window.removeEventListener('online', onOnline);
        listening = false;
      }
    };
    function schedule(id, used) {
      if (!active) return;
      const entry = owed.get(id);
      if (entry) clearTimeout(entry.timer);
      owed.set(id, { used, timer: setTimeout(() => fire(id), delayFor(used)) });
      if (!listening) {
        window.addEventListener('online', onOnline);
        listening = true;
      }
    }
    // The timer: with a read for this athlete already in flight it starts none and waits again.
    function fire(id) {
      const entry = owed.get(id);
      if (!entry || !active) return;
      if (running.has(id)) {
        entry.timer = setTimeout(() => fire(id), delayFor(entry.used));
        return;
      }
      refresh(id, entry.used + 1, 'timed');
    }
    // Back online: every owed athlete is tried at once (unless a read is in flight); the timers stay as they are.
    function onOnline() {
      if (!active) return;
      [...owed.keys()].forEach((id) => { if (!running.has(id)) refresh(id, owed.get(id).used, 'online'); });
    }
    const refresh = async (id, used = 0, how = 'notice') => {
      running.add(id);
      try {
        // Up to three reads in a row; an answer overtaken during its own read is neither cached nor shown.
        for (let n = 0; n < 3 && active; n += 1) {
          const before = writeCount(id);
          let milestone;
          try {
            milestone = await fetchIntakeFromServer(id);
          } catch (err) {
            cache.delete(id); // what is shown stays, the next open reads it, and a retry is owed
            if (restart.delete(id)) schedule(id, 0);
            else if (how !== 'online') schedule(id, used); // a failed attempt from "online" leaves the timers alone
            return;
          }
          if (!active) return;
          if (writeCount(id) === before) {
            cache.set(id, { milestone, readAt: Date.now() });
            setOverrides((o) => ({ ...o, [id]: milestone }));
            drop(id);
            return;
          }
        }
        // Overtaken three times: nothing was shown or cached, so the athlete is still owed a read.
        cache.delete(id);
        schedule(id, 0);
      } finally {
        restart.delete(id);
        running.delete(id);
      }
    };
    const touched = (id, causedBy) => {
      if (causedBy === me || !mine.has(id)) return;
      if (running.has(id)) {
        restart.add(id); // the read out now follows the overtaken-answer rule; if it fails the wait restarts
        return;
      }
      drop(id); // a newer notice starts the wait again from 5 seconds
      refresh(id);
    };
    listeners.add(touched);
    mine.forEach((id) => { if (writeCount(id) !== counters[id]) touched(id, null); });
    return () => {
      active = false;
      listeners.delete(touched);
      [...owed.keys()].forEach(drop);
    };
  }, [live, counters, idsKey]);

  const tick = async (athleteId) => {
    if (!liveMode) {
      const milestone = { ...seedTick(athleteId), at: new Date() };
      seed.set(athleteId, milestone);
      show(athleteId, milestone);
      return 'done';
    }
    const viewer = state.data?.viewer;
    if (!viewer) throw new LiveDataError(ERR.INVALID, 'tick: the signed-in account has not loaded yet.');
    const body = intakeDoc({ athleteId, uid: viewer.uid, byName: viewer.byName, stamp: intakeStamp() });
    const result = await createIntake(athleteId, body);
    // The server's own time replaces this on the next read; until then the
    // device's clock dates the tick (and starts its ten-minute undo).
    remember(athleteId, result.milestone !== undefined ? result.milestone : deviceStamped({ ...body, at: new Date() }));
    return result.status;
  };

  const undo = async (athleteId) => {
    if (!liveMode) {
      seed.delete(athleteId);
      show(athleteId, null);
      return;
    }
    // Only the mark this screen shows is deleted; a different one stored there is shown instead and the save fails.
    const shown = Object.prototype.hasOwnProperty.call(overrides, athleteId) ? overrides[athleteId] : state.data?.byAthlete?.[athleteId];
    try {
      await deleteIntake(athleteId, undefined, expectedMark(shown));
    } catch (err) {
      if (err?.reason === MARK_CHANGED) {
        remember(athleteId, err.stored);
        throw err;
      }
      // A refusal may mean the tick is already gone (the owner cleared it on
      // another device while this screen or the cache still showed it): read
      // it again. Gone is what undo wanted; a tick still there shows as
      // stored and the refusal stands (2026-11-11 review).
      if (err?.code !== ERR.PERMISSION) throw err;
      const stored = await fetchIntake(athleteId).catch(() => undefined);
      if (stored === undefined) throw err;
      remember(athleteId, stored);
      if (stored) throw err;
      return;
    }
    remember(athleteId, null);
  };

  const data = state.data ? { ...state.data, byAthlete: { ...state.data.byAthlete, ...overrides } } : null;
  return { data, loading: state.loading, error: state.error, tick, undo };
}
