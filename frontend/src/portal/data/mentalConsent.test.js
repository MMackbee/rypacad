/**
 * Consent status, dates, the family's rows and lines, Yannick's summary and
 * the staff tracker (plan Task 8). The status rule runs the shared case
 * table the server mirror runs too (functions/portal/mental-consent-status.js).
 */
import fs from 'fs';
import path from 'path';
import { academyDateISO } from './calendar';
import {
  CONSENT_VERSION, LOCATION_SHORT, STAFF_STATUS_LABEL, bookingLineFor, branchFor, consentStatusFor, drivingAsked, familyLine, familyRows, flowFacts,
  homeCardFor, isAdultRecord, msOf, needsConsentBeforeSession, paperDateToStamp, recordingAllowed, shortDate, signerFor, staffConsentSummary,
  trackerRows, utcTodayISO,
} from './mentalConsent';
import { choicesUpdate, normalizeChoices, paperCorrection } from './mentalConsentWrites';

const CASES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../functions/test/fixtures/consent-status-cases.json'), 'utf8'));
const D = '2026-11-05';
const NOW2 = new Date('2026-11-06T01:00:00Z'); // 7 PM Nov 5 in Chicago, already Nov 6 in UTC
const minorChoices = { location: 'B', audio: true, driving: null, emergencyContact: { name: '', phone: '', relationship: '' } };
const adultChoices = {
  location: 'C', audio: true, driving: null, emergencyContact: { name: 'Lee Test', phone: 'test-phone', relationship: 'aunt' }, parentSessions: true, parentName: 'Dana Test',
};
const adultChoicesStored = normalizeChoices(adultChoices, { adult: true, uid: 'u', stamp: 'T' });
const minorRec = (c, a) => ({ adult: false, adultSignature: null, choices: { audio: c }, assent: { audio: a } });

const SIGNED_AT = new Date('2026-10-30T17:00:00Z');
const minorRecord = (o = {}) => ({
  athleteId: 'ava', householdId: 'hh', version: CONSENT_VERSION, method: 'portal', signedAt: SIGNED_AT, signedBy: 'u-dana',
  signer: { role: 'parent', name: 'Dana Whitfield' }, adult: false,
  assent: { name: 'Ava', audio: true, at: SIGNED_AT, readAloud: false, withdrawnBy: null },
  choices: { ...normalizeChoices({ ...minorChoices, driving: false }, { adult: false, uid: 'u-dana', stamp: SIGNED_AT }) },
  adultConfirm: null, adultSignature: null, countersign: null, history: [], ...o,
});
const adultRecord = (o = {}) => ({
  athleteId: 'max', householdId: 'hh', version: CONSENT_VERSION, method: 'portal', signedAt: SIGNED_AT, signedBy: 'u-max',
  signer: { role: 'athlete', name: 'Max Test' }, adult: true, assent: null, choices: { ...adultChoicesStored },
  adultConfirm: null, adultSignature: null, countersign: null, history: [], ...o,
});

test('consentStatusFor: the shared case table', () => {
  expect(CASES).toHaveLength(13);
  for (const c of CASES) expect([c.label, consentStatusFor(c.athlete, c.record, c.utcToday)]).toEqual([c.label, c.want]);
});

test('recordingAllowed: both answers for a minor, the athlete\'s own at 18+, never while it needs the 18+ signature', () => {
  expect([[true, true], [true, false], [false, true]].map(([c, a]) => recordingAllowed({ dob: '2012-05-14' }, minorRec(c, a), D))).toEqual([true, false, false]);
  expect(recordingAllowed({ dob: '2007-03-02' }, { adult: true, choices: { audio: true }, assent: null }, D)).toBe(true);
  expect(recordingAllowed({ dob: '2008-11-05' }, minorRec(true, true), D)).toBe(false);
  expect(isAdultRecord({ adult: false, adultSignature: { name: 'Max' } })).toBe(true);
});

