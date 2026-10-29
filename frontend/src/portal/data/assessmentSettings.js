/**
 * Protocol settings - assessmentSettings/current (spec 4.6). Procedure
 * details that may change after the first timed wave are settings, not
 * code: Phil and the owner edit them on the staff Settings screen, and every
 * window keeps a snapshot of what it ran under (circuitModeOf) so a
 * reduced-trial or short-rest result is never compared as if it were
 * full-spec. PURE: no Firestore, no React.
 */

export const PROTOCOL_VERSION = 'v1.2';

/** The protocol's v1.2 values (spec 4.6 table; protocol Sections 2-5). */
export const DEFAULT_SETTINGS = {
  protocolVersion: PROTOCOL_VERSION,
  trialCounts: { grip: 3, cmjPractice: 1, cmjScored: 2, hopPractice: 1, hopScored: 2, medballPractice: 1, medballScored: 3, clubheadWarmup: 3, clubheadMax: 5 },
  gripRestSec: { min: 15, max: 20 },
  stations: { intake: true, anthro: true, grip: true, cmj: true, hop: true, medball: true, mcgill: true, segments: false, keiser: false },
  mcgillMode: 'wave',
  medballSide: 'trail',
  golfTiming: 'within-7',
  waveSize: 4,
  wavesPerSession: 5,
  hopEntry: 'summary',
  rsiModEntry: 'typed',
  coefficients: { set: 'moore-2015', verified: false, boys: { a: -8.128741, b: 0.0070346 }, girls: { a: -7.709133, b: 0.0042232 } },
  thresholds: { clubhead: 2, cmj: 5, hop: 8, medball: 5, grip: 5, parallax: null },
};

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

/** [min, max] per trial count - the same caps firestore.rules holds (assessmentSettings). */
export const TRIAL_LIMITS = {
  grip: [1, 5], cmjPractice: [0, 3], cmjScored: [1, 3], hopPractice: [0, 2], hopScored: [1, 4],
  medballPractice: [0, 3], medballScored: [1, 5], clubheadWarmup: [0, 5], clubheadMax: [1, 8],
};

/** The settings that change the procedure: saving one asks for a new protocol version label. */
export const PROCEDURE_KEYS = ['trialCounts', 'gripRestSec', 'stations', 'mcgillMode', 'medballSide', 'golfTiming', 'waveSize'];

/**
 * The entry modes (spec 4.1: "hop and RSImod entry modes"): results typed
 * under another mode are flagged, and only the marker that entry feeds is
 * switched off (the 10/5 marker for hopEntry; RSImod has no marker). The
 * coefficient set is kept on the window but is not a mode difference:
 * every maturity offset is computed with the current coefficients.
 */
export const ENTRY_KEYS = ['hopEntry', 'rsiModEntry'];

/** The circuit-mode keys two results must share to be compared (protocol Section 5: "trial counts and rest intervals used"), then the entry modes. */
export const MODE_KEYS = ['trialCounts', 'gripRestSec', 'stations', 'mcgillMode', 'medballSide', 'golfTiming', ...ENTRY_KEYS];

/** Not-tested codes (protocol Section 5): absent, ill, pain, injury, equipment failure. */
export const NOT_TESTED_REASONS = [['absent', 'Absent'], ['ill', 'Ill'], ['pain', 'Pain'], ['injury', 'Injury'], ['equipment', 'Equipment']];

/** The fixed station order (protocol Section 2) and each station's standard cue (Sections 2-4). */
export const STATIONS = [
  { id: 'intake', label: 'Readiness & intake', sections: ['readiness', 'log'], notTestedKeys: ['readiness'],
    cue: 'Pain check first. Do not test an athlete who is ill, reports current pain, or has an unresolved injury: record not tested with a reason and retest within 7 days.' },
  { id: 'anthro', label: 'Anthropometrics', sections: ['anthro'], notTestedKeys: ['anthro'],
    cue: 'Shoes off, minimal clothing. Standing height to 0.1 cm and body mass to 0.1 kg; take a second measure if the first looks off.' },
  { id: 'grip', label: 'Grip', sections: ['grip'], notTestedKeys: ['grip'],
    cue: 'Squeeze as hard as you can. Go, go, go, relax.' },
  { id: 'jump', label: 'CMJ, then 10/5', sections: ['cmj', 'hop'], notTestedKeys: ['cmj', 'hop'],
    cue: 'CMJ: "Dip fast and jump as high as you can." 10/5: "Off the ground as fast as you can, and as high as you can. Hot ground."' },
  { id: 'medball', label: 'Med ball', sections: ['medball'], notTestedKeys: ['medball'],
    cue: 'Push the ground and throw it through the wall.' },
  { id: 'mcgill', label: 'McGill', sections: ['mcgill'], notTestedKeys: ['mcgill'],
    cue: 'Flexor, extensor, right side bridge, left side bridge. One warning for posture, then stop. Stop every hold at 300 s.' },
];

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Key-order-independent JSON, so a Firestore map read back in another key order is not a change. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isMap(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}

