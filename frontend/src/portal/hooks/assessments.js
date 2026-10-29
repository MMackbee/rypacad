/**
 * Assessments - the read hooks every assessment screen mounts (spec 5). Seed
 * mode resolves the fixture in data/assessmentSeed.js; live mode reads
 * through hooks/assessmentsLive.js. The views are built by the pure
 * functions exported here, so each screen gets the same shape in both modes.
 * Invalidation keys: 'assessments' (startWave, a status change) and
 * 'assessmentSettings' (a settings save).
 */
import useSeedResource from './useSeedResource';
import { useInvalidation } from './invalidate';
import { fetchAllAthletes, fetchAthlete, fetchAthletesByIds, isLive } from './live';
import {
  ASSESSMENTS_KEY, ASSESSMENT_SETTINGS_KEY, fetchAllAssessmentProfiles, fetchAllAssessmentWindows, fetchAssessmentProfile, fetchAssessmentSettings,
  fetchAthleteWindows,
} from './assessmentsLive';
import { withDefaults } from '../data/assessmentSettings';
import { consentStatus, dueStatus } from '../data/assessmentWindows';
import { SEED_ASSESSMENT_ATHLETES, SEED_ASSESSMENT_PROFILES, SEED_ASSESSMENT_WINDOWS } from '../data/assessmentSeed';

const byDate = (a, b) => (a.circuitDate || '').localeCompare(b.circuitDate || '');
const byAthlete = (windows) => {
  const out = {};
  for (const w of windows) (out[w.athleteId] = out[w.athleteId] || []).push(w);
  return out;
};

