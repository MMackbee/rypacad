/**
 * onSingleTokenSpent - the double-spend guard for purchased single tokens
 * (owner rulings 2026-09-29/30, portal/single.js).
 *
 * Rules can prove a booking names the athlete's own unexpired token, but not
 * that the token backs only ONE live booking: two tabs, a stale client or a
 * promotion racing a direct booking can each spend the same `single_{cs}`.
 * This trigger closes that gap server-side within seconds. Whenever a
 * booking becomes confirmed with a single token, it reads every booking
 * carrying that token and keeps exactly one live:
 *
 *   1. attended/noshow first (it already happened),
 *   2. then a Calendly-sourced booking (Calendly owns that slot),
 *   3. then the earliest spend (rebookedAt, else createdAt), then the id.
 *
 * Every other CONFIRMED, non-Calendly booking is cancelled (cancelledBy
 * 'system', cancelReason 'double-spend'), its seat is released and the
 * family gets one 'booking-released' notice. A duplicate that cannot be
 * cancelled (attended, noshow or Calendly-sourced) is logged for ops.
 * 30-day bonus tokens keep their accepted gap: this covers single_ only.
 */
'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const {FieldValue} = require('firebase-admin/firestore');
const notices = require('./notices');
const notify = require('./notify');
const {isSingleTokenId} = require('./single');
const {MAIL_SECRETS} = require('./secrets');

/**
 * Whether this write spends a single token: the booking is now confirmed
 * with a `single_` token it did not already hold live (a create, a re-book
 * or a token swap). Attendance flips and unchanged rows are not spends.
 * @param {?Object} before The booking before the write (null on create).
 * @param {?Object} after The booking after the write (null on delete).
 * @return {boolean} True when the guard must check the token.
 */
function spendsSingleToken(before, after) {
  if (!after || after.status !== 'confirmed') return false;
  if (!isSingleTokenId(after.graceTokenId)) return false;
  return !before || before.status === 'cancelled' ||
      before.graceTokenId !== after.graceTokenId;
}

/**
 * Epoch millis of a Timestamp, a Date or a number.
 * @param {*} v The stored value.
 * @return {?number} Millis, or null when unusable.
 */
function millisOf(v) {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * When a booking spent its token: `rebookedAt` when re-booked, else
 * `createdAt`. A row with neither sorts last.
 * @param {!Object} row A booking row.
 * @return {number} Epoch millis, or Infinity.
 */
function spendKey(row) {
  const t = millisOf(row.rebookedAt) ?? millisOf(row.createdAt);
  return t === null ? Infinity : t;
}

/**
 * @param {!Object} row A booking row.
 * @return {number} 0 attended/noshow, 1 Calendly-sourced, 2 otherwise.
 */
function rankOf(row) {
  if (row.status === 'attended' || row.status === 'noshow') return 0;
  return row.source === 'calendly' ? 1 : 2;
}

/**
 * The one live booking a token keeps.
 * @param {!Array<!Object>} rows Live (non-cancelled) booking rows.
 * @return {?Object} The keeper, or null when there are none.
 */
function pickKeeper(rows) {
  const sorted = rows.slice().sort((a, b) =>
    rankOf(a) - rankOf(b) || spendKey(a) - spendKey(b) ||
      String(a.id).localeCompare(String(b.id)));
  return sorted[0] || null;
}

/**
 * Split one token's bookings into the keeper, the losers to cancel
 * (confirmed, not Calendly-sourced) and the duplicates that must stay.
 * @param {!Array<!Object>} rows Every booking carrying the token.
 * @return {{keeper: ?Object, losers: !Array<!Object>,
 *     stuck: !Array<!Object>}} The plan; no losers with fewer than 2 live.
 */
function planRelease(rows) {
  const live = (rows || []).filter((r) => r && r.status !== 'cancelled');
  if (live.length < 2) {
    return {keeper: live[0] || null, losers: [], stuck: []};
  }
  const keeper = pickKeeper(live);
  const others = live.filter((r) => r.id !== keeper.id);
  const cancellable = (r) => r.status === 'confirmed' &&
      r.source !== 'calendly';
  return {keeper, losers: others.filter(cancellable),
    stuck: others.filter((r) => !cancellable(r))};
}

/**
 * Cancel one loser in its own transaction, re-checking it (and that the
 * keeper still holds the token) so a stale read never releases a seat.
 * @param {!Object} store An admin Firestore.
 * @param {string} tokenId The single token.
 * @param {!Object} loser The loser row.
 * @param {string} keeperId The keeper's booking id.
 * @return {!Promise<?Object>} The cancelled booking's body plus its
 *     `session`, or null when it was skipped.
 */
async function cancelLoser(store, tokenId, loser, keeperId) {
  const ref = store.collection('bookings').doc(loser.id);
  const keeperRef = store.collection('bookings').doc(keeperId);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const keeperSnap = await tx.get(keeperRef);
    const b = snap.exists ? snap.data() : null;
    const k = keeperSnap.exists ? keeperSnap.data() : null;
    if (!b || b.status !== 'confirmed' || b.graceTokenId !== tokenId) {
      return null;
    }
    if (!k || k.status === 'cancelled' || k.graceTokenId !== tokenId) {
      return null;
    }
    const sRef = b.sessionId ?
        store.collection('sessions').doc(b.sessionId) : null;
    const sSnap = sRef ? await tx.get(sRef) : null;
    const session = sSnap && sSnap.exists ? sSnap.data() || {} : null;
    // ---- reads done ----
    tx.update(ref, {status: 'cancelled', cancelledBy: 'system',
      cancelReason: 'double-spend', cancelledAt: FieldValue.serverTimestamp()});
    if (session) {
      tx.update(sRef, {booked: Math.max(0, Number(session.booked || 0) - 1)});
    }
    return Object.assign({}, b, {session});
  });
}

