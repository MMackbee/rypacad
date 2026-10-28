/**
 * Assessments - the portal's Firestore reads and writes (spec 4, 5). New
 * surface, kept out of live.js / index.js (the scholarships.js precedent):
 * it imports shared primitives FROM ./live, never the other way.
 *
 * firestore.rules is the boundary (athletes/{id}/assessments,
 * assessmentProfile, assessmentSettings, users.assessor;
 * scripts/rules-probes/assessments.mjs), and every write here is shaped to
 * pass it:
 *   - saveSection writes ONE section, its enteredBy mark and the server
 *     updatedAt, nothing else: the rules then check only that section's
 *     trials. It never bumps - the wave screen holds what was typed, and a
 *     refetch of every window per keystroke would flash the screen;
 *   - startWave opens (or re-waves) up to four athletes' windows in one
 *     transaction, keeping every entry of a window that is already open;
 *     an open window more than 14 days old is skipped, never re-waved.
 * Seed mode (isLive() false) writes nothing and resolves, like every other
 * write off the live flag.
 */
import { collection, collectionGroup, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, isLive, requireUser, wrap } from './live';
import { bump } from './invalidate';
import { academyDateISO } from '../data/calendar';
import { SETTINGS_KEYS, circuitModeOf, validVersionLabel, withDefaults } from '../data/assessmentSettings';
import { ASSESSMENT_SECTIONS, KINDS, seasonOf, staleOpen, weeksBetween, windowIdFor } from '../data/assessmentWindows';

export const ASSESSMENTS_KEY = 'assessments';
export const ASSESSMENT_SETTINGS_KEY = 'assessmentSettings';
/** The window fields a write may change outside the sections (rules: fieldsWrite). */
export const WINDOW_FIELDS = ['status', 'circuitDate', 'golfDate', 'mcgillDate', 'weeksOfExposure'];
export const PROFILE_FIELDS = ['sex', 'firstTestDate', 'medballMassKg', 'medballMethod', 'dominantHand', 'gripDevice', 'handlePosition', 'driver', 'season'];
export const MAX_WAVE = 4;

const windowRef = (athleteId, windowId) => doc(db, 'athletes', athleteId, 'assessments', windowId);
const profileRef = (athleteId) => doc(db, 'athletes', athleteId, 'assessmentProfile', 'current');
const settingsRef = () => doc(db, 'assessmentSettings', 'current');
const rowOf = (d) => ({ id: d.id, ...d.data(), athleteId: d.data().athleteId ?? d.ref.parent.parent.id });
const invalid = (message) => new LiveDataError(ERR.INVALID, message);

/** assessmentSettings/current as stored, or null before the first save (screens use withDefaults). */
export async function fetchAssessmentSettings() {
  try {
    const snap = await getDoc(settingsRef());
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    throw wrap(err, 'fetchAssessmentSettings');
  }
}

/** Every window academy-wide: one unfiltered collection-group read (no index), filtered by the caller. */
export async function fetchAllAssessmentWindows() {
  try {
    const snap = await getDocs(collectionGroup(db, 'assessments'));
    return snap.docs.map(rowOf);
  } catch (err) {
    throw wrap(err, 'fetchAllAssessmentWindows');
  }
}

/** One athlete's windows, any season. */
export async function fetchAthleteWindows(athleteId) {
  if (!athleteId) throw invalid('fetchAthleteWindows: athleteId is required.');
  try {
    const snap = await getDocs(collection(db, 'athletes', athleteId, 'assessments'));
    return snap.docs.map(rowOf);
  } catch (err) {
    throw wrap(err, 'fetchAthleteWindows');
  }
}

/** Every assessment profile: one unfiltered collection-group read. */
export async function fetchAllAssessmentProfiles() {
  try {
    const snap = await getDocs(collectionGroup(db, 'assessmentProfile'));
    return snap.docs.map(rowOf);
  } catch (err) {
    throw wrap(err, 'fetchAllAssessmentProfiles');
  }
}

/** athletes/{id}/assessmentProfile/current, or null. */
export async function fetchAssessmentProfile(athleteId) {
  if (!athleteId) throw invalid('fetchAssessmentProfile: athleteId is required.');
  try {
    const snap = await getDoc(profileRef(athleteId));
    return snap.exists() ? { athleteId, ...snap.data() } : null;
  } catch (err) {
    throw wrap(err, 'fetchAssessmentProfile');
  }
}

