/**
 * Assessments (docs/portal/plans/2026-10-14-assessments/00-spec.md, Sections
 * 3, 4.1-4.6): who reads and writes athletes/{id}/assessments,
 * assessmentProfile and assessmentSettings; each section's shape and ranges;
 * the golf-only coach branch; the med ball season lock; the collection-group
 * reads; the owner-only users.assessor and the assessor's athlete list. Run
 * by scripts/verify-rules.mjs in both passes. It seeds and removes everything
 * it touches; the only clock it reads is today's (recentDate's dates, and the
 * season a window dated today belongs to).
 */
import { BASE, bookAs, call, createAs, del, expect, listAs, seed, t, token, uid, updateAs } from '../verify-rules.mjs';

const dayOut = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
/** The August-July season of a date ('2026-27'), as the rules tie a window's season to its circuit date. */
const seasonFor = (iso) => {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 8 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};
const SEASON = seasonFor(dayOut(0));
const NEXT_SEASON = seasonFor(dayOut(366));
const ATH = 'ath-assess';
const W = `${SEASON}-baseline`;
const W_END = `${SEASON}-end`;
const COL = `athletes/${ATH}/assessments`;
const PROFILE = `athletes/${ATH}/assessmentProfile`;
const uids = { phil: 'phil-assess-probe', assessor: 'assessor-probe', owner: 'owner-assess-probe', mental: 'mental-assess-probe', toggle: 'toggle-assess-probe' };
const tok = (u) => token(u, { email: `${u}@example.com`, email_verified: true });
const status = (r) => r.status;

/** A collection-group list as a real user; a refused query answers 403 on the response or in the stream. */
async function groupListAs(auth, collectionId) {
  const res = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId, allDescendants: true }] } }) });
  const body = await res.json().catch(() => null);
  const err = Array.isArray(body) ? body.find((r) => r && r.error)?.error : body?.error;
  return err ? err.code : res.status;
}

const windowBody = (over = {}) => ({ athleteId: ATH, season: SEASON, kind: 'baseline', protocolVersion: 'v1.2', circuitMode: { waveSize: 4 }, status: 'open',
  circuitDate: dayOut(0), golfDate: null, mcgillDate: null, weeksOfExposure: 0, wave: { id: 'wave-probe', position: 1, coachUid: uids.phil }, enteredBy: {}, ...over });
// The whole doc hooks/assessmentsLive.js saveAssessmentSettings writes (data/assessmentSettings.js DEFAULT_SETTINGS):
// every station and every threshold, so the probe meets the expression cap the real save meets (review 2026-10-28).
const settingsBody = (over = {}) => ({ protocolVersion: 'v1.2',
  trialCounts: { grip: 3, cmjPractice: 1, cmjScored: 2, hopPractice: 1, hopScored: 2, medballPractice: 1, medballScored: 3, clubheadWarmup: 3, clubheadMax: 5 },
  gripRestSec: { min: 15, max: 20 },
  stations: { intake: true, anthro: true, grip: true, cmj: true, hop: true, medball: true, mcgill: true, segments: false, keiser: false },
  mcgillMode: 'wave', medballSide: 'trail', golfTiming: 'within-7', waveSize: 4,
  wavesPerSession: 5, hopEntry: 'summary', rsiModEntry: 'typed',
  coefficients: { set: 'moore-2015', verified: false, boys: { a: -8.128741, b: 0.0070346 }, girls: { a: -7.709133, b: 0.0042232 } },
  thresholds: { clubhead: 2, cmj: 5, hop: 8, medball: 5, grip: 5, parallax: null }, updatedBy: uids.phil, ...over });

/** A section write as hooks/assessmentsLive.js saveSection sends it: the section, enteredBy.<section>, updatedAt server time. */
const section = (auth, by, name, value, id = W, extraMarks = []) => updateAs(auth, COL, id, { [name]: value, enteredBy: { [name]: by, ...Object.fromEntries(extraMarks.map((m) => [m, by])) } },
  [name, `enteredBy.${name}`, ...extraMarks.map((m) => `enteredBy.${m}`)], ['updatedAt']);

