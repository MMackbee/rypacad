/**
 * Seed-mode fixture for the assessment screens (REACT_APP_PORTAL_LIVE_DATA
 * off): five invented athletes - never a real family - covering every list
 * state: research yes / no / not answered, baseline due, two athletes in an
 * open wave, and one complete baseline with every section typed. Dates are
 * fixed (this is the review scaffold).
 */
import { DEFAULT_SETTINGS, circuitModeOf } from './assessmentSettings';

const research = (value) => ({ research: { value, assent: value, recordedAt: '2026-10-15T15:00:00Z', recordedBy: 'seed' } });

export const SEED_ASSESSMENT_ATHLETES = [
  { id: 'seed-ava', name: 'Ava Moreno', dob: '2012-04-10', consents: research(true) },
  { id: 'seed-ben', name: 'Ben Ortiz', dob: '2010-08-22', consents: research(false) },
  { id: 'seed-cal', name: 'Cal Duarte', dob: '2013-01-30', consents: {} },
  { id: 'seed-dev', name: 'Dev Patel', dob: '2011-11-05', consents: research(true) },
  { id: 'seed-eli', name: 'Eli Brooks', dob: '2009-06-14', consents: research(true) },
];

export const SEED_WAVE_ID = 'wave-2026-11-05-seed';
const MODE = circuitModeOf(DEFAULT_SETTINGS);
const baseline = (athleteId, over) => ({
  id: '2026-27-baseline', athleteId, season: '2026-27', kind: 'baseline', protocolVersion: 'v1.2', circuitMode: MODE,
  golfDate: null, mcgillDate: null, weeksOfExposure: 0, enteredBy: {}, ...over,
});

export const SEED_ASSESSMENT_WINDOWS = [
  baseline('seed-ava', {
    status: 'complete', circuitDate: '2026-11-03', golfDate: '2026-11-03', wave: { id: 'wave-2026-11-03-seed', position: 1, coachUid: 'phil' },
    readiness: { status: 'pass', reason: null, hoursSinceHardSession: 30, golfToday: false, notes: null },
    log: { location: 'ryp', externalContent: null, weeklyHours: 6, rypSessionsSincePrior: 0, golfVolume: '2 rounds a week', competitiveLevel: 'Handicap 9', otherSport: null, otherSportHours: null },
    anthro: { standing: [152.1, 152.3], mass: [41.0, 41.2], boxHeight: 40, sittingRaw: [118.0, 118.2], arm: [], hand: [] },
    grip: { right: [24.5, 25.1, 24.8], left: [23.0, 22.4, 23.8], deviceRight: 'D1', deviceLeft: 'D1', handlePosition: '3', dominant: 'right' },
    cmj: { trials: [{ heightCm: 31.2, rsiMod: 0.41, timeToTakeoffMs: null, peakPowerW: 2100, peakPowerWkg: null, asymmetryPct: 6.5 },
      { heightCm: 32.0, rsiMod: 0.39, timeToTakeoffMs: null, peakPowerW: 2150, peakPowerWkg: null, asymmetryPct: 4.2 }], software: 'Smart2Move', samplingHz: 1000 },
    hop: { sets: [{ rsiBest5: 2.31, gctMs: 198 }, { rsiBest5: 2.45, gctMs: 262 }] },
    medball: { massKg: 3, side: 'trail', method: 'speed', throws: [28.4, 29.1, 28.9] },
    mcgill: { flexorSec: 60, extensorSec: 90, sideRightSec: 50, sideLeftSec: 48, skippedBackPain: false },
    golf: { speeds: [88.2, 90.1, 89.5, 91.0, 87.9], driver: 'TSR3 10.5', parallaxComposite: 72, fps: 240 },
  }),
  baseline('seed-dev', {
    status: 'open', circuitDate: '2026-11-05', wave: { id: SEED_WAVE_ID, position: 1, coachUid: 'phil' },
    readiness: { status: 'pass', reason: null, hoursSinceHardSession: 48, golfToday: true, notes: null },
    anthro: { standing: [158.2], mass: [], boxHeight: 40, sittingRaw: [], arm: [], hand: [] },
  }),
  baseline('seed-eli', { status: 'open', circuitDate: '2026-11-05', wave: { id: SEED_WAVE_ID, position: 2, coachUid: 'phil' } }),
];

export const SEED_ASSESSMENT_PROFILES = [
  { athleteId: 'seed-ava', sex: 'female', firstTestDate: '2026-11-03', medballMassKg: 3, medballMethod: 'speed', dominantHand: 'right', gripDevice: 'D1', handlePosition: '3', driver: 'TSR3 10.5', season: '2026-27' },
  { athleteId: 'seed-dev', sex: 'male', firstTestDate: '2026-11-05', medballMassKg: null, medballMethod: null, dominantHand: null, gripDevice: null, handlePosition: null, driver: null, season: '2026-27' },
  { athleteId: 'seed-eli', sex: null, firstTestDate: '2026-11-05', medballMassKg: null, medballMethod: null, dominantHand: null, gripDevice: null, handlePosition: null, driver: null, season: '2026-27' },
];
