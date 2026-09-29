/**
 * The Stripe handler's unbounded follow-up phases (contract v2.1, pin H).
 *
 * These run AFTER the idempotency transaction has committed the
 * `stripeEvents` document with outcome 'processing'. They are separate from
 * stripe.js for two reasons: a household's future bookings are an unbounded
 * set that would blow a Firestore transaction's write budget, and the
 * 500-line file limit.
 *
 * REVOCATION ALWAYS RELEASES THE SEAT (policy section 11). A revoked booking
 * that kept its seat would leave a phantom hole in a block that shows full,
 * and the waitlist would have nothing to promote into. Every decrement here
 * therefore fires portal/promotion.js, by design.
 */

'use strict';

const admin = require('firebase-admin');
// See the note in portal/stripe.js: admin.firestore.FieldValue does not
// survive the Functions emulator's admin stub; the modular export does.
const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const notices = require('./notices');
const notify = require('./notify');

/** Firestore's per-commit write budget, with headroom. @const {number} */
const BATCH_LIMIT = 400;

/** @return {!Object} The admin Firestore, resolved lazily. */
function db() {
  return admin.firestore();
}

/** @return {!Object} A server timestamp sentinel. */
function now() {
  return FieldValue.serverTimestamp();
}

/**
 * Cancel a set of bookings and release their seats. `sessions.booked` is
 * floored at 0 and decremented by the number of bookings cancelled on that
 * session, computed from one read pass rather than blind increments — an
 * increment sentinel cannot floor, and a stuck negative counter would show
 * a block as having more room than it has.
 * @param {!Array<!Object>} docs `QueryDocumentSnapshot`s to cancel.
 * @param {string} reason `bookings.cancelReason`: 'lapsed' or 'downgrade'.
 * @return {!Promise<{cancelled: number, sessions: number}>} A summary.
 */
async function cancelBookings(docs, reason) {
  if (docs.length === 0) return {cancelled: 0, sessions: 0};

  const perSession = new Map();
  for (const doc of docs) {
    const sid = (doc.data() || {}).sessionId;
    if (!sid) continue;
    perSession.set(sid, (perSession.get(sid) || 0) + 1);
  }
  const sessionIds = Array.from(perSession.keys());
  const sessionSnaps = sessionIds.length === 0 ? [] : await db().getAll(
      ...sessionIds.map((id) => db().collection('sessions').doc(id)));

  const writes = docs.map((doc) => ({
    ref: doc.ref,
    data: {
      status: 'cancelled',
      cancelledBy: 'system',
      cancelReason: reason,
      cancelledAt: now(),
    },
  }));
  for (const snap of sessionSnaps) {
    if (!snap.exists) continue;
    const booked = Number((snap.data() || {}).booked || 0);
    const freed = perSession.get(snap.id) || 0;
    writes.push({ref: snap.ref, data: {booked: Math.max(0, booked - freed)}});
  }

  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    for (const w of writes.slice(i, i + BATCH_LIMIT)) {
      batch.update(w.ref, w.data);
    }
    await batch.commit();
  }
  return {cancelled: docs.length, sessions: sessionIds.length};
}

/**
 * Delete documents in chunked batches.
 * @param {!Array<!Object>} docs `QueryDocumentSnapshot`s.
 * @return {!Promise<number>} How many documents were deleted.
 */
async function deleteDocs(docs) {
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    for (const doc of docs.slice(i, i + BATCH_LIMIT)) batch.delete(doc.ref);
    await batch.commit();
  }
  return docs.length;
}

/**
 * Delete every document a query returns, in chunked batches.
 * @param {!Object} query A Firestore `Query`.
 * @return {!Promise<number>} How many documents were deleted.
 */
async function deleteAll(query) {
  return deleteDocs((await query.get()).docs);
}

/**
 * Tell the household its upcoming bookings were released — ONE notice per
 * household per Stripe event (contract v2.2), not one per booking: this
 * module already knows the count after its batch, and a family that loses
 * six sessions to one failed card gets one message about it. Billing
 * category, parents only. Never throws.
 * @param {!Object} hh The resolved household `{id, data, ref}`.
 * @param {?string} eventId The Stripe `event.id` driving this revoke; it
 *     makes the ledger id retry-stable.
 * @param {number} count How many bookings were cancelled.
 * @param {string} reason 'lapsed' or 'downgrade'.
 * @return {!Promise<void>} Resolves when the notice has been recorded.
 */
async function notifyRevoked(hh, eventId, count, reason) {
  if (count <= 0) return;
  const copy = notices.bookingRevoked({count, reason});
  await notify.sendNotice({
    kind: 'booking-revoked',
    category: 'billing',
    householdId: hh.id,
    athleteId: null,
    subjectKey: `${hh.id}_${eventId || 'no-event'}`,
    title: copy.title,
    body: copy.body,
  });
}

/**
 * The lapse follow-up (pin H): every household booking with `date > today`
 * and status 'confirmed' is cancelled with reason 'lapsed', its seat is
 * released, and every waitlist entry the household holds is deleted. No
 * grace token is minted — a lapse is the family's side, not a supply
 * failure (pin E).
 *
 * Rides the existing `bookings (householdId, date)` composite (DATA-MODEL
 * index 3); `status` is filtered in memory, the same discipline the rest of
 * the schema uses.
 * @param {!Object} hh The resolved household `{id, data, ref}`.
 * @param {?string=} eventId The Stripe `event.id`, for the notice's ledger
 *     id.
 * @return {!Promise<!Object>} A summary for the event ledger.
 */