test('branchFor: who signs, from the viewer and the UTC date', () => {
  const b = (viewer, dob, claimedLogin = false) => branchFor({ viewer, athlete: { dob }, claimedLogin, utcTodayISO: D });
  expect([b('parent', null), b('parent', '2012-05-14'), b('athlete', '2012-05-14'), b('athlete', '2007-03-02'), b('parent', '2007-03-02'), b('parent', '2007-03-02', true)])
    .toEqual(['no-dob', 'minor', 'minor-login', 'adult', 'adult-handover', 'adult-elsewhere']);
});

test('drivingAsked: a minor of 16 or 17', () => {
  expect(['2010-11-05', '2010-11-06', '2007-03-02'].map((dob) => drivingAsked({ dob }, D))).toEqual([true, false, false]);
});

test('the evening before an 18th birthday (Review Focus 5): ages on the UTC date, booking dates on the Chicago one', () => {
  expect(utcTodayISO(NOW2)).toBe('2026-11-06');
  expect(academyDateISO(NOW2)).toBe('2026-11-05');
  const facts = (dob) => flowFacts({ viewer: 'parent', athlete: { dob }, record: null, claimedLogin: false, now: NOW2 });
  expect(facts('2008-11-06')).toMatchObject({ branch: 'adult-handover', status: 'unsigned', utcToday: '2026-11-06' });
  expect(facts('2010-11-06').drivingAsked).toBe(true);
  expect(facts('2013-11-06').under13).toBe(false);
  expect(facts('2013-11-07').under13).toBe(true);
});

test('paper dates are Chicago midnight; shortDate is the Chicago date', () => {
  expect(paperDateToStamp('2026-10-28').toISOString()).toBe('2026-10-28T05:00:00.000Z');
  expect(paperDateToStamp('2026-11-05').toISOString()).toBe('2026-11-05T06:00:00.000Z');
  expect(shortDate(paperDateToStamp('2026-10-28'))).toBe('Oct 28');
  expect(shortDate(new Date('2026-11-06T01:00:00Z'))).toBe('Nov 5');
  expect(shortDate({ toMillis: () => SIGNED_AT.getTime() })).toBe('Oct 30');
  expect([msOf(SIGNED_AT), msOf('2026-10-30T17:00:00Z'), msOf(SIGNED_AT.getTime()), msOf('NOW'), msOf(null)])
    .toEqual([SIGNED_AT.getTime(), SIGNED_AT.getTime(), SIGNED_AT.getTime(), null, null]);
});

test('signerFor: the users doc, else the auth user, else the household guardian', () => {
  expect(signerFor({ userDoc: { displayName: 'Alex Whitfield', email: 'alex@example.com' }, authUser: {}, household: { guardian: { name: 'Dana', email: 'dana@example.com' } } }))
    .toEqual({ name: 'Alex Whitfield', email: 'alex@example.com' });
  expect(signerFor({ userDoc: {}, authUser: { displayName: null, email: 'alex@example.com' }, household: { guardian: { name: 'Dana', email: 'dana@example.com' } } }))
    .toEqual({ name: 'Dana', email: 'alex@example.com' });
});

/* ---------------------------------------------------------- family lines -- */

const row = (o = {}) => ({
  athleteId: 'ava', name: 'Ava Test', firstName: 'Ava', viewer: 'parent', status: 'unsigned', record: null, adultToday: false, claimedLogin: false,
  drivingUnanswered: false, nextMental: null, draft: null, ...o,
});
const maxRow = (o = {}) => row({ athleteId: 'max', name: 'Max Test', firstName: 'Max', adultToday: true, ...o });
const signedMinor = { status: 'signed', record: minorRecord() };

