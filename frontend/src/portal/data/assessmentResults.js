/**
 * The coach results view (spec 5 "Results (coach)"; spec 6). PURE: from one
 * athlete's windows, assessment profile and the settings it builds, per
 * window, every score (computed from the trials, never stored), the
 * maturity offset or why there is none, the change markers against the
 * previous window, and the flags. A window run under another protocol
 * version or circuit mode than the one before it has its markers switched
 * off and says why - never silently compared (spec 2, decision 9); one
 * entered under another 10/5 or RSImod entry mode is flagged, and the 10/5
 * marker (the one an entry mode feeds) goes off.
 * Thresholds and coefficients come from the current settings: the
 * thresholds are provisional and Phil edits them in one table (spec 6).
 */
import {
  GCT_FLAG_MS, GROWTH_FLAG_CM, MATURITY_LABEL, anthroFinals, changeMarker, clubheadScores, cmjScores, decimalAge, gripScores, growthCm,
  hopScores, maturityCategory, maturityOffset, mcgillScores, medballScores,
} from './assessmentScoring';
import { ENTRY_KEYS, modeDifferences, withDefaults } from './assessmentSettings';
import { GOLF_WINDOW_DAYS, KIND_LABEL, MCGILL_WINDOW_DAYS, MIN_GAP_DAYS, consentStatus, daysBetween, inResearch, shortDate } from './assessmentWindows';
import { addDaysISO } from './calendar';

