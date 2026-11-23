/**
 * The admin athlete roster's data (hq card 14, 2026-11-23): every athlete,
 * every household, and each athlete's small `milestones` list (the Parallax
 * intake swings and the fitness assessment marks), read once per screen
 * open. New surface, kept out of live.js and index.js (the signups.js
 * precedent); imports shared primitives FROM ./live, never the other way.
 *
 * Reads: all athletes and all households (the fetches the admin dashboard
 * uses), then ONE getDocs of athletes/{id}/milestones per real athlete, in
 * parallel. No collection-group query, no listener, no polling, and no
 * re-read after a tick: the row shows the write through a component-state
 * override. A failed read on one athlete leaves that athlete without marks
 * (`marks[id]` absent), never the list blank. Only `retry`, after a failed
 * first load, reads again.
 *
 * Writes are hooks/parallaxLive.js's, with the mark's doc id (the attendance
 * screen's hooks/parallax.js is not touched, so each keeps its own cache).
 * Seed mode (isLive() false): the seed's athletes, no network call, ticks in memory.
 */
import { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import useSeedResource from './useSeedResource';
import { ERR, LiveDataError, fetchAllAthletes, fetchAllHouseholds, fetchCurrentUser, isLive, wrap } from './live';
import { INTAKE_KEY, createIntake, deleteIntake, fetchIntake, intakeStamp } from './parallaxLive';
import { FITNESS_DOC_ID, INTAKE_DOC_ID, intakeByName, intakeDoc } from '../data/combine';
import { withoutTestFamilies } from '../data/testFamily';
import { HOUSEHOLD } from '../data/seed';

const MARK_IDS = [INTAKE_DOC_ID, FITNESS_DOC_ID];

/** One athlete's milestone docs as { parallaxIntake, fitnessAssessment }, each the mark or null. */
async function fetchMarks(athleteId) {
  try {
    const snap = await getDocs(collection(db, 'athletes', athleteId, INTAKE_KEY));
    const byId = new Map(snap.docs.map((d) => [d.id, d.data()]));
    return Object.fromEntries(MARK_IDS.map((id) => [id, byId.get(id) ?? null]));
  } catch (err) {
    throw wrap(err, 'fetchMarks');
  }
}

async function loadRoster() {
  const [user, allAthletes, allHouseholds] = await Promise.all([fetchCurrentUser(), fetchAllAthletes(), fetchAllHouseholds()]);
  const { athletes } = withoutTestFamilies({ households: allHouseholds, athletes: allAthletes });
  const marks = {};
  await Promise.all(athletes.map(async (a) => {
    // One athlete's failed read is that row's "didn't load", not the screen's error.
    marks[a.id] = await fetchMarks(a.id).catch(() => undefined);
    if (marks[a.id] === undefined) delete marks[a.id];
  }));
  return {
    athletes,
    households: allHouseholds,
    marks,
    viewer: {
      uid: user.uid,
      role: user.role,
      byName: intakeByName({ displayName: user.displayName, authName: auth.currentUser?.displayName, role: user.role }),
    },
  };
}

const SEED_FAMILY = HOUSEHOLD.name.replace(/ family$/i, '');
const SEED_AT = new Date('2026-11-03T22:15:00Z');
const SEED_VIEWER = { uid: 'owner-seed', role: 'owner', byName: 'Owner' };
function seedRoster() {
  const athletes = HOUSEHOLD.children.map((c) => ({
    id: c.id, name: `${c.name} ${SEED_FAMILY}`, householdId: 'whitfield', dob: c.dob, packageId: c.packageId, billing: { status: 'active' },
  }));
  const marks = Object.fromEntries(athletes.map((a) => [
    a.id,
    { [INTAKE_DOC_ID]: a.id === 'jordan' ? { athleteId: a.id, at: SEED_AT, by: 'coach-luke', byName: 'Luke' } : null, [FITNESS_DOC_ID]: null },
  ]));
  return { athletes, households: [{ id: 'whitfield', name: HOUSEHOLD.name }], marks, viewer: SEED_VIEWER };
}
const SEED = seedRoster();

/**
 * @returns {{ data: { athletes, households, marks, viewer: { uid, role, byName } }|null, loading, error,
 *   retry: () => void,
 *   tick: (athleteId, docId) => Promise<'done'|'already'>, undo: (athleteId, docId) => Promise<void> }}
 *   `marks[athleteId][docId]` is the mark, null (not done), or the athlete is absent from `marks` when its read failed.
 */
export function useAthleteRoster() {
  const liveMode = isLive();
  const [attempt, setAttempt] = useState(0);
  const [overrides, setOverrides] = useState({});
  const state = useSeedResource(liveMode ? null : SEED, liveMode ? { source: loadRoster, deps: ['athlete-roster', attempt] } : undefined);

  const show = (athleteId, docId, milestone) => setOverrides((o) => ({ ...o, [`${athleteId}/${docId}`]: milestone }));

  const tick = async (athleteId, docId) => {
    if (!liveMode) {
      show(athleteId, docId, { athleteId, at: new Date(), by: SEED_VIEWER.uid, byName: SEED_VIEWER.byName });
      return 'done';
    }
    const viewer = state.data?.viewer;
    if (!viewer) throw new LiveDataError(ERR.INVALID, 'tick: the signed-in account has not loaded yet.');
    const body = intakeDoc({ athleteId, uid: viewer.uid, byName: viewer.byName, stamp: intakeStamp() });
    const result = await createIntake(athleteId, body, docId);
    // The server's own time replaces this on the next open; until then the
    // device's clock dates the tick (and starts its ten-minute undo).
    show(athleteId, docId, result.status === 'already' ? result.milestone : { ...body, at: new Date() });
    return result.status;
  };

  const undo = async (athleteId, docId) => {
    if (!liveMode) {
      show(athleteId, docId, null);
      return;
    }
    try {
      await deleteIntake(athleteId, docId);
    } catch (err) {
      // A refusal may mean the mark is already gone (cleared on another
      // device): read it again. Gone is what undo wanted; a mark still there
      // shows as stored and the refusal stands (hooks/parallax.js, same rule).
      if (err?.code !== ERR.PERMISSION) throw err;
      const stored = await fetchIntake(athleteId, docId).catch(() => undefined);
      if (stored === undefined) throw err;
      show(athleteId, docId, stored);
      if (stored) throw err;
      return;
    }
    show(athleteId, docId, null);
  };

  let data = state.data;
  if (data) {
    const marks = { ...data.marks };
    Object.entries(overrides).forEach(([key, milestone]) => {
      const [athleteId, docId] = key.split('/');
      // An athlete whose read failed has no control to write from, so nothing shows over it.
      if (marks[athleteId]) marks[athleteId] = { ...marks[athleteId], [docId]: milestone };
    });
    data = { ...data, marks };
  }
  return { data, loading: state.loading, error: state.error, retry: () => setAttempt((n) => n + 1), tick, undo };
}
