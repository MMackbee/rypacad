/**
 * moveBooking - a family moves one booking to another open session of the
 * same kind in one transaction (spec 2026-11-11 section 5; plan C2).
 *
 *   in   {bookingId: string, toSessionId: string, allowFull?: boolean}
 *   out  {bookingId, movedFrom, sessionId, periodKey, chargedFrom,
 *         graceTokenId, comp, rebooked, overrides}
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
 * cancelled) is noticed by onBookingCancelled's re-confirm branch, which
 * calls `sendMoveReconfirm` below. A slow mail server can never turn a
 * committed move into a failed call.
 *
 * Staff mode (2026-11-13, portal/move-staff.js): when the caller's
 * `users/{uid}.role` is owner or ops - never a request flag - the staff
 * checks replace the family ones, `allowFull: true` may overfill the
 * target, the old row also records `cancelledFrom` (what it was), a
 * `full` refusal carries `{taken, capacity}`, `overrides` names each
 * family limit skipped, and one log line of ids goes out after the commit.
 * A family caller's `allowFull` is ignored: its move is exactly as before,
 * with `overrides: []`.
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
// See the note in portal/stripe.js: admin.firestore.FieldValue does not
// survive the Functions emulator's admin stub; the modular export does.
const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const notices = require('./notices');
const notify = require('./notify');
const {loadTokenInputs, rowOf} = require('./booking-reads');
const {REFUSALS, decideMove} = require('./move-decide');
const {isStaff} = require('./staff-cancel-decide');
const {logStaffBooking} = require('./staff-gates');

const {HttpsError} = functions.https;

/** Longest id accepted; real ids are far shorter. */
const MAX_ID_LENGTH = 200;
/** Stale cancel fields a moved-away row must not keep (C2 Writes). */
const STALE_CANCEL_FIELDS = ['cancelCategory', 'cancelNote', 'cancelledVia'];

/**
 * The typed refusal for one reason.
 * @param {string} reason A key of REFUSALS.
 * @param {!Object=} details Extra details (a staff `full`'s counts).
 * @return {!HttpsError} The error to throw.
 */
function refusal(reason, details) {
  const r = REFUSALS[reason];
  return new HttpsError(r.code, r.message,
      Object.assign({reason}, details));
}

/**
 * @param {*} id A request field.
 * @return {boolean} True for a 1..200 character id with no '/' that
 *     Firestore accepts as a document id (not '.', '..' or '__x__').
 */
function goodId(id) {
  return typeof id === 'string' && id.length > 0 &&
      id.length <= MAX_ID_LENGTH && !id.includes('/') &&
      !/^\.\.?$|^__.*__$/.test(id);
}

/**
 * Every read the move needs, in one transaction, before any write.
 * Missing documents are nulls; the decision refuses them.
 * @param {!Object} tx The transaction.
 * @param {!Object} store An admin Firestore.
 * @param {{uid: string, bookingId: string, toSessionId: string,
 *     allowFull: boolean, now: !Date}} args The caller, the request and
 *     the clock.
 * @return {!Promise<!Object>} The ctx `decideMove` takes. `staff` comes
 *     from the caller's role; `allowFull` counts only in staff mode.
 */
