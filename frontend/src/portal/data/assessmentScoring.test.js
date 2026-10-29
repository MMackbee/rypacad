import {
  anthroFinals, changeMarker, clubheadScores, closestTwoMean, cmjScores, decimalAge, gripScores, growthCm, growthFlag,
  holdLabel, hopScores, hopSet, isoToMs, maturityCategory, maturityOffset, mcgillScores, medballScores, needsThirdMeasure, rsiModFrom,
} from './assessmentScoring';

// The protocol's printed coefficients (Moore et al. 2015, protocol Section 3).
const MOORE = { boys: { a: -8.128741, b: 0.0070346 }, girls: { a: -7.709133, b: 0.0042232 } };

describe('repeated measures (protocol Section 3)', () => {
  test('closest two of three; two is their mean; one is itself; none is null', () => {
    expect(closestTwoMean([150.2, 150.4, 151.6])).toBeCloseTo(150.3, 6);
    expect(closestTwoMean([151.6, 150.2, 150.4])).toBeCloseTo(150.3, 6);
    expect(closestTwoMean([150.0, 151.2, 151.4])).toBeCloseTo(151.3, 6);
    expect(closestTwoMean([150.2, 150.4])).toBeCloseTo(150.3, 6);
    expect(closestTwoMean([150.2, null, null])).toBe(150.2);
    expect(closestTwoMean([null, null])).toBeNull();
    expect(closestTwoMean(undefined)).toBeNull();
  });
  test('an exact tie keeps the lower pair, whatever floating point says', () => {
    // In floating point 80.4 - 80.0 is 0.40000000000000568 and 80.8 - 80.4 is 0.3999999999999915.
    expect(closestTwoMean([80.0, 80.4, 80.8])).toBeCloseTo(80.2, 6);
  });
  test('a third seated measure is asked for only when the first two differ by more than 0.4 cm', () => {
    expect(needsThirdMeasure([118.0, 118.4])).toBe(false);
    expect(needsThirdMeasure([118.0, 118.5])).toBe(true);
    expect(needsThirdMeasure([118.0, 118.5, 118.2])).toBe(false);
    expect(needsThirdMeasure([118.0, null])).toBe(false);
  });
});

describe('anthropometrics', () => {
  test('sitting is the seated measure minus the box; leg length is standing minus sitting', () => {
    const f = anthroFinals({ standing: [152.1, 152.3], mass: [41.0, 41.2], boxHeight: 40, sittingRaw: [118.0, 118.2], arm: [65.0], hand: [17.5, 17.7] });
    expect(f).toEqual({ standing: 152.2, mass: 41.1, sitting: 78.1, legLength: 74.1, arm: 65, hand: 17.6, needsThirdSitting: false });
  });
  test('no box height means no sitting height and no leg length, never NaN', () => {
    const f = anthroFinals({ standing: [152.2], sittingRaw: [118.1] });
    expect(f.sitting).toBeNull();
    expect(f.legLength).toBeNull();
    expect(anthroFinals(undefined)).toEqual({ standing: null, mass: null, sitting: null, legLength: null, arm: null, hand: null, needsThirdSitting: false });
  });
  test('the growth flag trips above 3 cm since the prior window', () => {
    expect(growthCm(155.4, 152.2)).toBe(3.2);
    expect(growthFlag(155.4, 152.2)).toBe(true);
    expect(growthFlag(155.2, 152.2)).toBe(false);
    expect(growthFlag(155.4, null)).toBe(false);
  });
});

