/**
 * Combine scores and Parallax intake swings
 * (docs/portal/plans/2026-11-11-parallax-combine/00-spec.md 3-4). PURE: no
 * Firestore, no clock, no React. Every decision the screens make lives here:
 * validation and its copy, sorting, best and latest, who may enter, delete,
 * tick or undo, and the exact write shapes firestore.rules checks
 * (scripts/rules-probes/combine.mjs). Callers pass `today` and `now`.
 *
 * Dates a person reads are America/Chicago dates. Always "Parallax intake
 * swings" in full (INTAKE_LABEL): Phil's Parallax composite score is a
 * different thing.
 */
import { msOf, monthDayLabel, shortDate } from './mentalConsent';
import { addDaysISO } from './calendar';
import { isoToMs } from './assessmentScoring';
import { daysBetween } from './assessmentWindows';

/* -------------------------------------------------------------- constants -- */

export const COMBINE_DISTANCES = [
  { id: 'u100', label: 'Under 100 yd' },
  { id: 'u125', label: 'Under 125 yd' },
  { id: 'u150', label: 'Under 150 yd' },
  { id: 'u180', label: 'Under 180 yd' },
];
export const SCORE_MAX = 1000;
export const COMBINE_DAYS_BACK = 60;
export const SEED_COMBINE_ATHLETE_ID = 'jordan';

export const INTAKE_LABEL = 'Parallax intake swings';
export const INTAKE_DOC_ID = 'parallaxIntake';
export const INTAKE_UNDO_MS = 600000;
export const INTAKE_NAME_MAX = 40;

export const SCORE_ERROR = 'Enter a whole number from 0 to 1000.';
export const DATE_FUTURE_ERROR = 'Pick a date no later than today.';
export const DATE_OLD_ERROR = 'Pick a date in the last 60 days.';
export const DATE_MISSING_ERROR = 'Pick a date.';
export const COMBINE_SAVE_ERROR = 'Not saved. Check the connection and try again.';
export const COMBINE_DELETE_ERROR = 'Not deleted. Check the connection and try again.';
export const COMBINE_LOAD_ERROR = "The combine scores didn't load.";
export const COMBINE_READ_ONLY_NOTE = 'Coaches, athletes and parents enter combine scores.';
export const COMBINE_EMPTY = 'No scores yet.';
export const NO_SCORE = 'No score yet';
export const DELETE_PROMPT = 'Delete this score?';
export const INTAKE_SAVE_ERROR = 'Not saved. Tap to try again.';
export const INTAKE_UNDO_LATE = 'Ten minutes have passed. Ask the owner to clear it.';
export const INTAKE_LOAD_ERROR = "Parallax intake swings didn't load.";

const DISTANCE_IDS = COMBINE_DISTANCES.map((d) => d.id);
const ENTRY_ROLES = ['coach', 'owner', 'athlete', 'parent'];
const ROLE_WORD = { coach: 'Coach', owner: 'Owner', athlete: 'Athlete', parent: 'Parent' };

/* ------------------------------------------------------- combine: values -- */

/** 'u150' -> 'Under 150 yd'; an unknown id is shown as itself. */
export function distanceLabel(id) {
  const d = COMBINE_DISTANCES.find((x) => x.id === id);
  return d ? d.label : id;
}

const isScore = (n) => Number.isInteger(n) && n >= 0 && n <= SCORE_MAX;

/** A typed score: digits only (surrounding spaces allowed), 0 to 1000. */
export function parseScore(text) {
  let n = null;
  if (typeof text === 'number') n = text;
  else if (typeof text === 'string' && /^\d+$/.test(text.trim())) n = Number(text.trim());
  return isScore(n) ? { score: n, error: null } : { score: null, error: SCORE_ERROR };
}

/** The copy for a combine date that cannot be saved, or null: today back to 60 days (Chicago `today`). */
export function combineDateProblem(iso, today) {
  if (isoToMs(iso) == null) return DATE_MISSING_ERROR;
  const d = daysBetween(iso, today);
  if (d == null) return DATE_MISSING_ERROR;
  if (d < 0) return DATE_FUTURE_ERROR;
  if (d > COMBINE_DAYS_BACK) return DATE_OLD_ERROR;
  return null;
}

/** The oldest date a combine score may carry: `today` minus 60 days. */
export function combineDateFloor(today) {
  return addDaysISO(today, -COMBINE_DAYS_BACK);
}

/** '2026-11-05' -> 'Nov 5'. */
export function shortDay(iso) {
  return monthDayLabel(iso);
}

/** A score as shown: '1000', never '1,000'. */
export function formatScore(n) {
  return String(n);
}

/* --------------------------------------------------------- combine: who -- */

/** Who entered a score, as a word: 'Coach', 'Owner', 'Athlete', 'Parent', else 'Staff'. */
export function roleWord(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_WORD, role) ? ROLE_WORD[role] : 'Staff';
}

