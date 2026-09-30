/**
 * Pure payload validation for createFamily / addAthletes (contract 1.2-1.3).
 * No Firestore and no clock: `todayISO` is injected so the 18+ check is
 * testable on any day. Every refusal is a ValidationError carrying the
 * HttpsError code and the contract's `reason`, thrown in the contract's
 * order. Mirrors `frontend/src/portal/data/signup.js` (frontend Task 2).
 */
'use strict';

const lib = require('./lib');

/** `ALL_PACKAGES` ids (`data/packages.js:41-62`). @const {!Array<string>} */
const PACKAGE_IDS = ['t-6', 't-12', 't-16', 'elite', 'single'];
/** The tiers the client accepts (`live.js:1451`). @const {!Array<number>} */
const TIER_MINUTES = [20, 45, 90];
/** `Registration.js:66`. @const {!RegExp} */
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;
/** @const {number} */
const ADULT_AGE = 18;
const HANDICAP_MIN = 0;
const HANDICAP_MAX = 54;
const MODES = ['parent', 'athlete'];
/** The users.phone rule's cap (`firestore.rules`, `live.js#saveMyPhone`). */
const PHONE_MAX = 32;

/** A refused payload. */
class ValidationError extends Error {
  /**
   * @param {string} reason The contract's `details.reason`.
   * @param {string} message Plain-language copy for the form.
   * @param {string=} code HttpsError code; default 'invalid-argument'.
   */
  constructor(reason, message, code) {
    super(message);
    this.reason = reason;
    this.code = code || 'invalid-argument';
  }
}

/**
 * @param {*} s Anything.
 * @return {string} Trimmed; '' for null.
 */
function str(s) {
  return s === null || s === undefined ? '' : String(s).trim();
}

/**
 * @param {*} s An email.
 * @return {string} Trimmed and lower-cased.
 */
function lower(s) {
  return str(s).toLowerCase();
}

/**
 * A real calendar date (rejects 2012-13-45, which Date.UTC would roll).
 * @param {string} iso `'YYYY-MM-DD'`.
 * @return {boolean} True when it round-trips.
 */
function realDate(iso) {
  if (!DOB_RE.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * One athlete entry, normalized. Order: athlete-name-required, dob-invalid,
 * unknown-package, contract-tier, handicap-range, child-email-invalid,
 * child-email-is-guardian, facility-requested-invalid.
 * @param {*} a The raw entry.
 * @param {{todayISO: string, guardianEmail: string, mode: string}} opts
 *     Chicago today, the guardian's email (lower-cased) and the mode.
 * @return {{name: string, dob: string, packageId: string,
 *     contractMinutes: ?number, handicap: ?number, loginEmail: ?string,
 *     facilityRequested: boolean}}
 */
function normalizeAthlete(a, opts) {
  const e = a || {};
  const name = str(e.name);
  if (!name) {
    throw new ValidationError('athlete-name-required',
        'Athlete name is required.');
  }
  const dob = str(e.dob);
  if (!realDate(dob) || dob > opts.todayISO) {
    throw new ValidationError('dob-invalid',
        'Date of birth is required and cannot be in the future.');
  }
  if (!PACKAGE_IDS.includes(e.packageId)) {
    throw new ValidationError('unknown-package', 'Pick a package.');
  }
  const minutes = e.contractMinutes === undefined ? null : e.contractMinutes;
  if (minutes !== null && !TIER_MINUTES.includes(minutes)) {
    throw new ValidationError('contract-tier',
        'Pick 20, 45 or 90 minutes, or none.');
  }
  const handicap = e.handicap === undefined ? null : e.handicap;
  if (handicap !== null && !(Number.isInteger(handicap) &&
      handicap >= HANDICAP_MIN && handicap <= HANDICAP_MAX)) {
    throw new ValidationError('handicap-range',
        'Handicap is a whole number from 0 to 54, or leave it blank.');
  }
  let loginEmail = null;
  if (opts.mode === 'parent' && str(e.loginEmail) !== '') {
    loginEmail = lower(e.loginEmail);
    if (!EMAIL_RE.test(loginEmail)) {
      throw new ValidationError('child-email-invalid',
          'Enter the email the athlete will sign in with.');
    }
    if (loginEmail === opts.guardianEmail) {
      throw new ValidationError('child-email-is-guardian',
          'Use a different email from the guardian\'s.');
    }
  }
  // The facility add-on ticked under the package cards (owner request, Mike
  // 2026-09-30). Optional: a tab still on the bundle from before it omits
  // the field, which means not asked. Only a real boolean is taken.
  const facilityRequested = e.facilityRequested === undefined ? false :
      e.facilityRequested;
  if (typeof facilityRequested !== 'boolean') {
    throw new ValidationError('facility-requested-invalid',
        'Tick facility access or leave it unticked.');
  }
  return {name, dob, packageId: e.packageId, contractMinutes: minutes,
    handicap, loginEmail, facilityRequested};
}

/**
 * The athletes array as a set: count, the 18+ rule (athlete mode), each
 * entry, then child-email-duplicate across the set.
 * @param {*} athletes The raw array.
 * @param {{todayISO: string, guardianEmail: string, mode: string}} opts
 *     As for normalizeAthlete.
 * @return {!Array<!Object>} Normalized entries.
 */
function normalizeAthletes(athletes, opts) {
  const list = Array.isArray(athletes) ? athletes : [];
  if (list.length === 0 || (opts.mode === 'athlete' && list.length !== 1)) {
    throw new ValidationError('athlete-count', opts.mode === 'athlete' ?
        'Athlete sign-up is for yourself only.' :
        'Add at least one athlete.');
  }
  if (opts.mode === 'athlete') {
    const age = lib.ageAt(str(list[0] && list[0].dob), opts.todayISO);
    if (age !== null && age < ADULT_AGE) {
      throw new ValidationError('athlete-under-18',
          'Student sign-up is 18+. A parent or guardian needs to complete ' +
          'this for you.');
    }
  }
  const out = list.map((a) => normalizeAthlete(a, opts));
  const seen = new Set();
  for (const a of out) {
    if (!a.loginEmail) continue;
    if (seen.has(a.loginEmail)) {
      throw new ValidationError('child-email-duplicate',
          'Each athlete needs their own email.');
    }
    seen.add(a.loginEmail);
  }
  return out;
}

/**
 * The emergency contact (owner, 2026-09-30: its own mobile and relationship
 * fields). Optional as a block; once any field is filled, name and mobile
 * are both required. The pre-split string form (a tab still open on the old
 * bundle) is never refused: it becomes the name, as the medical doc always
 * stored it.
 * @param {*} raw `{name, phone, relationship}`, a string, or nothing.
 * @return {?{name: string, phone: ?string, relationship: ?string}} Trimmed,
 *     or null when blank.
 */
function normalizeEmergencyContact(raw) {
  const incomplete = () => new ValidationError('emergency-contact-incomplete',
      'Give the emergency contact a name and a mobile, or leave all three ' +
      'blank.');
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    const name = raw.trim();
    return name ? {name, phone: null, relationship: null} : null;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw incomplete();
  const text = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v !== 'string') throw incomplete();
    return v.trim();
  };
  const name = text(raw.name);
  const phone = text(raw.phone).slice(0, PHONE_MAX);
  const relationship = text(raw.relationship);
  if (!name && !phone && !relationship) return null;
  if (!name || !phone) throw incomplete();
  return {name, phone, relationship: relationship || null};
}