test.each([
  ['parent, unsigned', row(), 'Not signed', 'Sign now'],
  ['parent, signed', row(signedMinor), 'Signed Oct 30 by Dana', 'Change choices'],
  ['parent, signed, a draft left on another device', row({ ...signedMinor, draft: 'fresh' }), 'Signed Oct 30 by Dana', 'Change choices'],
  ['parent, signed, 16+ now, driving null', row({ status: 'signed', record: minorRecord({ choices: { ...minorRecord().choices, driving: null } }), drivingUnanswered: true }),
    'Signed Oct 30 by Dana · Driving permission not answered', 'Change choices'],
  ['parent, needs-adult, no claimed login', maxRow({ status: 'needs-adult', record: minorRecord() }), "Needs Max's 18+ signature", 'Sign now'],
  ['parent, needs-adult, claimed login', maxRow({ status: 'needs-adult', record: minorRecord(), claimedLogin: true }),
    "Needs Max's 18+ signature · Max signs this on their own login", null],
  ['parent, adult signed, claimed', maxRow({ status: 'signed', record: adultRecord(), claimedLogin: true }), 'Signed Oct 30 · Max manages this', null],
  ['parent, unsigned 18+, claimed', maxRow({ claimedLogin: true }), 'Not signed · Max signs this on their own login', null],
  ['parent, draft fresh', row({ draft: 'fresh' }), "Waiting for Ava's agreement", 'Continue'],
  ['parent, draft expired', row({ draft: 'expired' }), 'Draft expired', 'Start again'],
  ['parent, no dob', row({ status: 'no-dob' }), "Add Ava's date of birth first", null],
  ['athlete (minor), unsigned', row({ viewer: 'athlete' }), 'Your parent signs this', null],
  ['athlete (minor), signed, both audios yes', row({ viewer: 'athlete', ...signedMinor }), 'Signed Oct 30 · Your parent manages this · Recording: yes', 'Stop recording'],
  ['athlete (minor), signed, assent.audio false', row({ viewer: 'athlete', status: 'signed', record: minorRecord({ assent: { ...minorRecord().assent, audio: false } }) }),
    'Signed Oct 30 · Your parent manages this · Recording: no', null],
  ['athlete (minor), signed, the parent said no and the own answer is yes', row({ viewer: 'athlete', status: 'signed', record: minorRecord({ choices: { ...minorRecord().choices, audio: false } }) }),
    'Signed Oct 30 · Your parent manages this · Recording: no (your parent said no)', 'Stop recording'],
  ['athlete 18+, unsigned', maxRow({ viewer: 'athlete', claimedLogin: true }), 'Not signed', 'Sign now'],
  ['athlete 18+, needs-adult', maxRow({ viewer: 'athlete', claimedLogin: true, status: 'needs-adult', record: minorRecord() }), 'Needs your 18+ signature', 'Sign now'],
  ['athlete 18+, signed', maxRow({ viewer: 'athlete', claimedLogin: true, status: 'signed', record: adultRecord() }), 'Signed Oct 30', 'Change choices'],
  ['parent, signed on paper', row({ status: 'signed', record: minorRecord({ method: 'paper' }) }), 'Signed on paper Oct 30 by Dana', 'Change choices'],
  ['athlete (minor), signed on paper', row({ viewer: 'athlete', status: 'signed', record: minorRecord({ method: 'paper' }) }),
    'Signed on paper Oct 30 · Your parent manages this · Recording: yes', 'Stop recording'],
  ['parent, re-signed 18+ on paper, claimed', maxRow({ status: 'signed', claimedLogin: true,
    record: minorRecord({ adultSignature: { signedAt: SIGNED_AT, name: 'Max Test', method: 'paper' } }) }), 'Signed on paper Oct 30 · Max manages this', null],
])('familyLine: %s', (label, r, text, button) => {
  const line = familyLine(r);
  expect([line.text, line.label]).toEqual([text, button]);
  expect(line.action == null && line.href == null).toBe(button == null);
});

test('familyLine: where each action goes', () => {
  expect(familyLine(row()).href).toBe('/portal/consent/mental/ava');
  expect(familyLine(row({ draft: 'fresh' })).href).toBe('/portal/consent/mental/ava');
  expect(familyLine(row({ draft: 'expired' })).href).toBe('/portal/consent/mental/ava');
  expect(familyLine(row(signedMinor))).toMatchObject({ action: 'change', href: '/portal/consent/mental/ava?change=1' });
  expect(familyLine(row({ viewer: 'athlete', ...signedMinor }))).toMatchObject({ action: 'withdraw', href: '/portal/consent/mental?withdraw=1' });
});

