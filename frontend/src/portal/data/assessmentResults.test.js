import { TABLE_ROWS, UNVERIFIED_NOTE, buildResults, ratioCell } from './assessmentResults';
import { DEFAULT_SETTINGS, circuitModeOf } from './assessmentSettings';

const MODE = circuitModeOf(DEFAULT_SETTINGS);
const boy = { id: 'a', name: 'Cal Duarte', dob: '2012-11-03', consents: { research: { value: true, assent: true, recordedAt: '2026-10-20T15:00:00Z', recordedBy: 'p' } } };
const win = (over) => ({ athleteId: 'a', season: '2026-27', protocolVersion: 'v1.2', circuitMode: MODE, status: 'complete', golfDate: null, mcgillDate: null, enteredBy: {}, ...over });
const baseline = win({
  id: '2026-27-baseline', kind: 'baseline', circuitDate: '2026-11-03', weeksOfExposure: 0, wave: { id: 'w1', position: 1, coachUid: 'phil' },
  anthro: { standing: [160.0, 160.2], mass: [50.0], boxHeight: 40, sittingRaw: [118.0, 118.0], arm: [], hand: [] },
  grip: { right: [30, 29], left: [28], dominant: 'right' },
  cmj: { trials: [{ heightCm: 32, rsiMod: 0.4, timeToTakeoffMs: null, peakPowerW: 2500, peakPowerWkg: null, asymmetryPct: 5.5 }], software: 'Smart2Move', samplingHz: 1000 },
  hop: { sets: [{ rsiBest5: 2.31, gctMs: 198 }] },
  medball: { massKg: 3, side: 'trail', method: 'speed', throws: [28, 27.5] },
  mcgill: { flexorSec: 60, extensorSec: 90, sideRightSec: 50, sideLeftSec: 48, skippedBackPain: false },
  golf: { speeds: [90, 88, 89], driver: null, parallaxComposite: 72, fps: 240 },
});
const mid = win({
  id: '2026-27-mid', kind: 'mid', circuitDate: '2027-01-05', weeksOfExposure: 9, status: 'open', wave: { id: 'w2', position: 2, coachUid: 'phil' },
  anthro: { standing: [161.0], mass: [51.0], boxHeight: null, sittingRaw: [], arm: [], hand: [] },
  grip: { right: [32], left: [] },
  cmj: { trials: [{ heightCm: 32.5, rsiMod: 0.41, timeToTakeoffMs: null, peakPowerW: 2550, peakPowerWkg: null, asymmetryPct: 4 }], software: 'Smart2Move', samplingHz: 1000 },
  hop: { sets: [{ rsiBest5: 2.0, gctMs: 205 }] },
  medball: { massKg: 3, side: 'trail', method: 'speed', throws: [28.5] },
  golf: { speeds: [92], driver: null, parallaxComposite: 75, fps: 240 },
});
const results = (windows, over = {}) => buildResults({ athleteId: 'a', athlete: boy, profile: { sex: 'male', firstTestDate: '2026-11-03' }, windows, settings: DEFAULT_SETTINGS, ...over });
const hasNaN = (v) => (typeof v === 'number' ? Number.isNaN(v) : v && typeof v === 'object' ? Object.values(v).some(hasNaN) : false);

test('a first window: scores, the maturity offset marked unverified, research, no markers, no flags', () => {
  const r = results([baseline]);
  expect(r).toMatchObject({ name: 'Cal Duarte', sex: 'male', firstTestDate: '2026-11-03', consent: 'yes', coefficientsVerified: false });
  const [w] = r.windows;
  expect(w).toMatchObject({ kindLabel: 'Baseline', circuitDate: '2026-11-03', weeksOfExposure: 0, inResearch: true, markers: null, flags: [], mcgillDue: false, previousDate: null });
  expect(w.maturity).toEqual({ age: 14, offset: -0.447, category: 'circa', label: 'Circa-PHV', note: UNVERIFIED_NOTE, sittingFrom: null, missing: null });
  expect(w.scores.grip).toMatchObject({ best: 30, relativeBest: 0.6 });
  expect(w.scores.golf).toMatchObject({ best: 90, top3Mean: 89 });
  expect(w.scores.mcgill.flexExt).toEqual({ value: 0.67, capped: false, flagged: false });
});

test('a verified coefficient set drops the estimate note', () => {
  const r = results([baseline], { settings: { ...DEFAULT_SETTINGS, coefficients: { ...DEFAULT_SETTINGS.coefficients, verified: true } } });
  expect(r.windows[0].maturity.note).toBeNull();
  expect(r.coefficientsVerified).toBe(true);
});

