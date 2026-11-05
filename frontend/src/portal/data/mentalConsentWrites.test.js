/**
 * The exact write shapes of mentalConsents/{athleteId} (plan Task 8): what
 * firestore.rules proves, and every history entry made of the current
 * record's own objects (Review Focus 1).
 */
import {
  adultFieldsChanged, adultResign, choicesUpdate, countersignUpdate, normalizeChoices, paperCorrection, paperRecord, portalRecord, withdrawalUpdate,
} from './mentalConsentWrites';

const minorChoices = { location: 'B', audio: true, driving: null, emergencyContact: { name: '', phone: '', relationship: '' } };
const adultChoices = {
  location: 'C', audio: true, driving: null, emergencyContact: { name: 'Lee Test', phone: 'test-phone', relationship: 'aunt' }, parentSessions: true, parentName: 'Dana Test',
};
const adultChoicesStored = normalizeChoices(adultChoices, { adult: true, uid: 'u', stamp: 'T' });

test('portalRecord: the minor shape the rules prove', () => {
  expect(portalRecord({ athleteId: 'ava', householdId: 'hh', uid: 'u-dana', adult: false, signerName: ' Dana Test ',
    choices: { location: 'B', audio: true, driving: null, emergencyContact: { name: '', phone: '', relationship: '' }, parentSessions: true, parentName: 'x' },
    assent: { name: 'Ava', audio: true, readAloud: false }, stamp: 'NOW' })).toEqual({
    athleteId: 'ava', householdId: 'hh', version: '2026-10-30', method: 'portal', signedAt: 'NOW', signedBy: 'u-dana',
    signer: { role: 'parent', name: 'Dana Test' }, adult: false,
    assent: { name: 'Ava', audio: true, at: 'NOW', readAloud: false, withdrawnBy: null },
    choices: { location: 'B', audio: true, driving: null, emergencyContact: { name: null, phone: null, relationship: null },
      parentSessions: null, parentName: null, updatedAt: 'NOW', updatedBy: 'u-dana' },
    adultConfirm: null, adultSignature: null, countersign: null, history: [] });
});

test('portalRecord: the 18+ shape (section 11)', () => {
  const r = portalRecord({ athleteId: 'max', householdId: 'hh', uid: 'u-max', adult: true, signerName: 'Max Test', choices: { ...adultChoices, driving: true }, assent: null, stamp: 'NOW' });
  expect(r).toMatchObject({ signer: { role: 'athlete', name: 'Max Test' }, adult: true, assent: null });
  expect(r.choices).toEqual({ location: 'C', audio: true, driving: null, emergencyContact: { name: 'Lee Test', phone: 'test-phone', relationship: 'aunt' },
    parentSessions: true, parentName: 'Dana Test', updatedAt: 'NOW', updatedBy: 'u-max' });
  expect(normalizeChoices({ ...adultChoices, parentSessions: false }, { adult: true, uid: 'u', stamp: 'T' })).toMatchObject({ parentSessions: false, parentName: null });
  expect(Object.keys(r).sort()).toEqual(['adult', 'adultConfirm', 'adultSignature', 'assent', 'athleteId', 'choices', 'countersign', 'history', 'householdId',
    'method', 'signedAt', 'signedBy', 'signer', 'version']);
});

test('normalizeChoices: trims and clamps every typed field', () => {
  const c = normalizeChoices({ location: 'D', audio: 'yes', driving: 'no', emergencyContact: { name: ` ${'n'.repeat(130)} `, phone: 'p'.repeat(50), relationship: 'r'.repeat(70) },
    parentSessions: true, parentName: 'q'.repeat(130) }, { adult: true, uid: 'u', stamp: 'NOW' });
  expect([c.location, c.audio, c.driving, c.emergencyContact.name.length, c.emergencyContact.phone.length, c.emergencyContact.relationship.length, c.parentName.length])
    .toEqual([null, false, null, 120, 40, 60, 120]);
});

