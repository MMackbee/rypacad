/**
 * moveBooking - a family moves one booking to another open session of the
 * same kind in one transaction (spec 2026-11-11 section 5; plan C2).
 *
 *   in   {bookingId: string, toSessionId: string}
 *   out  {bookingId, movedFrom, sessionId, periodKey, chargedFrom,
 *         graceTokenId, comp, rebooked}
 *
 * Two app writes could lose the seat between them (the waitlist takes it),
 * charge twice, trip the single-token guard and send two emails. Here every
 * read comes first, portal/move-decide.js decides (the same gates and
 * charge order a fresh booking or a promotion uses), and only then are the
 * writes buffered: the old row cancelled as `'moved'` (silent: the cancel
 * trigger only answers 'member' and 'session-cancelled'), its seat given
 * back (the sessions trigger offers it to the waitlist as for any cancel),
 * the new row and its seat, and the athlete's waitlist entry on the target.
 * A refusal is an HttpsError thrown inside the transaction, so nothing
 * commits.
 *
 * The callable sends no notice and binds no secret: a created row fires
 * onBookingCreated, and a re-confirmed one (the target row existed
 * cancelled) is noticed by onBookingCancelled's re-confirm branch. A slow
 * mail server can never turn a committed move into a failed call.
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
// See the note in portal/stripe.js: admin.firestore.FieldValue does not
// survive the Functions emulator's admin stub; the modular export does.
const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const {REFUSALS, decideMove} = require('./move-decide');

const {HttpsError} = functions.https;

/** Longest id accepted; real ids are far shorter. */
const MAX_ID_LENGTH = 200;
/** Stale cancel fields a moved-away row must not keep (C2 Writes). */
const STALE_CANCEL_FIELDS = ['cancelCategory', 'cancelNote', 'cancelledVia'];

/**
 * The typed refusal for one reason.
 * @param {string} reason A key of REFUSALS.
 * @return {!HttpsError} The error to throw.
 */
function refusal(reason) {
  const r = REFUSALS[reason];
  return new HttpsError(r.code, r.message, {reason});
}

/**
 * @param {*} id A request field.
 * @return {boolean} True for a 1..200 character id with no '/'.
 */
function goodId(id) {
  return typeof id === 'string' && id.length > 0 &&
      id.length <= MAX_ID_LENGTH && !id.includes('/');
}

/**
 * One document as `{id, ...data}`, or null when it does not exist.
 * @param {!Object} tx The transaction.
 * @param {!Object} ref A document reference.
 * @return {!Promise<?Object>} The row.
 */
async function rowOf(tx, ref) {
  const snap = await tx.get(ref);
  return snap.exists ? Object.assign({id: snap.id}, snap.data()) : null;
}

/**
 * Every read the move needs, in one transaction, before any write.
 * Missing documents are nulls; the decision refuses them.
 * @param {!Object} tx The transaction.
 * @param {!Object} store An admin Firestore.
 * @param {{uid: string, bookingId: string, toSessionId: string,
 *     now: !Date}} args The caller, the request and the clock.
 * @return {!Promise<!Object>} The ctx `decideMove` takes.
 */
async function loadMove(tx, store, args) {
  const {uid, bookingId, toSessionId, now} = args;
  const doc = (name, id) => rowOf(tx, store.collection(name).doc(id));
  const ctx = {uid, toSessionId, now, user: await doc('users', uid),
    old: await doc('bookings', bookingId), oldSession: null, target: null,
    targetBooking: null, targetLive: 0, athlete: null, household: null,
    pkg: null, tokenPeriod: null, periodBookings: [], graceSpends: [],
    waitlist: [], graceTokens: []};
  const old = ctx.old;
  if (!old || !old.athleteId) return Object.assign(ctx, {old: null});
  const athleteId = old.athleteId;
  if (old.sessionId) ctx.oldSession = await doc('sessions', old.sessionId);
  ctx.target = await doc('sessions', toSessionId);
  ctx.athlete = await doc('athletes', athleteId);
  const householdId = (ctx.athlete && ctx.athlete.householdId) ||
      old.householdId;
  if (householdId) ctx.household = await doc('households', householdId);
  const packageId = ctx.athlete && ctx.athlete.packageId;
  if (packageId) ctx.pkg = await doc('packages', packageId);
  if (!ctx.target) return ctx;

  ctx.targetBooking = await doc('bookings',
      lib.bookingId(athleteId, toSessionId));
  ctx.targetLive = lib.rows(await tx.get(store.collection('bookings')
      .where('sessionId', '==', toSessionId)))
      .filter((b) => b.status !== 'cancelled').length;
  const period = lib.periodFor(ctx.target.date,
      ctx.household && ctx.household.periodAnchorDay);
  ctx.tokenPeriod = await doc('tokenPeriods',
      lib.tokenPeriodId(athleteId, period.periodKey));
  ctx.periodBookings = lib.rows(await tx.get(
      lib.periodBookingsQuery(store, athleteId, period)));
  ctx.waitlist = lib.rows(await tx.get(store.collection('waitlist')
      .where('athleteId', '==', athleteId)));
  ctx.graceTokens = lib.rows(await tx.get(store.collection('graceTokens')
      .where('athleteId', '==', athleteId)));
  ctx.graceSpends = await lib.readGraceSpends((q) => tx.get(q),
      lib.graceSpendQueries(store, ctx.graceTokens, lib.chicagoDate(now)));
  return ctx;
}