describe('maturity offset (Moore et al. 2015, as the protocol prints it)', () => {
  test("Phil's anchors: boy 14.0 / sitting 78.0 is about -0.447; girl 12.0 / standing 150.0 is about -0.107", () => {
    expect(maturityOffset({ sex: 'male', age: 14.0, sittingCm: 78.0, standingCm: 160, coefficients: MOORE })).toBe(-0.447);
    expect(maturityOffset({ sex: 'female', age: 12.0, sittingCm: 70, standingCm: 150.0, coefficients: MOORE })).toBe(-0.107);
  });
  test('boys use sitting height, girls standing height; any missing input is null', () => {
    expect(maturityOffset({ sex: 'male', age: 14, sittingCm: null, standingCm: 160, coefficients: MOORE })).toBeNull();
    expect(maturityOffset({ sex: 'female', age: 12, sittingCm: 70, standingCm: null, coefficients: MOORE })).toBeNull();
    expect(maturityOffset({ sex: null, age: 12, sittingCm: 70, standingCm: 150, coefficients: MOORE })).toBeNull();
    expect(maturityOffset({ sex: 'male', age: null, sittingCm: 78, standingCm: 160, coefficients: MOORE })).toBeNull();
    expect(maturityOffset({ sex: 'male', age: 14, sittingCm: 78, standingCm: 160, coefficients: null })).toBeNull();
  });
  test('categories: pre below -1.0, circa from -1.0 to +1.0, post above +1.0', () => {
    expect(maturityCategory(-1.001)).toBe('pre');
    expect(maturityCategory(-1)).toBe('circa');
    expect(maturityCategory(1)).toBe('circa');
    expect(maturityCategory(1.001)).toBe('post');
    expect(maturityCategory(null)).toBeNull();
  });
  test('decimal age from the date of birth at the circuit date', () => {
    expect(decimalAge('2012-11-03', '2026-11-03')).toBe(14);
    expect(decimalAge('2012-05-03', '2026-11-03')).toBe(14.5);
    expect(decimalAge('2012-02-30', '2026-11-03')).toBeNull();
    expect(decimalAge(null, '2026-11-03')).toBeNull();
    expect(decimalAge('2027-01-01', '2026-11-03')).toBeNull();
    expect(isoToMs('2026-11-03')).toBe(Date.UTC(2026, 10, 3));
    expect(isoToMs('Nov 3')).toBeNull();
  });
});

describe('grip, CMJ, 10/5, med ball, clubhead', () => {
  test('grip: best per hand, the better hand, best / body mass, always the circuit rest interval', () => {
    expect(gripScores({ right: [24.5, 25.1, null], left: [23.0, 22.4, 23.8] }, 41.1)).toEqual({
      bestRight: 25.1, bestLeft: 23.8, best: 25.1, relativeBest: 0.61, restNote: 'circuit rest interval',
    });
    expect(gripScores(undefined, 41.1)).toMatchObject({ best: null, relativeBest: null });
    expect(gripScores({ right: [25.1] }, null).relativeBest).toBeNull();
  });
  test('CMJ, typed RSImod: best height, best RSImod, peak power, the highest jump\'s asymmetry', () => {
    const cmj = { trials: [
      { heightCm: 31.2, rsiMod: 0.41, peakPowerW: 2100, asymmetryPct: 6.5 },
      { heightCm: 32.0, rsiMod: 0.39, peakPowerW: 2150, peakPowerWkg: null, asymmetryPct: 4.2 },
    ] };
    expect(cmjScores(cmj, { rsiModEntry: 'typed', massKg: 41.1 })).toEqual({ bestHeight: 32, bestRsiMod: 0.41, bestPeakW: 2150, bestPeakWkg: 52.3, asymmetryPct: 4.2 });
  });
  test('CMJ, computed RSImod: jump height (m) / time to take-off (s)', () => {
    expect(rsiModFrom(35, 800)).toBe(0.44);
    expect(rsiModFrom(35, 0)).toBeNull();
    const cmj = { trials: [{ heightCm: 35, timeToTakeoffMs: 800 }, { heightCm: 33, timeToTakeoffMs: 700 }, null] };
    expect(cmjScores(cmj, { rsiModEntry: 'computed' }).bestRsiMod).toBe(0.47);
  });
  test('10/5 per set: the best reportable set; a set over 250 ms is flagged and not reported', () => {
    const r = hopScores({ sets: [{ rsiBest5: 2.31, gctMs: 198 }, { rsiBest5: 2.45, gctMs: 262 }] });
    expect(r.best).toBe(2.31);
    expect(r.sets[1]).toEqual({ rsi: 2.45, gctMs: 262, flagged: true });
    expect(r.allFlagged).toBe(false);
    expect(hopScores({ sets: [{ rsiBest5: 2.4, gctMs: 251 }] })).toMatchObject({ best: null, allFlagged: true });
    expect(hopScores(undefined)).toEqual({ sets: [], best: null, allFlagged: false });
  });
  test('10/5 per hop: mean of the five highest RSIs and the mean contact time of those five', () => {
    const rsi = [2.1, 2.3, 1.9, 2.4, 2.2, 2.0, 2.35, 1.8, 2.25, 2.05];
    const gct = [200, 190, 230, 185, 210, 240, 195, 260, 205, 220];
    expect(hopSet({ hopRsi: rsi, hopGctMs: gct }, 'per-hop')).toEqual({ rsi: 2.3, gctMs: 197, flagged: false });
    expect(hopSet({ hopRsi: [...rsi.slice(0, 4), null, null], hopGctMs: gct }, 'per-hop').rsi).toBeNull();
    expect(hopSet({ hopRsi: rsi, hopGctMs: Array(10).fill(260) }, 'per-hop').flagged).toBe(true);
  });
  test('med ball: the best trail-side throw with mass and side', () => {
    expect(medballScores({ massKg: 3, side: 'trail', method: 'speed', throws: [28.4, 29.1, null] })).toEqual({ best: 29.1, method: 'speed', massKg: 3, side: 'trail' });
    expect(medballScores({ method: 'distance', throws: [6.25, 6.4] }).best).toBe(6.4);
  });
  test('clubhead: best and the mean of the top three of five; under 120 fps is directional only', () => {
    expect(clubheadScores({ speeds: [88.2, 90.1, 89.5, 91.0, 87.9], parallaxComposite: 72, fps: 110 })).toEqual({ best: 91, top3Mean: 90.2, parallax: 72, fpsDirectional: true });
    expect(clubheadScores({ speeds: [88.2, 90.1], fps: 240 })).toEqual({ best: 90.1, top3Mean: null, parallax: null, fpsDirectional: false });
  });
});