test('paperRecord: the date on the form, the version, the choices as far as the paper shows', () => {
  const at = new Date('2026-10-28T05:00:00Z');
  const r = paperRecord({ athleteId: 'ava', householdId: 'hh', uid: 'u-ops', signedAt: at, adult: false, signerName: 'Dana Whitfield', version: '2026-10-30',
    choices: { location: null, audio: false, driving: null, emergencyContact: { name: null, phone: null, relationship: null } }, assent: { name: 'Ava', audio: false }, stamp: 'NOW' });
  expect(r).toMatchObject({ method: 'paper', signedAt: at, signedBy: 'u-ops', version: '2026-10-30', signer: { role: 'parent', name: 'Dana Whitfield' },
    assent: { name: 'Ava', audio: false, at, readAloud: false, withdrawnBy: null }, history: [], countersign: null });
  expect(r.choices).toMatchObject({ location: null, audio: false, updatedAt: 'NOW', updatedBy: 'u-ops' });
  expect(paperRecord({ athleteId: 'max', householdId: 'hh', uid: 'u-ops', signedAt: at, adult: true, signerName: 'Max Test', choices: {}, assent: null, stamp: 'NOW' }))
    .toMatchObject({ adult: true, assent: null, version: '2026-10-30', signer: { role: 'athlete' }, choices: { parentSessions: false, parentName: null } });
});

test('history appends the current record\'s own objects (Review Focus 1)', () => {
  const current = { choices: { location: 'B' }, assent: { audio: true }, adultConfirm: { name: 'Max', at: 'T0' },
    history: [{ choices: {}, assent: null }], countersign: { at: 'T', by: 'm' } };
  const u = choicesUpdate({ current, uid: 'u-dana', choices: minorChoices, stamp: 'NOW' });
  expect(u.history).toHaveLength(2);
  expect(u.history[1].choices).toBe(current.choices);
  expect(u.history[1].assent).toBe(current.assent);
  expect(u.history[1].adultConfirm).toBe(current.adultConfirm);
  expect(u.history[0]).toBe(current.history[0]);
  expect(Object.keys(u).sort()).toEqual(['choices', 'history']);
  expect(withdrawalUpdate({ current, uid: 'u-ava', stamp: 'NOW' })).toEqual({
    assent: { ...current.assent, audio: false, at: 'NOW', withdrawnBy: 'u-ava' }, history: [...current.history, { choices: current.choices, assent: current.assent }] });
  const r = adultResign({ current, uid: 'u-dana', name: 'Max Test', choices: adultChoices, stamp: 'NOW' });
  expect(r.history[1]).toEqual({ choices: current.choices, assent: current.assent, countersign: current.countersign });
  expect(r.countersign).toBeNull();
  expect(r.adultSignature).toEqual({ signedAt: 'NOW', signedBy: 'u-dana', name: 'Max Test', version: '2026-10-30', method: 'portal' });
  expect(adultResign({ current, uid: 'u-ops', name: 'Max Test', choices: adultChoices, stamp: 'NOW', paperSignedAt: 'P' }).adultSignature)
    .toMatchObject({ signedAt: 'P', method: 'paper' });
});

test('a stored null stays a null in the history entry (never dropped)', () => {
  const current = { choices: { location: 'C' }, assent: null, adultConfirm: null, countersign: null, history: [] };
  expect(choicesUpdate({ current, uid: 'u', choices: adultChoices, stamp: 'NOW' }).history).toEqual([{ choices: current.choices, assent: null, adultConfirm: null }]);
  expect(adultResign({ current, uid: 'u', name: 'Max Test', choices: adultChoices, stamp: 'NOW' }).history).toEqual([{ choices: current.choices, assent: null, countersign: null }]);
});

