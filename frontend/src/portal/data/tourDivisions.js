/**
 * Boys and Girls at 15 & up (owner ruling 2026-11-06) - the pure half of
 * the Tour score sheet (screens/TourScoreSheet.js). The portal holds no
 * boy/girl fact a coach can read (the assessment profile's sex is staff-only
 * and empty), so the scorer picks Boys or Girls on the sheet for every
 * athlete 15 & up, and the pick becomes part of the stored bracket
 * ('15+B' / '15+G'). Nothing here fetches: hooks/tourDivisions.js reads the
 * prior results priorDivisions() takes.
 */
import { BRACKETS, SPLIT_AGE_GROUP } from './tour';

/** The sheet's two choices, in button order. */
export const DIVISIONS = [
  { id: 'B', label: 'Boys' },
  { id: 'G', label: 'Girls' },
];

const SPLIT = BRACKETS.filter((b) => b.division);
const BRACKET_BY_DIVISION = new Map(SPLIT.map((b) => [b.division, b.id]));
const DIVISION_BY_BRACKET = new Map(SPLIT.map((b) => [b.id, b.division]));
const STORABLE = new Set(BRACKETS.map((b) => b.id));

/** The 15 & up bracket ids ('15+B', '15+G'), for the prior-results query. */
export const SPLIT_BRACKET_IDS = SPLIT.map((b) => b.id);

/** Whether an age group (data/tour.js bracketFor's answer) needs Boys/Girls before it can be saved. */
export function needsDivision(group) {
  return group === SPLIT_AGE_GROUP;
}

/**
 * Age group + the scorer's pick -> the bracket to store. '11U', '12-14' and
 * null (Open) pass straight through; a pick is neither needed nor used.
 * '15+' becomes '15+B' or '15+G'. With no pick it stays '15+', which
 * isStorableBracket, live.js saveTournamentResults and the rules all refuse:
 * fail closed, never a silent Open.
 */
export function resolveBracket(group, division) {
  if (!needsDivision(group)) return group ?? null;
  return BRACKET_BY_DIVISION.get(division) ?? SPLIT_AGE_GROUP;
}

/** '15+B' -> 'B', '15+G' -> 'G', anything else -> null. */
export function divisionOf(bracket) {
  return DIVISION_BY_BRACKET.get(bracket) ?? null;
}

/** What this app may write: a current bracket id, or null (Open). Never a legacy id, never a bare '15+'. */
export function isStorableBracket(bracket) {
  return bracket === null || STORABLE.has(bracket);
}

// A Firestore Timestamp, a Date or epoch ms -> ms; anything else sorts as oldest.
const millis = (v) =>
  typeof v?.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === 'number' ? v : 0;

/**
 * The pre-fill: each athlete's Boys/Girls from their most recent saved
 * result in a 15 & up bracket, from any date, so a scorer picks once per kid
 * per season rather than every Saturday. Most recent = the latest event
 * `date`; two results on one date (two blocks) go to the later `createdAt`.
 * `results` are tournamentResults docs; a row outside `athleteIds`, or
 * without a '15+B' / '15+G' bracket, is ignored.
 * -> { [athleteId]: 'B' | 'G' }
 */
export function priorDivisions(results, athleteIds) {
  const wanted = new Set(athleteIds || []);
  const latest = new Map();
  for (const r of results || []) {
    const division = divisionOf(r?.bracket);
    if (!division || !wanted.has(r.athleteId)) continue;
    const date = r.date || '';
    const at = millis(r.createdAt);
    const cur = latest.get(r.athleteId);
    if (!cur || date > cur.date || (date === cur.date && at > cur.at)) latest.set(r.athleteId, { date, at, division });
  }
  const out = {};
  for (const [athleteId, v] of latest) out[athleteId] = v.division;
  return out;
}

/**
 * The score sheet's save, split in two. `rows` = [{ athleteId, name, label,
 * group, division, score }] in roster order: `score` null when none was
 * entered, `group` bracketFor's age group, `label` the name the sheet shows.
 * -> { entries, needsDivision }. `entries` [{ athleteId, name, bracket,
 * score }] are the rows that can be saved. `needsDivision` [{ athleteId,
 * label }] are scored rows 15 & up with no Boys/Girls pick: they are NOT
 * saved, and the sheet names them to the scorer. A row with no score is in
 * neither list (no score is not a result).
 */
export function buildScoreEntries(rows) {
  const entries = [];
  const pending = [];
  for (const r of rows || []) {
    if (r.score == null) continue;
    const bracket = resolveBracket(r.group ?? null, r.division ?? null);
    if (isStorableBracket(bracket)) {
      entries.push({ athleteId: r.athleteId, name: r.name ?? null, bracket, score: r.score });
    } else {
      pending.push({ athleteId: r.athleteId, label: r.label });
    }
  }
  return { entries, needsDivision: pending };
}