/**
 * The profile startWave writes: the first-test date is set once and never
 * moves; a new season clears the med ball method and mass (they are fixed
 * per season); everything else carries over.
 */
function profileFor(prev, athleteId, season, circuitDate, uid) {
  const sameSeason = prev?.season === season;
  return {
    athleteId,
    sex: prev?.sex ?? null,
    firstTestDate: prev?.firstTestDate ?? circuitDate,
    medballMassKg: sameSeason ? prev?.medballMassKg ?? null : null,
    medballMethod: sameSeason ? prev?.medballMethod ?? null : null,
    dominantHand: prev?.dominantHand ?? null,
    gripDevice: prev?.gripDevice ?? null,
    handlePosition: prev?.handlePosition ?? null,
    driver: prev?.driver ?? null,
    season,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };
}

/**
 * Start a wave (spec 5, list -> Start wave): for each athlete, open the
 * window `{season}-{kind}` with the settings' circuit-mode snapshot, or - when
 * that window is already open (absent last time, or a second tablet) - move
 * it into this wave and keep every entry. A complete window is skipped, and
 * so is an open one whose circuit date is more than 14 days before `today`
 * (reason 'stale': it is marked complete, never re-waved over its trials;
 * firestore.rules refuses that move too). Creates the profile (first-test
 * date) when the athlete has none for this season; a profile already in a
 * later season is left alone (the rules let the season only move forward).
 * One transaction: every athlete starts or none does.
 */
