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

/**
 * A coach name -> the stable athleteId of their results: 'coach_' + the
 * name lowercased, accents dropped, every run of other characters one
 * hyphen ("Coach Ana-María O'Neil" -> 'coach_coach-ana-maria-o-neil').
 * null when the name has no letter or digit to slug.
 */
export function coachIdFor(name) {
  const slug = cleanCoachName(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `${COACH_ID_PREFIX}${slug}` : null;
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
 * The save, split three ways. `rows` = [{ athleteId, name, label, bracket,
 * gender, raw, coach }] in sheet order: `raw` the typed strokes, `label` the
 * name the sheet shows, `bracket` the age group (or 'coaches').
 * -> { entries, missingGender, badScore }
 *   entries        [{ athleteId, name, bracket, gender, score }] - what saves
 *   missingGender  [{ athleteId, label, coach }] - scored, 11+ or a coach,
 *                  no Boys/Girls (Men/Women): NOT saved, and the sheet names them
 *   badScore       [{ athleteId, label }] - typed, but not 18..200: NOT saved
 * A row with nothing typed is in no list: no score is not a result. Gender
 * goes out only where the sheet asks for it; a 10 & under or Open row saves
 * gender null.
 */
export function buildScoreEntries(rows) {
  const entries = [];
  const missingGender = [];
  const badScore = [];
  for (const r of rows || []) {
    const parsed = parseStrokes(r.raw);
    if (parsed.empty) continue;
    const asks = needsGender(r.bracket ?? null);
    const gender = asks && isGender(r.gender) ? r.gender : null;
    if (parsed.bad) badScore.push({ athleteId: r.athleteId, label: r.label });
    if (asks && !gender) missingGender.push({ athleteId: r.athleteId, label: r.label, coach: Boolean(r.coach) });
    if (parsed.bad || (asks && !gender)) continue;
    entries.push({ athleteId: r.athleteId, name: r.name ?? null, bracket: r.bracket ?? null, gender, score: parsed.score });
  }
  return { entries, missingGender, badScore };
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
export function pendingLines({ missingGender = [], badScore = [] }) {
  const lines = [];
  const kids = missingGender.filter((m) => !m.coach).map((m) => m.label);
  const coaches = missingGender.filter((m) => m.coach).map((m) => m.label);
  if (kids.length) lines.push(`Choose Boys or Girls for ${nameList(kids)}.`);
  if (coaches.length) lines.push(`Choose Men or Women for ${nameList(coaches)}.`);
  if (badScore.length) lines.push(`Check the score for ${nameList(badScore.map((b) => b.label))}: strokes are 18 to 200.`);
  return lines;
}