/** The enteredRole a viewer writes, or null when this role does not enter scores (mental, ops). */
export function combineEntryRole(role) {
  return ENTRY_ROLES.includes(role) ? role : null;
}

/** Whoever entered a score deletes it, any time; the owner deletes any. */
export function canDeleteScore(row, viewer) {
  if (!row || !viewer) return false;
  if (viewer.role === 'owner') return true;
  return Boolean(viewer.uid) && row.enteredBy === viewer.uid;
}

/** athletes/{id}/combineScores/{autoId}: exactly the seven keys the rules accept. Throws on a write they refuse. */
export function combineScoreDoc({ athleteId, distance, score, date, uid, role, stamp }) {
  if (!DISTANCE_IDS.includes(distance)) throw new Error(`Unknown combine distance: ${distance}`);
  if (!isScore(score)) throw new Error(`Combine score must be a whole number from 0 to ${SCORE_MAX}`);
  const enteredRole = combineEntryRole(role);
  if (!enteredRole) throw new Error(`Role ${role} does not enter combine scores`);
  return { athleteId, distance, score, date, enteredBy: uid, enteredRole, createdAt: stamp };
}

/* ------------------------------------------------------ combine: summary -- */

const desc = (a, b) => (a > b ? -1 : a < b ? 1 : 0);
/** A missing createdAt (a write still pending) counts as the newest. */
const createdMs = (row) => msOf(row?.createdAt) ?? Infinity;

const newestFirst = (a, b) => desc(String(a.date ?? ''), String(b.date ?? ''))
  || desc(createdMs(a), createdMs(b))
  || desc(String(a.id ?? ''), String(b.id ?? ''));

/** A new array, newest first: date, then createdAt, then id. */
export function sortScores(rows) {
  return [...(rows || [])].sort(newestFirst);
}

/** Highest score; a tie goes to the earlier date, then the earlier createdAt, then the id. */
const betterThan = (a, b) => desc(a.score, b.score)
  || -desc(String(a.date ?? ''), String(b.date ?? ''))
  || -desc(createdMs(a), createdMs(b))
  || -desc(String(a.id ?? ''), String(b.id ?? ''));

/** { u100: { best, latest }, ... }: each a row or null. */
export function combineSummary(rows) {
  const sorted = sortScores(rows);
  const out = {};
  DISTANCE_IDS.forEach((id) => {
    const list = sorted.filter((r) => r.distance === id);
    const scored = list.filter((r) => Number.isFinite(r.score));
    out[id] = {
      best: scored.length ? [...scored].sort(betterThan)[0] : null,
      latest: list[0] ?? null,
    };
  });
  return out;
}

/** The ids of the best rows, in distance order. */
export function bestIds(summary) {
  return DISTANCE_IDS.map((id) => summary?.[id]?.best?.id).filter(Boolean);
}

/* ------------------------------------------------ Parallax intake swings -- */

/** The first word of a name, at most 40 characters, or null. */
export function firstName(name) {
  if (typeof name !== 'string') return null;
  const word = name.trim().split(/\s+/)[0] || '';
  return word ? word.slice(0, INTAKE_NAME_MAX) : null;
}

/** The label stored with a tick (1 to 40 characters): the users doc's first name, else Auth's, else the role. */
export function intakeByName({ displayName, authName, role }) {
  return firstName(displayName) ?? firstName(authName) ?? (role === 'owner' ? 'Owner' : 'Coach');
}

/** athletes/{id}/milestones/parallaxIntake: exactly the four keys the rules accept. */
export function intakeDoc({ athleteId, uid, byName, stamp }) {
  return { athleteId, at: stamp, by: uid, byName };
}

/** 'done Nov 12 · Luke': the America/Chicago date of `at` and who ticked it. */
export function intakeDoneLine(milestone) {
  const day = shortDate(milestone?.at);
  const head = day ? `done ${day}` : 'done';
  return milestone?.byName ? `${head} · ${milestone.byName}` : head;
}

/** Coaches (Phil included) and the owner tick, never on a read-only screen. */
export function canTickIntake(role, readOnly) {
  return !readOnly && (role === 'coach' || role === 'owner');
}

/**
 * What the viewer may do to a tick: 'undo' (whoever ticked it, inside ten
 * minutes of `at`), 'owner-clear' (the owner otherwise, behind a confirm),
 * else null. A tick with no readable `at` offers no undo.
 */
export function intakeUndo(milestone, viewer, nowMs) {
  if (!milestone || !viewer) return null;
  const atMs = msOf(milestone.at);
  if (viewer.uid && milestone.by === viewer.uid && atMs != null && nowMs < atMs + INTAKE_UNDO_MS) return 'undo';
  return viewer.role === 'owner' ? 'owner-clear' : null;
}
