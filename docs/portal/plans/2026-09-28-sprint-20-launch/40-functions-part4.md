# Functions - Sprint 20 Implementation Plan (part 4: Task 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read `40-functions.md` first: its Goal, Architecture, Global Constraints, Execution order and emulator command apply here unchanged. The split (matching the table in `40-functions.md`): `part4` Task 8 (`family.js`: createFamily / addAthletes / claimInvite), `part5` Task 9 (`checkout.js`), `part6` + `part6b` Task 10 (`calendly.js`, fixtures, harness), `part7` Tasks 11-13 (`index.js` secret binding + exports, the owner runbook, the Stripe harness additions). Task 8 also creates `functions/portal/secrets.js`, which Tasks 9-11 consume.

Every task below assumes Tasks 1-7 have landed: `lib.ageAt`, `lib.chicagoTime`, `lib.bookingOpen`, `lib.todayISO` (`lib.js:66`), `prepaid.prepaidPeriodFor`, `catalogue.priceIdFor` / `FACILITY_KEY`, `tiny.js` (the unit runner), and the reworked `stripe.js`.

---

### Task 8: family.js - createFamily, addAthletes, claimInvite (closes #16)

**Files:**
- Create: `functions/portal/secrets.js`, `functions/portal/family-validate.js`, `functions/portal/family-validate.test.js`, `functions/portal/family.js`, `functions/test/verify-family.js`
- Test: `functions/portal/family-validate.test.js` (unit, `node`), `functions/test/verify-family.js` (isolated emulator)

