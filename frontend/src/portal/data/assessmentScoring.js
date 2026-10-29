/**
 * Physical Performance Assessment scoring - Phil Herder's protocol v1.2
 * (docs/portal/plans/2026-10-14-assessments/00-spec.md, Section 6). PURE:
 * no Firestore, no clock, no React. Every screen (and, later, the family
 * summary) computes scores here from the stored trials; a score is never
 * typed in or stored as a final value (protocol Section 5).
 *
 * Inputs are the window sections as stored (athletes/{id}/assessments/
 * {windowId}, docs/portal/DATA-MODEL.md): lists of trials in which a trial
 * not typed yet is null. Every function tolerates a missing section and
 * returns null rather than NaN.
 */

export const CAP_SECONDS = 300;
export const GROWTH_FLAG_CM = 3;
export const GCT_FLAG_MS = 250;
export const FPS_DIRECTIONAL_BELOW = 120;
export const SITTING_TOLERANCE_CM = 0.4;
export const BEST_HOPS = 5;
export const MATURITY_LABEL = { pre: 'Pre-PHV', circa: 'Circa-PHV', post: 'Post-PHV' };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nums = (list) => (Array.isArray(list) ? list.filter(isNum) : []);
const maxOf = (list) => {
  const l = nums(list);
  return l.length ? Math.max(...l) : null;
};
const meanOf = (list) => {
  const l = nums(list);
  return l.length ? l.reduce((sum, v) => sum + v, 0) / l.length : null;
};