const reeseSignedRecord = minorRecord({ athleteId: 'reese', assent: { ...minorRecord().assent, name: 'Reese' } });
const signedJordan = row({ athleteId: 'jordan', name: 'Jordan Whitfield', firstName: 'Jordan', status: 'signed', record: minorRecord({ athleteId: 'jordan' }),
  nextMental: { date: '2026-11-10', attendee: 'athlete' } });
const unsignedReese = (o = {}) => row({ athleteId: 'reese', name: 'Reese Whitfield', firstName: 'Reese', ...o });
const unsignedNico = row({ athleteId: 'nico', name: 'Nico Whitfield', firstName: 'Nico' });
const claimedAdultUnsigned = (o = {}) => maxRow({ claimedLogin: true, ...o });
const needsAdultMax = (o = {}) => maxRow({ status: 'needs-adult', record: minorRecord({ athleteId: 'max' }), ...o });
const minorLoginUnsigned = () => row({ viewer: 'athlete' });
const noDob = () => row({ status: 'no-dob' });

test('homeCardFor: the first signable athlete with a confirmed 1:1 ahead', () => {
  expect(homeCardFor([signedJordan, unsignedReese({ nextMental: { date: '2026-11-12', attendee: 'athlete' } }), unsignedNico])).toEqual({
    athleteId: 'reese', text: "Sign Yannick's consent for Reese before the session on Thu, Nov 12", href: '/portal/consent/mental/reese' });
  expect(homeCardFor([unsignedNico])).toBeNull(); // nothing booked
  expect(homeCardFor([claimedAdultUnsigned({ nextMental: { date: '2026-11-12' } })])).toBeNull(); // no button for the parent
  expect(homeCardFor([needsAdultMax({ nextMental: { date: '2026-11-12' } })])).toEqual({
    athleteId: 'max', text: "Sign Yannick's consent for Max before the session on Thu, Nov 12", href: '/portal/consent/mental/max' });
  expect(homeCardFor([needsAdultMax({ claimedLogin: true, nextMental: { date: '2026-11-12' } })])).toBeNull();
  expect(homeCardFor(undefined)).toBeNull();
});

test('homeCardFor: the soonest 1:1 wins, not the first name', () => {
  const ava = row({ nextMental: { date: '2026-11-26', attendee: 'athlete' } });
  const zed = row({ athleteId: 'zed', name: 'Zed Test', firstName: 'Zed', nextMental: { date: '2026-11-06', attendee: 'athlete' } });
  expect(homeCardFor([ava, zed]).athleteId).toBe('zed');
  expect(homeCardFor([zed, ava]).athleteId).toBe('zed');
});

test('bookingLineFor', () => {
  expect(bookingLineFor(unsignedReese())).toEqual({ text: 'Consent needed · Sign', href: '/portal/consent/mental/reese' });
  expect(bookingLineFor(minorLoginUnsigned())).toEqual({ text: 'Consent needed · Your parent signs this', href: null });
  expect(bookingLineFor(claimedAdultUnsigned())).toEqual({ text: 'Consent needed · Max signs this on their own login', href: null });
  expect(bookingLineFor(needsAdultMax({ claimedLogin: true }))).toEqual({ text: 'Consent needed · Max signs this on their own login', href: null });
  expect(bookingLineFor(noDob())).toEqual({ text: "Consent needed · Add Ava's date of birth first", href: null });
  expect(bookingLineFor(signedJordan)).toBeNull();
  expect(bookingLineFor(null)).toBeNull();
});

test('needsConsentBeforeSession: not signed with a 1:1 ahead', () => {
  expect(needsConsentBeforeSession(unsignedReese({ nextMental: { date: '2026-11-12' } }))).toBe(true);
  expect(needsConsentBeforeSession(unsignedNico)).toBe(false);
  expect(needsConsentBeforeSession(signedJordan)).toBe(false);
});