**Interfaces:**
- Consumes: `lib.ageAt`, `lib.todayISO` (`lib.js:66`); `functions.https.HttpsError(code, message, {reason})` (`node_modules/firebase-functions/lib/common/providers/https.js:72-82` - `details` is the third argument); `FieldValue.serverTimestamp` from `firebase-admin/firestore` (the modular import, `stripe.js:28-31` explains why).
- Produces: `secrets.MAIL_SECRETS = ['SMTP_USER', 'SMTP_PASS']`, `secrets.STRIPE_WEBHOOK_SECRETS`, `secrets.CHECKOUT_SECRETS`, `secrets.CALENDLY_SECRETS` (decision D4: the four secret-list constants live in `functions/portal/secrets.js`, not `index.js`, so `promotion.js`, `stripe.js`, `checkout.js`, `calendly.js` and `index.js` bind the SAME lists; `index.js` requires `MAIL_SECRETS` in Task 11 and never re-exports anything but the 13 functions); `validate.validateFamilyPayload(data, {todayISO}) -> normalized payload`; `validate.validateAddAthletesPayload(data, {todayISO, guardianEmail})`; `validate.normalizeAthletes(list, {todayISO, guardianEmail, mode})`; `class ValidationError {code, reason}`; `validate.lower(s)`; handlers `createFamilyHandler(data, context, deps) -> {householdId, athleteIds}`, `addAthletesHandler(data, context, deps) -> {householdId, athleteIds}`, `claimInviteHandler(data, context, deps) -> {state, householdId, athleteId}` with `deps = {db?, now?}`; callables `createFamily`, `addAthletes`, `claimInvite` (`https.onCall`, no secrets).
- Reason strings, all in contract 1.2-1.4 (decision D7): `invalid-argument` / `athlete-name-required` (an athlete with a blank name; `createFamily` and `addAthletes`); `invalid-argument` / `child-email-duplicate` fires for two athletes sharing one email AND, in BOTH `createFamily` and `addAthletes`, against an existing OPEN `loginInvites/{email}` (keyed by email, so a second family could otherwise overwrite another family's open invite). `claimInvite` returns `householdId` / `athleteId` only on `state: 'claimed'` (nulls otherwise).

- [ ] **Step 1: Write `functions/portal/secrets.js`**

```js
/**
 * Secret NAMES bound per function with `.runWith({secrets})` (contract 6.4,
 * spec 8, decision D4: this module is the one source; index.js requires it
 * and exports only functions). 1st-gen functions only see a secret they
 * declare; a declared secret that does not exist in Secret Manager fails
 * the deploy, which is why COURIER_AUTH_TOKEN is not listed. Values never
 * appear in the repo.
 */
'use strict';

/** The SMTP path (`email.js:51-53`). @const {!Array<string>} */
const MAIL_SECRETS = ['SMTP_USER', 'SMTP_PASS'];
/** `revoke.js` sends from inside the webhook. @const {!Array<string>} */
const STRIPE_WEBHOOK_SECRETS = [
  'STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', ...MAIL_SECRETS,
];
/** @const {!Array<string>} */
const CHECKOUT_SECRETS = ['STRIPE_SECRET_KEY'];
/** @const {!Array<string>} */
const CALENDLY_SECRETS = ['CALENDLY_WEBHOOK_SIGNING_KEY'];

module.exports = {
  CALENDLY_SECRETS, CHECKOUT_SECRETS, MAIL_SECRETS, STRIPE_WEBHOOK_SECRETS,
};
```

- [ ] **Step 2: Write the failing unit test** `functions/portal/family-validate.test.js`

```js
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const v = require('./family-validate');

const TODAY = '2026-10-01';
const kid = (over) => Object.assign({name: 'Jordan', dob: '2012-06-17',
  packageId: 't-12', contractMinutes: 45, handicap: 12,
  loginEmail: ' Jordan@Email.com '}, over);
const base = () => ({
  mode: 'parent',
  contact: {name: ' Dana Whitfield ', email: 'dana@email.com',
    phone: '(612) 555-0148', relationship: 'Mother'},
  athletes: [kid(), kid({name: 'Reese', dob: '2014-03-02', packageId: 't-6',
    contractMinutes: null, handicap: null, loginEmail: null})],
  emergencyContact: '  ',
  medical: 'Peanut allergy',
  consents: {dataCollection: true, videoCapture: true, mediaRelease: false,
    facilityAccess: true},
  signatureName: 'Dana Whitfield',
});

/**
 * @param {!Object} payload The body.
 * @param {string} reason The expected `reason`.
 * @param {string=} code The expected HttpsError code.
 */
function refuses(payload, reason, code) {
  assert.throws(() => v.validateFamilyPayload(payload, {todayISO: TODAY}),
      (e) => e instanceof v.ValidationError && e.reason === reason &&
        e.code === (code || 'invalid-argument'), reason);
}

test('happy path normalizes: trims, lower-cases child email, nulls', () => {
  const p = v.validateFamilyPayload(base(), {todayISO: TODAY});
  assert.deepEqual(p.contact, {name: 'Dana Whitfield', email: 'dana@email.com',
    phone: '(612) 555-0148', relationship: 'Mother'});
  assert.deepEqual(p.athletes[0], {name: 'Jordan', dob: '2012-06-17',
    packageId: 't-12', contractMinutes: 45, handicap: 12,
    loginEmail: 'jordan@email.com'});
  assert.deepEqual(p.athletes[1].loginEmail, null);
  assert.deepEqual([p.emergencyContact, p.medical, p.signatureName],
      [null, 'Peanut allergy', 'Dana Whitfield']);
  assert.deepEqual(p.consents, {dataCollection: true, videoCapture: true,
    mediaRelease: false, facilityAccess: true});
});

test('athlete mode: exactly one adult, loginEmail forced null', () => {
  const adult = Object.assign(base(), {mode: 'athlete',
    athletes: [kid({dob: '2000-01-01', loginEmail: 'me@x.com'})]});
  const p = v.validateFamilyPayload(adult, {todayISO: TODAY});
  assert.equal(p.contact.relationship, null);
  assert.equal(p.athletes[0].loginEmail, null);
  refuses(Object.assign(base(), {mode: 'athlete'}), 'athlete-count');
  refuses(Object.assign(base(), {mode: 'athlete',
    athletes: [kid({dob: '2008-10-02'})]}), 'athlete-under-18');
  const p2 = v.validateFamilyPayload(Object.assign(base(), {mode: 'athlete',
    athletes: [kid({dob: '2008-10-01'})]}), {todayISO: TODAY});
  assert.equal(p2.athletes[0].dob, '2008-10-01');
});

test('every refusal, in the contract order', () => {
  refuses(Object.assign(base(), {mode: 'staff'}), 'invalid-mode');
  refuses(Object.assign(base(), {contact: {name: 'x', email: '', phone: 'y'}}),
      'contact-required');
  refuses(Object.assign(base(), {athletes: []}), 'athlete-count');
  refuses(Object.assign(base(), {athletes: [kid({name: ' '})]}),
      'athlete-name-required');
  refuses(Object.assign(base(), {athletes: [kid({dob: '2027-01-01'})]}),
      'dob-invalid');
  refuses(Object.assign(base(), {athletes: [kid({dob: '2012-13-45'})]}),
      'dob-invalid');
  refuses(Object.assign(base(), {athletes: [kid({packageId: 't-20'})]}),
      'unknown-package');
  refuses(Object.assign(base(), {athletes: [kid({contractMinutes: 95})]}),
      'contract-tier');
  refuses(Object.assign(base(), {athletes: [kid({handicap: 55})]}),
      'handicap-range');
  refuses(Object.assign(base(), {athletes: [kid({handicap: 12.5})]}),
      'handicap-range');
  refuses(Object.assign(base(), {athletes: [kid({loginEmail: 'nope'})]}),
      'child-email-invalid');
  refuses(Object.assign(base(),
      {athletes: [kid({loginEmail: 'DANA@email.com'})]}),
  'child-email-is-guardian');
  refuses(Object.assign(base(), {athletes: [kid(), kid({name: 'B',
    loginEmail: 'JORDAN@email.com'})]}), 'child-email-duplicate');
  refuses(Object.assign(base(), {consents: {dataCollection: true,
    videoCapture: false}}), 'consents-required');
  refuses(Object.assign(base(), {signatureName: ''}), 'consents-required');
});

test('addAthletes payload: guardian email from the household', () => {
  const p = v.validateAddAthletesPayload({athletes: [kid()], medical: ' x '},
      {todayISO: TODAY, guardianEmail: 'Dana@Email.com'});
  assert.deepEqual([p.athletes.length, p.medical], [1, 'x']);
  assert.throws(() => v.validateAddAthletesPayload(
      {athletes: [kid({loginEmail: 'dana@email.com'})]},
      {todayISO: TODAY, guardianEmail: 'Dana@Email.com'}),
  (e) => e.reason === 'child-email-is-guardian');
});

run();
```

Run: `cd functions && node portal/family-validate.test.js`
Expected: `Cannot find module './family-validate'`.

- [ ] **Step 3: Implement `functions/portal/family-validate.js`**

```js
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

/** @param {*} s Anything. @return {string} Trimmed; '' for null. */
function str(s) {
  return s === null || s === undefined ? '' : String(s).trim();
}

/** @param {*} s An email. @return {string} Trimmed and lower-cased. */
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
 * child-email-is-guardian.
 * @param {*} a The raw entry.
 * @param {{todayISO: string, guardianEmail: string, mode: string}} opts
 *     Chicago today, the guardian's email (lower-cased) and the mode.
 * @return {{name: string, dob: string, packageId: string,
 *     contractMinutes: ?number, handicap: ?number, loginEmail: ?string}}
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
  return {name, dob, packageId: e.packageId, contractMinutes: minutes,
    handicap, loginEmail};
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
 * The createFamily payload (contract 1.2), normalized.
 * @param {*} data The request body.
 * @param {{todayISO: string}} opts Chicago today.
 * @return {{mode: string, contact: !Object, athletes: !Array<!Object>,
 *     emergencyContact: ?string, medical: ?string, consents: !Object,
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
  if (!contact.name || !contact.email || !contact.phone) {
    throw new ValidationError('contact-required',
        'Name, email and phone are all required.');
  }
  const athletes = normalizeAthletes(d.athletes, {todayISO: opts.todayISO,
    guardianEmail: lower(contact.email), mode: d.mode});
  const consents = d.consents || {};
  const signatureName = str(d.signatureName);
  if (consents.dataCollection !== true || consents.videoCapture !== true ||
      !signatureName) {
    throw new ValidationError('consents-required',
        'The required consents and your signature are needed to finish.');
  }
  return {
    mode: d.mode, contact, athletes,
    emergencyContact: str(d.emergencyContact) || null,
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
 * @return {{athletes: !Array<!Object>, medical: ?string}} Normalized.
 */
function validateAddAthletesPayload(data, opts) {
  const d = data || {};
  return {
    athletes: normalizeAthletes(d.athletes, {todayISO: opts.todayISO,
      guardianEmail: lower(opts.guardianEmail), mode: 'parent'}),
    medical: str(d.medical) || null,
  };
}

module.exports = {
  ADULT_AGE, EMAIL_RE, PACKAGE_IDS, TIER_MINUTES, ValidationError, lower,
  normalizeAthlete, normalizeAthletes, validateAddAthletesPayload,
  validateFamilyPayload,
};
```

- [ ] **Step 4: Run**

Run: `cd functions && node portal/family-validate.test.js && npm run lint`
Expected: `4 passing`, lint clean.

- [ ] **Step 5: Implement `functions/portal/family.js`**

```js
/**
 * Instant sign-up (spec 2.2-2.3) and the child-login claim (spec 3.2):
 * createFamily, addAthletes, claimInvite. Each callable is a thin
 * `https.onCall` around an exported handler `(data, context, deps)` so
 * test/verify-family.js calls it in-process against the isolated Firestore
 * emulator. One Admin-SDK transaction per call (the browser cannot pass the
 * rules' document-read cap for a normal family, spec 2); the client rules
 * for creating households / users / loginInvites stay denied.
 */
'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
// Modular import on purpose - see the note in portal/stripe.js:28-31.
const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const validate = require('./family-validate');

const {HttpsError} = functions.https;

/** @return {!Object} The admin Firestore, resolved lazily. */
function db() {
  return admin.firestore();
}

/** @return {!Object} A server timestamp sentinel. */
function now() {
  return FieldValue.serverTimestamp();
}

/**
 * The signed-in caller, or `unauthenticated` / `signed-out`.
 * @param {!Object} context The callable context.
 * @return {{uid: string, token: !Object}} Auth facts.
 */
function requireAuth(context) {
  const auth = context && context.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.',
        {reason: 'signed-out'});
  }
  return {uid: auth.uid, token: auth.token || {}};
}

/**
 * "Whitfield family" from the guardian's name (`live.js:1333-1336`).
 * @param {string} guardianName The contact name.
 * @return {string} The household name.
 */
function householdNameFor(guardianName) {
  const surname = String(guardianName || '').trim().split(/\s+/).pop();
  return surname ? `${surname} family` : 'New family';
}

/**
 * The `athletes/{id}` body of the spec 2.2 table.
 * @param {!Object} a A normalized athlete entry.
 * @param {string} householdId The household.
 * @param {string} uid The caller (signs the facility waiver).
 * @param {boolean} facilityConsent `consents.facilityAccess`.
 * @return {!Object} The document body.
 */
function athleteDoc(a, householdId, uid, facilityConsent) {
  return {
    name: a.name, dob: a.dob, householdId, packageId: a.packageId,
    contractMinutes: a.contractMinutes, coachId: null, facilityAccess: false,
    facilityAccessConsent: facilityConsent ?
        {signedAt: now(), byUid: uid} : null,
    handicap: a.handicap, loginEmail: a.loginEmail,
    billing: {status: 'pending', customerId: null, subscriptionId: null,
      priceId: null, checkoutSessionId: null, updatedAt: now()},
    updatedAt: now(),
  };
}

/**
 * `athletes/{id}/private/medical` as the approval batch wrote it
 * (`live.js:1362-1368`), or null when there is nothing to record.
 * @param {?string} emergencyContact The household emergency contact.
 * @param {?string} medical The household medical note.
 * @return {?Object} The body or null.
 */
function medicalDoc(emergencyContact, medical) {
  if (!emergencyContact && !medical) return null;
  return {
    emergencyContact: {name: emergencyContact || null, phone: null,
      relationship: null},
    medicalNotes: medical || null,
    updatedAt: now(),
  };
}

/**
 * Refuse a child email that already has an OPEN invite (another family's,
 * or a retry). A transaction read; the caller has not written yet.
 * @param {!Object} tx The transaction.
 * @param {!Object} store Firestore.
 * @param {!Array<!Object>} athletes Normalized entries.
 * @return {!Promise<void>} Rejects with child-email-duplicate.
 */
async function refuseOpenInvites(tx, store, athletes) {
  for (const a of athletes) {
    if (!a.loginEmail) continue;
    const snap = await tx.get(
        store.collection('loginInvites').doc(a.loginEmail));
    if (snap.exists && (snap.data() || {}).status === 'open') {
      throw new HttpsError('invalid-argument',
          'That email already has a pending athlete login.',
          {reason: 'child-email-duplicate'});
    }
  }
}

/**
 * Athletes (+ medical, + invites) into a household. Reads are done.
 * @param {!Object} tx The transaction.
 * @param {{store: !Object, householdId: string, uid: string,
 *     athletes: !Array<!Object>, emergencyContact: ?string,
 *     medical: ?string, facilityConsent: boolean}} args The writes.
 * @return {!Array<string>} The new athlete ids, in payload order.
 */
function writeAthletes(tx, args) {
  const ids = [];
  const med = medicalDoc(args.emergencyContact, args.medical);
  for (const a of args.athletes) {
    const ref = args.store.collection('athletes').doc();
    tx.set(ref, athleteDoc(a, args.householdId, args.uid,
        args.facilityConsent));
    if (med) tx.set(ref.collection('private').doc('medical'), med);
    if (a.loginEmail) {
      tx.set(args.store.collection('loginInvites').doc(a.loginEmail), {
        email: a.loginEmail, householdId: args.householdId,
        athleteId: ref.id, athleteName: a.name, requestedBy: 'guardian',
        createdBy: args.uid, createdAt: now(), status: 'open',
        claimedBy: null, claimedAt: null,
      });
    }
    ids.push(ref.id);
  }
  return ids;
}

/**
 * A validator refusal or a transaction failure as the callable's error.
 * @param {*} err What was thrown.
 * @return {!Error} An HttpsError.
 */
function toHttpsError(err) {
  if (err instanceof HttpsError) return err;
  if (err instanceof validate.ValidationError) {
    return new HttpsError(err.code, err.message, {reason: err.reason});
  }
  console.error('family write failed:', err);
  return new HttpsError('internal', 'Sign-up could not be saved. Try again.',
      {reason: 'write-failed'});
}

/**
 * createFamily (contract 1.2, spec 2.2). Checks, in order: signed in; no
 * users doc; no open invite for the caller's email; then the validator.
 * @param {*} data The request body.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), now: (Date|undefined)}=} deps
 *     Injectable Firestore and clock (the harness).
 * @return {!Promise<{householdId: string, athleteIds: !Array<string>}>}
 */
async function createFamilyHandler(data, context, deps) {
  const d = deps || {};
  const store = d.db || db();
  const {uid, token} = requireAuth(context);
  const todayISO = lib.todayISO(d.now);
  const userRef = store.collection('users').doc(uid);
  const provisioned = new HttpsError('already-exists',
      'This login is already set up.', {reason: 'already-provisioned'});
  try {
    if ((await userRef.get()).exists) throw provisioned;
    const callerEmail = validate.lower(token.email);
    if (callerEmail) {
      const inv = await store.collection('loginInvites').doc(callerEmail)
          .get();
      if (inv.exists && (inv.data() || {}).status === 'open') {
        throw new HttpsError('failed-precondition',
            'Your parent already enrolled you - sign in with this email ' +
            'and tap Check again.', {reason: 'invite-open'});
      }
    }
    const p = validate.validateFamilyPayload(data, {todayISO});
    return await store.runTransaction(async (tx) => {
      if ((await tx.get(userRef)).exists) throw provisioned;
      await refuseOpenInvites(tx, store, p.athletes);
      // ---- reads done ----
      const hhRef = store.collection('households').doc();
      tx.set(hhRef, {
        name: householdNameFor(p.contact.name),
        guardian: {name: p.contact.name, email: p.contact.email,
          phone: p.contact.phone, relationship: p.contact.relationship},
        stripeCustomerId: null, stripeSubscriptionId: null,
        stripeCustomerIds: [],
        signup: {at: now(), by: uid, source: 'self', mode: p.mode},
        createdBy: uid,
        emergencyContact: p.emergencyContact,
      });
      const athleteIds = writeAthletes(tx, {store, householdId: hhRef.id,
        uid, athletes: p.athletes, emergencyContact: p.emergencyContact,
        medical: p.medical, facilityConsent: p.consents.facilityAccess});
      tx.set(userRef, {
        role: p.mode === 'athlete' ? 'athlete' : 'parent',
        householdId: hhRef.id,
        athleteId: p.mode === 'athlete' ? athleteIds[0] : null,
        staff: false, specialistId: null,
        displayName: p.contact.name, email: p.contact.email,
      });
      return {householdId: hhRef.id, athleteIds};
    });
  } catch (err) {
    throw toHttpsError(err);
  }
}

/**
 * addAthletes (contract 1.3, spec 2.3): a parent adds athletes to
 * `me().householdId`. The facility waiver is ops-verified later, so
 * `facilityAccessConsent` is null here.
 * @param {*} data The request body.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), now: (Date|undefined)}=} deps Injectable.
 * @return {!Promise<{householdId: string, athleteIds: !Array<string>}>}
 */
async function addAthletesHandler(data, context, deps) {
  const d = deps || {};
  const store = d.db || db();
  const {uid} = requireAuth(context);
  const todayISO = lib.todayISO(d.now);
  try {
    const meSnap = await store.collection('users').doc(uid).get();
    const me = meSnap.exists ? meSnap.data() || {} : null;
    if (!me || me.role !== 'parent' || !me.householdId) {
      throw new HttpsError('permission-denied',
          'Only a parent account can add athletes.', {reason: 'not-parent'});
    }
    const hhRef = store.collection('households').doc(me.householdId);
    const hh = (await hhRef.get()).data() || {};
    const p = validate.validateAddAthletesPayload(data, {todayISO,
      guardianEmail: (hh.guardian && hh.guardian.email) || me.email || ''});
    return await store.runTransaction(async (tx) => {
      await refuseOpenInvites(tx, store, p.athletes);
      const athleteIds = writeAthletes(tx, {store, householdId: hhRef.id,
        uid, athletes: p.athletes, emergencyContact: hh.emergencyContact ||
        null, medical: p.medical, facilityConsent: false});
      return {householdId: hhRef.id, athleteIds};
    });
  } catch (err) {
    throw toHttpsError(err);
  }
}

/**
 * claimInvite (contract 1.4, spec 3.2). Never throws for an expected state.
 * @param {*} data Ignored (`{}`).
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined)}=} deps Injectable Firestore.
 * @return {!Promise<{state: string, householdId: ?string,
 *     athleteId: ?string}>} `claimed | needs-verification |
 *     already-claimed | none`; ids only on `claimed`.
 */
async function claimInviteHandler(data, context, deps) {
  const store = (deps && deps.db) || db();
  const {uid, token} = requireAuth(context);
  const email = validate.lower(token.email);
  if (!email) {
    throw new HttpsError('failed-precondition',
        'This account has no email address.', {reason: 'no-email'});
  }
  const none = {state: 'none', householdId: null, athleteId: null};
  try {
    return await store.runTransaction(async (tx) => {
      const invRef = store.collection('loginInvites').doc(email);
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists) return none;
      const inv = invSnap.data() || {};
      if (inv.status === 'claimed') {
        return {state: 'already-claimed', householdId: null, athleteId: null};
      }
      if (inv.status !== 'open' || !inv.athleteId) return none;
      const athSnap = await tx.get(
          store.collection('athletes').doc(inv.athleteId));
      if (!athSnap.exists) {
        tx.update(invRef, {status: 'orphaned'});
        return none;
      }
      if (token.email_verified !== true) {
        return {state: 'needs-verification', householdId: null,
          athleteId: null};
      }
      const athlete = athSnap.data() || {};
      const householdId = athlete.householdId || inv.householdId || null;
      // `create`, not `set`: a users doc for this uid is an unexpected
      // state (the client only calls when fetchCurrentUser is NOT_FOUND).
      tx.create(store.collection('users').doc(uid), {
        role: 'athlete', athleteId: inv.athleteId, householdId,
        staff: false, specialistId: null,
        displayName: inv.athleteName || athlete.name || null, email,
      });
      tx.update(invRef, {status: 'claimed', claimedBy: uid,
        claimedAt: now()});
      return {state: 'claimed', householdId, athleteId: inv.athleteId};
    });
  } catch (err) {
    throw toHttpsError(err);
  }
}

// Contract 6.4: these three bind no secret. `runWith({secrets: []})` rather
// than a bare `https.onCall` so `grep runWith` (spec 8) finds every function.
const createFamily = functions.runWith({secrets: []}).https.onCall(
    (data, context) => createFamilyHandler(data, context));
const addAthletes = functions.runWith({secrets: []}).https.onCall(
    (data, context) => addAthletesHandler(data, context));
const claimInvite = functions.runWith({secrets: []}).https.onCall(
    (data, context) => claimInviteHandler(data, context));

module.exports = {
  addAthletes, addAthletesHandler, claimInvite, claimInviteHandler,
  createFamily, createFamilyHandler, householdNameFor,
};
```

- [ ] **Step 6: Lint**

Run: `cd functions && npm run lint`
Expected: clean (`family.js` is ~290 lines).

- [ ] **Step 7: Write the emulator harness** `functions/test/verify-family.js` (in-process handler calls; the emulator only has to be running for Firestore on 8082)

```js
/* Sprint 20 createFamily / addAthletes / claimInvite harness - runs against
 * the ISOLATED emulator (firestore 8082, config firebase.functions-lane.json).
 * It WIPES and reseeds that instance; never point it at 8080.
 *   cd functions && npx firebase-tools emulators:start --only firestore,functions --project rypacad --config ../firebase.functions-lane.json
 *   node test/verify-family.js   (from functions/)
 * The handlers run in THIS process with a fabricated callable context, so no
 * Auth emulator and no HTTP: every refusal in contract 1.2-1.4 is asserted
 * on `err.code` and `err.details.reason`. */
'use strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082';
process.env.GCLOUD_PROJECT = 'rypacad';

const admin = require('firebase-admin');
const family = require('../portal/family.js');

admin.initializeApp({projectId: 'rypacad'});
const db = admin.firestore();

let failures = 0;
const log = (...a) => console.log(...a);
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { log(`    PASS  ${label} = ${a}`); }
  else { failures++; log(`    FAIL  ${label}\n          expected ${e}\n          actual   ${a}`); }
}
async function refused(label, promise, code, reason) {
  try {
    await promise;
    failures++; log(`    FAIL  ${label}: resolved instead of ${code}/${reason}`);
  } catch (e) {
    check(label, [e.code, e.details && e.details.reason], [code, reason]);
  }
}
async function get(col, id) {
  const s = await db.collection(col).doc(id).get();
  return s.exists ? s.data() : null;
}
async function exists(col, id) {
  return (await db.collection(col).doc(id).get()).exists;
}
async function wipe() {
  for (const c of ['households', 'athletes', 'packages', 'users', 'loginInvites']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}
const ctx = (uid, email, verified = true, provider = 'password') => ({
  auth: {uid, token: {email, email_verified: verified, firebase: {sign_in_provider: provider}}}});
const NOW = new Date('2026-10-01T18:00:00Z');
const deps = {db, now: NOW};
const kid = (over) => Object.assign({name: 'Lena Novak', dob: '2012-06-17', packageId: 't-6',
  contractMinutes: null, handicap: 20, loginEmail: null}, over);
const payload = (over) => Object.assign({
  mode: 'parent',
  contact: {name: 'Nina Novak', email: 'nina@example.test', phone: '+15550199', relationship: 'Mother'},
  athletes: [kid({loginEmail: 'Kid@Example.test'}), kid({name: 'Max Novak', dob: '2010-02-02', packageId: 'elite', handicap: null})],
  emergencyContact: 'Uncle Bo +15550100',
  medical: 'Peanut allergy',
  consents: {dataCollection: true, videoCapture: true, mediaRelease: true, facilityAccess: true},
  signatureName: 'Nina Novak',
}, over);

async function seed() {
  await wipe();
  const B = db.batch();
  const set = (c, id, d) => B.set(db.collection(c).doc(id), d);
  set('households', 'whitfield', {name: 'Whitfield family', guardian: {name: 'Dana', email: 'dana@example.test', phone: null}, emergencyContact: null});
  set('athletes', 'reese', {name: 'Reese', householdId: 'whitfield', packageId: 't-6', loginEmail: 'reese@example.test'});
  set('users', 'u-dana', {role: 'parent', householdId: 'whitfield', email: 'dana@example.test'});
  set('users', 'u-jordan', {role: 'athlete', athleteId: 'jordan', householdId: 'whitfield', email: 'jordan@example.test'});
  set('loginInvites', 'reese@example.test', {email: 'reese@example.test', householdId: 'whitfield', athleteId: 'reese', athleteName: 'Reese', requestedBy: 'guardian', createdBy: 'u-dana', createdAt: new Date(), status: 'open', claimedBy: null, claimedAt: null});
  set('loginInvites', 'ghost@example.test', {email: 'ghost@example.test', householdId: 'whitfield', athleteId: 'nobody', athleteName: 'Ghost', requestedBy: 'guardian', createdBy: 'u-dana', createdAt: new Date(), status: 'open', claimedBy: null, claimedAt: null});
  set('loginInvites', 'done@example.test', {email: 'done@example.test', householdId: 'whitfield', athleteId: 'reese', athleteName: 'Reese', requestedBy: 'guardian', createdBy: 'u-dana', createdAt: new Date(), status: 'claimed', claimedBy: 'u-old', claimedAt: new Date()});
  await B.commit();
}

async function main() {
  log('\n=== Sprint 20 family callables (isolated emulator, in-process) ===');
  await seed();

  log('STEP 1  createFamily happy path (parent, two athletes, one child login)');
  const r1 = await family.createFamilyHandler(payload(), ctx('u-nina', 'nina@example.test'), deps);
  check('athleteIds count', r1.athleteIds.length, 2);
  const hh = await get('households', r1.householdId);
  check('household', [hh.name, hh.guardian, hh.stripeCustomerId, hh.stripeSubscriptionId, hh.stripeCustomerIds, hh.createdBy, hh.emergencyContact, hh.signup.by, hh.signup.source, hh.signup.mode, !!hh.signup.at],
      ['Novak family', {name: 'Nina Novak', email: 'nina@example.test', phone: '+15550199', relationship: 'Mother'}, null, null, [], 'u-nina', 'Uncle Bo +15550100', 'u-nina', 'self', 'parent', true]);
  const [lenaId, maxId] = r1.athleteIds;
  const lena = await get('athletes', lenaId);
  check('lena athlete doc', [lena.name, lena.dob, lena.householdId, lena.packageId, lena.contractMinutes, lena.coachId, lena.facilityAccess, lena.handicap, lena.loginEmail, lena.billing.status, lena.billing.subscriptionId, !!lena.billing.updatedAt, !!lena.updatedAt, lena.facilityAccessConsent.byUid],
      ['Lena Novak', '2012-06-17', r1.householdId, 't-6', null, null, false, 20, 'kid@example.test', 'pending', null, true, true, 'u-nina']);
  check('lena billing shape', Object.keys(lena.billing).sort(), ['checkoutSessionId', 'customerId', 'priceId', 'status', 'subscriptionId', 'updatedAt']);
  check('max handicap null, no loginEmail', [(await get('athletes', maxId)).handicap, (await get('athletes', maxId)).loginEmail], [null, null]);
  const med = (await db.collection('athletes').doc(lenaId).collection('private').doc('medical').get()).data();
  check('private/medical on every athlete', [med.emergencyContact.name, med.medicalNotes, await (async () => (await db.collection('athletes').doc(maxId).collection('private').doc('medical').get()).exists)()], ['Uncle Bo +15550100', 'Peanut allergy', true]);
  check('users/u-nina', await get('users', 'u-nina'), {role: 'parent', householdId: r1.householdId, athleteId: null, staff: false, specialistId: null, displayName: 'Nina Novak', email: 'nina@example.test'});
  const inv = await get('loginInvites', 'kid@example.test');
  check('loginInvites/kid@example.test', [inv.email, inv.householdId, inv.athleteId, inv.athleteName, inv.requestedBy, inv.createdBy, inv.status, inv.claimedBy, inv.claimedAt, !!inv.createdAt],
      ['kid@example.test', r1.householdId, lenaId, 'Lena Novak', 'guardian', 'u-nina', 'open', null, null, true]);

  log('\nSTEP 2  createFamily refusals (contract 1.2 order)');
  await refused('signed-out', family.createFamilyHandler(payload(), {auth: null}, deps), 'unauthenticated', 'signed-out');
  await refused('already-provisioned', family.createFamilyHandler(payload(), ctx('u-nina', 'nina@example.test'), deps), 'already-exists', 'already-provisioned');
  await refused('invite-open (caller email has an open invite, any case)', family.createFamilyHandler(payload(), ctx('u-reese', 'Reese@Example.test'), deps), 'failed-precondition', 'invite-open');
  await refused('invalid-mode', family.createFamilyHandler(payload({mode: 'coach'}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'invalid-mode');
  await refused('contact-required', family.createFamilyHandler(payload({contact: {name: 'X', email: 'x@x.test', phone: ''}}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'contact-required');
  await refused('athlete-count', family.createFamilyHandler(payload({athletes: []}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'athlete-count');
  await refused('athlete-under-18', family.createFamilyHandler(payload({mode: 'athlete', athletes: [kid({dob: '2008-10-02'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'athlete-under-18');
  await refused('dob-invalid', family.createFamilyHandler(payload({athletes: [kid({dob: '2026-12-25'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'dob-invalid');
  await refused('unknown-package', family.createFamilyHandler(payload({athletes: [kid({packageId: 't-20'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'unknown-package');
  await refused('contract-tier', family.createFamilyHandler(payload({athletes: [kid({contractMinutes: 95})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'contract-tier');
  await refused('handicap-range', family.createFamilyHandler(payload({athletes: [kid({handicap: 55})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'handicap-range');
  await refused('child-email-invalid', family.createFamilyHandler(payload({athletes: [kid({loginEmail: 'nope'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'child-email-invalid');
  await refused('child-email-is-guardian', family.createFamilyHandler(payload({athletes: [kid({loginEmail: 'NINA@example.test'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'child-email-is-guardian');
  await refused('child-email-duplicate (within the payload)', family.createFamilyHandler(payload({athletes: [kid({loginEmail: 'a@b.test'}), kid({name: 'B', loginEmail: 'A@b.test'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'child-email-duplicate');
  await refused('child-email-duplicate (existing open invite)', family.createFamilyHandler(payload({athletes: [kid({loginEmail: 'kid@example.test'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'child-email-duplicate');
  await refused('consents-required', family.createFamilyHandler(payload({consents: {dataCollection: true, videoCapture: false}}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'consents-required');
  check('no stray household from a refused call', (await db.collection('households').get()).size, 2);
  check('no users doc for u-x1', await exists('users', 'u-x1'), false);

  log('\nSTEP 3  createFamily athlete mode (18+, self)');
  const r3 = await family.createFamilyHandler(payload({mode: 'athlete', contact: {name: 'Sam Reyes', email: 'sam@example.test', phone: '+15550111', relationship: null},
    athletes: [kid({name: 'Sam Reyes', dob: '2000-01-01', packageId: 't-12', loginEmail: 'ignored@example.test'})]}), ctx('u-sam', 'sam@example.test', true, 'google.com'), deps);
  check('users/u-sam is the athlete', await get('users', 'u-sam'), {role: 'athlete', householdId: r3.householdId, athleteId: r3.athleteIds[0], staff: false, specialistId: null, displayName: 'Sam Reyes', email: 'sam@example.test'});
  check('athlete mode: loginEmail null, relationship null, signup.mode', [(await get('athletes', r3.athleteIds[0])).loginEmail, (await get('households', r3.householdId)).guardian.relationship, (await get('households', r3.householdId)).signup.mode], [null, null, 'athlete']);
  check('no invite written in athlete mode', await exists('loginInvites', 'ignored@example.test'), false);

  log('\nSTEP 4  addAthletes');
  const r4 = await family.addAthletesHandler({athletes: [kid({name: 'Nico', dob: '2015-05-05', loginEmail: 'nico@example.test'})], medical: null}, ctx('u-dana', 'dana@example.test'), deps);
  check('lands in me().householdId', r4.householdId, 'whitfield');
  const nico = await get('athletes', r4.athleteIds[0]);
  check('nico doc', [nico.householdId, nico.billing.status, nico.loginEmail, nico.facilityAccessConsent], ['whitfield', 'pending', 'nico@example.test', null]);
  check('nico invite open', (await get('loginInvites', 'nico@example.test')).status, 'open');
  check('no medical doc when nothing to record', (await db.collection('athletes').doc(r4.athleteIds[0]).collection('private').doc('medical').get()).exists, false);
  await refused('not-parent (athlete account)', family.addAthletesHandler({athletes: [kid()]}, ctx('u-jordan', 'jordan@example.test'), deps), 'permission-denied', 'not-parent');
  await refused('not-parent (no users doc)', family.addAthletesHandler({athletes: [kid()]}, ctx('u-x2', 'x2@example.test'), deps), 'permission-denied', 'not-parent');
  await refused('child-email-is-guardian (household guardian)', family.addAthletesHandler({athletes: [kid({loginEmail: 'dana@example.test'})]}, ctx('u-dana', 'dana@example.test'), deps), 'invalid-argument', 'child-email-is-guardian');
  await refused('child-email-duplicate (open invite elsewhere)', family.addAthletesHandler({athletes: [kid({loginEmail: 'kid@example.test'})]}, ctx('u-dana', 'dana@example.test'), deps), 'invalid-argument', 'child-email-duplicate');

  log('\nSTEP 5  claimInvite states');
  check('none (stranger)', await family.claimInviteHandler({}, ctx('u-str', 'stranger@example.test'), deps), {state: 'none', householdId: null, athleteId: null});
  check('needs-verification (open, unverified) writes nothing', [await family.claimInviteHandler({}, ctx('u-kid', 'KID@example.test', false), deps), await exists('users', 'u-kid')], [{state: 'needs-verification', householdId: null, athleteId: null}, false]);
  check('claimed (open, verified)', await family.claimInviteHandler({}, ctx('u-kid', 'KID@example.test', true), deps), {state: 'claimed', householdId: r1.householdId, athleteId: lenaId});
  check('users/u-kid', await get('users', 'u-kid'), {role: 'athlete', athleteId: lenaId, householdId: r1.householdId, staff: false, specialistId: null, displayName: 'Lena Novak', email: 'kid@example.test'});
  const claimed = await get('loginInvites', 'kid@example.test');
  check('invite flipped', [claimed.status, claimed.claimedBy, !!claimed.claimedAt], ['claimed', 'u-kid', true]);
  check('already-claimed (second uid, same email)', await family.claimInviteHandler({}, ctx('u-kid2', 'kid@example.test', true), deps), {state: 'already-claimed', householdId: null, athleteId: null});
  check('already-claimed (seeded)', (await family.claimInviteHandler({}, ctx('u-d', 'done@example.test', true), deps)).state, 'already-claimed');
  check('orphaned: none + status flip', [(await family.claimInviteHandler({}, ctx('u-g', 'ghost@example.test', true), deps)).state, (await get('loginInvites', 'ghost@example.test')).status], ['none', 'orphaned']);
  check('orphaned invite stays none afterwards', (await family.claimInviteHandler({}, ctx('u-g', 'ghost@example.test', true), deps)).state, 'none');
  await refused('no-email (emulator custom token)', family.claimInviteHandler({}, {auth: {uid: 'u-anon', token: {}}}, deps), 'failed-precondition', 'no-email');
  await refused('signed-out', family.claimInviteHandler({}, {}, deps), 'unauthenticated', 'signed-out');

  log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 8: Run the harness**

Run (emulator up per the command in `40-functions.md`): `cd functions && node test/verify-family.js`
Expected: `ALL CHECKS PASSED` (49 checks). Then `node test/verify-lane.js` still ends `ALL CHECKS PASSED` (it reseeds; `verify-family.js` does not touch `bookings` / `sessions`, but run it anyway - the harnesses share one instance).

- [ ] **Step 9: Commit**

```bash
git add functions/portal/secrets.js functions/portal/family-validate.js functions/portal/family-validate.test.js functions/portal/family.js functions/test/verify-family.js
git commit -m "feat(functions): createFamily, addAthletes, claimInvite callables + validator + harness" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
Continue with `40-functions-part5.md` (Task 9, `createCheckoutSession`).