/**
 * Keep one live booking per single token; release the rest.
 * @param {!Object} store An admin Firestore.
 * @param {string} tokenId A `single_{cs}` graceTokens id.
 * @return {!Promise<{keeper: ?string, released: !Array<string>,
 *     stuck: !Array<string>}>} What happened.
 */
async function releaseDoubleSpends(store, tokenId) {
  const snap = await store.collection('bookings')
      .where('graceTokenId', '==', tokenId).get();
  const plan = planRelease(
      snap.docs.map((d) => Object.assign({id: d.id}, d.data())));
  const released = [];
  for (const loser of plan.losers) {
    const b = await cancelLoser(store, tokenId, loser, plan.keeper.id);
    if (!b) continue;
    released.push(loser.id);
    const aSnap = b.athleteId ?
        await store.collection('athletes').doc(b.athleteId).get() : null;
    const copy = notices.bookingReleased({
      athlete: aSnap && aSnap.exists ? aSnap.data() : null,
      session: b.session,
    });
    await notify.sendNotice({
      kind: 'booking-released',
      category: 'schedule',
      householdId: b.householdId || null,
      athleteId: b.athleteId || null,
      sessionId: b.sessionId || null,
      bookingId: loser.id,
      subjectKey: `${loser.id}_released`,
      title: copy.title,
      body: copy.body,
    });
  }
  if (plan.stuck.length > 0) {
    console.error(`single token ${tokenId} still backs more than one live ` +
        `booking: keeper=${plan.keeper.id} stuck=` +
        plan.stuck.map((r) => r.id).join(','));
  }
  return {
    keeper: plan.keeper ? plan.keeper.id : null,
    released,
    stuck: plan.stuck.map((r) => r.id),
  };
}

/**
 * bookings onWrite: a single token was just spent - keep one live booking.
 * Its own cancellations are not spends, so it never re-enters itself.
 */
const onSingleTokenSpent = functions
    .runWith({secrets: MAIL_SECRETS})
    .firestore
    .document('bookings/{bookingId}')
    .onWrite(async (change, context) => {
      const before = change.before.exists ? change.before.data() : null;
      const after = change.after.exists ? change.after.data() : null;
      if (!spendsSingleToken(before, after)) return null;
      try {
        const r = await releaseDoubleSpends(admin.firestore(),
            after.graceTokenId);
        console.log(`onSingleTokenSpent: booking=${context.params.bookingId}` +
            ` token=${after.graceTokenId} keeper=${r.keeper} ` +
            `released=${r.released.length} stuck=${r.stuck.length}`);
      } catch (err) {
        console.error('onSingleTokenSpent error:', err);
      }
      return null;
    });

module.exports = {
  onSingleTokenSpent,
  pickKeeper,
  planRelease,
  releaseDoubleSpends,
  spendKey,
  spendsSingleToken,
};
