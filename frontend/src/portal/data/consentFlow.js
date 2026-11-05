/**
 * The consent flow (spec 4.2): its steps, the hand-over lock, the device
 * draft and where the family lands after it. PURE apart from the draft's
 * storage calls, which never throw. The screen drives flowReducer with
 * useReducer; nothing is saved until the last step (savesHere).
 *
 * Steps: a minor's parent signs section 10 (who, agreement, choices,
 * signature), then hands the phone over and the athlete agrees (section 9);
 * an 18+ athlete signs section 11 on their own login (who, agreement,
 * choices, signature), or on the parent's phone after the hand-over.
 */
import { CONSENT_VERSION } from './mentalConsent';
import { validateEmergencyContact } from './signup';

export const DRAFT_TTL_DAYS = 7;
export const DRAFT_V = 1;
const DAY_MS = 86400000;

const STEPS = {
  minor: ['who', 'agreement', 'choices', 'signature', 'handover', 'assent'],
  adult: ['who', 'agreement', 'choices', 'signature'],
  'adult-handover': ['who', 'handover', 'agreement', 'choices', 'signature'],
};
const SAVE_STEP = { minor: 'assent', adult: 'signature', 'adult-handover': 'signature' };
const isAdultBranch = (branch) => branch === 'adult' || branch === 'adult-handover';
const MAX = { 'contact.name': 120, 'signature.name': 120, 'assent.name': 120, 'choices.parentName': 120, 'contact.phone': 40, 'contact.relationship': 60 };
const LOCKED = ['contact.', 'choices.', 'signature.'];
const str = (s) => (typeof s === 'string' ? s : '');
const blank = (s) => str(s).trim() === '';
const NOT_YET = { ok: false, reason: null };
const OK = { ok: true, reason: null };

/* ------------------------------------------------------- the device draft -- */

/** localStorage key of one account's draft for one athlete (the registration draft precedent). */
export function draftKey(uid, athleteId) {
  return `ryp.mentalConsent.${uid}.${athleteId}`;
}
const storeOf = (storage) => storage ?? window.localStorage;

/** `Draft = { v: 1, version, savedAt: ms, choices: ChoicesInput, parentName }`, or null (none, unreadable, another shape). */
export function readDraft(uid, athleteId, storage) {
  try {
    const raw = storeOf(storage).getItem(draftKey(uid, athleteId));
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d === 'object' && d.v === DRAFT_V ? d : null;
  } catch (err) {
    return null;
  }
}

export function writeDraft(uid, athleteId, draft, storage) {
  try {
    storeOf(storage).setItem(draftKey(uid, athleteId), JSON.stringify(draft));
  } catch (err) {
    // A private window or blocked storage: the parent's part is simply not kept.
  }
}

export function clearDraft(uid, athleteId, storage) {
  try {
    storeOf(storage).removeItem(draftKey(uid, athleteId));
  } catch (err) {
    // Nothing to clear where storage is blocked.
  }
}

/** 'fresh' | 'expired' (older than 7 days) | 'version-changed' | 'adult-changed' (the athlete is 18 now) | null (no draft). */
export function draftState(draft, { version, adultNow, nowMs }) {
  if (!draft || draft.v !== DRAFT_V) return null;
  if (adultNow) return 'adult-changed';
  if (!(nowMs - draft.savedAt <= DRAFT_TTL_DAYS * DAY_MS)) return 'expired';
  return draft.version === version ? 'fresh' : 'version-changed';
}

/* ------------------------------------------------------------ the state -- */

const emptyAssent = () => ({ audio: null, agreed: false, name: '', readAloud: false });

function contactOf(c, { minor }) {
  const k = c || {};
  const sameAsParent = Boolean(c) && minor && blank(k.name) && blank(k.phone);
  return { name: str(k.name), phone: str(k.phone), relationship: str(k.relationship), sameAsParent };
}

