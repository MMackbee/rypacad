/**
 * signDoorRules - a family login signs the facility door rules once
 * (spec 5.3, docs/portal/plans/2026-11-17-door-button/00-spec.md).
 *
 *   in   {name, termsVersion}
 *   out  {ok: true, termsVersion}
 *
 * The caller must be a parent or athlete login with a household; the
 * typed full name is 2-120 characters once trimmed; the version must be
 * the one this server enforces (DOOR_TERMS_VERSION), else the app is
 * showing older rules and is told to reload. Writes `doorRules/{uid}`
 * whole: {uid, householdId, athleteId, role, adult, name, termsVersion,
 * signedAt, signedAtMs}. `adult` is true for a parent, and for an athlete
 * login that is 18 or older on the Chicago day.
 *
 * Signing grants nothing by itself: unlockDoor still checks paid facility
 * access, age, a pause and (for a 16-17 athlete) a parent's signature.
 * No client writes doorRules; firestore.rules lets the signer and
 * owner/ops read it.
 */
'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
// See portal/staff-cancel.js: the modular export survives the emulator.
const {Timestamp} = require('firebase-admin/firestore');
const {ageAt, todayISO} = require('./lib');
const {ADULT_AGE, DOOR_TERMS_VERSION, FAMILY_ROLES, REFUSALS} =
    require('./door-decide');

const {HttpsError} = functions.https;

const NAME_MIN = 2;
const NAME_MAX = 120;

/**
 * @param {string} reason A key of REFUSALS.
 * @param {string=} message Copy in place of the usual.
 * @return {!HttpsError} The typed refusal.
 */
function refusal(reason, message) {
  const r = REFUSALS[reason];
  return new HttpsError(r.code, message || r.message, {reason});
}

/** @return {!Object} The admin Firestore. */
function defaultDb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

/**
 * The callable's body, exported so the unit tests can call it in-process.
 * @param {*} data `{name, termsVersion}`.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), now: (!Date|undefined)}=} deps The
 *     Firestore and the clock, injectable for tests.
 * @return {!Promise<{ok: boolean, termsVersion: string}>} Once written.
 */
async function signDoorRulesHandler(data, context, deps) {
  const auth = context && context.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to sign the door rules.',
        {reason: 'signed-out'});
  }
  const d = deps || {};
  const req = data && typeof data === 'object' ? data : {};
  const store = d.db || defaultDb();
  const now = d.now instanceof Date ? d.now : new Date();
  const uid = auth.uid;

  const userSnap = await store.collection('users').doc(uid).get();
  const user = userSnap.exists ? userSnap.data() || {} : null;
  if (!user || !FAMILY_ROLES.includes(user.role) || !user.householdId) {
    throw refusal('not-eligible');
  }
  const name = typeof req.name === 'string' ? req.name.trim() : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw refusal('bad-request', 'Type your full name to sign the door ' +
        'rules.');
  }
  if (req.termsVersion !== DOOR_TERMS_VERSION) throw refusal('stale-terms');

  let adult = user.role === 'parent';
  const athleteId = user.role === 'athlete' &&
      typeof user.athleteId === 'string' ? user.athleteId : null;
  if (athleteId) {
    const snap = await store.collection('athletes').doc(athleteId).get();
    const age = ageAt(snap.exists ? (snap.data() || {}).dob : null,
        todayISO(now));
    adult = Number.isFinite(age) && age >= ADULT_AGE;
  }
  const nowMs = now.getTime();
  await store.collection('doorRules').doc(uid).set({
    uid, householdId: user.householdId, athleteId, role: user.role, adult,
    name, termsVersion: DOOR_TERMS_VERSION,
    signedAt: Timestamp.fromMillis(nowMs), signedAtMs: nowMs,
  });
  console.log(`signDoorRules: ${uid} (${user.role}) signed ` +
      `${DOOR_TERMS_VERSION} for household ${user.householdId}`);
  return {ok: true, termsVersion: DOOR_TERMS_VERSION};
}

/** The callable. No secrets. */
const signDoorRules = functions.https.onCall((data, context) =>
  signDoorRulesHandler(data, context));

module.exports = {signDoorRules, signDoorRulesHandler};
