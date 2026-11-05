/**
 * The exact write shapes of mentalConsents/{athleteId} (spec 6.1, plan
 * Global Constraints). PURE: `stamp` is serverTimestamp() in live code and a
 * plain marker in tests. firestore.rules proves every shape here
 * (scripts/rules-probes/mental-consent.mjs); a shape changed on one side only
 * is refused for good.
 *
 * History (Review Focus 1): every update that appends to `history` appends
 * the CURRENT record's own objects, exactly as the transaction read them -
 * Timestamps as Timestamps, a stored null as null. Never rebuild them from a
 * display copy: the rules compare the whole array.
 */
import { CONSENT_VERSION, isAdultRecord } from './mentalConsent';

export const NAME_MAX = 120;
export const PHONE_MAX = 40;
export const RELATIONSHIP_MAX = 60;
const LOCATIONS = ['A', 'B', 'C', 'any'];

const clean = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const orNull = (s) => (s === '' ? null : s);
const appended = (current, entry) => [...(current.history || []), entry];

/**
 * ChoicesInput -> the stored `choices` map. Trims and clamps; a blank
 * relationship is null; a contact with no name and no phone is all null (a
 * minor's "Same as parent"); a minor has no parentSessions/parentName; an
 * adult has no driving and a parentName only with parentSessions.
 */
export function normalizeChoices(input, { adult, uid, stamp }) {
  const c = input || {};
  const ec = c.emergencyContact || {};
  const name = orNull(clean(ec.name, NAME_MAX));
  const phone = orNull(clean(ec.phone, PHONE_MAX));
  const blank = name == null && phone == null;
  const parentSessions = adult ? c.parentSessions === true : null;
  return {
    location: LOCATIONS.includes(c.location) ? c.location : null,
    audio: c.audio === true,
    driving: !adult && typeof c.driving === 'boolean' ? c.driving : null,
    emergencyContact: { name, phone, relationship: blank ? null : orNull(clean(ec.relationship, RELATIONSHIP_MAX)) },
    parentSessions,
    parentName: parentSessions ? orNull(clean(c.parentName, NAME_MAX)) : null,
    updatedAt: stamp,
    updatedBy: uid,
  };
}

const assentOf = (a, at) => ({ name: clean(a?.name, NAME_MAX), audio: a?.audio === true, at, readAloud: a?.readAloud === true, withdrawnBy: null });

/** A portal signature: the parent's section 10 with the athlete's section 9 (`assent` = { name, audio, readAloud }), or section 11 (`adult`, `assent` null). */
export function portalRecord({ athleteId, householdId, uid, adult, signerName, choices, assent, stamp }) {
  return {
    athleteId, householdId, version: CONSENT_VERSION, method: 'portal', signedAt: stamp, signedBy: uid,
    signer: { role: adult ? 'athlete' : 'parent', name: clean(signerName, NAME_MAX) }, adult: adult === true,
    assent: adult ? null : assentOf(assent, stamp),
    choices: normalizeChoices(choices, { adult, uid, stamp }),
    adultConfirm: null, adultSignature: null, countersign: null, history: [],
  };
}

/** A paper form typed in by ops or the owner: `signedAt` is the form's date (paperDateToStamp), the assent dated with it. */
export function paperRecord({ athleteId, householdId, uid, signedAt, adult, signerName, version = CONSENT_VERSION, choices, assent, stamp }) {
  return {
    athleteId, householdId, version: clean(version, NAME_MAX) || CONSENT_VERSION, method: 'paper', signedAt, signedBy: uid,
    signer: { role: adult ? 'athlete' : 'parent', name: clean(signerName, NAME_MAX) }, adult: adult === true,
    assent: adult ? null : assentOf(assent, signedAt),
    choices: normalizeChoices(choices, { adult, uid, stamp }),
    adultConfirm: null, adultSignature: null, countersign: null, history: [],
  };
}

/**
 * Change choices (spec 4.3). `assentAudio` (a boolean) only through the
 * hand-the-phone step; `adultConfirmName` only when an adult record's
 * section 11 fields change (adultFieldsChanged).
 */