export async function taskAssessments() {
  console.log('Assessments: staff, golf-only coaches, families none; shapes, ranges, enteredBy, the med ball lock, settings, users.assessor');
  const phil = tok(uids.phil);
  const assessor = tok(uids.assessor);
  const owner = tok(uids.owner);
  const mental = tok(uids.mental);
  const toggle = tok(uids.toggle);
  const cleanup = async () => {
    for (const id of [W, W_END, `${SEASON}-mid`, '1999-00-baseline']) await del(COL, id);
    await del(PROFILE, 'current');
    await del('assessmentSettings', 'current');
    await del('athletes', ATH);
    for (const u of [...Object.values(uids), 'new-staff-probe']) await del('users', u);
  };
  try {
    await seed('users', uids.phil, { role: 'coach', specialistId: 'phil' });
    await seed('users', uids.assessor, { role: 'coach', assessor: true });
    await seed('users', uids.owner, { role: 'owner' });
    await seed('users', uids.mental, { role: 'mental', specialistId: 'mental' });
    await seed('users', uids.toggle, { role: 'coach' });
    await seed('athletes', ATH, { name: 'Probe Athlete', householdId: 'hh', dob: '2012-04-10', contractMinutes: null, coachId: null, packageId: 't-6' });

    // The athlete list for starting a wave.
    expect('an assessor coach reads an athlete', await call('GET', `/athletes/${ATH}`, null, assessor).then(status), 200);
    expect('an assessor coach lists every athlete', await listAs(assessor, 'athletes', {}), 200);
    expect('a plain coach still cannot list every athlete', await listAs(t.coach, 'athletes', {}), 403);

    // Opening a window.
    expect('a coach without the permission cannot open a window', await createAs(t.coach, COL, W, windowBody({ wave: { id: 'w', position: 1, coachUid: 'coach-probe' } }), ['createdAt', 'updatedAt']), 403);
    expect('the window id must be season-kind', await createAs(phil, COL, `${SEASON}-mid`, windowBody(), ['createdAt', 'updatedAt']), 403);
    expect('a window cannot open complete', await createAs(phil, COL, W, windowBody({ status: 'complete' }), ['createdAt', 'updatedAt']), 403);
    expect('a window cannot open dated 20 days back', await createAs(phil, COL, W, windowBody({ circuitDate: dayOut(-20) }), ['createdAt', 'updatedAt']), 403);
    expect('a window cannot open with entries already marked', await createAs(phil, COL, W, windowBody({ enteredBy: { grip: uids.phil } }), ['createdAt', 'updatedAt']), 403);
    expect("a window cannot name another coach's wave", await createAs(phil, COL, W, windowBody({ wave: { id: 'w', position: 1, coachUid: uids.assessor } }), ['createdAt', 'updatedAt']), 403);
    expect("a window's season is its circuit date's season", await createAs(phil, COL, '1999-00-baseline', windowBody({ season: '1999-00' }), ['createdAt', 'updatedAt']), 403);
    expect('a protocol label that is not vN.N refused', await createAs(phil, COL, W, windowBody({ protocolVersion: 'junk' }), ['createdAt', 'updatedAt']), 403);
    expect('a circuit mode with keys no snapshot has refused', await createAs(phil, COL, W, windowBody({ circuitMode: { anything: 'x' } }), ['createdAt', 'updatedAt']), 403);
    expect('Phil opens a baseline window', await createAs(phil, COL, W, windowBody(), ['createdAt', 'updatedAt']), 200);
    expect('an assessor coach opens an end window', await createAs(assessor, COL, W_END, windowBody({ kind: 'end', wave: { id: 'wave-probe', position: 2, coachUid: uids.assessor } }), ['createdAt', 'updatedAt']), 200);

    // Reads: every coach and staff; never a family; never mental without the permission.
    for (const [who, auth, wanted] of [['Phil', phil, 200], ['an assessor', assessor, 200], ['a plain coach', t.coach, 200], ['ops', t.ops, 200],
      ['the owner', owner, 200], ['mental without the permission', mental, 403], ['the parent', t.parent, 403], ['an athlete login', t.athlete, 403], ['a login with no role', t.stranger, 403]]) {
      expect(`${who}: window read`, await call('GET', `/${COL}/${W}`, null, auth).then(status), wanted);
    }
    expect('a coach lists every window (collection group)', await groupListAs(t.coach, 'assessments'), 200);
    expect('a parent cannot list windows', await groupListAs(t.parent, 'assessments'), 403);
    expect('an athlete login cannot list windows', await groupListAs(t.athlete, 'assessments'), 403);

    // Sections: valid and in range, enteredBy is the writer, updatedAt is the server's.
    const grip = { right: [32.5, null, null], left: [], deviceRight: 'D1', deviceLeft: 'D1', handlePosition: '3', dominant: 'right' };
    expect('Phil writes grip', await section(phil, uids.phil, 'grip', grip), 200);
    expect('grip 150 kg refused', await section(phil, uids.phil, 'grip', { ...grip, right: [150] }), 403);
    expect('six grip trials refused', await section(phil, uids.phil, 'grip', { ...grip, right: [30, 30, 30, 30, 30, 30] }), 403);
    expect("grip marked as someone else's refused", await section(phil, uids.assessor, 'grip', grip), 403);
    expect('a mark on a section the write does not touch refused', await section(phil, uids.phil, 'grip', grip, W, ['cmj']), 403);
    expect('a client-chosen updatedAt refused', await updateAs(phil, COL, W, { grip, enteredBy: { grip: uids.phil }, updatedAt: new Date('2026-01-01T00:00:00Z') }, ['grip', 'enteredBy.grip', 'updatedAt']), 403);
    expect('grip beside a kind change refused', await updateAs(phil, COL, W, { grip, enteredBy: { grip: uids.phil }, kind: 'mid' }, ['grip', 'enteredBy.grip', 'kind'], ['updatedAt']), 403);
    expect('grip beside a protocol change refused', await updateAs(phil, COL, W, { grip, enteredBy: { grip: uids.phil }, protocolVersion: 'v9.9' }, ['grip', 'enteredBy.grip', 'protocolVersion'], ['updatedAt']), 403);
    expect('an assessor coach edits the same section (last writer marks it)', await section(assessor, uids.assessor, 'grip', { ...grip, left: [30.1] }), 200);
    expect('anthropometrics in range', await section(phil, uids.phil, 'anthro', { standing: [152.1, 152.3], mass: [41.0], boxHeight: 40, sittingRaw: [118.0], arm: [], hand: [] }), 200);
    expect('a 4th standing measure refused', await section(phil, uids.phil, 'anthro', { standing: [152, 152, 152, 152] }), 403);
    expect('standing height 300 cm refused', await section(phil, uids.phil, 'anthro', { standing: [300] }), 403);
    expect('a stored growth flag is not part of the shape', await section(phil, uids.phil, 'anthro', { standing: [152], growthFlag: true }), 403);
    const trial = { heightCm: 31.2, rsiMod: 0.41, timeToTakeoffMs: null, peakPowerW: 2100, peakPowerWkg: 51.1, asymmetryPct: 6 };
    expect('CMJ trials in range', await section(phil, uids.phil, 'cmj', { trials: [trial, null], software: 'S2M 3.1', samplingHz: 1000 }), 200);
    expect('RSImod 2.5 refused', await section(phil, uids.phil, 'cmj', { trials: [{ ...trial, rsiMod: 2.5 }] }), 403);
    expect('asymmetry 61 % refused', await section(phil, uids.phil, 'cmj', { trials: [{ ...trial, asymmetryPct: 61 }] }), 403);
    expect('three CMJ trials in range', await section(phil, uids.phil, 'cmj', { trials: [trial, trial, trial], software: 'S2M 3.1', samplingHz: 1000 }), 200);
    expect('four CMJ trials refused', await section(phil, uids.phil, 'cmj', { trials: [trial, trial, trial, trial] }), 403);
    expect('two sections in one write refused', await updateAs(phil, COL, W, { grip, cmj: { trials: [trial] }, enteredBy: { grip: uids.phil, cmj: uids.phil } }, ['grip', 'cmj', 'enteredBy.grip', 'enteredBy.cmj'], ['updatedAt']), 403);
    const everyHop = { hopRsi: Array(10).fill(2.1), hopGctMs: Array(10).fill(200) };
    expect('10/5 every hop (two sets) and per set', await section(phil, uids.phil, 'hop', { sets: [everyHop, everyHop, { rsiBest5: 2.3, gctMs: 198 }] }), 200);
    expect('11 hops in a set refused', await section(phil, uids.phil, 'hop', { sets: [{ ...everyHop, hopRsi: Array(11).fill(2.1) }] }), 403);
    expect('five 10/5 sets refused', await section(phil, uids.phil, 'hop', { sets: Array(5).fill({ rsiBest5: 2.3, gctMs: 198 }) }), 403);
    expect('a 50 ms contact time refused', await section(phil, uids.phil, 'hop', { sets: [{ rsiBest5: 2.3, gctMs: 50 }] }), 403);
    expect('a set with both shapes refused', await section(phil, uids.phil, 'hop', { sets: [{ rsiBest5: 2.3, hopRsi: Array(10).fill(2.1) }] }), 403);
    expect('McGill holds in range, capped at 300', await section(phil, uids.phil, 'mcgill', { flexorSec: 300, extensorSec: 95, sideRightSec: null, sideLeftSec: null, skippedBackPain: false }), 200);
    expect('a 301 s hold refused', await section(phil, uids.phil, 'mcgill', { flexorSec: 301 }), 403);
    expect('readiness and the training log', await section(phil, uids.phil, 'readiness', { status: 'pass', reason: null, hoursSinceHardSession: 20, golfToday: false, notes: null }), 200);
    expect('an unknown readiness status refused', await section(phil, uids.phil, 'readiness', { status: 'maybe' }), 403);
    expect('the training log', await section(phil, uids.phil, 'log', { location: 'external', externalContent: 'machines', weeklyHours: 6, rypSessionsSincePrior: 0,
      golfVolume: '3 rounds a week', competitiveLevel: 'Handicap 8', otherSport: 'Soccer', otherSportHours: 4 }), 200);
    expect('a not-tested reason code', await section(phil, uids.phil, 'notTested', { medball: 'equipment' }), 200);
    expect('an unknown reason code refused', await section(phil, uids.phil, 'notTested', { medball: 'tired' }), 403);
    expect('Phil changes the circuit date within 14 days', await updateAs(phil, COL, W, { circuitDate: dayOut(-3) }, ['circuitDate'], ['updatedAt']), 200);
    expect('a circuit date 20 days back refused', await updateAs(phil, COL, W, { circuitDate: dayOut(-20) }, ['circuitDate'], ['updatedAt']), 403);
    expect('a circuit date two days ahead refused', await updateAs(phil, COL, W, { circuitDate: dayOut(2) }, ['circuitDate'], ['updatedAt']), 403);
    // A window left open past the entry window is completed, never re-waved (a new wave would type over its trials under a new date).
    const MID = `${SEASON}-mid`;
    await seed(COL, MID, { ...windowBody({ kind: 'mid', circuitDate: dayOut(-30) }), createdAt: new Date(), updatedAt: new Date() });
    expect('a window open 30 days cannot be re-waved to today', await updateAs(phil, COL, MID, { circuitDate: dayOut(0), wave: { id: 'wave-probe-2', position: 1, coachUid: uids.phil }, weeksOfExposure: 4 },
      ['circuitDate', 'wave', 'weeksOfExposure'], ['updatedAt']), 403);
    expect('a window open 30 days cannot join another wave', await updateAs(phil, COL, MID, { wave: { id: 'wave-probe-2', position: 1, coachUid: uids.phil } }, ['wave'], ['updatedAt']), 403);
    expect('a window open 30 days is still marked complete', await updateAs(phil, COL, MID, { status: 'complete' }, ['status'], ['updatedAt']), 200);
    await del(COL, MID);

    // The med ball method and mass are fixed for the season once the profile holds them.
    const profile = { athleteId: ATH, sex: 'female', firstTestDate: dayOut(0), medballMassKg: 3, medballMethod: 'speed', dominantHand: 'right',
      gripDevice: 'D1', handlePosition: '3', driver: null, season: SEASON, updatedBy: uids.phil };
    expect('Phil writes the profile', await createAs(phil, PROFILE, 'current', profile, ['updatedAt']), 200);
    expect('a parent cannot read the profile', await call('GET', `/${PROFILE}/current`, null, t.parent).then(status), 403);
    expect('a coach lists profiles (collection group)', await groupListAs(t.coach, 'assessmentProfile'), 200);
    expect('a parent cannot list profiles', await groupListAs(t.parent, 'assessmentProfile'), 403);
    const throws = { massKg: 3, side: 'trail', method: 'speed', throws: [28.4, null, null] };
    expect('med ball by the season method and mass', await section(phil, uids.phil, 'medball', throws), 200);
    expect('the other method in the same season refused', await section(phil, uids.phil, 'medball', { ...throws, method: 'distance', throws: [6.2] }), 403);
    expect('another ball in the same season refused', await section(phil, uids.phil, 'medball', { ...throws, massKg: 4 }), 403);
    expect('61 mph refused', await section(phil, uids.phil, 'medball', { ...throws, throws: [61] }), 403);
    expect('Phil updates the sex on the profile', await updateAs(phil, PROFILE, 'current', { sex: 'male', updatedBy: uids.phil }, ['sex', 'updatedBy'], ['updatedAt']), 200);
    expect('Phil cannot switch the season method', await updateAs(phil, PROFILE, 'current', { medballMethod: 'distance', updatedBy: uids.phil }, ['medballMethod', 'updatedBy'], ['updatedAt']), 403);
    expect('Phil cannot move the first test date', await updateAs(phil, PROFILE, 'current', { firstTestDate: dayOut(-1), updatedBy: uids.phil }, ['firstTestDate', 'updatedBy'], ['updatedAt']), 403);
    // "Block mixing" cannot be undone by moving the season: back to an old one and the lock would be off.
    expect('the season never moves back (with the method switched in the same write)', await updateAs(phil, PROFILE, 'current',
      { season: '1999-00', medballMethod: 'distance', medballMassKg: 4, updatedBy: uids.phil }, ['season', 'medballMethod', 'medballMassKg', 'updatedBy'], ['updatedAt']), 403);
    expect('a new season resets the method', await updateAs(phil, PROFILE, 'current', { season: NEXT_SEASON, medballMethod: null, medballMassKg: null, updatedBy: uids.phil },
      ['season', 'medballMethod', 'medballMassKg', 'updatedBy'], ['updatedAt']), 200);
    expect("a window of another season than the profile's takes no med ball from staff", await section(phil, uids.phil, 'medball', { ...throws, method: 'distance', throws: [6.2] }), 403);
    expect('and the season cannot be put back', await updateAs(phil, PROFILE, 'current', { season: SEASON, updatedBy: uids.phil }, ['season', 'updatedBy'], ['updatedAt']), 403);
    expect("the owner may still correct that window's med ball", await section(owner, uids.owner, 'medball', throws), 200);
    expect('the owner corrects a method', await updateAs(owner, PROFILE, 'current', { season: SEASON, medballMethod: 'distance', updatedBy: uids.owner },
      ['season', 'medballMethod', 'updatedBy'], ['updatedAt']), 200);

    // Golf coaches: the golf section of an open window, nothing else.
    const golf = { speeds: [88.4, 90.1], driver: 'TSR3 10.5', parallaxComposite: 72, fps: 240 };
    expect('a golf coach writes golf', await section(t.coach, 'coach-probe', 'golf', golf), 200);
    expect('a golf coach sets the golf date', await updateAs(t.coach, COL, W, { golfDate: dayOut(0) }, ['golfDate'], ['updatedAt']), 200);
    expect('clubhead 150 mph refused', await section(t.coach, 'coach-probe', 'golf', { ...golf, speeds: [150] }), 403);
    expect('nine swings refused', await section(t.coach, 'coach-probe', 'golf', { ...golf, speeds: Array(9).fill(88) }), 403);
    expect('Parallax 101 refused', await section(t.coach, 'coach-probe', 'golf', { ...golf, parallaxComposite: 101 }), 403);
    expect('a golf coach cannot write grip', await section(t.coach, 'coach-probe', 'grip', grip), 403);
    expect('a golf coach cannot change the circuit date', await updateAs(t.coach, COL, W, { circuitDate: dayOut(-1) }, ['circuitDate'], ['updatedAt']), 403);
    expect('a parent cannot write golf', await section(t.parent, 'p-probe', 'golf', golf), 403);
    expect('an assessor completes the end window', await updateAs(assessor, COL, W_END, { status: 'complete' }, ['status'], ['updatedAt']), 200);
    expect('a golf coach cannot write golf on a complete window', await section(t.coach, 'coach-probe', 'golf', golf, W_END), 403);
    expect('staff still correct a complete window', await section(phil, uids.phil, 'golf', golf, W_END), 200);

    // Delete: the owner only.
    expect('Phil cannot delete a window', await call('DELETE', `/${COL}/${W_END}`, null, phil).then(status), 403);
    expect('ops cannot delete a window', await call('DELETE', `/${COL}/${W_END}`, null, t.ops).then(status), 403);
    expect('the owner deletes a window', await call('DELETE', `/${COL}/${W_END}`, null, owner).then(status), 200);

    // Settings: Phil and the owner write; every staff role reads.
    expect('ops cannot write the settings', await createAs(t.ops, 'assessmentSettings', 'current', settingsBody({ updatedBy: 'ops-probe' }), ['updatedAt']), 403);
    expect('an assessor coach cannot write the settings', await createAs(assessor, 'assessmentSettings', 'current', settingsBody({ updatedBy: uids.assessor }), ['updatedAt']), 403);
    expect('Phil writes the settings', await createAs(phil, 'assessmentSettings', 'current', settingsBody(), ['updatedAt']), 200);
    const ownerSettings = (over) => { const body = settingsBody({ updatedBy: uids.owner, ...over }); return updateAs(owner, 'assessmentSettings', 'current', body, Object.keys(body), ['updatedAt']); };
    expect('the owner writes the settings', await ownerSettings({ protocolVersion: 'v1.2.1' }), 200);
    expect('every threshold a number, Parallax too', await ownerSettings({ thresholds: { clubhead: 50, cmj: 0, hop: 8.5, medball: 5, grip: 5, parallax: 3 } }), 200);
    expect('a partial station list still saves', await ownerSettings({ stations: { intake: true, mcgill: true } }), 200);
    expect('a wave of five refused', await ownerSettings({ waveSize: 5 }), 403);
    expect('eleven waves per session refused', await ownerSettings({ wavesPerSession: 11 }), 403);
    expect('a trial count that is not a whole number refused', await ownerSettings({ trialCounts: { ...settingsBody().trialCounts, grip: 2.5 } }), 403);
    const noClubheadMax = Object.fromEntries(Object.entries(settingsBody().trialCounts).filter(([k]) => k !== 'clubheadMax'));
    expect('a missing trial count refused', await ownerSettings({ trialCounts: noClubheadMax }), 403);
    expect('a trial count left empty refused', await ownerSettings({ trialCounts: { ...noClubheadMax, clubheadMax: null } }), 403);
    expect('a station outside the list refused', await ownerSettings({ stations: { ...settingsBody().stations, sprint: true } }), 403);
    expect('six grip trials refused', await ownerSettings({ trialCounts: { ...settingsBody().trialCounts, grip: 6 } }), 403);
    expect('four scored CMJs refused', await ownerSettings({ trialCounts: { ...settingsBody().trialCounts, cmjScored: 4 } }), 403);
    expect('a version label without the v refused', await ownerSettings({ protocolVersion: '1.2.2' }), 403);
    const coefficients = settingsBody().coefficients;
    expect('a threshold that is not a number refused', await ownerSettings({ thresholds: { clubhead: 'ten' } }), 403);
    expect('a threshold outside 0-50 % refused', await ownerSettings({ thresholds: { cmj: -50 } }), 403);
    expect('a coefficient that is not a number refused', await ownerSettings({ coefficients: { ...coefficients, boys: { a: 'abc', b: 0.0070346 } } }), 403);
    expect('a coefficient set without the girls refused', await ownerSettings({ coefficients: { set: 'moore-2015', verified: false, boys: coefficients.boys } }), 403);
    expect('the coefficient check is true or false', await ownerSettings({ coefficients: { ...coefficients, verified: 'yes' } }), 403);
    expect('a station is on or off', await ownerSettings({ stations: { grip: 'maybe' } }), 403);
    expect('the shortest grip rest is not longer than the longest', await ownerSettings({ gripRestSec: { min: 30, max: 10 } }), 403);
    expect('the owner corrects a coefficient against the paper', await ownerSettings({ coefficients: { ...coefficients, verified: true, boys: { a: -8.1, b: 0.007 } } }), 200);
    expect('another document id refused', await createAs(phil, 'assessmentSettings', 'draft', settingsBody(), ['updatedAt']), 403);
    for (const [who, auth, wanted] of [['a plain coach', t.coach, 200], ['mental', mental, 200], ['ops', t.ops, 200], ['the parent', t.parent, 403], ['an athlete login', t.athlete, 403]]) {
      expect(`${who}: settings read`, await call('GET', '/assessmentSettings/current', null, auth).then(status), wanted);
    }

    // users.assessor is the owner's to give.
    expect('ops cannot give the Assessments permission', await updateAs(t.ops, 'users', uids.toggle, { assessor: true }), 403);
    expect('the owner gives it', await updateAs(owner, 'users', uids.toggle, { assessor: true }), 200);
    expect('it is a bool', await updateAs(owner, 'users', uids.toggle, { assessor: 'yes' }), 403);
    expect('nobody gives it to themselves', await updateAs(toggle, 'users', uids.toggle, { assessor: false }), 403);
    expect('ops cannot create a staff account that has it', await createAs(t.ops, 'users', 'new-staff-probe', { role: 'coach', assessor: true }, []), 403);
    expect('ops still creates a staff account without it', await createAs(t.ops, 'users', 'new-staff-probe', { role: 'coach' }, []), 200);

    await taskTestFamilyNeverBooks();
  } finally {
    await cleanup();
  }
}

