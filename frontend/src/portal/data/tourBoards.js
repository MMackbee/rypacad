/**
 * The Tour's leaderboards and the standings screen's two filters (owner
 * rulings 2026-11-06: "a leaderboard with filters for all of those works
 * well"). Boards are DERIVED at read time from each result's stored bracket
 * and gender - nothing here is stored - and one result counts on every
 * board it belongs to:
 *
 *   Overall                 11-14 + 15-18 (every 18-hole kid)
 *   Boys / Girls            11-14 + 15-18 with that gender
 *   10 & under              10U
 *   11–14, 15–18            by bracket
 *   11–14 Boys ... Girls    bracket x gender
 *   Coaches (Men / Women)   coaches, and coaches x gender
 *   Open                    no bracket (no dob on file)
 *   11–13, 14 & up          legacy Sprint 8 ids, if one ever appears;
 *                           never part of Overall / Boys / Girls
 *
 * A result with no gender (an old client, or a legacy row) counts on Overall
 * and its age board, never on a gender board. The screen shows ONE board at
 * a time, picked by an Age filter x a Gender filter; every combination is
 * exactly one board (boardIdFor).
 */
import { COACH_BRACKET, LEGACY_BRACKETS, isGender } from './tourBrackets';

/** Every standard board, in display order. `age` x `gender` are the filter values that pick it. */
export const BOARDS = [
  { id: 'overall', label: 'Overall', age: 'all', gender: 'all' },
  { id: 'boys', label: 'Boys', age: 'all', gender: 'boys' },
  { id: 'girls', label: 'Girls', age: 'all', gender: 'girls' },
  { id: '10U', label: '10 & under', age: '10U', gender: 'all' },
  { id: '11-14', label: '11–14', age: '11-14', gender: 'all' },
  { id: '11-14-boys', label: '11–14 Boys', age: '11-14', gender: 'boys' },
  { id: '11-14-girls', label: '11–14 Girls', age: '11-14', gender: 'girls' },
  { id: '15-18', label: '15–18', age: '15-18', gender: 'all' },
  { id: '15-18-boys', label: '15–18 Boys', age: '15-18', gender: 'boys' },
  { id: '15-18-girls', label: '15–18 Girls', age: '15-18', gender: 'girls' },
  { id: 'coaches', label: 'Coaches', age: 'coaches', gender: 'all' },
  { id: 'coaches-men', label: 'Coaches · Men', age: 'coaches', gender: 'boys' },
  { id: 'coaches-women', label: 'Coaches · Women', age: 'coaches', gender: 'girls' },
  { id: 'open', label: 'Open', age: 'open', gender: 'all' },
  ...LEGACY_BRACKETS.map((b) => ({ id: b.id, label: b.label, age: b.id, gender: 'all' })),
];

const BOARD_BY_ID = new Map(BOARDS.map((b) => [b.id, b]));
const LEGACY_IDS = new Set(LEGACY_BRACKETS.map((b) => b.id));
const KNOWN_BRACKETS = new Set(['10U', ...LEGACY_IDS]);
// A bracket the rules would refuse still gets a board of its own, so no row can vanish.
const OTHER = 'other:';

/** The Age filter, in chip order. Open and any legacy board join it only when they hold results (ageFiltersFor). */
export const AGE_FILTERS = [
  { id: 'all', label: '11–18 overall' },
  { id: '10U', label: '10 & under' },
  { id: '11-14', label: '11–14' },
  { id: '15-18', label: '15–18' },
  { id: 'coaches', label: 'Coaches' },
];
const GENDERED_AGES = new Set(['all', '11-14', '15-18', 'coaches']);

/**
 * One result -> every board id it counts on. Its HOME board (homeBoardOf) is
 * the age board among them: the one a weekly result is listed under, and
 * what "Your results" falls back to when the filters show another board.
 */
export function boardsOf({ bracket, gender } = {}) {
  const g = isGender(gender) ? gender : null;
  if (bracket === '11-14' || bracket === '15-18') {
    return ['overall', bracket, ...(g ? [g, `${bracket}-${g}`] : [])];
  }
  if (bracket === COACH_BRACKET) return ['coaches', ...(g ? [g === 'boys' ? 'coaches-men' : 'coaches-women'] : [])];
  if (bracket == null || bracket === '') return ['open'];
  return [KNOWN_BRACKETS.has(bracket) ? bracket : `${OTHER}${bracket}`];
}

/** The age board a result belongs to: 11-14, 15-18, 10U, coaches, open, or its legacy / unknown board. */
export function homeBoardOf(result) {
  const ids = boardsOf(result);
  return ids[0] === 'overall' ? ids[1] : ids[0];
}

/** A board id -> its label. An unknown bracket's board reads as the bracket itself. */
export function boardLabel(id) {
  if (BOARD_BY_ID.has(id)) return BOARD_BY_ID.get(id).label;
  return typeof id === 'string' && id.startsWith(OTHER) ? id.slice(OTHER.length) : String(id ?? '');
}

/** Display order for any set of board ids: BOARDS order, then unknown boards by name. */
export function boardOrder(ids) {
  const rank = new Map(BOARDS.map((b, i) => [b.id, i]));
  return [...ids].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a) : BOARDS.length;
    const rb = rank.has(b) ? rank.get(b) : BOARDS.length;
    return ra !== rb ? ra - rb : String(a).localeCompare(String(b));
  });
}

/**
 * The Age chips for a season: the five standard ones always, then Open
 * (only when someone has no dob) and any legacy / unknown board, each only
 * when it holds results. `boardIds` are the non-empty boards.
 */
export function ageFiltersFor(boardIds) {
  const extra = boardOrder(new Set(boardIds))
    .filter((id) => id === 'open' || LEGACY_IDS.has(id) || !BOARD_BY_ID.has(id))
    .map((id) => ({ id, label: boardLabel(id) }));
  return [...AGE_FILTERS, ...extra];
}

/** The Gender chips for an Age filter, or null when that age is one board (10 & under, Open, legacy). */
export function genderFiltersFor(age) {
  if (!GENDERED_AGES.has(age)) return null;
  const coach = age === 'coaches';
  return [
    { id: 'all', label: 'All' },
    { id: 'boys', label: coach ? 'Men' : 'Boys' },
    { id: 'girls', label: coach ? 'Women' : 'Girls' },
  ];
}

/** Age x Gender -> the one board it shows. A gender on an age with no Gender chips is ignored. */
export function boardIdFor(age, gender = 'all') {
  if (!GENDERED_AGES.has(age)) return age;
  const g = gender === 'boys' || gender === 'girls' ? gender : 'all';
  return BOARDS.find((b) => b.age === age && b.gender === g).id;
}

/**
 * Where a family member lands (Gender All): the first Age filter, in chip
 * order, whose All board ranks one of `viewerIds`. 11-18 kids are already on
 * the default Overall; a 10 & under kid lands on 10 & under, a kid with no
 * dob on Open. No ids, or none on any board yet: the default, 11-18 overall.
 * `boards` is deriveTourStandings' boards list.
 */
export function defaultAgeFor(boards, viewerIds) {
  const ids = new Set((viewerIds || []).filter(Boolean));
  if (!ids.size) return 'all';
  const byId = new Map((boards || []).map((b) => [b.id, b]));
  for (const f of ageFiltersFor([...byId.keys()])) {
    const board = byId.get(boardIdFor(f.id, 'all'));
    if (board && board.standings.some((s) => ids.has(s.athleteId))) return f.id;
  }
  return 'all';
}
