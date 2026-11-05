/**
 * Assessment fixtures (docs/portal/plans/2026-10-14-assessments): the
 * windows, assessment profiles and research answers the emulator seed
 * (scripts/seed-firestore.mjs) writes for INVENTED athletes only.
 * Pure and dependency-free: dates are relative to `todayISO`; `mode` is the
 * caller's circuitModeOf(DEFAULT_SETTINGS) and `seasonOf` the frontend's,
 * both bundled from frontend/src/portal/data, so the protocol is never
 * retyped here. Every value sits inside the ranges firestore.rules holds.
 *
 * One story per athlete:
 *   tested     - research yes (recorded 70 days back) and a COMPLETE
 *                baseline 63 days back, every section typed: mid-season
 *                eligible today. (Run before 9 weeks into the season, the
 *                baseline falls in the previous season and reads "Baseline
 *                due" instead.)
 *   due        - research yes (recorded 10 days back), never tested.
 *   declined   - research no: tested and coached the same, baseline due.
 *   unanswered - consents with no research answer: the list can add them
 *                (owner 2026-11-05) with a line that their tests stay out
 *                of research, and the family's one-time confirm asks.
 */
export const STORIES = ['tested', 'due', 'declined', 'unanswered'];

const DAY_MS = 86400000;
export function addDaysISO(iso, n) {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
const stamp = (iso, hourUtc) => new Date(`${iso}T${String(hourUtc).padStart(2, '0')}:00:00Z`);

/** One complete baseline's sections, as the stations write them. */
const SECTIONS = {
  readiness: { status: 'pass', reason: null, hoursSinceHardSession: 30, golfToday: false, notes: null },
  log: { location: 'ryp', externalContent: null, weeklyHours: 6, rypSessionsSincePrior: 0, golfVolume: '2 rounds a week', competitiveLevel: 'Club junior', otherSport: null, otherSportHours: null },
  anthro: { standing: [152.1, 152.3], mass: [41.0, 41.2], boxHeight: 40, sittingRaw: [118.0, 118.2], arm: [], hand: [] },
  grip: { right: [24.5, 25.1, 24.8], left: [23.0, 22.4, 23.8], deviceRight: 'D1', deviceLeft: 'D1', handlePosition: '3', dominant: 'right' },
  cmj: {
    trials: [
      { heightCm: 31.2, rsiMod: 0.41, timeToTakeoffMs: null, peakPowerW: 2100, peakPowerWkg: null, asymmetryPct: 6.5 },
      { heightCm: 32.0, rsiMod: 0.39, timeToTakeoffMs: null, peakPowerW: 2150, peakPowerWkg: null, asymmetryPct: 4.2 },
    ],
    software: 'Smart2Move',
    samplingHz: 1000,
  },
  hop: { sets: [{ rsiBest5: 2.31, gctMs: 198 }, { rsiBest5: 2.45, gctMs: 262 }] },
  medball: { massKg: 2, side: 'trail', method: 'speed', throws: [28.4, 29.1, 28.9] },
  mcgill: { flexorSec: 60, extensorSec: 90, sideRightSec: 50, sideLeftSec: 48, skippedBackPain: false },
  golf: { speeds: [88.2, 90.1, 89.5, 91.0, 87.9], driver: 'Fixture driver', parallaxComposite: 72, fps: 240 },
};

function consentsFor(a, todayISO, guardianUid, signatureName) {
  const recorded = addDaysISO(todayISO, a.story === 'tested' ? -70 : -10);
  const yes = a.story === 'tested' || a.story === 'due';
  return {
    dataCollection: true,
    videoCapture: true,
    mediaRelease: false,
    research: a.story === 'unanswered' ? null : { value: yes, assent: a.adult ? null : yes, recordedAt: stamp(recorded, 15), recordedBy: guardianUid },
    signature: { name: signatureName, date: addDaysISO(todayISO, -70) },
  };
}

export function assessmentFixtures({
  todayISO, mode, seasonOf, athletes, protocolVersion = 'v1.2', coachUid = 'phil', guardianUid = 'fixture-guardian', signatureName = 'Fixture Guardian',
}) {
  const consents = {};
  const collections = {};
  let tested = 0;
  for (const a of athletes) {
    if (!STORIES.includes(a.story)) throw new Error(`assessmentFixtures: unknown story "${a.story}" for ${a.id}`);
    consents[a.id] = consentsFor(a, todayISO, guardianUid, signatureName);
    if (a.story !== 'tested') continue;
    const circuitDate = addDaysISO(todayISO, -63);
    const season = seasonOf(circuitDate);
    const at = stamp(circuitDate, 22);
    collections[`athletes/${a.id}/assessments`] = new Map([[`${season}-baseline`, {
      athleteId: a.id, season, kind: 'baseline', protocolVersion, circuitMode: mode, status: 'complete',
      circuitDate, golfDate: circuitDate, mcgillDate: circuitDate, weeksOfExposure: 0,
      wave: { id: `wave-${circuitDate}-fixtr`, position: (tested % 4) + 1, coachUid },
      ...SECTIONS,
      notTested: {},
      enteredBy: Object.fromEntries(Object.keys(SECTIONS).map((s) => [s, coachUid])),
      createdAt: at,
      updatedAt: at,
    }]]);
    collections[`athletes/${a.id}/assessmentProfile`] = new Map([['current', {
      athleteId: a.id, sex: a.sex ?? null, firstTestDate: circuitDate, medballMassKg: 2, medballMethod: 'speed', dominantHand: 'right',
      gripDevice: 'D1', handlePosition: '3', driver: 'Fixture driver', season, updatedAt: at, updatedBy: coachUid,
    }]]);
    tested += 1;
  }
  return { consents, collections };
}