/**
 * Review Focus 7: the production test family never books or waitlists (review 2026-10-28). Its athletes are seeded as
 * scripts/provision-test-family.mjs writes them - test: true, no package, no billing key (which alone reads as paid,
 * and the rules count no period tokens) - against a control athlete that differs only by the flag. Re-booking runs
 * the same athleteBillingOk. Uses the sessions and the parent verify-rules setup() seeds; removes what it adds.
 */
async function taskTestFamilyNeverBooks() {
  const athlete = (test) => ({ name: 'Ava Test', householdId: 'hh', dob: '2012-05-14', contractMinutes: null, coachId: null, packageId: null, ...(test ? { test: true } : {}) });
  const booking = (athleteId) => ({ athleteId, sessionId: 's1', date: dayOut(5), type: 'training', periodKey: '2026-11-01',
    status: 'confirmed', householdId: 'hh', createdBy: uid.parent, chargedFrom: 'period' });
  const entry = (athleteId) => ({ sessionId: 's-full', athleteId, householdId: 'hh', date: dayOut(5), periodKey: '2026-11-01', createdBy: uid.parent });
  try {
    await seed('athletes', 'ath-test-probe', athlete(true));
    await seed('athletes', 'ath-test-control', athlete(false));
    expect('the test family cannot book a session', await bookAs(t.parent, 'ath-test-probe_s1', booking('ath-test-probe')), 403);
    expect('the test family cannot join a waitlist', await createAs(t.parent, 'waitlist', 's-full_ath-test-probe', entry('ath-test-probe'), ['joinedAt']), 403);
    expect('control: the same athlete without the flag books', await bookAs(t.parent, 'ath-test-control_s1', booking('ath-test-control')), 200);
    expect('control: and joins a waitlist', await createAs(t.parent, 'waitlist', 's-full_ath-test-control', entry('ath-test-control'), ['joinedAt']), 200);
  } finally {
    for (const id of ['ath-test-probe_s1', 'ath-test-control_s1']) await del('bookings', id);
    for (const id of ['s-full_ath-test-probe', 's-full_ath-test-control']) await del('waitlist', id);
    for (const id of ['ath-test-probe', 'ath-test-control']) await del('athletes', id);
  }
}

