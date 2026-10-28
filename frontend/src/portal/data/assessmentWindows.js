/**
 * Test windows (spec 4.1, 5, 6 "Rules"): seasons, window ids, what each
 * athlete is due, research consent status and the date checks a coach's
 * entry must pass. PURE. Windows are timed from the athlete's own first test
 * and are at least 8 weeks apart; a late joiner may skip mid-season and be
 * compared at end of season instead, which is the coach's choice at the
 * start of a wave (`kinds`, the default first). An open window is in
 * progress for 14 days; after that it is completed, never re-waved.
 */
import { academyDateISO, addDaysISO } from './calendar';
import { isoToMs } from './assessmentScoring';
import { SEASON_BOUNDS } from './season';

export const KINDS = ['baseline', 'mid', 'end'];
export const KIND_LABEL = { baseline: 'Baseline', mid: 'Mid-season', end: 'End of season' };
/** Every section a window doc may hold - the same list firestore.rules checks enteredBy against. */
export const ASSESSMENT_SECTIONS = ['readiness', 'log', 'anthro', 'grip', 'cmj', 'hop', 'medball', 'mcgill', 'golf', 'notTested'];
export const MIN_GAP_DAYS = 56;
export const ENTRY_WINDOW_DAYS = 14;
export const GOLF_WINDOW_DAYS = 7;
export const MCGILL_WINDOW_DAYS = 14;
export const CONSENT_LABEL = { yes: 'Research: yes', no: 'Research: no', unanswered: 'Research: not answered' };

