/**
 * staffBookSession - the owner or ops adds one athlete to one session in
 * one transaction (spec 2026-11-13 section 9.1).
 *
 *   in   {athleteId: string, sessionId: string, free?: boolean,
 *         allowFull?: boolean}
 *   out  {bookingId, athleteId, sessionId, periodKey, chargedFrom,
 *         graceTokenId, comp, rebooked, booked, capacity, overrides}
 *
 * Every read comes first (the caller's role, and only for staff the
 * athlete, household, package, session, the athlete's row on it, the live
 * roster and the token inputs of the session's period), portal/
 * staff-book-decide.js decides, and only then are the writes buffered:
 *
 *   - the booking `{athleteId}_{sessionId}`, created, or written WHOLE
 *     over a cancelled row (no merge), so no old cancel, move, no-show,
 *     comp or stale `graceTokenId` field survives. `householdId` comes
 *     from the athlete, never the request; `date` and `type` from the
 *     session. `createdVia: 'staff'`, `createdBy` the staff uid, and
 *     `comp: true` only when Free;
 *   - the seat: `booked = max(live, counter) + 1`, which heals a counter
 *     that reads low and may pass `capacity` on an overfill (promotion
 *     stays off until a cancel brings it back under);
 *   - the athlete's own waitlist entry on this session, deleted.
 *
 * The doc id makes a retried or double-tapped add `already-booked`: never
 * two rows, never two seats. A refusal is an HttpsError thrown inside the
 * transaction, so nothing commits.
 *
 * The callable sends no notice and binds no secret: a created row fires
 * onBookingCreated ("Session booked"), and a cancelled row written over is
 * noticed by onBookingCancelled's re-confirm branch (notify-gates.js
 * `shouldNoticeMoveReconfirm` takes `createdVia: 'staff'`). One log line of
 * ids goes out after the commit, never inside the transaction, where a
 * retry would log twice.
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
// See the note in portal/stripe.js: admin.firestore.FieldValue does not
// survive the Functions emulator's admin stub; the modular export does.
const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const {loadTokenInputs, rowOf} = require('./booking-reads');
const {isStaff} = require('./staff-cancel-decide');
const {REFUSALS, decideStaffBook, parseStaffBook} =
    require('./staff-book-decide');
const {logStaffBooking} = require('./staff-gates');

const {HttpsError} = functions.https;

/**
 * The typed refusal for one reason.
 * @param {string} reason A key of REFUSALS.
 * @param {!Object=} details Extra details (`{taken, capacity}` for full).
 * @return {!HttpsError} The error to throw.
 */
function refusal(reason, details) {
  const r = REFUSALS[reason];
  return new HttpsError(r.code, r.message,
      Object.assign({reason}, details));
}

/**
 * Every read the add needs, in one transaction, before any write. A caller
 * who is not staff reads nothing more, nor does a missing athlete; other
 * missing documents are nulls the decision refuses.
 * @param {!Object} tx The transaction.
 * @param {!Object} store An admin Firestore.
 * @param {{uid: string, athleteId: string, sessionId: string,
 *     now: !Date}} args The caller, the request and the clock.
 * @return {!Promise<!Object>} The ctx `decideStaffBook` takes, without the
 *     request's two flags.
 */
async function loadStaffBook(tx, store, args) {
  const {uid, athleteId, sessionId, now} = args;
  const doc = (name, id) => rowOf(tx, store.collection(name).doc(id));
  const ctx = {user: await doc('users', uid), athlete: null,
    household: null, pkg: null, session: null, existing: null, live: 0,
    tokenPeriod: null, periodBookings: [], graceSpends: [], waitlist: [],
    graceTokens: [], now};
  if (!isStaff(ctx.user)) return ctx;
  ctx.athlete = await doc('athletes', athleteId);
  if (!ctx.athlete) return ctx;
  const {householdId, packageId} = ctx.athlete;
  if (householdId) ctx.household = await doc('households', householdId);
  if (packageId) ctx.pkg = await doc('packages', packageId);
  ctx.session = await doc('sessions', sessionId);
  ctx.existing = await doc('bookings', lib.bookingId(athleteId, sessionId));
  ctx.live = lib.rows(await tx.get(store.collection('bookings')
      .where('sessionId', '==', sessionId)))
      .filter((b) => b.status !== 'cancelled').length;
  if (!ctx.session || !ctx.session.date || !ctx.household) return ctx;
  const {tokenPeriod, periodBookings, waitlist, graceTokens, graceSpends} =
      await loadTokenInputs(tx, store, {athleteId, date: ctx.session.date,
        anchorDay: ctx.household.periodAnchorDay, now});
  return Object.assign(ctx, {tokenPeriod, periodBookings, waitlist,
    graceTokens, graceSpends});
}

