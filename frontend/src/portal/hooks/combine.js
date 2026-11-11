/**
 * Combine score hooks (docs/portal/plans/2026-11-11-parallax-combine spec 4,
 * plan Task 4): useCombine behind the Combine screen and useCombineCard
 * behind the cards on the athlete home and the athlete page.
 *
 * Live mode reads through ./combineLive.js and the viewer from live.js
 * fetchCurrentUser (never hooks/index.js or useAuthSession.js: the screen
 * tests mock both partially). Seed mode (isLive() false: a clean checkout,
 * the states gallery) keeps this session's writes in a module Map over
 * seedCombineRows, as the seed coach Luke.
 *
 * A reload (a bump after a save or a delete) keeps the last view of the
 * same athlete while it runs (Review Focus 2): useSeedResource blanks `data`
 * on every reload, and a screen that unmounted its blocks for that would
 * lose what was typed in the others.
 */
import { useCallback, useMemo, useRef } from 'react';
import { ERR, LiveDataError, fetchAthlete, fetchCurrentUser, isLive } from './live';
import { bump, useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { COMBINE_KEY, combineStamp, createCombineScore, deleteCombineScore, fetchCombineScores } from './combineLive';
import { SEED_COMBINE_ATHLETE_ID, bestIds, combineEntryRole, combineScoreDoc, combineSummary, sortScores } from '../data/combine';
import { academyDateISO, addDaysISO } from '../data/calendar';
import { ROSTER } from '../data/seed';

/** The seed viewer: Luke, a golf coach. */
export const SEED_COMBINE_VIEWER = { uid: 'coach-luke', role: 'coach' };

const SEED_NAMES = { jordan: 'Jordan Whitfield', ...Object.fromEntries(ROSTER.map((r) => [r.id, r.name])) };
const seedNameOf = (athleteId) => (Object.prototype.hasOwnProperty.call(SEED_NAMES, athleteId) ? SEED_NAMES[athleteId] : null);

/* ---------------------------------------------------------- seed store -- */

/** Seed scores for any athlete: three Under 100 yd and one Under 150 yd, dated back from `today`. */
export function seedCombineRows(athleteId, today) {
  const row = (n, distance, score, daysBack, by, enteredRole) => {
    const date = addDaysISO(today, -daysBack);
    return {
      id: `seed-${athleteId}-${n}`, athleteId, distance, score, date,
      enteredBy: by, enteredRole, createdAt: new Date(`${date}T22:00:00Z`),
    };
  };
  return [
    row(1, 'u100', 612, 40, 'coach-luke', 'coach'),
    row(2, 'u100', 655, 20, 'athlete-jordan', 'athlete'),
    row(3, 'u100', 640, 6, 'coach-luke', 'coach'),
    row(4, 'u150', 480, 6, 'parent-dana', 'parent'),
  ];
}

/** Seed mode: this session's rows per athlete, started from seedCombineRows on first read. */
const seedStore = new Map();
let seedCount = 0;

function seedRowsFor(athleteId, today) {
  if (!seedStore.has(athleteId)) seedStore.set(athleteId, seedCombineRows(athleteId, today));
  return seedStore.get(athleteId);
}

function seedCreate(athleteId, body, today) {
  seedCount += 1;
  seedStore.set(athleteId, [...seedRowsFor(athleteId, today), { id: `seed-new-${seedCount}`, ...body }]);
  bump(COMBINE_KEY);
}

function seedDelete(athleteId, scoreId, today) {
  seedStore.set(athleteId, seedRowsFor(athleteId, today).filter((r) => r.id !== scoreId));
  bump(COMBINE_KEY);
}

/* -------------------------------------------------------------- views -- */

/** The CombineView: everything the screen shows, sorted and summarised. */
function viewOf({ athleteId, name, viewer, rows, today }) {
  const summary = combineSummary(rows);
  return {
    athlete: { id: athleteId, name: name ?? null },
    viewer,
    canEnter: combineEntryRole(viewer?.role) != null,
    rows: sortScores(rows),
    summary,
    best: bestIds(summary),
    today,
  };
}

function seedView(athleteId) {
  if (!athleteId) return null;
  const today = academyDateISO(new Date());
  return viewOf({ athleteId, name: seedNameOf(athleteId), viewer: SEED_COMBINE_VIEWER, rows: seedRowsFor(athleteId, today), today });
}

async function liveView(athleteId) {
  if (!athleteId) throw new LiveDataError(ERR.INVALID, 'useCombine: athleteId is required.');
  const user = await fetchCurrentUser();
  // The athlete record may be refused (a coach outside their sessions): the scores still show, under the caller's name.
  const [athlete, rows] = await Promise.all([fetchAthlete(athleteId).catch(() => null), fetchCombineScores(athleteId)]);
  return viewOf({ athleteId, name: athlete?.name ?? null, viewer: { uid: user.uid, role: user.role ?? null }, rows, today: academyDateISO(new Date()) });
}

const withName = (view, fallbackName) => (
  view && view.athlete.name == null && fallbackName ? { ...view, athlete: { ...view.athlete, name: fallbackName } } : view
);

/**
 * One athlete's combine scores: `{ data: CombineView|null, loading, error,
 * save({ distance, score, date }), remove(scoreId) }` (plan Shared
 * contract). `fallbackName` is the caller's name for the athlete, shown when
 * the record has none or cannot be read. `save` rejects INVALID for a role
 * that does not enter scores (mental, ops) and writes nothing.
 */
export function useCombine(athleteId, { fallbackName = null } = {}) {
  const live = isLive();
  const gen = useInvalidation(COMBINE_KEY);
  const state = useSeedResource(
    live ? null : seedView(athleteId),
    live ? { source: () => liveView(athleteId), deps: ['combine', athleteId, gen] } : undefined
  );

  // The last view of THIS athlete stands in while a reload runs; never another athlete's.
  const last = useRef(null);
  const fresh = state.data && state.data.athlete.id === athleteId ? state.data : null;
  if (fresh) last.current = fresh;
  const kept = !fresh && state.loading && last.current?.athlete.id === athleteId ? last.current : null;
  const view = fresh ?? kept;
  const data = useMemo(() => withName(view, fallbackName), [view, fallbackName]);

  const save = useCallback(async ({ distance, score, date }) => {
    if (!view) throw new LiveDataError(ERR.INVALID, 'useCombine: nothing is loaded yet.');
    if (!view.canEnter) throw new LiveDataError(ERR.INVALID, `useCombine: role ${view.viewer?.role} does not enter combine scores.`);
    let body;
    try {
      body = combineScoreDoc({
        athleteId, distance, score, date, uid: view.viewer.uid, role: view.viewer.role, stamp: live ? combineStamp() : new Date(),
      });
    } catch (err) {
      throw new LiveDataError(ERR.INVALID, `useCombine: ${err.message}`, err);
    }
    if (live) await createCombineScore(athleteId, body);
    else seedCreate(athleteId, body, view.today);
  }, [view, live, athleteId]);

  const remove = useCallback(async (scoreId) => {
    if (live) await deleteCombineScore(athleteId, scoreId);
    else seedDelete(athleteId, scoreId, view?.today ?? academyDateISO(new Date()));
  }, [view, live, athleteId]);

  return { data, loading: state.loading, error: state.error, save, remove };
}

/* --------------------------------------------------------------- card -- */

async function liveCard(athleteId) {
  const id = athleteId ?? (await fetchCurrentUser()).athleteId ?? null;
  if (!id) return null; // an athlete login with no athlete on file: no card, nothing read
  return { athleteId: id, summary: combineSummary(await fetchCombineScores(id)) };
}

function seedCard(athleteId) {
  return { athleteId, summary: combineSummary(seedRowsFor(athleteId, academyDateISO(new Date()))) };
}

/**
 * The summary on the athlete home and the athlete page: `{ data: { athleteId,
 * summary }|null, loading, error }`. The athlete is `athleteId`, else (live)
 * the signed-in user's, else (seed) SEED_COMBINE_ATHLETE_ID. `practice` (the
 * onboarding walkthrough's homes) reads nothing and answers null.
 */
export function useCombineCard({ athleteId = null, practice = false } = {}) {
  const live = !practice && isLive();
  const gen = useInvalidation(COMBINE_KEY);
  return useSeedResource(
    live || practice ? null : seedCard(athleteId ?? SEED_COMBINE_ATHLETE_ID),
    live ? { source: () => liveCard(athleteId), deps: ['combine-card', athleteId, gen] } : undefined
  );
}