test('a retest: newest first, change markers against the previous window, the learning-effect flag', () => {
  const r = results([mid, baseline]);
  expect(r.windows.map((w) => w.id)).toEqual(['2026-27-mid', '2026-27-baseline']);
  const [m] = r.windows;
  expect(m.previousDate).toBe('2026-11-03');
  expect(m.markers).toEqual({ clubhead: 'gain', cmj: 'within', hop: 'drop', medball: 'within', grip: 'gain', parallax: null });
  expect(m.flags).toEqual([{ code: 'first-retest', text: 'First retest: part of any gain may be a learning effect.' }]);
  expect(m.maturity.sittingFrom).toBe('2026-11-03');
  expect(m.maturity.offset).not.toBeNull();
});

test('another protocol version or circuit mode switches the markers off and says why', () => {
  const v = win({ ...mid, protocolVersion: 'v1.2.1', circuitMode: { ...MODE, trialCounts: { ...MODE.trialCounts, cmjScored: 3 }, gripRestSec: { min: 30, max: 30 } } });
  const [m] = results([baseline, v]).windows;
  expect(m.markers).toBeNull();
  expect(m.flags.map((f) => f.text)).toEqual(expect.arrayContaining([
    'Protocol v1.2.1 vs v1.2 on Nov 3: change markers are off.',
    'Circuit mode differs from Nov 3 (trial counts, grip rest): change markers are off.',
  ]));
});

test('another 10/5 or RSImod entry mode is flagged; only the 10/5 marker goes off', () => {
  const v = win({ ...mid, circuitMode: { ...MODE, hopEntry: 'per-hop', rsiModEntry: 'computed' } });
  const [m] = results([baseline, v]).windows;
  expect(m.markers).toEqual({ clubhead: 'gain', cmj: 'within', hop: null, medball: 'within', grip: 'gain', parallax: null });
  expect(m.flags.filter((f) => f.code === 'entry-differs').map((f) => f.text)).toEqual([
    '10/5 entered hop by hop here and as the per-set summary on Nov 3: the 10/5 marker is off.',
    'CMJ RSImod computed from height and time to take-off here and typed from Smart2Move on Nov 3: RSImod is not compared like for like.',
  ]);
  expect(m.flags.map((f) => f.code)).not.toContain('mode-differs');
});

test('what an open window still lacks, with its due date, and how long it has been open', () => {
  const [m] = results([baseline, win({ ...mid, golf: null })], { today: '2027-01-12' }).windows;
  expect(m.missing).toEqual(['Clubhead speed not entered (due by Jan 12)']);
  expect(m.openDays).toBe(7);
  const end = win({ ...baseline, id: '2026-27-end', kind: 'end', status: 'open', circuitDate: '2027-02-16', golf: null, mcgill: null, circuitMode: { ...MODE, golfTiming: 'same-day' } });
  expect(results([end], { today: '2027-02-16' }).windows[0].missing).toEqual(['Clubhead speed not entered (due on Feb 16)', 'McGill not entered (due by Mar 2)']);
  expect(results([win({ ...end, notTested: { golf: 'absent', mcgill: 'pain' } })]).windows[0].missing).toEqual([]);
  expect(results([baseline]).windows[0]).toMatchObject({ missing: [], openDays: null });
});

test('the intake back-pain answer alone is not McGill entered: due until a hold is timed or it is skipped for pain', () => {
  const end = win({ ...baseline, id: '2026-27-end', kind: 'end', status: 'open', circuitDate: '2027-02-16', mcgill: { skippedBackPain: false } });
  const [e] = results([end]).windows;
  expect(e.mcgillDue).toBe(true);
  expect(e.missing).toEqual(['McGill not entered (due by Mar 2)']);
  const held = results([win({ ...end, mcgill: { skippedBackPain: false, flexorSec: 45, extensorSec: null, sideRightSec: null, sideLeftSec: null } })]).windows[0];
  expect(held).toMatchObject({ mcgillDue: false, missing: [] });
  const skipped = results([win({ ...end, mcgill: { skippedBackPain: true } })]).windows[0];
  expect(skipped).toMatchObject({ mcgillDue: false, missing: [] });
});

test('a new ball or method switches the med ball marker off', () => {
  const [m] = results([baseline, win({ ...mid, medball: { massKg: 4, side: 'trail', method: 'speed', throws: [26] } })]).windows;
  expect(m.markers.medball).toBeNull();
  expect(m.markers.grip).toBe('gain');
});

