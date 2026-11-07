/**
 * The Tour score sheet's pure half (screens/TourScoreSheet.js; owner rulings
 * 2026-11-06): which rows can be saved, the Boys/Girls pre-fill, and coach
 * entries. Nothing here fetches - hooks/tourSheet.js reads the past results
 * these functions take.
 */
import { COACH_BRACKET, COACH_ID_PREFIX, isCoachId, isGender, needsGender } from './tourBrackets';

/** The two choices, in button order: Boys / Girls for a kid, Men / Women for a coach (stored the same). */
export function genderChoices(coach) {
  return coach
    ? [{ id: 'boys', label: 'Men' }, { id: 'girls', label: 'Women' }]
    : [{ id: 'boys', label: 'Boys' }, { id: 'girls', label: 'Girls' }];
}

/** A typed coach name, tidied: trimmed, inner spaces collapsed, at most 60 characters. */
export function cleanCoachName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

// Latin letters NFD does not split into a base letter and an accent (review
// 2026-11-06): without these "Søren" and "Sören" would get different ids,
// and "Straße" would lose its ß.
const LATIN_EXTRAS = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ħ: 'h', ı: 'i' };
const LATIN_EXTRA_RE = /[ßæœøłđðþħı]/g;

/** FNV-1a over the name's UTF-16 units, in base 36: short, and the same on every client. */
function nameHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * A coach name -> the stable athleteId of their results: 'coach_' + the
 * name lowercased, accents dropped (ß -> ss, ø -> o, ł -> l, æ -> ae and
 * the like too), every run of other characters one hyphen ("Coach Ana-Maria
 * O'Neil" -> 'coach_coach-ana-maria-o-neil'). A name with a letter or digit
 * that has no a-z / 0-9 spelling (another script, alone or beside Latin
 * letters) gets a short hash of the whole tidied name on the end, so it
 * still has an id the rules accept and two such names never share one.
 * null when the name has no letter or digit at all.
 */
export function coachIdFor(name) {
  const tidy = cleanCoachName(name).toLowerCase().normalize('NFC');
  const latin = tidy
    .replace(LATIN_EXTRA_RE, (ch) => LATIN_EXTRAS[ch])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const slug = latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const lossy = /[\p{L}\p{N}]/u.test(latin.replace(/[a-z0-9]/g, ''));
  if (!lossy) return slug ? `${COACH_ID_PREFIX}${slug}` : null;
  return `${COACH_ID_PREFIX}${slug ? `${slug}-` : ''}${nameHash(tidy)}`;
}

/** A typed strokes count -> { score } when it is a whole number 18..200, { empty } or { bad } otherwise. */
export function parseStrokes(raw) {
  if (raw === undefined || raw === null || raw === '') return { empty: true };
  const n = Number(raw);
  return Number.isInteger(n) && n >= 18 && n <= 200 ? { score: n } : { bad: true };
}

// A Firestore Timestamp, a Date or epoch ms -> ms; anything else sorts as oldest.
const millis = (v) =>
  typeof v?.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === 'number' ? v : 0;

/** Each id's most recent row (latest `date`, then latest `createdAt`) among the rows `keep` accepts. */
function latestBy(results, keep) {
  const latest = new Map();
  for (const r of results || []) {
    if (!r || !r.athleteId || !keep(r)) continue;
    const date = r.date || '';
    const at = millis(r.createdAt);
    const cur = latest.get(r.athleteId);
    if (!cur || date > cur.date || (date === cur.date && at > cur.at)) latest.set(r.athleteId, { date, at, row: r });
  }
  return latest;
}

/**
 * The pre-fill: every player's (and coach's) gender from their most recent
 * saved result that has one, any date - so a scorer picks once per kid per
 * season, not every Saturday. -> { [athleteId]: 'boys' | 'girls' }
 */
export function priorGenders(results) {
  const out = {};
  for (const [id, v] of latestBy(results, (r) => isGender(r.gender))) out[id] = v.row.gender;
  return out;
}

/**
 * The quick picks: every coach in earlier Tour results, once each, with the
 * name as most recently saved (so spelling stays consistent) and their
 * gender when one was saved. Sorted by name. -> [{ athleteId, name, gender }]
 */
export function coachQuickPicks(results) {
  const latest = latestBy(results, (r) => r.bracket === COACH_BRACKET && isCoachId(r.athleteId) && typeof r.name === 'string' && r.name);
  const genders = priorGenders((results || []).filter((r) => r && isCoachId(r.athleteId)));
  return [...latest.values()]
    .map(({ row }) => ({ athleteId: row.athleteId, name: row.name, gender: genders[row.athleteId] ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The ids an age-group read asked for that did not come back: no athlete
 * doc, or one this scorer cannot read (hooks/live.js fetchAthletesByIds
 * drops both). Not the same as no dob - a player read with no dob is in
 * `brackets` as null (review 2026-11-06). [] until something has been read.
 */
export function unreadIds(ids, brackets) {
  if (!brackets) return [];
  const has = (id) => Object.prototype.hasOwnProperty.call(brackets, id);
  return [...new Set((ids || []).filter(Boolean))].filter((id) => !has(id));
}

/**
 * The save, split four ways. `rows` = [{ athleteId, name, label, bracket,
 * gender, raw, coach, groupUnknown }] in sheet order: `raw` the typed
 * strokes, `label` the name the sheet shows, `bracket` the age group (or
 * 'coaches'), `groupUnknown` true when the sheet could not learn the age
 * group at all. -> { entries, missingGender, badScore, noGroup }
 *   entries        [{ athleteId, name, bracket, gender, score }] - what saves
 *   missingGender  [{ athleteId, label, coach }] - scored, 11+ or a coach,
 *                  no Boys/Girls (Men/Women): NOT saved, and the sheet names them
 *   badScore       [{ athleteId, label }] - typed, but not 18..200: NOT saved
 *   noGroup        [{ athleteId, label }] - scored, but `groupUnknown`: the
 *                  age-group read did not return this player and this event
 *                  has no saved group for them. NOT saved: filing them as
 *                  Open would take them off every board they belong on
 *                  (review 2026-11-06)
 * A row with nothing typed is in no list: no score is not a result. Gender
 * goes out only where the sheet asks for it; a 10 & under or Open row saves
 * gender null.
 */
export function buildScoreEntries(rows) {
  const entries = [];
  const missingGender = [];
  const badScore = [];
  const noGroup = [];
  for (const r of rows || []) {
    const parsed = parseStrokes(r.raw);
    if (parsed.empty) continue;
    const asks = needsGender(r.bracket ?? null);
    const gender = asks && isGender(r.gender) ? r.gender : null;
    if (r.groupUnknown) noGroup.push({ athleteId: r.athleteId, label: r.label });
    if (parsed.bad) badScore.push({ athleteId: r.athleteId, label: r.label });
    if (asks && !gender) missingGender.push({ athleteId: r.athleteId, label: r.label, coach: Boolean(r.coach) });
    if (r.groupUnknown || parsed.bad || (asks && !gender)) continue;
    entries.push({ athleteId: r.athleteId, name: r.name ?? null, bracket: r.bracket ?? null, gender, score: parsed.score });
  }
  return { entries, missingGender, badScore, noGroup };
}

/** ['A'] -> 'A'; ['A', 'B'] -> 'A and B'; ['A', 'B', 'C'] -> 'A, B and C'. */
export function nameList(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * What still blocks a save, in the scorer's words - one sentence per kind,
 * [] when nothing does. Shown above Save scores before a save, and repeated
 * in the notice after one.
 */
export function pendingLines({ missingGender = [], badScore = [], noGroup = [] }) {
  const lines = [];
  if (noGroup.length) lines.push(`Reopen the score sheet so the age group loads for ${nameList(noGroup.map((m) => m.label))}.`);
  const kids = missingGender.filter((m) => !m.coach).map((m) => m.label);
  const coaches = missingGender.filter((m) => m.coach).map((m) => m.label);
  if (kids.length) lines.push(`Choose Boys or Girls for ${nameList(kids)}.`);
  if (coaches.length) lines.push(`Choose Men or Women for ${nameList(coaches)}.`);
  if (badScore.length) lines.push(`Check the score for ${nameList(badScore.map((b) => b.label))}: strokes are 18 to 200.`);
  return lines;
}