/** `n` rounded to `dp` places, or null when it is not a number. */
export function round(n, dp = 2) {
  if (!isNum(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** 'YYYY-MM-DD' as UTC-midnight ms, or null for anything else (2026-02-30 included: Date.parse rolls it over). */
export function isoToMs(iso) {
  if (typeof iso !== 'string' || !ISO.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== iso ? null : ms;
}

/**
 * The final value of up to three repeated measures: the mean of the closest
 * two. One measure is itself, none is null. With three, an exact tie in the
 * two gaps keeps the lower pair; gaps are compared to a thousandth so
 * floating-point noise never decides a tie.
 */
export function closestTwoMean(values) {
  const l = nums(values).slice(0, 3);
  if (l.length === 0) return null;
  if (l.length === 1) return l[0];
  if (l.length === 2) return (l[0] + l[1]) / 2;
  const [a, b, c] = [...l].sort((x, y) => x - y);
  return round(c - b, 3) < round(b - a, 3) ? (b + c) / 2 : (a + b) / 2;
}

/** True when exactly two measures are in and they differ by more than `tolerance`: take a third. */
export function needsThirdMeasure(values, tolerance = SITTING_TOLERANCE_CM) {
  const l = nums(values);
  return l.length === 2 && round(Math.abs(l[0] - l[1]), 3) > tolerance;
}

/** Decimal age in years at `dateISO`, to two places; null without both dates or before birth. */
export function decimalAge(dob, dateISO) {
  const born = isoToMs(dob);
  const at = isoToMs(dateISO);
  if (born == null || at == null || at < born) return null;
  return round((at - born) / (365.25 * 86400000), 2);
}

/**
 * Moore et al. (2015) maturity offset - years from peak height velocity - as
 * the protocol prints it: boys a + b x (age x sitting height), girls a + b x
 * (age x standing height). `coefficients` is the settings map
 * ({ boys: { a, b }, girls: { a, b } }), unverified until Phil checks the
 * paper. Null when the sex, the age, the height it needs or the
 * coefficients are missing.
 */
export function maturityOffset({ sex, age, sittingCm, standingCm, coefficients }) {
  const set = sex === 'male' ? coefficients?.boys : sex === 'female' ? coefficients?.girls : null;
  const height = sex === 'male' ? sittingCm : standingCm;
  if (!set || !isNum(set.a) || !isNum(set.b) || !isNum(age) || !isNum(height)) return null;
  return round(set.a + set.b * (age * height), 3);
}

/** 'pre' below -1.0, 'post' above +1.0, 'circa' between (both ends included). */
export function maturityCategory(offset) {
  if (!isNum(offset)) return null;
  if (offset < -1) return 'pre';
  if (offset > 1) return 'post';
  return 'circa';
}

/** Standing-height change since the prior window, cm to one place, or null. */
export function growthCm(currentStanding, priorStanding) {
  return isNum(currentStanding) && isNum(priorStanding) ? round(currentStanding - priorStanding, 1) : null;
}

/** The growth flag: standing height up more than 3 cm since the prior window. */
export function growthFlag(currentStanding, priorStanding) {
  const g = growthCm(currentStanding, priorStanding);
  return g != null && g > GROWTH_FLAG_CM;
}

/**
 * One window's anthropometric finals. Each measure is its closest-two mean;
 * sitting height is the seated measure minus the box; leg length is standing
 * minus sitting. `needsThirdSitting` asks for a third seated measure when the
 * first two differ by more than 0.4 cm.
 */
export function anthroFinals(anthro) {
  const a = anthro || {};
  const standing = closestTwoMean(a.standing);
  const seated = closestTwoMean(a.sittingRaw);
  const box = isNum(a.boxHeight) ? a.boxHeight : null;
  const sitting = seated != null && box != null ? seated - box : null;
  return {
    standing: round(standing, 1),
    mass: round(closestTwoMean(a.mass), 1),
    sitting: round(sitting, 1),
    legLength: standing != null && sitting != null ? round(standing - sitting, 1) : null,
    arm: round(closestTwoMean(a.arm), 1),
    hand: round(closestTwoMean(a.hand), 1),
    needsThirdSitting: needsThirdMeasure(a.sittingRaw),
  };
}

/** Grip: best per hand, the better hand, and best / body mass (kg/kg). Always the "circuit rest interval". */
export function gripScores(grip, massKg) {
  const g = grip || {};
  const bestRight = maxOf(g.right);
  const bestLeft = maxOf(g.left);
  const best = maxOf([bestRight, bestLeft]);
  return {
    bestRight: round(bestRight, 1),
    bestLeft: round(bestLeft, 1),
    best: round(best, 1),
    relativeBest: best != null && isNum(massKg) && massKg > 0 ? round(best / massKg, 2) : null,
    restNote: 'circuit rest interval',
  };
}

/** RSImod from jump height (cm) and time to take-off (ms): metres / seconds, two places. */
export function rsiModFrom(heightCm, timeToTakeoffMs) {
  if (!isNum(heightCm) || !isNum(timeToTakeoffMs) || timeToTakeoffMs <= 0) return null;
  return round(heightCm / 100 / (timeToTakeoffMs / 1000), 2);
}

/**
 * CMJ: best height and best RSImod (typed from Smart2Move, or computed from
 * height and time to take-off - the rsiModEntry setting), best peak power in
 * W and W/kg (a typed W/kg wins; else W / body mass), and the L/R asymmetry of
 * the highest jump - an injury-screening value for coaches only.
 */
export function cmjScores(cmj, { rsiModEntry = 'typed', massKg = null } = {}) {
  const trials = (cmj?.trials ?? []).filter(Boolean);
  const rsi = trials.map((t) => (rsiModEntry === 'computed' ? rsiModFrom(t.heightCm, t.timeToTakeoffMs) : t.rsiMod));
  const highest = trials.reduce((best, t) => (isNum(t.heightCm) && (!best || t.heightCm > best.heightCm) ? t : best), null);
  const peakW = maxOf(trials.map((t) => t.peakPowerW));
  const typedWkg = maxOf(trials.map((t) => t.peakPowerWkg));
  const wkg = typedWkg != null ? typedWkg : peakW != null && isNum(massKg) && massKg > 0 ? peakW / massKg : null;
  return {
    bestHeight: round(highest ? highest.heightCm : null, 1),
    bestRsiMod: round(maxOf(rsi), 2),
    bestPeakW: round(peakW, 0),
    bestPeakWkg: round(wkg, 1),
    asymmetryPct: round(highest ? highest.asymmetryPct : null, 1),
  };
}

/**
 * One 10/5 set as scored. Per-set entry is Smart2Move's summary: the best-5
 * RSI and its mean contact time. Every-hop entry ({ hopRsi: [10], hopGctMs:
 * [10] }, parallel lists) scores the mean of the five highest RSIs (five
 * typed hops needed) and the mean contact time of those five. A set whose contact time is over 250 ms is flagged and not reported.
 */
export function hopSet(set, hopEntry = 'summary') {
  if (!set) return { rsi: null, gctMs: null, flagged: false };
  if (hopEntry === 'per-hop' || Array.isArray(set.hopRsi)) {
    const gcts = Array.isArray(set.hopGctMs) ? set.hopGctMs : [];
    const hops = (Array.isArray(set.hopRsi) ? set.hopRsi : []).map((rsi, i) => ({ rsi, gctMs: gcts[i] })).filter((h) => isNum(h.rsi));
    if (hops.length < BEST_HOPS) return { rsi: null, gctMs: null, flagged: false };
    const top = [...hops].sort((x, y) => y.rsi - x.rsi).slice(0, BEST_HOPS);
    const gct = meanOf(top.map((h) => h.gctMs));
    return { rsi: round(meanOf(top.map((h) => h.rsi)), 2), gctMs: round(gct, 0), flagged: gct != null && gct > GCT_FLAG_MS };
  }
  const gct = isNum(set.gctMs) ? set.gctMs : null;
  return { rsi: round(isNum(set.rsiBest5) ? set.rsiBest5 : null, 2), gctMs: gct, flagged: gct != null && gct > GCT_FLAG_MS };
}

/** 10/5: every set scored, and the best reportable (unflagged) set's RSI. */
export function hopScores(hop, { hopEntry = 'summary' } = {}) {
  const sets = (hop?.sets ?? []).map((s) => hopSet(s, hopEntry));
  const reportable = sets.filter((s) => s.rsi != null && !s.flagged);
  return {
    sets,
    best: reportable.length ? Math.max(...reportable.map((s) => s.rsi)) : null,
    allFlagged: reportable.length === 0 && sets.some((s) => s.rsi != null),
  };
}

/** Med ball: the best trail-side throw (mph, or m when the method is distance), with ball mass and side. */
export function medballScores(medball) {
  const m = medball || {};
  return { best: round(maxOf(m.throws), m.method === 'distance' ? 2 : 1), method: m.method ?? null, massKg: m.massKg ?? null, side: m.side ?? null };
}

/** Clubhead: best and the mean of the top three of five; Parallax as entered; under 120 fps the timing gaps are directional only. */
export function clubheadScores(golf) {
  const g = golf || {};
  const speeds = nums(g.speeds).sort((x, y) => y - x);
  return {
    best: round(speeds.length ? speeds[0] : null, 1),
    top3Mean: speeds.length >= 3 ? round(meanOf(speeds.slice(0, 3)), 1) : null,
    parallax: isNum(g.parallaxComposite) ? g.parallaxComposite : null,
    fpsDirectional: isNum(g.fps) && g.fps < FPS_DIRECTIONAL_BELOW,
  };
}

function ratio(num, den, flagIf) {
  if (!isNum(num) || !isNum(den) || den <= 0) return null;
  const value = round(num / den, 3);
  const capped = num >= CAP_SECONDS || den >= CAP_SECONDS;
  return { value: round(value, 2), capped, flagged: !capped && flagIf(value) };
}

/**
 * McGill ratios (protocol Section 4): flexion:extension (flag > 1.0),
 * right:left (flag when it differs from 1.0 by more than 0.05), and each
 * side bridge : extension (flag > 0.75). A ratio with a 300 s capped hold is
 * marked capped and never flagged. `summary` is what the family summary will
 * say - balanced, or working on it - only when all four ratios exist.
 */
export function mcgillScores(mcgill) {
  const m = mcgill || {};
  if (m.skippedBackPain === true) {
    return { skipped: true, flexExt: null, rightLeft: null, sideRightExt: null, sideLeftExt: null, summary: null };
  }
  const flexExt = ratio(m.flexorSec, m.extensorSec, (r) => r > 1.0);
  const rightLeft = ratio(m.sideRightSec, m.sideLeftSec, (r) => round(Math.abs(r - 1), 3) > 0.05);
  const sideRightExt = ratio(m.sideRightSec, m.extensorSec, (r) => r > 0.75);
  const sideLeftExt = ratio(m.sideLeftSec, m.extensorSec, (r) => r > 0.75);
  const all = [flexExt, rightLeft, sideRightExt, sideLeftExt];
  const summary = all.every(Boolean) ? (all.some((r) => r.flagged) ? 'working-on-it' : 'balanced') : null;
  return { skipped: false, flexExt, rightLeft, sideRightExt, sideLeftExt, summary };
}

/** A hold for display: "300+ (capped)" at the cap, "62 s" otherwise, "-" when not timed. */
export function holdLabel(seconds) {
  if (!isNum(seconds)) return '-';
  return seconds >= CAP_SECONDS ? '300+ (capped)' : `${seconds} s`;
}

/**
 * The change marker against the previous window (protocol Section 5):
 * 'gain' beyond +threshold %, 'drop' beyond -threshold %, 'within' otherwise;
 * null when either value is missing or the test has no threshold (Parallax).
 */
export function changeMarker(current, previous, thresholdPct) {
  if (!isNum(current) || !isNum(previous) || previous === 0 || !isNum(thresholdPct)) return null;
  const pct = round(((current - previous) / Math.abs(previous)) * 100, 3);
  if (pct > thresholdPct) return 'gain';
  if (pct < -thresholdPct) return 'drop';
  return 'within';
}