/**
 * Buffer the add's writes. Call only after every read.
 * @param {!Object} tx The transaction.
 * @param {!Object} store An admin Firestore.
 * @param {!Object} ctx From `loadStaffBook`.
 * @param {!Object} decision An ok `decideStaffBook` result.
 * @param {string} uid The caller.
 * @return {string} The booking id.
 */
function writeStaffBook(tx, store, ctx, decision, uid) {
  const {athlete, session} = ctx;
  const id = lib.bookingId(athlete.id, session.id);
  const row = {
    athleteId: athlete.id,
    sessionId: session.id,
    householdId: athlete.householdId,
    date: session.date,
    // The admin SDK rejects undefined (as portal/move.js writes it).
    type: session.type || null,
    status: 'confirmed',
    periodKey: decision.period.periodKey,
    chargedFrom: decision.charge.chargedFrom,
    graceTokenId: decision.charge.graceTokenId,
    createdBy: uid,
    createdVia: 'staff',
    createdAt: FieldValue.serverTimestamp(),
  };
  if (decision.comp) row.comp = true;
  const ref = store.collection('bookings').doc(id);
  if (decision.rebooked) {
    // A whole-document replace: no old cancel or comp field survives.
    row.rebookedAt = FieldValue.serverTimestamp();
    tx.set(ref, row);
  } else {
    tx.create(ref, row);
  }
  tx.update(store.collection('sessions').doc(session.id),
      {booked: decision.taken + 1});
  if (decision.waitlistEntryId) {
    tx.delete(store.collection('waitlist').doc(decision.waitlistEntryId));
  }
  return id;
}

/**
 * The callable's body, exported so the unit tests can call it in-process.
 * @param {*} data `{athleteId, sessionId, free?, allowFull?}`.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), now: (!Date|undefined)}=} deps The
 *     Firestore and the clock, injectable for tests.
 * @return {!Promise<!Object>} The new booking (the header's `out`).
 */
async function staffBookSessionHandler(data, context, deps) {
  const auth = context && context.auth;
  if (!auth || !auth.uid) throw refusal('signed-out');
  const request = parseStaffBook(data);
  if (!request) throw refusal('bad-request');
  const store = (deps && deps.db) || admin.firestore();
  const now = deps && deps.now instanceof Date ? deps.now : new Date();
  const uid = auth.uid;
  const {athleteId, sessionId} = request;
  const {role, out} = await store.runTransaction(async (tx) => {
    const ctx = await loadStaffBook(tx, store,
        {uid, athleteId, sessionId, now});
    // ---- every read happens above this line ----
    const decision = decideStaffBook(Object.assign(ctx,
        {free: request.free, allowFull: request.allowFull}));
    if (!decision.ok) throw refusal(decision.reason, decision.details);
    const bookingId = writeStaffBook(tx, store, ctx, decision, uid);
    return {role: ctx.user.role, out: {
      bookingId,
      athleteId,
      sessionId,
      periodKey: decision.period.periodKey,
      chargedFrom: decision.charge.chargedFrom,
      graceTokenId: decision.charge.graceTokenId,
      comp: decision.comp,
      rebooked: decision.rebooked,
      booked: decision.taken + 1,
      capacity: decision.capacity,
      overrides: decision.overrides,
    }};
  });
  logStaffBooking({action: 'add', by: uid, role, athleteId, sessionId,
    chargedFrom: out.chargedFrom, comp: out.comp, overrides: out.overrides});
  return out;
}

// Binds no secret: it sends no notice (the booking triggers do).
// `runWith({secrets: []})` like the other callables so `grep runWith`
// finds every function (portal/family.js).
const staffBookSession = functions.runWith({secrets: []}).https.onCall(
    (data, context) => staffBookSessionHandler(data, context));

module.exports = {staffBookSession, staffBookSessionHandler};