function choicesOf(c, parentName) {
  const k = c || {};
  return {
    location: k.location ?? null,
    audio: typeof k.audio === 'boolean' ? k.audio : null,
    driving: typeof k.driving === 'boolean' ? k.driving : null,
    parentSessions: typeof k.parentSessions === 'boolean' ? k.parentSessions : null,
    parentName: str(k.parentName ?? parentName),
  };
}

/**
 * The flow's first state. `contact` prefills the emergency contact (the
 * household's, when it has one); `parentName` the 18+ parent-session name.
 * A 'fresh' draft resumes at the signature, its name filled and unticked;
 * 'version-changed' restarts at the agreement with the draft's choices;
 * 'adult-changed' and 'expired' start at step 1 without it.
 */
export function initialFlow({ branch, drivingAsked = false, under13 = false, firstName = '', contact = null, parentName = '', draft = null, draftState: ds = null }) {
  const minor = branch === 'minor';
  const base = {
    branch, steps: STEPS[branch] || ['who'], step: 'who', locked: false, readToEnd: false,
    contact: contactOf(contact, { minor: false }), choices: choicesOf(null, parentName), signature: { agreed: false, name: '' }, assent: emptyAssent(),
    drivingAsked: Boolean(drivingAsked), under13: Boolean(under13), firstName, resumed: false, notice: null,
  };
  if (ds === 'adult-changed') return { ...base, notice: `${firstName} is 18 now, so ${firstName} signs this for themself.` };
  if (!draft || (ds !== 'fresh' && ds !== 'version-changed')) return base;
  const resumed = {
    ...base, resumed: true,
    contact: contactOf(draft.choices?.emergencyContact ?? {}, { minor }),
    choices: choicesOf(draft.choices, parentName),
    signature: { agreed: false, name: str(draft.parentName) },
  };
  if (ds === 'fresh') return { ...resumed, step: 'signature', readToEnd: true };
  return { ...resumed, step: 'agreement', notice: 'The form was updated since you started, so please read it again.' };
}

function setIn(state, path, value) {
  const [head, key] = path.split('.');
  if (!key) return { ...state, [head]: value };
  const max = MAX[path];
  const v = max && typeof value === 'string' ? value.slice(0, max) : value;
  return { ...state, [head]: { ...state[head], [key]: v } };
}

/** Actions: { type: 'set', path, value } | 'next' | 'back' | 'readToEnd' | 'unlock'. */
export function flowReducer(state, action) {
  switch (action?.type) {
    case 'set':
      if (state.locked && LOCKED.some((p) => action.path.startsWith(p))) return state; // the parent's answers, after the hand-over
      return setIn(state, action.path, action.value);
    case 'next': {
      const i = state.steps.indexOf(state.step);
      if (!canContinue(state).ok || i < 0 || i >= state.steps.length - 1) return state;
      const step = state.steps[i + 1];
      return { ...state, step, locked: state.locked || (state.branch === 'minor' && step === 'handover'), notice: null };
    }
    case 'back': {
      if (state.locked) return state.step === 'assent' ? { ...state, step: 'handover' } : state;
      const i = state.steps.indexOf(state.step);
      return i > 0 ? { ...state, step: state.steps[i - 1] } : state;
    }
    case 'readToEnd':
      return state.readToEnd ? state : { ...state, readToEnd: true };
    case 'unlock':
      return state.locked ? { ...state, step: 'signature', locked: false, signature: { ...state.signature, agreed: false }, assent: emptyAssent() } : state;
    default:
      return state;
  }
}

/* ---------------------------------------------------------- the checks -- */

function whoCheck(state) {
  const adult = isAdultBranch(state.branch);
  if (!adult && state.contact.sameAsParent) return OK;
  const first = Object.values(validateEmergencyContact(state.contact))[0];
  if (first) return { ok: false, reason: first };
  if (adult && (blank(state.contact.name) || blank(state.contact.phone))) return { ok: false, reason: 'Add an emergency contact name and mobile number.' };
  return OK;
}