test('familyRows: nextMental reads confirmed mental bookings only, from today; a record beats a draft', () => {
  const reese = { id: 'reese', name: 'Reese Whitfield', dob: '2014-03-02' };
  const rows = familyRows({ viewer: 'parent', athletes: [reese], records: [],
    bookings: [{ athleteId: 'reese', type: 'mental', status: 'cancelled', date: '2026-11-08' }, { athleteId: 'reese', type: 'mental', status: 'confirmed', date: '2026-11-04' },
      { athleteId: 'reese', type: 'training', status: 'confirmed', date: '2026-11-06' }, { athleteId: 'reese', type: 'mental', status: 'confirmed', date: '2026-11-12', attendee: 'parent' }],
    claimed: {}, draftStates: {}, utcToday: '2026-11-05', today: '2026-11-05' });
  expect(rows[0].nextMental).toEqual({ date: '2026-11-12', attendee: 'parent' });
  const at = (draftStates, records = []) => familyRows({ viewer: 'parent', athletes: [reese], records, bookings: [], claimed: {}, draftStates, utcToday: '2026-11-05', today: '2026-11-05' })[0];
  expect(at({ reese: 'version-changed' }).draft).toBe('fresh'); // familyLine: "Waiting for Reese's agreement" / 'Continue'
  expect(familyLine(at({ reese: 'version-changed' }))).toMatchObject({ text: "Waiting for Reese's agreement", label: 'Continue' });
  expect(at({ reese: 'adult-changed' }).draft).toBeNull();
  expect(at({ reese: 'expired' }).draft).toBe('expired');
  expect(at({ reese: 'fresh' }, [{ id: 'reese', ...reeseSignedRecord }])).toMatchObject({ draft: null, status: 'signed' });
});

test('familyRows: the row facts, sorted by name', () => {
  const athletes = [
    { id: 'ava', name: 'Ava Test', dob: '2010-01-01' },
    { id: 'max', name: 'Max Test', dob: '2007-03-02' },
    { id: 'eli', name: 'Eli Test', dob: null },
  ];
  const noDriving = minorRecord({ choices: { ...minorRecord().choices, driving: null } });
  const rows = familyRows({ viewer: 'parent', athletes, records: { ava: noDriving }, bookings: [], claimed: { max: true }, draftStates: {}, utcToday: D, today: D });
  expect(rows.map((r) => [r.athleteId, r.firstName, r.status, r.adultToday, r.claimedLogin, r.drivingUnanswered])).toEqual([
    ['ava', 'Ava', 'signed', false, false, true], ['eli', 'Eli', 'no-dob', false, false, false], ['max', 'Max', 'unsigned', true, true, false],
  ]);
  expect(rows[0].record).toBe(noDriving);
});

/* ------------------------------------------------------- Yannick's card -- */