/**
 * A household's stored emergency contact, read tolerantly: the rules let a
 * parent write anything to the field, and pre-split households hold a
 * string. Never throws.
 * @param {*} v `households.emergencyContact`.
 * @return {?{name: ?string, phone: ?string, relationship: ?string}} The
 *     contact, or null when there is nothing usable.
 */
function storedEmergencyContact(v) {
  if (typeof v === 'string') {
    return v.trim() ? {name: v.trim(), phone: null, relationship: null} : null;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const pick = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
  const out = {name: pick(v.name), phone: pick(v.phone),
    relationship: pick(v.relationship)};
  return out.name || out.phone ? out : null;
}

/**
 * The createFamily payload (contract 1.2), normalized.
 * @param {*} data The request body.
 * @param {{todayISO: string}} opts Chicago today.
 * @return {{mode: string, contact: !Object, athletes: !Array<!Object>,
 *     emergencyContact: ?Object, medical: ?string, consents: !Object,
 *     signatureName: string}} Strings trimmed, child emails lower-cased.
 */
function validateFamilyPayload(data, opts) {
  const d = data || {};
  if (!MODES.includes(d.mode)) {
    throw new ValidationError('invalid-mode', 'Choose parent or athlete.');
  }
  const c = d.contact || {};
  const contact = {
    name: str(c.name), email: str(c.email), phone: str(c.phone),
    relationship: d.mode === 'parent' ? (str(c.relationship) || null) : null,
  };
  // The form runs the same regex; this is the boundary check - a malformed
  // guardian email would otherwise reach Stripe as customer_email and fail
  // at pay time, far from the field.
  if (!contact.name || !EMAIL_RE.test(contact.email) || !contact.phone) {
    throw new ValidationError('contact-required',
        'Name, a valid email and phone are all required.');
  }
  const athletes = normalizeAthletes(d.athletes, {todayISO: opts.todayISO,
    guardianEmail: lower(contact.email), mode: d.mode});
  const emergencyContact = normalizeEmergencyContact(d.emergencyContact);
  const consents = d.consents || {};
  const signatureName = str(d.signatureName);
  if (consents.dataCollection !== true || consents.videoCapture !== true ||
      !signatureName) {
    throw new ValidationError('consents-required',
        'The required consents and your signature are needed to finish.');
  }
  return {
    mode: d.mode, contact, athletes, emergencyContact,
    medical: str(d.medical) || null,
    consents: {dataCollection: true, videoCapture: true,
      mediaRelease: consents.mediaRelease === true,
      facilityAccess: consents.facilityAccess === true},
    signatureName,
  };
}

/**
 * The addAthletes payload (contract 1.3).
 * @param {*} data The request body.
 * @param {{todayISO: string, guardianEmail: string}} opts Chicago today and
 *     the household guardian's email (any case).
 * @return {{athletes: !Array<!Object>, emergencyContact: ?Object,
 *     medical: ?string}} Normalized; `emergencyContact` is optional (the
 *     handler falls back to the household's).
 */
function validateAddAthletesPayload(data, opts) {
  const d = data || {};
  const athletes = normalizeAthletes(d.athletes, {todayISO: opts.todayISO,
    guardianEmail: lower(opts.guardianEmail), mode: 'parent'});
  return {
    athletes,
    emergencyContact: normalizeEmergencyContact(d.emergencyContact),
    medical: str(d.medical) || null,
  };
}

module.exports = {
  ADULT_AGE, EMAIL_RE, PACKAGE_IDS, PHONE_MAX, TIER_MINUTES, ValidationError,
  lower, normalizeAthlete, normalizeAthletes, normalizeEmergencyContact,
  storedEmergencyContact, validateAddAthletesPayload, validateFamilyPayload,
};