describe('McGill (protocol Section 4)', () => {
  test('balanced when no ratio is flagged', () => {
    const r = mcgillScores({ flexorSec: 60, extensorSec: 90, sideRightSec: 50, sideLeftSec: 48, skippedBackPain: false });
    expect(r.flexExt).toEqual({ value: 0.67, capped: false, flagged: false });
    expect(r.rightLeft.flagged).toBe(false);
    expect(r.summary).toBe('balanced');
  });
  test('flags: F:E above 1.0, R:L more than 0.05 from 1.0, side:extension above 0.75 - each boundary itself passes', () => {
    expect(mcgillScores({ flexorSec: 95, extensorSec: 90, sideRightSec: 50, sideLeftSec: 50 }).summary).toBe('working-on-it');
    expect(mcgillScores({ flexorSec: 50, extensorSec: 60, sideRightSec: 63, sideLeftSec: 60 }).rightLeft.flagged).toBe(false);
    expect(mcgillScores({ flexorSec: 50, extensorSec: 60, sideRightSec: 64, sideLeftSec: 60 }).rightLeft.flagged).toBe(true);
    expect(mcgillScores({ flexorSec: 50, extensorSec: 60, sideRightSec: 45, sideLeftSec: 45 }).sideRightExt.flagged).toBe(false);
    expect(mcgillScores({ flexorSec: 50, extensorSec: 60, sideRightSec: 46, sideLeftSec: 46 }).sideRightExt.flagged).toBe(true);
  });
  test('a 300 s hold is capped: its ratios are marked capped and never flagged', () => {
    const r = mcgillScores({ flexorSec: 120, extensorSec: 300, sideRightSec: 80, sideLeftSec: 82 });
    expect(r.flexExt).toMatchObject({ capped: true, flagged: false });
    expect(r.sideRightExt.capped).toBe(true);
    expect(holdLabel(300)).toBe('300+ (capped)');
    expect(holdLabel(62)).toBe('62 s');
    expect(holdLabel(null)).toBe('-');
  });
  test('skipped for low back pain, or incomplete: no summary', () => {
    expect(mcgillScores({ skippedBackPain: true, sideRightSec: 40, sideLeftSec: 41 })).toMatchObject({ skipped: true, summary: null });
    expect(mcgillScores({ flexorSec: 60, extensorSec: 90, sideRightSec: 50 }).summary).toBeNull();
  });
});

describe('change markers (protocol Section 5)', () => {
  test('gain beyond +threshold, drop beyond -threshold, within otherwise; the threshold itself is within', () => {
    expect(changeMarker(102, 100, 2)).toBe('within');
    expect(changeMarker(102.1, 100, 2)).toBe('gain');
    expect(changeMarker(98, 100, 2)).toBe('within');
    expect(changeMarker(97.9, 100, 2)).toBe('drop');
    expect(changeMarker(90.1, 88.2, 2)).toBe('gain');
  });
  test('no marker without both values or without a threshold (Parallax)', () => {
    expect(changeMarker(72, 70, null)).toBeNull();
    expect(changeMarker(null, 70, 5)).toBeNull();
    expect(changeMarker(70, 0, 5)).toBeNull();
  });
});
