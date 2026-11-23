/**
 * The admin athlete roster (hq card 14, 2026-11-23): every real athlete in
 * one list, with the Parallax intake swings and fitness assessment marks.
 * PURE: no Firestore, no clock, no React. The row for one athlete, sorting,
 * search, the filters and the count line live here; `today` is passed in
 * (the academy's Chicago date). The copy below is the owner's to approve.
 */
import { ageOn } from './contractRule';
import { billingStatusOf } from './billingCopy';
import { FITNESS_DOC_ID, INTAKE_DOC_ID } from './combine';
import { packageById } from './packages';
import { withoutTestFamilies } from './testFamily';

/* ------------------------------------------------------------------ copy -- */

export const DASHBOARD_CARD = {
  title: 'Athletes',
  label: 'Open athlete roster',
  body: 'Every athlete, with their package and the Parallax and fitness marks.',
};
export const SCREEN_TITLE = 'Athletes';
export const SEARCH_PLACEHOLDER = 'Search athletes or families';
export const COUNT_EMPTY = 'No athletes match.';
export const LOADING_COPY = 'Loading athletes…';
export const LOAD_ERROR_TITLE = "Athletes didn't load";

export const PARALLAX_DONE_KEY = INTAKE_DOC_ID;
export const FITNESS_DONE_KEY = FITNESS_DOC_ID;

export const ROSTER_FILTERS = [
  ['all', 'Everyone'],
  ['parallax', 'Parallax not done'],
  ['fitness', 'Fitness not done'],
];
const FILTER_MARK = { parallax: PARALLAX_DONE_KEY, fitness: FITNESS_DONE_KEY };

/* ------------------------------------------------------------------ rows -- */

const MEMBERSHIP = { pending: 'Not paid yet', active: 'Paid', past_due: 'Payment failed', lapsed: 'Ended' };

/**
 * The athlete's own billing record in words: 'Paid', 'Not paid yet',
 * 'Comped' (an active comp: `billing.comp`), 'Payment failed', 'Ended', or
 * null for an athlete with no billing record or a status this screen has no
 * word for. A one-time buyer moved off Single is not paid yet (billingStatusOf).
 */
export function membershipLabel(athlete) {
  if (!athlete?.billing) return null;
  const status = billingStatusOf(athlete);
  if (status === 'active' && athlete.billing.comp === true) return 'Comped';
  return Object.prototype.hasOwnProperty.call(MEMBERSHIP, status) ? MEMBERSHIP[status] : null;
}

/**
 * One row per real athlete (test households, their athletes and athletes
 * marked test are left out): { athleteId, name, age, packageName,
 * membership, householdId, householdName, line }. `line` is the small line
 * under the name: age, package and membership, a missing part left off.
 */
export function rosterRows({ athletes = [], households = [], today }) {
  const real = withoutTestFamilies({ households, athletes });
  const familyOf = new Map(real.households.map((h) => [h.id, h]));
  return real.athletes.map((a) => {
    const age = ageOn(a.dob ?? null, today);
    const packageName = packageById(a.packageId)?.name ?? null;
    const membership = membershipLabel(a);
    const household = familyOf.get(a.householdId);
    return {
      athleteId: a.id,
      name: a.name ?? a.id,
      age,
      packageName,
      membership,
      householdId: a.householdId ?? null,
      householdName: household?.name ?? null,
      line: [age != null ? `Age ${age}` : null, packageName, membership].filter(Boolean).join(' · '),
    };
  });
}

const words = (name) => String(name ?? '').trim().split(/\s+/).filter(Boolean);
const lastOf = (name) => words(name).slice(-1)[0] ?? '';
const firstOf = (name) => words(name).slice(0, -1).join(' ');
const byText = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** A new array: last name, then first name, then id; case and accents do not decide. */
export function sortRows(rows) {
  return [...(rows || [])].sort((a, b) => (
    byText(lastOf(a.name), lastOf(b.name))
    || byText(firstOf(a.name), firstOf(b.name))
    || (a.athleteId < b.athleteId ? -1 : a.athleteId > b.athleteId ? 1 : 0)
  ));
}

/** Rows whose athlete name or family name holds the trimmed, lower-cased text; blank text keeps every row. */
export function searchRows(rows, text) {
  const needle = String(text ?? '').trim().toLowerCase();
  if (!needle) return rows || [];
  return (rows || []).filter((r) => `${r.name}`.toLowerCase().includes(needle) || `${r.householdName ?? ''}`.toLowerCase().includes(needle));
}

/* ----------------------------------------------------------------- marks -- */

/** One athlete's mark: the stored mark, null (not done), or undefined (its read did not land). */
export function markOf(marks, athleteId, docId) {
  const mine = marks?.[athleteId];
  return mine ? mine[docId] : undefined;
}

/**
 * 'all' keeps everyone; 'parallax' and 'fitness' keep the athletes KNOWN not
 * to have that mark. A mark that did not load is not "not done".
 */
export function filterRows(rows, filter, marks) {
  const docId = FILTER_MARK[filter];
  if (!docId) return rows || [];
  return (rows || []).filter((r) => markOf(marks, r.athleteId, docId) === null);
}

const doneCount = (rows, marks, docId) => rows.filter((r) => Boolean(markOf(marks, r.athleteId, docId))).length;

/**
 * '99 athletes · Parallax 4 done · Fitness 0 done'; with a search or filter
 * on (fewer rows shown than there are): 'Showing 12 of 99 · ...'. The done
 * numbers always count every athlete on the roster.
 */
export function countLine({ rows, shown, marks }) {
  const total = (rows || []).length;
  const head = (shown || []).length === total ? `${total} ${total === 1 ? 'athlete' : 'athletes'}` : `Showing ${(shown || []).length} of ${total}`;
  return `${head} · Parallax ${doneCount(rows || [], marks, PARALLAX_DONE_KEY)} done · Fitness ${doneCount(rows || [], marks, FITNESS_DONE_KEY)} done`;
}
