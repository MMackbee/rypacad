/**
 * Parallax intake swings on a training session's attendance screen
 * (docs/portal/plans/2026-11-11-parallax-combine/00-spec.md 3): one tick per
 * athlete, read once per row athlete and cached per athleteId for the app's
 * lifetime, so the next block's roster costs no read for athletes already
 * seen. An entry read more than INTAKE_UNDO_MS ago is read again on the next
 * mount, so an owner's clear reaches other coaches' open screens within ten
 * minutes (plan, Decided here 15). A failed read is never cached, and the
 * next account on the same device starts from an empty cache (2026-11-11 review).
 *
 * Never imports hooks/index.js or hooks/useAuthSession.js (screen tests mock
 * both partially): the viewer comes from live.js fetchCurrentUser.
 *
 * A tick or undo shows at once through a component-state override over the
 * loaded data (and updates the cache), so no reload blanks the roster's ticks.
 * Seed mode (isLive() false): r1 and r4 of the demo roster are ticked by Luke.
 */
import { useState } from 'react';
import useSeedResource from './useSeedResource';
import { ERR, LiveDataError, fetchCurrentUser, isLive } from './live';
import { auth } from '../../firebase';
import { createIntake, deleteIntake, fetchIntake, intakeStamp } from './parallaxLive';
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
  cacheUid = null;
  seed = freshSeed();
}

const isFresh = (entry, now) => Boolean(entry) && now - entry.readAt <= INTAKE_UNDO_MS;

async function loadIntakes(ids) {
  const user = await fetchCurrentUser();
  if (user.uid !== cacheUid) {
    cache.clear();
    cacheUid = user.uid;
  }
  const now = Date.now();
  await Promise.all(ids.filter((id) => !isFresh(cache.get(id), now)).map(async (id) => {
    const milestone = await fetchIntake(id);
    cache.set(id, { milestone, readAt: Date.now() });
  }));
  return {
    byAthlete: Object.fromEntries(ids.map((id) => [id, cache.get(id)?.milestone ?? null])),
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
  const remember = (athleteId, milestone) => {
    cache.set(athleteId, { milestone, readAt: Date.now() });
    show(athleteId, milestone);
  };

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
    remember(athleteId, result.status === 'already' ? result.milestone : { ...body, at: new Date() });
    return result.status;
  };

  const undo = async (athleteId) => {
    if (!liveMode) {
      seed.delete(athleteId);
      show(athleteId, null);
      return;
    }
    try {
      await deleteIntake(athleteId);
    } catch (err) {
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