export function choicesUpdate({ current, uid, choices, assentAudio, adultConfirmName, stamp }) {
  const update = {
    choices: normalizeChoices(choices, { adult: isAdultRecord(current), uid, stamp }),
    history: appended(current, { choices: current.choices, assent: current.assent ?? null, adultConfirm: current.adultConfirm ?? null }),
  };
  if (typeof assentAudio === 'boolean') update.assent = { ...current.assent, audio: assentAudio, at: stamp, withdrawnBy: null };
  const confirm = clean(adultConfirmName, NAME_MAX);
  if (confirm) update.adultConfirm = { name: confirm, at: stamp };
  return update;
}

/** The one-way withdrawal of a minor's own recording answer, by the athlete's login or Yannick. */
export function withdrawalUpdate({ current, uid, stamp }) {
  return {
    assent: { ...current.assent, audio: false, at: stamp, withdrawnBy: uid },
    history: appended(current, { choices: current.choices, assent: current.assent ?? null }),
  };
}

/** The section 11 re-sign of a minor-era record at 18; on paper when `paperSignedAt` (the form's date) is given. */
export function adultResign({ current, uid, name, choices, stamp, paperSignedAt = null, version = CONSENT_VERSION }) {
  const paper = paperSignedAt != null;
  return {
    adultSignature: { signedAt: paper ? paperSignedAt : stamp, signedBy: uid, name: clean(name, NAME_MAX), version, method: paper ? 'paper' : 'portal' },
    choices: normalizeChoices(choices, { adult: true, uid, stamp }),
    countersign: null,
    history: appended(current, { choices: current.choices, assent: current.assent ?? null, countersign: current.countersign ?? null }),
  };
}

/** Yannick's countersignature (the form's "Yannick Artigolle (Signature)" line). */
export function countersignUpdate({ uid, stamp }) {
  return { countersign: { at: stamp, by: uid } };
}

/** A minor's assent after a correction: a withdrawal is never undone, an unchanged answer stays as stored. */
function correctedAssent(stored, input, signedAt) {
  const name = clean(input?.name ?? stored?.name, NAME_MAX);
  const audio = typeof input?.audio === 'boolean' ? input.audio : stored?.audio === true;
  if (stored && (stored.withdrawnBy || (stored.name === name && stored.audio === audio))) return stored;
  return { name, audio, at: signedAt, readAloud: stored?.readAloud ?? false, withdrawnBy: null };
}

/**
 * The owner's correction of a paper record (dates, names, section, version); the old values go to history.
 * A withdrawn record stays section 10 with its stored assent (firestore.rules mcPaperCorrection): section 11
 * would drop the assent, and a later correction could then write a fresh one.
 */
export function paperCorrection({
  current, uid, signedAt = current.signedAt, version = current.version, adult: asked = current.adult === true, signerName = current.signer?.name, choices, assent, stamp,
}) {
  const adult = current.assent?.withdrawnBy ? false : asked;
  return {
    signedAt,
    signer: { role: adult ? 'athlete' : 'parent', name: clean(signerName, NAME_MAX) },
    adult,
    assent: adult ? null : correctedAssent(current.assent, assent, signedAt),
    version,
    choices: normalizeChoices(choices ?? current.choices, { adult, uid, stamp }),
    signedBy: uid,
    history: appended(current, {
      choices: current.choices, assent: current.assent ?? null, signedAt: current.signedAt, signer: current.signer,
      adult: current.adult, version: current.version, signedBy: current.signedBy,
    }),
  };
}

/** Whether a section 11 field (recording, emergency contact, parent sessions or their name) differs: the change then needs the athlete's typed confirmation. */
export function adultFieldsChanged(prev, next) {
  const view = (c) => {
    const n = normalizeChoices(c, { adult: true, uid: null, stamp: null });
    return JSON.stringify([n.audio, n.emergencyContact, n.parentSessions, n.parentName]);
  };
  return view(prev) !== view(next);
}