/** Stored settings merged over the defaults: every known key present, unknown keys (updatedAt, updatedBy) dropped. */
export function withDefaults(stored) {
  const s = isMap(stored) ? stored : {};
  const out = {};
  for (const key of SETTINGS_KEYS) {
    const d = DEFAULT_SETTINGS[key];
    const v = s[key];
    if (v === undefined || (v === null && d !== null)) out[key] = isMap(d) ? { ...d } : d;
    else out[key] = isMap(d) && isMap(v) ? { ...d, ...v } : v;
  }
  const c = isMap(s.coefficients) ? s.coefficients : {};
  out.coefficients = {
    ...out.coefficients,
    boys: { ...DEFAULT_SETTINGS.coefficients.boys, ...(isMap(c.boys) ? c.boys : {}) },
    girls: { ...DEFAULT_SETTINGS.coefficients.girls, ...(isMap(c.girls) ? c.girls : {}) },
  };
  return out;
}

/** True when a save changes the procedure (PROCEDURE_KEYS): the protocol says any procedure change increments the version. */
export function procedureChanged(before, after) {
  const a = withDefaults(before);
  const b = withDefaults(after);
  return PROCEDURE_KEYS.some((k) => stable(a[k]) !== stable(b[k]));
}

/** The next patch label: v1.2 -> v1.2.1, v1.2.1 -> v1.2.2; anything unreadable -> v1.2.1. */
export function nextPatch(version) {
  const m = /^v(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(version || ''));
  if (!m) return `${PROTOCOL_VERSION}.1`;
  return `v${m[1]}.${m[2]}.${m[3] ? Number(m[3]) + 1 : 1}`;
}

/** A protocol label: v1.2 or v1.2.1 (the same pattern firestore.rules holds). */
export function validVersionLabel(label) {
  return /^v\d+\.\d+(\.\d+)?$/.test(String(label || ''));
}

/** The snapshot a window keeps of the settings it ran under (spec 4.1 circuitMode). */
export function circuitModeOf(settings) {
  const s = withDefaults(settings);
  return {
    trialCounts: s.trialCounts,
    gripRestSec: s.gripRestSec,
    stations: s.stations,
    mcgillMode: s.mcgillMode,
    medballSide: s.medballSide,
    golfTiming: s.golfTiming,
    waveSize: s.waveSize,
    hopEntry: s.hopEntry,
    rsiModEntry: s.rsiModEntry,
    coefficientSet: s.coefficients.set,
    coefficientsVerified: s.coefficients.verified === true,
  };
}

/** The circuit-mode keys on which two windows differ; [] when either is missing. */
export function modeDifferences(a, b) {
  if (!isMap(a) || !isMap(b)) return [];
  return MODE_KEYS.filter((k) => stable(a[k]) !== stable(b[k]));
}

/** The med ball for a body mass at the first test: under 45 kg 2 kg, 45-65 kg 3 kg, over 65 kg 4 kg. */
export function medballMassFor(massKg) {
  if (typeof massKg !== 'number' || !Number.isFinite(massKg)) return null;
  if (massKg < 45) return 2;
  if (massKg > 65) return 4;
  return 3;
}

/**
 * The stations a wave runs, in the fixed order. McGill runs at baseline and
 * end only, so a wave of nothing but mid-season athletes has no McGill
 * station; a station switched off in the settings is left out.
 */
export function stationsFor(circuitMode, kinds = []) {
  const on = { ...DEFAULT_SETTINGS.stations, ...(isMap(circuitMode?.stations) ? circuitMode.stations : {}) };
  const anyFull = kinds.length === 0 || kinds.some((k) => k !== 'mid');
  return STATIONS.filter((st) => {
    if (st.id === 'jump') return on.cmj !== false || on.hop !== false;
    if (st.id === 'mcgill') return on.mcgill !== false && anyFull;
    return on[st.id] !== false;
  });
}
