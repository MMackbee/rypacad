/**
 * staffCancelBooking - the owner or ops cancels one or more bookings of
 * one household on one session from the staff Billing view, in one
 * transaction (owner approved 2026-11-12).
 *
 *   in   {bookingIds: string[], category: string, note?: string}
 *   out  {sessionId, cancelled: [{bookingId, athleteId, cancelledFrom,
 *         tokenBack}]}
 *
 * Every read comes first (the caller's role, each booking, the session,
 * the household), portal/staff-cancel-decide.js decides, and only then are
 * the writes buffered: each booking cancelled with `cancelReason: 'staff'`
 * and `cancelledFrom` (what it was), and the session's `booked` lowered by
 * the number cancelled, floored at 0 - one read, one write, never an
 * increment sentinel (portal/revoke.js says why). A refusal is an
 * HttpsError thrown inside the transaction, so nothing commits: the
 * tapped booking and the ticked siblings go together or not at all.
 *
 * Silent by design. onBookingCancelled answers only 'member' and
 * 'session-cancelled' (and a no-show row was never 'confirmed', which it
 * also requires); onSingleTokenSpent answers only a spend, never a cancel;
 * no booking trigger mints a bonus token (that is the academy's
 * whole-session cancel, hooks/grace.js). The sessions trigger offers an
 * upcoming seat to the waitlist as for any cancel, and refuses a same-day
 * or past session (portal/promotion.js), so a past no-show promotes
 * nobody. portal/staff-cancel.test.js pins all of it.
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
// See the note in portal/stripe.js: admin.firestore.FieldValue does not
// survive the Functions emulator's admin stub; the modular export does.
const {FieldValue} = require('firebase-admin/firestore');
const {REFUSALS, decideStaffCancel, isStaff, parseRequest} =
    require('./staff-cancel-decide');

const {HttpsError} = functions.https;

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
 * Every read the cancel needs, in one transaction, before any write. A
 * caller who is not staff reads nothing more; missing documents are nulls
 * and the decision refuses them.
 * @param {!Object} tx The transaction.
 * @param {!Object} store An admin Firestore.
 * @param {{uid: string, bookingIds: !Array<string>}} args The caller and
 *     the bookings.
 * @return {!Promise<!Object>} The ctx `decideStaffCancel` takes (no clock).
 */
async function loadCancel(tx, store, args) {
  const doc = (name, id) => rowOf(tx, store.collection(name).doc(id));
  const ctx = {user: await doc('users', args.uid), bookings: [],
    session: null, household: null};
  if (!isStaff(ctx.user)) return ctx;
  for (const id of args.bookingIds) {
    ctx.bookings.push(await doc('bookings', id));
  }
  const first = ctx.bookings[0];
  if (ctx.bookings.some((b) => !b)) return ctx;
  if (first.sessionId) ctx.session = await doc('sessions', first.sessionId);
  if (first.householdId) {
    ctx.household = await doc('households', first.householdId);
  }
  return ctx;
}

/**
 * Buffer the cancel's writes. Call only after every read.
 * @param {!Object} tx The transaction.
 * @param {!Object} store An admin Firestore.
 * @param {!Object} ctx From `loadCancel`.
 * @param {!Object} decision An ok `decideStaffCancel` result.
 * @param {{uid: string, category: string, note: ?string}} args The caller
 *     and the reason.
 */
function writeCancel(tx, store, ctx, decision, args) {
  const bookings = store.collection('bookings');
  ctx.bookings.forEach((b, i) => {
    const row = {
      status: 'cancelled',
      cancelledBy: args.uid,
      cancelReason: 'staff',
      cancelCategory: args.category,
      // Only Other keeps a note; any earlier cancel's note goes.
      cancelNote: args.note === null ? FieldValue.delete() : args.note,
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledFrom: decision.cancelled[i].cancelledFrom,
    };
    // A series marker an older cancel left would read as a series week.
    if (b.cancelledVia !== undefined) row.cancelledVia = FieldValue.delete();
    tx.update(bookings.doc(b.id), row);
  });
  if (ctx.session && decision.booked !== null) {
    tx.update(store.collection('sessions').doc(ctx.session.id),
        {booked: decision.booked});
  }
}

/**
 * The callable's body, exported so the unit tests can call it in-process.
 * @param {*} data `{bookingIds, category, note?}`.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), now: (!Date|undefined)}=} deps The
 *     Firestore and the clock, injectable for tests.
 * @return {!Promise<!Object>} `{sessionId, cancelled}`.
 */
async function staffCancelBookingHandler(data, context, deps) {
  const auth = context && context.auth;
  if (!auth || !auth.uid) throw refusal('signed-out');
  const request = parseRequest(data);
  if (!request) throw refusal('bad-request');
  const store = (deps && deps.db) || admin.firestore();
  const now = deps && deps.now instanceof Date ? deps.now : new Date();
  const uid = auth.uid;
  return store.runTransaction(async (tx) => {
    const ctx = await loadCancel(tx, store,
        {uid, bookingIds: request.bookingIds});
    // ---- every read happens above this line ----
    const decision = decideStaffCancel(Object.assign({now}, ctx));
    if (!decision.ok) throw refusal(decision.reason);
    writeCancel(tx, store, ctx, decision,
        {uid, category: request.category, note: request.note});
    return {sessionId: decision.sessionId, cancelled: decision.cancelled};
  });
}

// Binds no secret: it sends no notice. `runWith({secrets: []})` like the
// other callables so `grep runWith` finds every function (portal/family.js).
const staffCancelBooking = functions.runWith({secrets: []}).https.onCall(
    (data, context) => staffCancelBookingHandler(data, context));

module.exports = {staffCancelBooking, staffCancelBookingHandler};