async function revokeHousehold(hh, eventId) {
  const today = lib.todayISO();
  const snap = await db().collection('bookings')
      .where('householdId', '==', hh.id)
      .where('date', '>', today)
      .get();
  const confirmed = snap.docs.filter(
      (d) => (d.data() || {}).status === 'confirmed');
  const cancelled = await cancelBookings(confirmed, 'lapsed');
  const waitlistDeleted = await deleteAll(db().collection('waitlist')
      .where('householdId', '==', hh.id));
  await notifyRevoked(hh, eventId, cancelled.cancelled, 'lapsed');
  return Object.assign({today, waitlistDeleted}, cancelled);
}

/**
 * The per-athlete lapse follow-up (Sprint 20, D17): ONE athlete's future
 * confirmed bookings are cancelled with reason 'lapsed', their seats
 * released, and that athlete's waitlist entries deleted; siblings keep
 * theirs. Rides the same `bookings (householdId, date)` composite as
 * `revokeHousehold`; `athleteId` and `status` are filtered in memory.
 * @param {!Object} hh The resolved household `{id, data, ref}`.
 * @param {string} athleteId The athlete whose tier subscription ended.
 * @param {?string=} eventId The Stripe `event.id`, for the notice's ledger
 *     id.
 * @return {!Promise<!Object>} A summary for the event ledger.
 */
async function revokeAthlete(hh, athleteId, eventId) {
  const today = lib.todayISO();
  const snap = await db().collection('bookings')
      .where('householdId', '==', hh.id)
      .where('date', '>', today)
      .get();
  const mine = (d) => (d.data() || {}).athleteId === athleteId;
  const confirmed = snap.docs.filter(
      (d) => mine(d) && (d.data() || {}).status === 'confirmed');
  const cancelled = await cancelBookings(confirmed, 'lapsed');
  const wl = await db().collection('waitlist')
      .where('householdId', '==', hh.id).get();
  const waitlistDeleted = await deleteDocs(wl.docs.filter(mine));
  await notifyRevoked(hh, eventId, cancelled.cancelled, 'lapsed');
  return Object.assign({today, athleteId, waitlistDeleted}, cancelled);
}

/**
 * The bookings one athlete holds in each period AFTER the current one,
 * counted exactly as `tokensFor` counts `used`: non-cancelled, and not
 * grace-charged (grace is a second life, never a period spend).
 * @param {string} athleteId The athlete.
 * @param {string} currentEnd The current period's last day.
 * @param {number} anchorDay The household's anchor.
 * @return {!Promise<!Map<string, !Array<!Object>>>} periodKey -> documents.
 */
async function futurePeriodBookings(athleteId, currentEnd, anchorDay) {
  const snap = await db().collection('bookings')
      .where('athleteId', '==', athleteId)
      .where('date', '>', currentEnd)
      .get();
  const byPeriod = new Map();
  for (const doc of snap.docs) {
    const b = doc.data() || {};
    if (b.status === 'cancelled' || b.graceTokenId) continue;
    const key = lib.periodFor(b.date, anchorDay).periodKey;
    if (!byPeriod.has(key)) byPeriod.set(key, []);
    byPeriod.get(key).push(doc);
  }
  return byPeriod;
}

/**
 * The downgrade follow-up (pin H): bookings in FUTURE periods beyond the new
 * grant are cancelled newest-first. The current period is left alone —
 * sessions already booked this cycle were paid for under the old plan, and
 * the pin says future-period.
 * @param {!Object} hh The resolved household `{id, data, ref}`.
 * @param {{tokens: ?number, athleteIds: !Array<string>}} detail The plan the
 *     transaction produced.
 * @param {?string=} eventId The Stripe `event.id`, for the notice's ledger
 *     id.
 * @return {!Promise<!Object>} A summary for the event ledger.
 */
async function trimDowngrade(hh, detail, eventId) {
  // An upgrade to Elite (tokens: null) can never have excess.
  if (detail.tokens === null || detail.tokens === undefined) {
    return {cancelled: 0, sessions: 0, periods: 0, grant: null};
  }
  const anchorDay = hh.data.periodAnchorDay;
  const currentEnd = lib.periodFor(lib.todayISO(), anchorDay).periodEnd;

  const excess = [];
  let periods = 0;
  for (const athleteId of detail.athleteIds) {
    const byPeriod = await futurePeriodBookings(
        athleteId, currentEnd, anchorDay);
    for (const [periodKey, docs] of byPeriod) {
      periods += 1;
      // An already-issued tokenPeriods doc is a fact about a payment and
      // outranks the package's nominal grant.
      const tpSnap = await db().collection('tokenPeriods')
          .doc(lib.tokenPeriodId(athleteId, periodKey)).get();
      const issued = tpSnap.exists ? (tpSnap.data() || {}).granted : null;
      const grant = Number.isInteger(issued) ? issued : detail.tokens;
      if (docs.length <= grant) continue;
      docs.sort((a, b) => {
        const ad = (a.data() || {}).date || '';
        const bd = (b.data() || {}).date || '';
        if (ad !== bd) return ad < bd ? 1 : -1; // newest session date first
        return b.createTime.toMillis() - a.createTime.toMillis();
      });
      excess.push(...docs.slice(0, docs.length - grant));
    }
  }
  const cancelled = await cancelBookings(excess, 'downgrade');
  await notifyRevoked(hh, eventId, cancelled.cancelled, 'downgrade');
  return Object.assign({periods, grant: detail.tokens}, cancelled);
}

module.exports = {
  BATCH_LIMIT,
  cancelBookings,
  deleteAll,
  notifyRevoked,
  revokeAthlete,
  revokeHousehold,
  trimDowngrade,
};