export async function startWave({ waveId, circuitDate, entries, settings, today = academyDateISO() }) {
  if (!waveId || typeof waveId !== 'string') throw invalid('startWave: waveId is required.');
  const season = seasonOf(circuitDate);
  if (!season) throw invalid('startWave: circuitDate must be a YYYY-MM-DD date.');
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_WAVE) {
    throw invalid(`startWave: a wave is 1 to ${MAX_WAVE} athletes.`);
  }
  for (const e of entries) {
    if (!e || !e.athleteId || !KINDS.includes(e.kind) || !Number.isInteger(e.position) || e.position < 1 || e.position > MAX_WAVE) {
      throw invalid('startWave: every athlete needs an id, a kind and a position from 1 to 4.');
    }
  }
  if (!isLive()) return { waveId, started: entries.map((e) => e.athleteId), skipped: [], simulated: true };
  const user = requireUser();
  const s = withDefaults(settings);
  const mode = circuitModeOf(s);
  let result;
  try {
    result = await runTransaction(db, async (tx) => {
      const reads = [];
      for (const e of entries) {
        const wRef = windowRef(e.athleteId, windowIdFor(season, e.kind));
        const pRef = profileRef(e.athleteId);
        reads.push({ e, wRef, pRef, window: await tx.get(wRef), profile: await tx.get(pRef) });
      }
      const started = [];
      const skipped = [];
      for (const r of reads) {
        const prof = r.profile.exists() ? r.profile.data() : null;
        if (r.window.exists() && r.window.data().status === 'complete') {
          skipped.push({ athleteId: r.e.athleteId, reason: 'complete' });
          continue;
        }
        if (r.window.exists() && staleOpen(r.window.data(), today)) {
          skipped.push({ athleteId: r.e.athleteId, reason: 'stale' });
          continue;
        }
        const wave = { id: waveId, position: r.e.position, coachUid: user.uid };
        const weeksOfExposure = weeksBetween(prof?.firstTestDate ?? circuitDate, circuitDate) ?? 0;
        if (r.window.exists()) {
          tx.update(r.wRef, { wave, circuitDate, weeksOfExposure, updatedAt: serverTimestamp() });
        } else {
          tx.set(r.wRef, {
            athleteId: r.e.athleteId, season, kind: r.e.kind, protocolVersion: s.protocolVersion, circuitMode: mode, status: 'open',
            circuitDate, golfDate: null, mcgillDate: null, weeksOfExposure, wave, enteredBy: {},
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
        }
        if (!prof || !prof.firstTestDate || (prof.season ?? '') < season) {
          tx.set(r.pRef, profileFor(prof, r.e.athleteId, season, circuitDate, user.uid));
        }
        started.push(r.e.athleteId);
      }
      return { started, skipped };
    });
  } catch (err) {
    throw wrap(err, 'startWave');
  }
  bump(ASSESSMENTS_KEY);
  return { waveId, ...result };
}

/**
 * One section as typed (spec 5: "Every entry saves as typed"): the section,
 * its enteredBy mark, the server time. The section is written whole, so two
 * devices typing into the same section are last writer wins: the circuit
 * runs on one shared tablet (spec decision 2), and the rules cannot tell a
 * stale copy from a correction without a transaction, which would refuse
 * every save made offline.
 */
export async function saveSection({ athleteId, windowId, section, value }) {
  if (!athleteId || !windowId) throw invalid('saveSection: athleteId and windowId are required.');
  if (!ASSESSMENT_SECTIONS.includes(section)) throw invalid(`saveSection: ${section} is not a section.`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('saveSection: a section is a map.');
  if (!isLive()) return { section, simulated: true };
  const user = requireUser();
  try {
    await updateDoc(windowRef(athleteId, windowId), { [section]: value, [`enteredBy.${section}`]: user.uid, updatedAt: serverTimestamp() });
  } catch (err) {
    throw wrap(err, 'saveSection');
  }
  return { section };
}

/** The window's own fields (status, dates, weeks). A status change refreshes the list screens. */
export async function saveWindowFields({ athleteId, windowId, fields }) {
  if (!athleteId || !windowId) throw invalid('saveWindowFields: athleteId and windowId are required.');
  const keys = Object.keys(fields || {});
  if (keys.length === 0 || keys.some((k) => !WINDOW_FIELDS.includes(k))) {
    throw invalid(`saveWindowFields: only ${WINDOW_FIELDS.join(', ')}.`);
  }
  if (!isLive()) return { ...fields, simulated: true };
  requireUser();
  try {
    await updateDoc(windowRef(athleteId, windowId), { ...fields, updatedAt: serverTimestamp() });
  } catch (err) {
    throw wrap(err, 'saveWindowFields');
  }
  if (keys.includes('status')) bump(ASSESSMENTS_KEY);
  return { ...fields };
}

/** Profile fields (sex at intake, dominant hand, the season's med ball), merged, with the writer. */
export async function saveAssessmentProfile({ athleteId, patch }) {
  if (!athleteId) throw invalid('saveAssessmentProfile: athleteId is required.');
  const keys = Object.keys(patch || {});
  if (keys.length === 0 || keys.some((k) => !PROFILE_FIELDS.includes(k))) {
    throw invalid(`saveAssessmentProfile: only ${PROFILE_FIELDS.join(', ')}.`);
  }
  if (!isLive()) return { ...patch, simulated: true };
  const user = requireUser();
  try {
    await setDoc(profileRef(athleteId), { ...patch, athleteId, updatedAt: serverTimestamp(), updatedBy: user.uid }, { merge: true });
  } catch (err) {
    throw wrap(err, 'saveAssessmentProfile');
  }
  return { ...patch };
}

/** The whole settings doc, defaults filled in, with the writer (Phil or the owner). */
export async function saveAssessmentSettings(settings) {
  const s = withDefaults(settings);
  if (!validVersionLabel(s.protocolVersion)) throw invalid('saveAssessmentSettings: the version label looks like v1.2.1.');
  if (!isLive()) return { protocolVersion: s.protocolVersion, simulated: true };
  const user = requireUser();
  try {
    await setDoc(settingsRef(), { ...Object.fromEntries(SETTINGS_KEYS.map((k) => [k, s[k]])), updatedAt: serverTimestamp(), updatedBy: user.uid });
  } catch (err) {
    throw wrap(err, 'saveAssessmentSettings');
  }
  bump(ASSESSMENT_SETTINGS_KEY);
  return { protocolVersion: s.protocolVersion };
}

/** The owner's Assessments permission switch on Staff & Roles (users.assessor). */
export async function setStaffAssessor({ uid, assessor }) {
  if (!uid || typeof assessor !== 'boolean') throw invalid('setStaffAssessor: a uid and true or false.');
  if (!isLive()) return { uid, assessor, simulated: true };
  requireUser();
  try {
    await updateDoc(doc(db, 'users', uid), { assessor });
  } catch (err) {
    throw wrap(err, 'setStaffAssessor');
  }
  bump('users');
  return { uid, assessor };
}