describe('staffConsentSummary', () => {
  const ava = { name: 'Ava Test', dob: '2010-01-01' }; // 16 on D
  const signed = (o = {}) => minorRecord({ countersign: { at: new Date('2026-10-31T15:00:00Z'), by: 'mental' }, ...o });
  const sum = (record, athlete = ava, utcToday = D) => staffConsentSummary({ athlete, record, utcToday });
  const withAssent = (o) => ({ assent: { ...minorRecord().assent, ...o } });
  const withChoices = (o) => ({ choices: { ...minorRecord().choices, ...o } });

  test('a complete minor record', () => {
    const s = sum(signed());
    expect(s.label).toBe('Complete');
    expect(s.summary).toBe('Signed Oct 30 by Dana Whitfield (parent) · Ava agreed · Recording: yes (both) · Location: Eden Prairie · Driving: no · Emergency contact: same as parent · Version 2026-10-30 · Countersigned Oct 31');
    expect(s).toMatchObject({ status: 'signed', canCountersign: false, canRemind: false, canWithdraw: true, audience: 'household' });
  });
  test('countersign, withdrawal and the two answers', () => {
    expect(sum(signed({ countersign: null }))).toMatchObject({ label: 'Signed', canCountersign: true });
    expect(sum(signed(withAssent({ audio: false, withdrawnBy: 'u-ava', at: new Date('2026-11-12T18:00:00Z') }))))
      .toMatchObject({ recording: 'Recording: no (Ava withdrew Nov 12)', canWithdraw: false });
    expect(sum(signed(withChoices({ audio: false }))).recording).toBe('Recording: no (parent)');
    expect(sum(signed(withAssent({ audio: false }))).recording).toBe('Recording: no (Ava)');
  });
  test('an adult record', () => {
    expect(sum(adultRecord(), { name: 'Max Test', dob: '2007-03-02' }).summary)
      .toBe('Signed Oct 30 by Max Test (athlete, 18+) · Recording: yes · Location: Online · Parent sessions: yes (Dana Test) · Emergency contact: Lee Test, test-phone (aunt) · Version 2026-10-30');
  });
  test('re-signed at 18, in the portal and on paper', () => {
    const max = { name: 'Max Test', dob: '2008-11-05' };
    const resigned = (sig) => minorRecord({ athleteId: 'max', choices: { ...adultChoicesStored }, countersign: null,
      adultSignature: { signedBy: 'u-max', version: CONSENT_VERSION, name: 'Max Test', ...sig } });
    const portal = sum(resigned({ signedAt: new Date('2026-11-06T16:00:00Z'), method: 'portal' }), max, '2026-11-06');
    expect(portal.summary.startsWith('Re-signed 18+ Nov 6 by Max Test')).toBe(true);
    expect(portal).toMatchObject({ status: 'signed', canWithdraw: false, recording: 'Recording: yes' });
    const paper = sum(resigned({ signedAt: paperDateToStamp('2026-11-01'), method: 'paper' }), max, '2026-11-06');
    expect(paper.summary.startsWith('Re-signed 18+ on paper Nov 1 by Max Test · recorded by the academy')).toBe(true);
  });
  test('needs the 18+ signature', () => {
    expect(sum(signed(), { name: 'Max Test', dob: '2008-11-05' })).toMatchObject({ label: 'Needs 18+', recording: 'Recording: needs 18+ signature', canRemind: true, canWithdraw: false });
  });
  test('the driving part', () => {
    expect(sum(signed(withChoices({ driving: true }))).summary).toContain('Driving: yes');
    expect(sum(signed(withChoices({ driving: null }))).summary).toContain('Driving: not answered');
    expect(sum(signed(withChoices({ driving: null })), { name: 'Ava Test', dob: '2012-05-14' }).summary).not.toContain('Driving');
  });
  test('a paper record, as far as the paper shows', () => {
    const paper = signed({ method: 'paper', signedAt: paperDateToStamp('2026-10-28'), signedBy: 'u-ops', countersign: null,
      assent: { ...minorRecord().assent, at: paperDateToStamp('2026-10-28') },
      choices: { ...minorRecord().choices, location: null, audio: false, updatedAt: new Date('2026-11-02T15:00:00Z'), updatedBy: 'u-ops' }, history: [] });
    const s = sum(paper);
    expect(s.summary.startsWith('Signed on paper Oct 28 by Dana Whitfield (parent) · recorded Nov 2')).toBe(true);
    expect(s.summary).toContain('Location: not transcribed');
    expect(s.summary).toContain('Recording: no');
    // The paper form has no "same as parent" box: a blank contact typed from paper is not transcribed...
    expect(s.summary).toContain('Emergency contact: not transcribed');
    expect(s.summary).not.toContain('same as parent');
    // ...until the family's own Change choices answers "same as parent".
    expect(sum({ ...paper, choices: { ...paper.choices, updatedBy: 'u-dana' } }).summary).toContain('Emergency contact: same as parent');
    const corrected = { ...paper, choices: { ...paper.choices, updatedAt: new Date('2026-11-04T15:00:00Z') }, history: [{ choices: paper.choices }] };
    expect(sum(corrected).summary).toContain('recorded Nov 2');
  });
  test("a family's answer to a paper record survives the owner correcting the record later", () => {
    const blank = { name: null, phone: null, relationship: null };
    const paper = signed({ method: 'paper', signedAt: paperDateToStamp('2026-10-28'), signedBy: 'u-ops', countersign: null,
      assent: { ...minorRecord().assent, at: paperDateToStamp('2026-10-28') },
      choices: { ...minorRecord().choices, location: null, emergencyContact: blank, updatedBy: 'u-ops' }, history: [] });
    const answered = { ...paper, ...choicesUpdate({ current: paper, uid: 'u-dana', choices: { ...paper.choices, emergencyContact: blank }, stamp: new Date('2026-11-03T15:00:00Z') }) };
    expect(sum(answered).summary).toContain('Emergency contact: same as parent');
    const fixed = { ...answered, ...paperCorrection({ current: answered, uid: 'u-owner', signedAt: paperDateToStamp('2026-10-27'), stamp: new Date('2026-11-04T15:00:00Z') }) };
    expect([fixed.signedBy, fixed.choices.updatedBy]).toEqual(['u-owner', 'u-owner']);
    expect(sum(fixed).summary).toContain('Emergency contact: same as parent');
    // A paper record only the academy ever wrote stays "not transcribed" through a correction.
    const fixedUnanswered = { ...paper, ...paperCorrection({ current: paper, uid: 'u-owner', stamp: new Date('2026-11-04T15:00:00Z') }) };
    expect(sum(fixedUnanswered).summary).toContain('Emergency contact: not transcribed');
  });
  test('not signed, no date of birth, and who a reminder reaches', () => {
    expect(sum(null)).toMatchObject({ label: 'Not signed', summary: null, canRemind: true });
    expect(sum(null, { name: 'Ava Test', dob: null })).toMatchObject({ label: 'No date of birth', canRemind: false });
    expect(sum(null, { name: 'Max Test', dob: '2007-03-02', loginEmail: 'max@example.com' }).audience).toBe('athlete');
    expect(sum(null, { name: 'Max Test', dob: '2007-03-02' }).audience).toBe('household');
    expect(sum(null, { name: 'Ava Test', dob: '2012-05-14', loginEmail: 'ava@example.com' }).audience).toBe('household');
  });
  test('the labels', () => {
    expect(STAFF_STATUS_LABEL).toEqual({ signed: 'Signed', unsigned: 'Not signed', 'needs-adult': 'Needs 18+', 'no-dob': 'No date of birth' });
    expect(LOCATION_SHORT).toEqual({ A: 'Academy quiet area', B: 'Eden Prairie', C: 'Online', any: 'Session by session' });
  });
});