export const UNVERIFIED_NOTE = 'estimate, coefficients unverified';
export const MODE_LABEL = { trialCounts: 'trial counts', gripRestSec: 'grip rest', stations: 'stations on', mcgillMode: 'McGill mode', medballSide: 'med ball side', golfTiming: 'golf timing' };
export const MARKER_TEXT = { gain: 'Up', within: 'No change', drop: 'Down - check maturity and readiness' };
const ENTRY_TEXT = {
  hopEntry: { summary: 'as the per-set summary', 'per-hop': 'hop by hop' },
  rsiModEntry: { typed: 'typed from Smart2Move', computed: 'computed from height and time to take-off' },
};
const entryOf = (key, mode) => ENTRY_TEXT[key][mode?.[key]] ?? 'another way';
const MARKER_TESTS = ['clubhead', 'cmj', 'hop', 'medball', 'grip', 'parallax'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const byDate = (a, b) => (a.circuitDate || '').localeCompare(b.circuitDate || '');

/** Every score one window's trials give (spec 6), under the entry modes it ran with. */
export function windowScores(w) {
  const mode = w.circuitMode || {};
  const anthro = anthroFinals(w.anthro);
  return {
    anthro,
    grip: gripScores(w.grip, anthro.mass),
    cmj: cmjScores(w.cmj, { rsiModEntry: mode.rsiModEntry, massKg: anthro.mass }),
    hop: hopScores(w.hop, { hopEntry: mode.hopEntry }),
    medball: medballScores(w.medball),
    mcgill: w.mcgill ? mcgillScores(w.mcgill) : null,
    golf: clubheadScores(w.golf),
  };
}

/** The latest earlier window with a value, { value, date }, or null. */
function latestBefore(earlier, pick) {
  for (const p of [...earlier].reverse()) {
    const value = pick(p);
    if (value != null) return { value, date: p.circuitDate };
  }
  return null;
}

/**
 * Moore (2015) at this window's circuit date. Mid-season has no sitting
 * height of its own unless the growth check asked for a repeat, so it
 * uses the most recent full measure (spec 6); `sittingFrom` names that
 * window. Without a value it needs, `missing` says which - never a guess.
 */
function maturityOf({ athlete, sex, w, anthro, earlier, coefficients }) {
  const own = anthro.sitting;
  const carried = own == null ? latestBefore(earlier, (p) => anthroFinals(p.anthro).sitting) : null;
  const sitting = own ?? carried?.value ?? null;
  const age = athlete ? decimalAge(athlete.dob, w.circuitDate) : null;
  const seated = (w.anthro?.sittingRaw || []).some(isNum);
  const missing = [];
  if (!athlete) missing.push('the athlete record could not be read');
  else if (age == null) missing.push('no date of birth on file');
  if (sex !== 'male' && sex !== 'female') missing.push('sex not entered at intake');
  if (sex === 'male' && sitting == null) missing.push(seated && !isNum(w.anthro?.boxHeight) ? 'no box height for the sitting height' : 'no sitting height');
  if (sex === 'female' && anthro.standing == null) missing.push('no standing height');
  const offset = maturityOffset({ sex, age, sittingCm: sitting, standingCm: anthro.standing, coefficients });
  const category = maturityCategory(offset);
  return {
    age,
    offset,
    category,
    label: category ? MATURITY_LABEL[category] : null,
    note: offset != null && coefficients?.verified !== true ? UNVERIFIED_NOTE : null,
    sittingFrom: sex === 'male' && own == null && carried ? carried.date : null,
    missing: offset == null ? `Maturity offset not computed: ${missing.length ? missing.join('; ') : 'a value it needs is missing'}.` : null,
  };
}

/** The value each change marker compares (spec 6). */
function markerValues(s) {
  return { clubhead: s.golf.best, cmj: s.cmj.bestHeight, hop: s.hop.best, medball: s.medball.best, grip: s.grip.best, parallax: s.golf.parallax };
}

function markersOf(scores, previous, thresholds) {
  const cur = markerValues(scores);
  const old = markerValues(previous);
  const out = {};
  for (const k of MARKER_TESTS) out[k] = changeMarker(cur[k], old[k], thresholds?.[k]);
  if (scores.medball.method !== previous.medball.method || scores.medball.massKg !== previous.medball.massKg) out.medball = null;
  return out;
}

function flagsOf({ w, scores, prev, index, growth, maturity }) {
  const flags = [];
  const add = (code, text) => flags.push({ code, text });
  if (growth && growth.cm > GROWTH_FLAG_CM) {
    add('growth', `Growth: standing height up ${growth.cm} cm since ${shortDate(growth.date)} (over ${GROWTH_FLAG_CM} cm).`);
    if (maturity.sittingFrom) {
      add('sitting-stale', `Sitting height is from ${shortDate(maturity.sittingFrom)} and may be stale after this growth; a repeat sitting-height measure updates the maturity offset.`);
    }
  }
  scores.hop.sets.forEach((set, i) => {
    if (set.flagged) add('gct', `10/5 set ${i + 1}: contact time ${set.gctMs} ms is over ${GCT_FLAG_MS} ms; not reported.`);
  });
  if (scores.golf.fpsDirectional) add('fps-directional', `Parallax at ${w.golf.fps} fps: timing gaps are directional only.`);
  const golfDays = w.golfDate ? daysBetween(w.circuitDate, w.golfDate) : null;
  if (golfDays != null) {
    if (w.circuitMode?.golfTiming === 'same-day' && golfDays !== 0) {
      add('golf-late', `Clubhead speed on ${shortDate(w.golfDate)}, not the circuit day (this circuit runs golf the same day).`);
    } else if (golfDays > GOLF_WINDOW_DAYS) {
      add('golf-late', `Clubhead speed ${golfDays} days after the circuit (due within ${GOLF_WINDOW_DAYS}).`);
    }
  }
  const mcgillDays = w.mcgillDate ? daysBetween(w.circuitDate, w.mcgillDate) : null;
  if (mcgillDays != null && mcgillDays > MCGILL_WINDOW_DAYS) add('mcgill-late', `McGill ${mcgillDays} days after the circuit (due within ${MCGILL_WINDOW_DAYS}).`);
  if (prev) {
    const gap = daysBetween(prev.circuitDate, w.circuitDate);
    if (gap != null && gap < MIN_GAP_DAYS) add('too-soon', `${gap} days after the previous test (${shortDate(prev.circuitDate)}); windows are at least 8 weeks apart.`);
    if (index === 1) add('first-retest', 'First retest: part of any gain may be a learning effect.');
    if ((prev.protocolVersion ?? null) !== (w.protocolVersion ?? null)) {
      add('cross-version', `Protocol ${w.protocolVersion} vs ${prev.protocolVersion} on ${shortDate(prev.circuitDate)}: change markers are off.`);
    }
    const diffs = modeDifferences(prev.circuitMode, w.circuitMode);
    const procedure = diffs.filter((k) => !ENTRY_KEYS.includes(k));
    const on = shortDate(prev.circuitDate);
    if (procedure.length) add('mode-differs', `Circuit mode differs from ${on} (${procedure.map((k) => MODE_LABEL[k]).join(', ')}): change markers are off.`);
    if (diffs.includes('hopEntry')) {
      add('entry-differs', `10/5 entered ${entryOf('hopEntry', w.circuitMode)} here and ${entryOf('hopEntry', prev.circuitMode)} on ${on}: the 10/5 marker is off.`);
    }
    if (diffs.includes('rsiModEntry')) {
      add('entry-differs', `CMJ RSImod ${entryOf('rsiModEntry', w.circuitMode)} here and ${entryOf('rsiModEntry', prev.circuitMode)} on ${on}: RSImod is not compared like for like.`);
    }
  }
  return flags;
}

/**
 * What an open window still lacks, each with its due date (spec 4.1: golf
 * within 7 days of the circuit, or the same day when the circuit says so;
 * McGill within 14). Golf coaches write only an open window, so completing
 * one with clubhead speed missing ends their entry: the card asks first.
 */
function missingOf(w, scores, mcgillDue) {
  const out = [];
  if (scores.golf.best == null && !w.notTested?.golf) {
    const due = w.circuitMode?.golfTiming === 'same-day' ? `on ${shortDate(w.circuitDate)}` : `by ${shortDate(addDaysISO(w.circuitDate, GOLF_WINDOW_DAYS))}`;
    out.push(`Clubhead speed not entered (due ${due})`);
  }
  if (mcgillDue) out.push(`McGill not entered (due by ${shortDate(addDaysISO(w.circuitDate, MCGILL_WINDOW_DAYS))})`);
  return out;
}

/**
 * One athlete's results, newest window first (spec 5). `athlete` is null
 * when the viewer may not read the record; `today` (the academy date) dates
 * how long an open window has been open.
 */
export function buildResults({ athleteId, athlete, profile, windows, settings, today = null }) {
  const s = withDefaults(settings);
  const all = [...(windows || [])].filter(Boolean).sort(byDate);
  const sex = profile?.sex ?? null;
  const research = athlete?.consents?.research ?? null;
  const rows = all.map((w, index) => {
    const earlier = all.slice(0, index);
    const prev = earlier.length ? earlier[earlier.length - 1] : null;
    const scores = windowScores(w);
    const prior = latestBefore(earlier, (p) => anthroFinals(p.anthro).standing);
    const growth = prior && scores.anthro.standing != null ? { cm: growthCm(scores.anthro.standing, prior.value), date: prior.date } : null;
    const maturity = maturityOf({ athlete, sex, w, anthro: scores.anthro, earlier, coefficients: s.coefficients });
    const diffs = prev ? modeDifferences(prev.circuitMode, w.circuitMode) : [];
    const comparable = Boolean(prev) && (prev.protocolVersion ?? null) === (w.protocolVersion ?? null) && diffs.every((k) => ENTRY_KEYS.includes(k));
    const markers = comparable ? markersOf(scores, windowScores(prev), s.thresholds) : null;
    const mcgillDue = w.kind !== 'mid' && !w.mcgill && !w.notTested?.mcgill && w.circuitMode?.stations?.mcgill !== false;
    return {
      id: w.id,
      kind: w.kind,
      kindLabel: KIND_LABEL[w.kind] ?? w.kind,
      circuitDate: w.circuitDate,
      status: w.status,
      protocolVersion: w.protocolVersion ?? null,
      weeksOfExposure: isNum(w.weeksOfExposure) ? w.weeksOfExposure : null,
      wave: w.wave ?? null,
      scores,
      growth,
      maturity,
      previousDate: prev ? prev.circuitDate : null,
      markers: markers && diffs.includes('hopEntry') ? { ...markers, hop: null } : markers,
      flags: flagsOf({ w, scores, prev, index, growth, maturity }),
      notTested: w.notTested || {},
      mcgillDue,
      missing: missingOf(w, scores, mcgillDue),
      openDays: w.status === 'open' && today ? daysBetween(w.circuitDate, today) : null,
      inResearch: inResearch(research, w.circuitDate),
      window: w,
    };
  });
  return {
    athleteId,
    name: athlete?.name ?? null,
    sex,
    firstTestDate: profile?.firstTestDate ?? null,
    consent: consentStatus(athlete),
    coefficientsVerified: s.coefficients.verified === true,
    windows: rows.reverse(),
  };
}

/** A McGill ratio as one cell: "1.2 - flag", "0.4 (capped)", or null. */
export function ratioCell(r) {
  return r ? `${r.value}${r.capped ? ' (capped)' : r.flagged ? ' - flag' : ''}` : null;
}

const medballCell = (m) => (m.best == null ? null : `${m.best} ${m.method === 'distance' ? 'm' : 'mph'}`);

/** The score rows of the results card and the desktop table, in protocol order; `marker` names the change marker shown beside it. */
export const TABLE_ROWS = [
  { label: 'Weeks of exposure', value: (r) => r.weeksOfExposure },
  { label: 'Standing height (cm)', value: (r) => r.scores.anthro.standing },
  { label: 'Body mass (kg)', value: (r) => r.scores.anthro.mass },
  { label: 'Sitting height (cm)', value: (r) => r.scores.anthro.sitting },
  { label: 'Maturity offset (years)', value: (r) => r.maturity.offset },
  { label: 'Maturity', value: (r) => r.maturity.label },
  { label: 'Grip best (kg)', value: (r) => r.scores.grip.best, marker: 'grip' },
  { label: 'Grip / body mass', value: (r) => r.scores.grip.relativeBest },
  { label: 'CMJ height (cm)', value: (r) => r.scores.cmj.bestHeight, marker: 'cmj' },
  { label: 'CMJ RSImod', value: (r) => r.scores.cmj.bestRsiMod },
  { label: 'Peak power (W/kg)', value: (r) => r.scores.cmj.bestPeakWkg },
  { label: 'CMJ asymmetry (%)', value: (r) => r.scores.cmj.asymmetryPct },
  { label: '10/5 RSI', value: (r) => r.scores.hop.best, marker: 'hop' },
  { label: 'Med ball', value: (r) => medballCell(r.scores.medball), marker: 'medball' },
  { label: 'Clubhead best (mph)', value: (r) => r.scores.golf.best, marker: 'clubhead' },
  { label: 'Clubhead top 3 (mph)', value: (r) => r.scores.golf.top3Mean },
  { label: 'Parallax composite', value: (r) => r.scores.golf.parallax, marker: 'parallax' },
  { label: 'McGill flexion:extension', value: (r) => ratioCell(r.scores.mcgill?.flexExt) },
  { label: 'McGill right:left', value: (r) => ratioCell(r.scores.mcgill?.rightLeft) },
  { label: 'McGill right side:extension', value: (r) => ratioCell(r.scores.mcgill?.sideRightExt) },
  { label: 'McGill left side:extension', value: (r) => ratioCell(r.scores.mcgill?.sideLeftExt) },
];