test('choicesUpdate: assent and adultConfirm only when asked for', () => {
  const minor = { choices: { location: 'B' }, assent: { name: 'Ava', audio: false, at: 'T', readAloud: false, withdrawnBy: null }, history: [] };
  expect(choicesUpdate({ current: minor, uid: 'u', choices: minorChoices, assentAudio: true, stamp: 'NOW' }).assent)
    .toEqual({ name: 'Ava', audio: true, at: 'NOW', readAloud: false, withdrawnBy: null });
  const adult = { adult: true, choices: { ...adultChoicesStored }, assent: null, history: [] };
  expect(choicesUpdate({ current: adult, uid: 'u', choices: { ...adultChoices, audio: !adultChoices.audio }, adultConfirmName: 'Max Test', stamp: 'NOW' }).adultConfirm)
    .toEqual({ name: 'Max Test', at: 'NOW' });
  expect(choicesUpdate({ current: adult, uid: 'u', choices: adultChoices, stamp: 'NOW' }).choices).toMatchObject({ parentSessions: true, parentName: 'Dana Test' });
  expect(adultFieldsChanged(adultChoicesStored, { ...adultChoicesStored, location: 'C' })).toBe(false);
  expect(adultFieldsChanged(adultChoicesStored, { ...adultChoices, location: 'A' })).toBe(false);
  expect(adultFieldsChanged(adultChoicesStored, { ...adultChoices, audio: false })).toBe(true);
  expect(adultFieldsChanged(adultChoicesStored, { ...adultChoices, emergencyContact: { ...adultChoices.emergencyContact, phone: 'other-phone' } })).toBe(true);
  expect(adultFieldsChanged(adultChoicesStored, { ...adultChoices, parentName: 'Sam Test' })).toBe(true);
});

test('countersignUpdate: Yannick\'s acknowledgement and nothing else', () => {
  expect(countersignUpdate({ uid: 'u-mental', stamp: 'NOW' })).toEqual({ countersign: { at: 'NOW', by: 'u-mental' } });
});

describe('paperCorrection', () => {
  const stored = {
    method: 'paper', signedAt: 'S', signedBy: 'u-ops', signer: { role: 'parent', name: 'Dana Whitfield' }, adult: false, version: '2026-10-30',
    assent: { name: 'Ava', audio: false, at: 'S', readAloud: false, withdrawnBy: 'u-mental' },
    choices: { location: null, audio: false, driving: null, emergencyContact: { name: null, phone: null, relationship: null }, parentSessions: null, parentName: null,
      updatedAt: 'OLD', updatedBy: 'u-ops' },
    history: [],
  };
  test('a withdrawal is never undone; the choices are restamped; the old values go to history', () => {
    const u = paperCorrection({ current: stored, uid: 'u-owner', signedAt: 'S2', version: '2026-10-30', adult: false, signerName: 'Dana Whitfield',
      assent: { name: 'Ava', audio: true }, stamp: 'NOW' });
    expect(u.assent).toBe(stored.assent);
    expect(u.choices).toMatchObject({ updatedAt: 'NOW', updatedBy: 'u-owner' });
    expect(u.history[0].signedAt).toBe('S');
    expect(u.history[0]).toEqual({ choices: stored.choices, assent: stored.assent, signedAt: 'S', signer: stored.signer, adult: false, version: '2026-10-30', signedBy: 'u-ops' });
    expect(u).toMatchObject({ signedAt: 'S2', signedBy: 'u-owner', signer: { role: 'parent', name: 'Dana Whitfield' } });
  });
  test('an unchanged assent stays as stored; a changed one is dated with the form', () => {
    const open = { ...stored, assent: { ...stored.assent, withdrawnBy: null } };
    expect(paperCorrection({ current: open, uid: 'u-owner', signedAt: 'S2', assent: { name: 'Ava', audio: false }, stamp: 'NOW' }).assent).toBe(open.assent);
    expect(paperCorrection({ current: open, uid: 'u-owner', signedAt: 'S2', assent: { name: 'Ava', audio: true }, stamp: 'NOW' }).assent)
      .toEqual({ name: 'Ava', audio: true, at: 'S2', readAloud: false, withdrawnBy: null });
    expect(paperCorrection({ current: open, uid: 'u-owner', signedAt: 'S2', adult: true, signerName: 'Ava Test', choices: {}, stamp: 'NOW' }))
      .toMatchObject({ adult: true, assent: null, signer: { role: 'athlete', name: 'Ava Test' }, choices: { parentSessions: false } });
  });
});