// Assessments spec 8: Diagnostic Capture is gone from the new portal (production held 0 docs on 2026-10-14), but its
// rules stay exactly as they are for this release: the rules reach production before the live portal (main) is
// updated - staging shares production's backend (plan Task 27) - and main's athlete home and admin dashboard read
// diagnostics while its Capture tab saves them. Plan Task 28 removes every diagnostics grant after the release.
export async function taskDiagnosticsKept() {
  console.log('Diagnostics: unchanged for this release (the live portal still reads and saves captures)');
  const owner = tok(uids.owner);
  await seed('users', uids.owner, { role: 'owner' });
  await seed('athletes', ATH, { name: 'Probe Athlete', householdId: 'hh', dob: '2012-04-10', contractMinutes: null, coachId: 'coach-probe', packageId: 't-6' });
  await seed(`athletes/${ATH}/diagnostics`, 'old-1', { athleteId: ATH, capturedBy: 'coach-probe', status: 'published', values: {}, notes: null });
  try {
    for (const [who, auth] of [['the owner', owner], ['ops', t.ops], ['the assigned coach', t.coach]]) {
      expect(`${who}: a capture still reads (the live portal keeps loading)`, await call('GET', `/athletes/${ATH}/diagnostics/old-1`, null, auth).then(status), 200);
    }
    expect('the owner: the collection-group list still reads', await groupListAs(owner, 'diagnostics'), 200);
    expect('the assigned coach: a new capture still saves (the live Capture tab)', await createAs(t.coach, `athletes/${ATH}/diagnostics`, 'new-1',
      { athleteId: ATH, capturedBy: 'coach-probe', status: 'draft', values: {}, notes: null }, ['capturedAt', 'updatedAt']), 200);
  } finally {
    await del(`athletes/${ATH}/diagnostics`, 'old-1');
    await del(`athletes/${ATH}/diagnostics`, 'new-1');
    await del('athletes', ATH);
    await del('users', uids.owner);
  }
}
