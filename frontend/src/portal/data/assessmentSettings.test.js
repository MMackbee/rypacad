import {
  DEFAULT_SETTINGS, ENTRY_KEYS, circuitModeOf, medballMassFor, modeDifferences, nextPatch, procedureChanged, stationsFor, validVersionLabel, withDefaults,
} from './assessmentSettings';

describe('settings merge (spec 4.6)', () => {
  test('nothing stored is the v1.2 default', () => {
    expect(withDefaults(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.protocolVersion).toBe('v1.2');
    expect(DEFAULT_SETTINGS.trialCounts).toEqual({ grip: 3, cmjPractice: 1, cmjScored: 2, hopPractice: 1, hopScored: 2, medballPractice: 1, medballScored: 3, clubheadWarmup: 3, clubheadMax: 5 });
    expect(DEFAULT_SETTINGS.thresholds).toEqual({ clubhead: 2, cmj: 5, hop: 8, medball: 5, grip: 5, parallax: null });
    expect(DEFAULT_SETTINGS.coefficients).toEqual({ set: 'moore-2015', verified: false, boys: { a: -8.128741, b: 0.0070346 }, girls: { a: -7.709133, b: 0.0042232 } });
  });
  test('a stored partial map is merged over the default; unknown keys are dropped', () => {
    const s = withDefaults({ trialCounts: { grip: 2 }, waveSize: 3, coefficients: { verified: true, boys: { a: -8.1 } }, updatedBy: 'u1' });
    expect(s.trialCounts.grip).toBe(2);
    expect(s.trialCounts.cmjScored).toBe(2);
    expect(s.waveSize).toBe(3);
    expect(s.coefficients).toEqual({ set: 'moore-2015', verified: true, boys: { a: -8.1, b: 0.0070346 }, girls: { a: -7.709133, b: 0.0042232 } });
    expect('updatedBy' in s).toBe(false);
  });
});

describe('procedure changes bump the protocol version', () => {
  const d = DEFAULT_SETTINGS;
  test('trial counts, rest, stations, McGill mode, med ball side, golf timing and wave size are procedure', () => {
    expect(procedureChanged(d, { ...d, trialCounts: { ...d.trialCounts, grip: 2 } })).toBe(true);
    expect(procedureChanged(d, { ...d, gripRestSec: { min: 30, max: 30 } })).toBe(true);
    expect(procedureChanged(d, { ...d, stations: { ...d.stations, mcgill: false } })).toBe(true);
    expect(procedureChanged(d, { ...d, mcgillMode: 'separate' })).toBe(true);
    expect(procedureChanged(d, { ...d, waveSize: 3 })).toBe(true);
  });
  test('thresholds, coefficients and entry modes are not', () => {
    expect(procedureChanged(d, { ...d, thresholds: { ...d.thresholds, cmj: 6 } })).toBe(false);
    expect(procedureChanged(d, { ...d, coefficients: { ...d.coefficients, verified: true } })).toBe(false);
    expect(procedureChanged(d, { ...d, hopEntry: 'per-hop', rsiModEntry: 'computed', wavesPerSession: 4 })).toBe(false);
  });
  test('the order keys come back from Firestore in never reads as a change', () => {
    const reordered = { ...d, stations: Object.fromEntries(Object.entries(d.stations).reverse()) };
    expect(procedureChanged(d, reordered)).toBe(false);
  });
  test('the next patch label, and what a label may be', () => {
    expect(nextPatch('v1.2')).toBe('v1.2.1');
    expect(nextPatch('v1.2.1')).toBe('v1.2.2');
    expect(nextPatch('v2.0')).toBe('v2.0.1');
    expect(nextPatch('junk')).toBe('v1.2.1');
    expect(validVersionLabel('v1.2.1')).toBe(true);
    expect(validVersionLabel('v1.3')).toBe(true);
    expect(validVersionLabel('1.2.1')).toBe(false);
    expect(validVersionLabel('v1')).toBe(false);
  });
});

describe('the circuit mode a window is run under', () => {
  test('the snapshot carries what makes two results comparable', () => {
    expect(circuitModeOf(DEFAULT_SETTINGS)).toEqual({
      trialCounts: DEFAULT_SETTINGS.trialCounts, gripRestSec: { min: 15, max: 20 }, stations: DEFAULT_SETTINGS.stations,
      mcgillMode: 'wave', medballSide: 'trail', golfTiming: 'within-7', waveSize: 4, hopEntry: 'summary', rsiModEntry: 'typed',
      coefficientSet: 'moore-2015', coefficientsVerified: false,
    });
  });
  test('reduced trials, a different rest or another entry mode differ (spec 4.1); the coefficient set does not', () => {
    const full = circuitModeOf(DEFAULT_SETTINGS);
    const cut = circuitModeOf({ ...DEFAULT_SETTINGS, trialCounts: { ...DEFAULT_SETTINGS.trialCounts, hopScored: 1 } });
    expect(modeDifferences(full, cut)).toEqual(['trialCounts']);
    expect(modeDifferences(full, circuitModeOf({ ...DEFAULT_SETTINGS, hopEntry: 'per-hop', rsiModEntry: 'computed' }))).toEqual(['hopEntry', 'rsiModEntry']);
    expect(ENTRY_KEYS).toEqual(['hopEntry', 'rsiModEntry']);
    // Every maturity offset is computed with the current coefficients, so windows under another set stay comparable.
    expect(modeDifferences(full, { ...full, coefficientSet: 'other-2020' })).toEqual([]);
    expect(modeDifferences(full, null)).toEqual([]);
  });
});

describe('med ball mass bands (protocol Section 3)', () => {
  test('under 45 kg 2 kg; 45-65 kg 3 kg; over 65 kg 4 kg', () => {
    expect(medballMassFor(44.9)).toBe(2);
    expect(medballMassFor(45)).toBe(3);
    expect(medballMassFor(65)).toBe(3);
    expect(medballMassFor(65.1)).toBe(4);
    expect(medballMassFor(null)).toBeNull();
  });
});

describe('stations, in the fixed order', () => {
  const ids = (mode, kinds) => stationsFor(mode, kinds).map((s) => s.id);
  test('baseline and end run McGill; a wave of mid-season athletes does not', () => {
    const mode = circuitModeOf(DEFAULT_SETTINGS);
    expect(ids(mode, ['baseline'])).toEqual(['intake', 'anthro', 'grip', 'jump', 'medball', 'mcgill']);
    expect(ids(mode, ['mid', 'mid'])).toEqual(['intake', 'anthro', 'grip', 'jump', 'medball']);
    expect(ids(mode, ['mid', 'end'])).toContain('mcgill');
  });
  test('stations switched off in the settings are left out', () => {
    const mode = circuitModeOf({ ...DEFAULT_SETTINGS, stations: { ...DEFAULT_SETTINGS.stations, grip: false, cmj: false, hop: false } });
    expect(ids(mode, ['baseline'])).toEqual(['intake', 'anthro', 'medball', 'mcgill']);
  });
  test('every station carries its standard cue', () => {
    const grip = stationsFor(circuitModeOf(DEFAULT_SETTINGS), ['baseline']).find((s) => s.id === 'grip');
    expect(grip.cue).toBe('Squeeze as hard as you can. Go, go, go, relax.');
  });
});