/** The season a date belongs to - August to July: '2026-27' for 2026-11-03. */
export function seasonOf(dateISO) {
  if (isoToMs(dateISO) == null) return null;
  const y = Number(dateISO.slice(0, 4));
  const start = Number(dateISO.slice(5, 7)) >= 8 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/** athletes/{id}/assessments/{windowId}: one doc per athlete per test window. */
export function windowIdFor(season, kind) {
  return `${season}-${kind}`;
}

/** Whole days from one 'YYYY-MM-DD' to another (negative when earlier), or null. */
export function daysBetween(fromISO, toISO) {
  const a = isoToMs(fromISO);
  const b = isoToMs(toISO);
  return a == null || b == null ? null : Math.round((b - a) / 86400000);
}

/** Whole weeks from the first test to a circuit date (weeks of Academy exposure), or null. */
export function weeksBetween(fromISO, toISO) {
  const d = daysBetween(fromISO, toISO);
  return d == null || d < 0 ? null : Math.floor(d / 7);
}

/** "Nov 3". */
export function shortDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const byDate = (a, b) => (a.circuitDate || '').localeCompare(b.circuitDate || '');

/**
 * An open window whose circuit date is more than 14 days before `today`.
 * Windows stay open for days (golf and a McGill block are entered on an open
 * window), but past the 14-day entry window a new wave would type over its
 * trials under a new date: it is marked complete instead (the rules refuse
 * the re-wave too).
 */
export function staleOpen(w, today) {
  return Boolean(w) && w.status === 'open' && (daysBetween(w.circuitDate, today) ?? 0) > ENTRY_WINDOW_DAYS;
}

/**
 * What an athlete is due today, from their windows (any season): an open
 * window is in progress for 14 days, then reads "mark it complete"; never
 * tested this season is "Baseline due"; mid season is eligible 8 weeks after
 * the baseline (end of season may be chosen instead); end of season 8 weeks
 * after mid season. A late joiner - a mid-season window 8 weeks after the
 * baseline would leave no 8 weeks before the season end (SEASON_BOUNDS.end) -
 * defaults to end of season (protocol Section 1: "will be compared at end of
 * season instead"), mid-season still a choice. `kinds` are the windows a wave
 * may start for them now, the first being the default; `kind` is null when
 * nothing can start.
 */
export function dueStatus(windows, today) {
  const season = seasonOf(today);
  const all = (windows || []).filter((w) => w && w.circuitDate).sort(byDate);
  const lastTestDate = all.length ? all[all.length - 1].circuitDate : null;
  const mine = all.filter((w) => w.season === season);
  const base = { inProgress: false, stale: false, eligibleOn: null, lastTestDate, windowId: null };
  const open = mine.find((w) => w.status === 'open');
  if (open && staleOpen(open, today)) {
    return { ...base, kind: null, kinds: [], label: `Open since ${shortDate(open.circuitDate)}: mark it complete`, inProgress: true, stale: true, windowId: open.id };
  }
  if (open) return { ...base, kind: open.kind, kinds: [open.kind], label: `${KIND_LABEL[open.kind]} in progress`, inProgress: true, windowId: open.id };
  const has = (k) => mine.find((w) => w.kind === k);
  const after = (prev, kinds, label) => {
    const eligibleOn = addDaysISO(prev.circuitDate, MIN_GAP_DAYS);
    return today >= eligibleOn
      ? { ...base, kind: kinds[0], kinds, label, eligibleOn }
      : { ...base, kind: null, kinds: [], label: `${KIND_LABEL[kinds[0]]} from ${shortDate(eligibleOn)}`, eligibleOn };
  };
  if (!has('baseline')) return { ...base, kind: 'baseline', kinds: ['baseline'], label: 'Baseline due' };
  if (!has('mid') && !has('end')) {
    const seasonEnd = seasonOf(SEASON_BOUNDS.end) === season ? SEASON_BOUNDS.end : null;
    const midOn = addDaysISO(has('baseline').circuitDate, MIN_GAP_DAYS);
    const late = seasonEnd != null && addDaysISO(midOn, MIN_GAP_DAYS) > seasonEnd;
    return late ? after(has('baseline'), ['end', 'mid'], 'End of season') : after(has('baseline'), ['mid', 'end'], 'Mid-season eligible');
  }
  if (!has('end')) return after(has('mid'), ['end'], 'End of season');
  return { ...base, kind: null, kinds: [], label: 'Season complete' };
}

/** The athlete's research answer (spec 4.3): 'yes', 'no', or 'unanswered' when no answer is recorded. */
export function consentStatus(athlete) {
  const r = athlete?.consents?.research;
  if (!r || typeof r.value !== 'boolean') return 'unanswered';
  return r.value ? 'yes' : 'no';
}

/** Why a list row cannot join a wave, or null when it can (spec 5: not answered cannot be added). */
export function waveBlock(row) {
  if (row.consent === 'unanswered') return "Waiting on the family's research answer";
  if (!row.due.kind) return row.due.label;
  return null;
}

/** A coach-set circuit date: in the last 14 days (spec 4.1) and never in the future. */
export function circuitDateProblem(date, today) {
  const d = daysBetween(date, today);
  if (d == null) return 'Pick a date.';
  if (d < 0) return "The circuit date can't be in the future.";
  if (d > ENTRY_WINDOW_DAYS) return 'Pick a date in the last 14 days.';
  return null;
}

/** A wave id that names its date: 'wave-2026-11-03-k3x9q'. */
export function newWaveId(circuitDate, random = Math.random) {
  return `wave-${circuitDate}-${random().toString(36).slice(2, 7)}`;
}

/** A Firestore Timestamp, Date, ms or ISO string as the academy (Chicago) date, or null. */
export function toISODate(value) {
  if (value == null) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : academyDateISO(date);
}

/** The first circuit date a research "yes" covers (it is never applied retroactively), or null. */
export function researchCountsFrom(research) {
  return research && research.value === true ? toISODate(research.recordedAt) : null;
}

/** Whether a window's results may be used in research (spec 4.3). */
export function inResearch(research, circuitDate) {
  const from = researchCountsFrom(research);
  return Boolean(from && circuitDate && circuitDate >= from);
}
