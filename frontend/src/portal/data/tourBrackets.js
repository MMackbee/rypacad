/**
 * The RYP Tour's age groups, gender and coach entries - what a
 * tournamentResults doc stores (owner rulings 2026-11-06, the evening before
 * the first Tour event; docs/portal/TEAM.md "Sprint 8 amendment 2026-11-06").
 * Pure: no fetching, no React. data/tour.js re-exports what screens need.
 *
 * `bracket` is a write-time snapshot of the athlete's age group, measured on
 * SEASON_BOUNDS.start so no kid changes groups mid-season:
 *   '10U'     10 & under, ages 0-10, 9 holes (10 on the Junior tee, 9 and
 *             under on the Par3 tee)
 *   '11-14'   ages 11-14, 18 holes
 *   '15-18'   ages 15 and up, 18 holes (an adult, rare, lands here too)
 *   'coaches' a coach entry (athleteId 'coach_' + a slug of the name)
 *   null      no dob on file: the Open board
 * `gender` ('boys' | 'girls' | null) is the scorer's pick on the score sheet;
 * coaches store the same two values and the screens read them Men / Women.
 */
import { differenceInYears, parseISO } from 'date-fns';

/** The age groups a dob lands in. Order here is display order. */
export const BRACKETS = [
  { id: '10U', label: '10 & under', min: 0, max: 10, holes: 9 },
  { id: '11-14', label: '11–14', min: 11, max: 14, holes: 18 },
  { id: '15-18', label: '15–18', min: 15, max: 999, holes: 18 },
];

/** A coach's result: bracket 'coaches', athleteId 'coach_<slug>'. */
export const COACH_BRACKET = 'coaches';
export const COACH_ID_PREFIX = 'coach_';

/**
 * The Sprint 8 ids (2026-09-10 to 2026-11-06) that do not continue. '10U'
 * does continue: same id, same ages. No result carries one of these today,
 * but the rules still accept them (staging and production share one
 * database, and a phone with the old app cached may save one), so the
 * standings show them on their own boards under the old labels. This app
 * never writes them.
 */
export const LEGACY_BRACKETS = [
  { id: '11-13', label: '11–13' },
  { id: '14+', label: '14 & up' },
];

/** The two stored gender values. */
export const GENDERS = ['boys', 'girls'];

const LABELS = new Map([
  ...[...BRACKETS, ...LEGACY_BRACKETS].map((b) => [b.id, b.label]),
  [COACH_BRACKET, 'Coaches'],
  ['open', 'Open'],
]);
const STORABLE = new Set([...BRACKETS.map((b) => b.id), COACH_BRACKET]);

/** A bracket id -> its label. null and 'open' read "Open"; an id no table knows reads as itself. */
export function bracketLabel(id) {
  if (id == null || id === '') return 'Open';
  return LABELS.get(id) ?? id;
}

/**
 * Athlete dob ('yyyy-MM-dd', or null - never invented) -> '10U' | '11-14' |
 * '15-18', or null when there is no dob. `asOfISO` is SEASON_BOUNDS.start.
 */
export function bracketFor(dob, asOfISO) {
  if (!dob || !asOfISO) return null;
  const age = differenceInYears(parseISO(asOfISO), parseISO(dob));
  const bracket = BRACKETS.find((b) => age >= b.min && age <= b.max);
  return bracket ? bracket.id : null;
}

export const isGender = (g) => g === 'boys' || g === 'girls';
export const isCoachId = (id) => typeof id === 'string' && id.startsWith(COACH_ID_PREFIX);

/** Whether the score sheet must have Boys/Girls (Men/Women) before a row saves: everyone 11 and up, and coaches. */
export function needsGender(bracket) {
  return bracket === '11-14' || bracket === '15-18' || bracket === COACH_BRACKET;
}

/** A kid's age group as this app writes it: a current id or null (Open) - never a legacy id, never 'coaches'. */
export function isSavableAgeGroup(bracket) {
  return bracket == null || BRACKETS.some((b) => b.id === bracket);
}

/**
 * One entry as saveTournamentResults may write it: an athleteId, an int
 * score in 18..200, a string-or-null name, a current bracket or null (never
 * a legacy id), gender null/absent or 'boys'/'girls', and a coach id exactly
 * when the bracket is 'coaches' - the same checks firestore.rules makes.
 */
export function isSavableTourEntry(entry) {
  if (!entry || typeof entry.athleteId !== 'string' || !entry.athleteId) return false;
  if (!Number.isInteger(entry.score) || entry.score < 18 || entry.score > 200) return false;
  if (entry.name != null && typeof entry.name !== 'string') return false;
  const bracket = entry.bracket ?? null;
  if (bracket !== null && !STORABLE.has(bracket)) return false;
  if (entry.gender != null && !isGender(entry.gender)) return false;
  if ((bracket === COACH_BRACKET) !== isCoachId(entry.athleteId)) return false;
  return bracket !== COACH_BRACKET || /^coach_[a-z0-9-]+$/.test(entry.athleteId);
}