/** The list (spec 5): every academy athlete, consent, what is due, last test, by name. */
export function rosterRows({ athletes, windows, today }) {
  const mine = byAthlete(windows || []);
  return (athletes || [])
    .map((a) => {
      const own = (mine[a.id] || []).sort(byDate);
      return { athleteId: a.id, name: a.name || a.id, dob: a.dob ?? null, consent: consentStatus(a), due: dueStatus(own, today), windows: own };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
}

/** One wave: its windows by position, each with the athlete's profile and earlier windows (growth check, med ball). */
export function waveView({ waveId, windows, athletes, profiles }) {
  const members = (windows || []).filter((w) => w.wave?.id === waveId).sort((a, b) => a.wave.position - b.wave.position);
  if (members.length === 0) return null;
  const athleteById = new Map((athletes || []).map((a) => [a.id, a]));
  const profileById = new Map((profiles || []).map((p) => [p.athleteId, p]));
  return {
    waveId,
    circuitDate: members[0].circuitDate,
    circuitMode: members[0].circuitMode,
    protocolVersion: members[0].protocolVersion,
    athletes: members.map((w) => ({
      athleteId: w.athleteId,
      name: athleteById.get(w.athleteId)?.name ?? w.athleteId,
      dob: athleteById.get(w.athleteId)?.dob ?? null,
      position: w.wave.position,
      windowId: w.id,
      kind: w.kind,
      window: w,
      profile: profileById.get(w.athleteId) ?? null,
      prior: (windows || []).filter((p) => p.athleteId === w.athleteId && p.id !== w.id && (p.circuitDate || '') < (w.circuitDate || '')).sort(byDate),
    })),
  };
}

/** Each athlete's open window (the latest), for the golf coach's session roster. */
export function openWindowsByAthlete(windows) {
  const out = {};
  for (const w of [...(windows || [])].filter((x) => x.status === 'open').sort(byDate)) {
    out[w.athleteId] = { windowId: w.id, kind: w.kind, circuitDate: w.circuitDate, golfDate: w.golfDate ?? null, circuitMode: w.circuitMode ?? null };
  }
  return out;
}

const pickAthlete = (a) => (a ? { id: a.id, name: a.name ?? null, dob: a.dob ?? null, consents: a.consents ?? {} } : null);

/** One athlete's results: the athlete (null when the caller may not read the record), profile, windows by date, settings. */
function athleteView({ athlete, profile, windows, settings }) {
  return { athlete: pickAthlete(athlete), profile: profile ?? null, windows: [...(windows || [])].sort(byDate), settings: withDefaults(settings) };
}

/** assessmentSettings/current with the v1.2 defaults filled in; `stored` is false before the first save. */
export function useAssessmentSettings() {
  const live = isLive();
  const gen = useInvalidation(ASSESSMENT_SETTINGS_KEY);
  return useSeedResource(
    live ? null : { settings: withDefaults(null), stored: false },
    live
      ? { source: async () => { const s = await fetchAssessmentSettings(); return { settings: withDefaults(s), stored: s != null }; }, deps: ['assessment-settings', gen] }
      : undefined
  );
}

/** The list: every academy athlete with consent and what is due on `today` (the academy date). */
export function useAssessmentRoster({ today }) {
  const live = isLive();
  const gen = useInvalidation(ASSESSMENTS_KEY);
  return useSeedResource(
    live ? null : { rows: rosterRows({ athletes: SEED_ASSESSMENT_ATHLETES, windows: SEED_ASSESSMENT_WINDOWS, today }) },
    live
      ? {
          source: async () => {
            const [athletes, windows] = await Promise.all([fetchAllAthletes(), fetchAllAssessmentWindows()]);
            return { rows: rosterRows({ athletes, windows, today }) };
          },
          deps: ['assessment-roster', today, gen],
        }
      : undefined
  );
}

/** One wave (spec 5): its athletes in position order, with their windows and profiles. */
export function useWave(waveId) {
  const live = isLive();
  const gen = useInvalidation(ASSESSMENTS_KEY);
  return useSeedResource(
    live ? null : waveView({ waveId, windows: SEED_ASSESSMENT_WINDOWS, athletes: SEED_ASSESSMENT_ATHLETES, profiles: SEED_ASSESSMENT_PROFILES }),
    live
      ? {
          source: async () => {
            const [windows, profiles] = await Promise.all([fetchAllAssessmentWindows(), fetchAllAssessmentProfiles()]);
            const ids = windows.filter((w) => w.wave?.id === waveId).map((w) => w.athleteId);
            const athletes = ids.length ? await fetchAthletesByIds(ids) : [];
            return waveView({ waveId, windows, athletes, profiles });
          },
          deps: ['assessment-wave', waveId, gen],
        }
      : undefined
  );
}

/** One athlete's windows, profile and the settings (results, golf entry). A refused athlete read is null, not an error. */
export function useAthleteAssessments(athleteId) {
  const live = isLive() && athleteId != null;
  const gen = useInvalidation(ASSESSMENTS_KEY);
  const settingsGen = useInvalidation(ASSESSMENT_SETTINGS_KEY);
  return useSeedResource(
    live
      ? null
      : athleteView({
          athlete: SEED_ASSESSMENT_ATHLETES.find((a) => a.id === athleteId),
          profile: SEED_ASSESSMENT_PROFILES.find((p) => p.athleteId === athleteId),
          windows: SEED_ASSESSMENT_WINDOWS.filter((w) => w.athleteId === athleteId),
          settings: null,
        }),
    live
      ? {
          source: async () => {
            const [athlete, profile, windows, settings] = await Promise.all([
              fetchAthlete(athleteId).catch(() => null),
              fetchAssessmentProfile(athleteId),
              fetchAthleteWindows(athleteId),
              fetchAssessmentSettings(),
            ]);
            return athleteView({ athlete, profile, windows, settings });
          },
          deps: ['assessment-athlete', athleteId, gen, settingsGen],
        }
      : undefined
  );
}

/**
 * Which athletes have an open window: the golf coach's "Clubhead speed"
 * entry on the session roster. `enabled: false` (a viewer the rules refuse,
 * such as a mental account without the Assessments permission) reads
 * nothing and answers no open windows.
 */
export function useOpenAssessmentWindows({ enabled = true } = {}) {
  const live = isLive() && enabled;
  const gen = useInvalidation(ASSESSMENTS_KEY);
  return useSeedResource(
    live ? null : { byAthlete: enabled ? openWindowsByAthlete(SEED_ASSESSMENT_WINDOWS) : {} },
    live ? { source: async () => ({ byAthlete: openWindowsByAthlete(await fetchAllAssessmentWindows()) }), deps: ['assessment-open', gen] } : undefined
  );
}