function choicesCheck(state) {
  const c = state.choices;
  if (c.location == null || typeof c.audio !== 'boolean') return NOT_YET;
  if (isAdultBranch(state.branch)) return typeof c.parentSessions === 'boolean' && (!c.parentSessions || !blank(c.parentName)) ? OK : NOT_YET;
  return !state.drivingAsked || typeof c.driving === 'boolean' ? OK : NOT_YET;
}

/** `{ ok, reason }`: whether this step is complete; `reason` is the button's text while it is not, or null for plain "Continue". */
export function canContinue(state) {
  switch (state.step) {
    case 'who':
      return STEPS[state.branch] ? whoCheck(state) : NOT_YET;
    case 'agreement':
      return state.readToEnd ? OK : { ok: false, reason: 'Scroll to the end to continue' };
    case 'choices':
      return choicesCheck(state);
    case 'signature':
      return state.signature.agreed && !blank(state.signature.name) ? OK : NOT_YET;
    case 'handover':
      return OK;
    case 'assent':
      return typeof state.assent.audio === 'boolean' && state.assent.agreed && !blank(state.assent.name) ? OK : NOT_YET;
    default:
      return NOT_YET;
  }
}

/** 'Step n of N': 5 for a minor (the hand-over and the assent are both step 5), 4 at 18+ (the adult's hand-over is not counted). */
export function progressLabel(state) {
  const counted = state.steps.filter((s) => s !== 'handover');
  const i = state.steps.indexOf(state.step);
  const shown = state.step === 'handover' ? state.steps[i + 1] : state.step;
  return `Step ${Math.max(counted.indexOf(shown), 0) + 1} of ${counted.length}`;
}

/** The step whose button saves: the assent for a minor, the signature at 18+. */
export function savesHere(state) {
  return SAVE_STEP[state.branch] === state.step;
}

const firstFolded = (s) => str(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().split(/\s+/)[0] || '';

/** The athlete's typed name against their first name (first word, case and accents ignored); a mismatch warns, never blocks. */
export function nameMatches(typed, firstName) {
  const t = firstFolded(typed);
  return t !== '' && t === firstFolded(firstName);
}

/** The flow's answers as a ChoicesInput (data/mentalConsentWrites.js normalizes it). Same as parent, or an all-blank minor contact, is all null. */
export function choicesFromFlow(state) {
  const adult = isAdultBranch(state.branch);
  const c = state.choices;
  const k = state.contact;
  const same = !adult && (k.sameAsParent || (blank(k.name) && blank(k.phone) && blank(k.relationship)));
  return {
    location: c.location ?? null,
    audio: c.audio === true,
    driving: !adult && state.drivingAsked && typeof c.driving === 'boolean' ? c.driving : null,
    emergencyContact: same ? { name: null, phone: null, relationship: null } : { name: str(k.name).trim(), phone: str(k.phone).trim(), relationship: str(k.relationship).trim() || null },
    parentSessions: adult ? c.parentSessions === true : null,
    parentName: adult && c.parentSessions === true ? str(c.parentName).trim() : null,
  };
}

/** The athlete's section 9 answers; the read-aloud tick only under 13. */
export function assentFromFlow(state) {
  return { name: str(state.assent.name).trim(), audio: state.assent.audio === true, readAloud: state.under13 && state.assent.readAloud === true };
}

/** The draft "<Athlete> isn't here" keeps on this device. */
export function draftFromFlow(state, savedAt = Date.now()) {
  return { v: DRAFT_V, version: CONSENT_VERSION, savedAt, choices: choicesFromFlow(state), parentName: str(state.signature.name) };
}

/**
 * Where Done and Back from step 1 go: one listed athlete (every athlete
 * login, a one-child family) -> the role home; more -> the list, which does
 * not auto-open again (`state.from === 'flow'`).
 */
export function consentExit({ viewer, listCount }) {
  if (listCount > 1) return { to: '/portal/consent/mental', state: { from: 'flow' } };
  return { to: viewer === 'athlete' ? '/portal/home' : '/portal/family', state: null };
}
