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
const facility = require('./facility');
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
 * Packages the facility add-on never goes with: Elite includes 24/7 access,
 * and the single token is a one-time purchase (checkout.js refuses the
 * add-on for Elite; the single token never reaches an active membership).
 * @const {!Array<string>}
 */
const NO_FACILITY_ADD_ON = ['elite', 'single'];

/**
 * The `athletes/{id}` body of the spec 2.2 table. A contract picked at
 * sign-up also records `contractStart`, the Chicago date it was picked: the
 * contract counts from the later of that and the season start.
 * `facilityRequested` is the add-on ticked under the package cards (owner
 * request, Mike 2026-09-30) - a request, never access: the home pending
 * card offers its checkout once the membership is paid. It is a FAMILY
 * add-on (owner ruling 2026-09-30): the handlers pass entries through
 * facility.js oneFacilityRequest first, so one athlete at most keeps it.
 * @param {!Object} a A normalized athlete entry.
 * @param {string} householdId The household.
 * @param {string} uid The caller (signs the facility waiver).
 * @param {boolean} facilityConsent `consents.facilityAccess`.
 * @param {string} todayISO Chicago today, `'YYYY-MM-DD'`.
 * @return {!Object} The document body.
 */
function athleteDoc(a, householdId, uid, facilityConsent, todayISO) {
  const doc = {
    name: a.name, dob: a.dob, householdId, packageId: a.packageId,
    contractMinutes: a.contractMinutes, coachId: null, facilityAccess: false,
    facilityAccessConsent: facilityConsent ?
        {signedAt: now(), byUid: uid} : null,
    handicap: a.handicap, loginEmail: a.loginEmail,
    // Coerced to false for Elite / the single token whatever was sent: the
    // form hides the tick there, but a stale tab or a hand-built call could
    // still send true, and the home card must never offer a $300 add-on on
    // a package that includes or cannot take it.
    facilityRequested: a.facilityRequested === true &&
        !NO_FACILITY_ADD_ON.includes(a.packageId),
    billing: {status: 'pending', customerId: null, subscriptionId: null,
      priceId: null, checkoutSessionId: null, updatedAt: now()},
    updatedAt: now(),
  };
  if (a.contractMinutes !== null) doc.contractStart = todayISO;
  return doc;
}

/**
 * `athletes/{id}/private/medical` in the approval batch's shape
 * (`live.js:1362-1368`), now with the contact's mobile and relationship
 * filled in, or null when there is nothing to record.
 * @param {?{name: ?string, phone: ?string, relationship: ?string}} ec The
 *     emergency contact.
 * @param {?string} medical The household medical note.
 * @return {?Object} The body or null.
 */
function medicalDoc(ec, medical) {
  if (!ec && !medical) return null;
  return {
    emergencyContact: {name: ec?.name ?? null, phone: ec?.phone ?? null,
      relationship: ec?.relationship ?? null},
    medicalNotes: medical || null,
    updatedAt: now(),
  };
}

/**
 * The caller's `users/{uid}` body. The sign-up mobile is copied here too so
 * Settings shows it; cut to the 32 characters the member-edit rule allows,
 * or every later self-edit of the doc would be refused.
 * @param {!Object} p The normalized createFamily payload.
 * @param {string} householdId The new household.
 * @param {!Array<string>} athleteIds The new athletes, in payload order.
 * @return {!Object} The document body.
 */
function userDocFor(p, householdId, athleteIds) {
  return {
    role: p.mode === 'athlete' ? 'athlete' : 'parent',
    householdId,
    athleteId: p.mode === 'athlete' ? athleteIds[0] : null,
    staff: false, specialistId: null,
    displayName: p.contact.name, email: p.contact.email,
    phone: p.contact.phone.slice(0, validate.PHONE_MAX),
  };
}

/**
 * Refuse a child email whose invite is open (another family's, or a retry)
 * or claimed (already a login). A transaction read; nothing written yet.
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
    const status = snap.exists ? (snap.data() || {}).status : null;
    // 'open': another athlete is waiting on it. 'claimed': the email IS an
    // athlete login already - writeAthletes would overwrite the claim and
    // the new invite could never be claimed. Only 'orphaned' is reusable.
    if (status === 'open' || status === 'claimed') {
      const message = status === 'open' ?
          'That email already has a pending athlete login.' :
          'That email already belongs to an athlete login.';
      throw new HttpsError('invalid-argument', message,
          {reason: 'child-email-duplicate'});
    }
  }
}

/**
 * Athletes (+ medical, + invites) into a household. Reads are done.
 * @param {!Object} tx The transaction.
 * @param {{store: !Object, householdId: string, uid: string,
 *     athletes: !Array<!Object>, emergencyContact: ?Object,
 *     medical: ?string, facilityConsent: boolean,
 *     todayISO: string}} args The writes.
 * @return {!Array<string>} The new athlete ids, in payload order.
 */
function writeAthletes(tx, args) {
  const ids = [];
  const med = medicalDoc(args.emergencyContact, args.medical);
  for (const a of args.athletes) {
    const ref = args.store.collection('athletes').doc();
    tx.set(ref, athleteDoc(a, args.householdId, args.uid,
        args.facilityConsent, args.todayISO));
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
        uid, athletes: facility.oneFacilityRequest(p.athletes),
        emergencyContact: p.emergencyContact,
        medical: p.medical, facilityConsent: p.consents.facilityAccess,
        todayISO});
      tx.set(userRef, userDocFor(p, hhRef.id, athleteIds));
      return {householdId: hhRef.id, athleteIds};
    });
  } catch (err) {
    throw toHttpsError(err);
  }
}

/**
 * addAthletes (contract 1.3, spec 2.3): a parent adds athletes to
 * `me().householdId`. The facility waiver is ops-verified later, so
 * `facilityAccessConsent` is null here. An emergency contact typed in the
 * form goes on the new athletes' medical docs only; without one they get
 * the household's (never overwritten here).
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
      // The family add-on: the athletes already here decide whether a
      // request is kept (an Elite athlete, a request or a paid add-on).
      const here = await tx.get(store.collection('athletes')
          .where('householdId', '==', hhRef.id));
      const athletes = facility.oneFacilityRequest(p.athletes,
          here.docs.map((doc) => doc.data()));
      const athleteIds = writeAthletes(tx, {store, householdId: hhRef.id,
        uid, athletes, emergencyContact: p.emergencyContact ||
        validate.storedEmergencyContact(hh.emergencyContact),
        medical: p.medical, facilityConsent: false, todayISO});
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
  addAthletes, addAthletesHandler, athleteDoc, claimInvite,
  claimInviteHandler, createFamily, createFamilyHandler, householdNameFor,
  medicalDoc, userDocFor,
};