/* -------------------------------------------------------- staff tracker -- */

test('trackerRows: every athlete with a mental booking; not signed with a 1:1 ahead first', () => {
  const jordan = { id: 'jordan', name: 'Jordan Whitfield', dob: '2012-06-17', householdId: 'whitfield' };
  const reese = { id: 'reese', name: 'Reese Whitfield', dob: '2014-03-02', householdId: 'whitfield' };
  const nico = { id: 'nico', name: 'Nico Whitfield', dob: '2017-09-09', householdId: 'whitfield' };
  const sage = { id: 'sage', name: 'Sage Parker', dob: '2011-04-04', householdId: 'parker' };
  const jordanSigned = minorRecord({ athleteId: 'jordan' });
  const m = (athleteId, status, date) => ({ athleteId, type: 'mental', status, date });
  const rows = trackerRows({ athletes: [jordan, reese, nico, sage], households: {}, records: { jordan: jordanSigned }, today: '2026-11-05', utcToday: '2026-11-05',
    bookings: [m('jordan', 'confirmed', '2026-11-19'), m('reese', 'confirmed', '2026-11-12'), m('nico', 'attended', '2026-10-29'), m('sage', 'cancelled', '2026-11-20')] });
  expect(rows.map((r) => [r.athleteId, r.nextMental, r.lastMental])).toEqual([
    ['reese', '2026-11-12', null], ['nico', null, '2026-10-29'], ['jordan', '2026-11-19', null]]);
  expect(rows.map((r) => r.label)).toEqual(['Not signed', 'Not signed', 'Signed']);
  const named = trackerRows({ athletes: [jordan], households: [{ id: 'whitfield', name: 'Whitfield family' }], records: [{ id: 'jordan', ...jordanSigned }],
    bookings: [m('jordan', 'confirmed', '2026-11-19')], today: '2026-11-05', utcToday: '2026-11-05' });
  expect(named[0]).toMatchObject({ familyName: 'Whitfield family', status: 'signed' });
});