/**
 * Buffer the move's writes (C2 Writes). Call only after every read.
 * @param {!Object} tx The transaction.
 * @param {!Object} store An admin Firestore.
 * @param {!Object} ctx From `loadMove`.
 * @param {!Object} decision An ok `decideMove` result.
 * @param {string} uid The caller.
 * @return {{newId: string, rebooked: boolean}} The new booking id, and
 *     whether a cancelled row was re-confirmed.
 */
function writeMove(tx, store, ctx, decision, uid) {
  const {old, oldSession, target} = ctx;
  const bookings = store.collection('bookings');
  const sessions = store.collection('sessions');
  const newId = lib.bookingId(old.athleteId, target.id);
  const cancel = {status: 'cancelled', cancelledBy: uid,
    cancelReason: 'moved', movedTo: newId,
    cancelledAt: FieldValue.serverTimestamp()};
  for (const k of STALE_CANCEL_FIELDS) {
    if (old[k] !== undefined) cancel[k] = FieldValue.delete();
  }
  tx.update(bookings.doc(old.id), cancel);
  tx.update(sessions.doc(oldSession.id),
      {booked: Math.max(0, (Number(oldSession.booked) || 0) - 1)});

  const row = {
    athleteId: old.athleteId,
    sessionId: target.id,
    householdId: old.householdId ||
        (ctx.athlete && ctx.athlete.householdId) || null,
    date: target.date,
    type: target.type || null,
    status: 'confirmed',
    periodKey: decision.period.periodKey,
    chargedFrom: decision.charge.chargedFrom,
    graceTokenId: decision.charge.graceTokenId,
    createdBy: uid,
    createdVia: 'move',
    movedFrom: old.id,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (decision.comp) {
    for (const k of Object.keys(old)) {
      if (k.startsWith('comp')) row[k] = old[k];
    }
  }
  const rebooked = Boolean(ctx.targetBooking);
  if (rebooked) {
    // A whole-document replace: no old cancel or comp field survives.
    row.rebookedAt = FieldValue.serverTimestamp();
    tx.set(bookings.doc(newId), row);
  } else {
    tx.create(bookings.doc(newId), row);
  }
  tx.update(sessions.doc(target.id), {booked: decision.taken + 1});
  if (decision.waitlistEntryId) {
    tx.delete(store.collection('waitlist').doc(decision.waitlistEntryId));
  }
  return {newId, rebooked};
}

/**
 * The callable's body, exported so the unit tests can call it in-process.
 * @param {*} data `{bookingId, toSessionId}`.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), now: (!Date|undefined)}=} deps The
 *     Firestore and the clock, injectable for tests.
 * @return {!Promise<!Object>} The moved booking (C2 response).
 */
async function moveBookingHandler(data, context, deps) {
  const auth = context && context.auth;
  if (!auth || !auth.uid) throw refusal('signed-out');
  const bookingId = data && data.bookingId;
  const toSessionId = data && data.toSessionId;
  if (!goodId(bookingId) || !goodId(toSessionId)) {
    throw refusal('bad-request');
  }
  const store = (deps && deps.db) || admin.firestore();
  const now = deps && deps.now instanceof Date ? deps.now : new Date();
  const uid = auth.uid;
  return store.runTransaction(async (tx) => {
    const ctx = await loadMove(tx, store,
        {uid, bookingId, toSessionId, now});
    // ---- every read happens above this line ----
    const decision = decideMove(ctx);
    if (!decision.ok) throw refusal(decision.reason);
    const {newId, rebooked} = writeMove(tx, store, ctx, decision, uid);
    return {
      bookingId: newId,
      movedFrom: ctx.old.id,
      sessionId: toSessionId,
      periodKey: decision.period.periodKey,
      chargedFrom: decision.charge.chargedFrom,
      graceTokenId: decision.charge.graceTokenId,
      comp: decision.comp,
      rebooked,
    };
  });
}

// Binds no secret: it sends no notice (the booking triggers do).
// `runWith({secrets: []})` like the other callables so `grep runWith`
// finds every function (portal/family.js).
const moveBooking = functions.runWith({secrets: []}).https.onCall(
    (data, context) => moveBookingHandler(data, context));

module.exports = {moveBooking, moveBookingHandler};