test('timing and data flags: contact time, frame rate, late golf, late McGill, too soon', () => {
  const end = win({
    ...mid, id: '2026-27-end', kind: 'end', circuitDate: '2026-12-15', golfDate: '2026-12-24', mcgillDate: '2027-01-02',
    hop: { sets: [{ rsiBest5: 2.4, gctMs: 262 }, { rsiBest5: 2.2, gctMs: 230 }] },
    golf: { speeds: [91], driver: null, parallaxComposite: 70, fps: 60 },
  });
  const [e] = results([baseline, end]).windows;
  expect(e.flags).toEqual([
    { code: 'gct', text: '10/5 set 1: contact time 262 ms is over 250 ms; not reported.' },
    { code: 'fps-directional', text: 'Parallax at 60 fps: timing gaps are directional only.' },
    { code: 'golf-late', text: 'Clubhead speed 9 days after the circuit (due within 7).' },
    { code: 'mcgill-late', text: 'McGill 18 days after the circuit (due within 14).' },
    { code: 'too-soon', text: '42 days after the previous test (Nov 3); windows are at least 8 weeks apart.' },
    { code: 'first-retest', text: 'First retest: part of any gain may be a learning effect.' },
  ]);
  expect(e.scores.hop.best).toBe(2.2);
  expect(e.mcgillDue).toBe(true);
});

test('golf on another day when the circuit runs it the same day', () => {
  const same = win({ ...baseline, circuitMode: { ...MODE, golfTiming: 'same-day' }, golfDate: '2026-11-04' });
  expect(results([same]).windows[0].flags).toEqual([{ code: 'golf-late', text: 'Clubhead speed on Nov 4, not the circuit day (this circuit runs golf the same day).' }]);
});

test('growth over 3 cm flags the carried sitting height as stale; a repeat sitting measure clears it', () => {
  const grown = win({ ...mid, anthro: { ...mid.anthro, standing: [164.0] } });
  const [g] = results([baseline, grown]).windows;
  expect(g.growth).toEqual({ cm: 3.9, date: '2026-11-03' });
  expect(g.flags.slice(0, 2)).toEqual([
    { code: 'growth', text: 'Growth: standing height up 3.9 cm since Nov 3 (over 3 cm).' },
    { code: 'sitting-stale', text: 'Sitting height is from Nov 3 and may be stale after this growth; a repeat sitting-height measure updates the maturity offset.' },
  ]);
  const repeat = win({ ...grown, anthro: { ...grown.anthro, boxHeight: 40, sittingRaw: [119.0, 119.0] } });
  const [r] = results([baseline, repeat]).windows;
  expect(r.flags.map((f) => f.code)).toEqual(['growth', 'first-retest']);
  expect(r.maturity.sittingFrom).toBeNull();
  expect(r.scores.anthro.sitting).toBe(79);
});

test('Review Focus 4: an incomplete record says what is missing and never shows NaN or a category', () => {
  const bare = win({ ...baseline, anthro: { standing: [150], mass: [], boxHeight: null, sittingRaw: [80, 80], arm: [], hand: [] }, grip: null, cmj: null, hop: null, medball: null, mcgill: null, golf: null });
  const legacy = buildResults({ athleteId: 'a', athlete: { id: 'a', name: 'Legacy Kid', dob: null, consents: {} }, profile: null, windows: [bare], settings: null });
  expect(legacy.consent).toBe('unanswered');
  expect(legacy.windows[0].maturity).toEqual({
    age: null, offset: null, category: null, label: null, note: null, sittingFrom: null,
    missing: 'Maturity offset not computed: no date of birth on file; sex not entered at intake.',
  });
  expect(hasNaN(legacy)).toBe(false);
  for (const row of TABLE_ROWS) expect(() => row.value(legacy.windows[0])).not.toThrow();

  const noBox = results([bare]);
  expect(noBox.windows[0].maturity.missing).toBe('Maturity offset not computed: no box height for the sitting height.');
  const noSitting = results([win({ ...bare, anthro: { ...bare.anthro, sittingRaw: [] } })]);
  expect(noSitting.windows[0].maturity.missing).toBe('Maturity offset not computed: no sitting height.');
  const unread = buildResults({ athleteId: 'a', athlete: null, profile: { sex: 'female' }, windows: [baseline], settings: null });
  expect(unread.name).toBeNull();
  expect(unread.windows[0].maturity.missing).toBe('Maturity offset not computed: the athlete record could not be read.');
  expect(buildResults({ athleteId: 'a', athlete: null, profile: null, windows: null, settings: null }).windows).toEqual([]);
});

test('a ratio cell says capped or flagged', () => {
  expect(ratioCell({ value: 1.2, capped: false, flagged: true })).toBe('1.2 - flag');
  expect(ratioCell({ value: 0.4, capped: true, flagged: false })).toBe('0.4 (capped)');
  expect(ratioCell(null)).toBeNull();
});