async function loadMove(tx, store, args) {
  const {uid, bookingId, toSessionId, now} = args;
  const doc = (name, id) => rowOf(tx, store.collection(name).doc(id));
  const ctx = {uid, toSessionId, now, user: await doc('users', uid),
    old: await doc('bookings', bookingId), oldSession: null, target: null,
    targetBooking: null, targetLive: 0, athlete: null, household: null,
    pkg: null, tokenPeriod: null, periodBookings: [], graceSpends: [],
    waitlist: [], graceTokens: []};
  ctx.staff = isStaff(ctx.user);
  ctx.allowFull = ctx.staff && args.allowFull === true;
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
  const {tokenPeriod, periodBookings, waitlist, graceTokens, graceSpends} =
      await loadTokenInputs(tx, store, {athleteId, date: ctx.target.date,
        anchorDay: ctx.household && ctx.household.periodAnchorDay, now});
  return Object.assign(ctx, {tokenPeriod, periodBookings, waitlist,
    graceTokens, graceSpends});
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
  // Staff may move a No-show: record what the row was.
  if (ctx.staff) cancel.cancelledFrom = old.status;
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
 * @param {*} data `{bookingId, toSessionId, allowFull?}`.
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
  // Anything but true is false, never a bad request: the family's
  // request behaves exactly as before.
  const allowFull = Boolean(data && data.allowFull === true);
  const store = (deps && deps.db) || admin.firestore();
  const now = deps && deps.now instanceof Date ? deps.now : new Date();
  const uid = auth.uid;
  const {out, staff, role, athleteId} = await store.runTransaction(
      async (tx) => {
        const ctx = await loadMove(tx, store,
            {uid, bookingId, toSessionId, allowFull, now});
        // ---- every read happens above this line ----
        const decision = decideMove(ctx);
        if (!decision.ok) throw refusal(decision.reason, decision.details);
        const {newId, rebooked} = writeMove(tx, store, ctx, decision, uid);
        return {staff: ctx.staff, role: ctx.user && ctx.user.role,
          athleteId: ctx.old.athleteId, out: {
            bookingId: newId,
            movedFrom: ctx.old.id,
            sessionId: toSessionId,
            periodKey: decision.period.periodKey,
            chargedFrom: decision.charge.chargedFrom,
            graceTokenId: decision.charge.graceTokenId,
            comp: decision.comp,
            rebooked,
            overrides: decision.overrides,
          }};
      });
  // After the commit, never inside it, where a retry would log twice.
  if (staff) {
    logStaffBooking({action: 'move', by: uid, role, athleteId,
      sessionId: toSessionId, chargedFrom: out.chargedFrom, comp: out.comp,
      overrides: out.overrides});
  }
  return out;
}

/**
 * The 'booking-confirmed' notice for a move onto a row the athlete had
 * cancelled earlier: onBookingCancelled calls this when
 * `shouldNoticeMoveReconfirm` holds (portal/notify-gates.js). The key
 * carries the move's `createdAt`, so the row's earlier
 * `booking-confirmed_{id}` ledger entry never blocks it and a redelivered
 * trigger never sends twice. A failure is logged, never thrown.
 * @param {string} bookingId The booking id.
 * @param {!Object} booking The booking body after the move.
 * @param {{db: (!Object|undefined), sendNotice: (!Function|undefined)}=}
 *     deps The Firestore and the sender, injectable for tests.
 * @return {!Promise<void>} Resolves once sent, or once a failure is logged.
 */
async function sendMoveReconfirm(bookingId, booking, deps) {
  try {
    const store = (deps && deps.db) || admin.firestore();
    const send = (deps && deps.sendNotice) || notify.sendNotice;
    const body = async (name, id) => {
      if (!id) return null;
      const snap = await store.collection(name).doc(id).get();
      return snap.exists ? snap.data() : null;
    };
    const [session, athlete] = await Promise.all([
      body('sessions', booking.sessionId),
      body('athletes', booking.athleteId),
    ]);
    const copy = notices.bookingConfirmed({athlete, session, booking});
    await send({
      kind: 'booking-confirmed',
      category: 'schedule',
      householdId: booking.householdId || null,
      athleteId: booking.athleteId || null,
      sessionId: booking.sessionId || null,
      bookingId,
      subjectKey: `${bookingId}_move_${booking.createdAt.toMillis()}`,
      title: copy.title,
      body: copy.body,
    });
  } catch (err) {
    console.error(`move re-confirm notice failed: booking=${bookingId}`, err);
  }
}

// Binds no secret: it sends no notice (the booking triggers do).
// `runWith({secrets: []})` like the other callables so `grep runWith`
// finds every function (portal/family.js).
const moveBooking = functions.runWith({secrets: []}).https.onCall(
    (data, context) => moveBookingHandler(data, context));

module.exports = {moveBooking, moveBookingHandler, sendMoveReconfirm};
