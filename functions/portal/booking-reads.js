/**
 * The reads a server booking makes inside its transaction, shared by
 * `moveBooking` (portal/move.js) and `staffBookSession`
 * (portal/staff-book.js): one document as a row, and the athlete's token
 * inputs for one session's billing period - what `lib.tokensPosition`
 * needs, read the way portal/waitlist-order.js reads a candidate's.
 */

'use strict';

const lib = require('./lib');

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
 * The athlete's token inputs for the period a session date falls in, in
 * five reads: the period's `tokenPeriods` doc, the period's bookings, the
 * athlete's waitlist entries and grace tokens, then the bookings of any
 * period that spent one of those grace tokens.
 * @param {!Object} tx The transaction.
 * @param {!Object} store An admin Firestore.
 * @param {{athleteId: string, date: string, anchorDay: (number|undefined),
 *     now: !Date}} args The athlete, the session date, the household
 *     anchor (absent == 1) and the clock.
 * @return {!Promise<{period: {periodKey: string, periodEnd: string},
 *     tokenPeriod: ?Object, periodBookings: !Array<!Object>,
 *     waitlist: !Array<!Object>, graceTokens: !Array<!Object>,
 *     graceSpends: !Array<!Object>}>} The inputs, each row with its `id`.
 */
async function loadTokenInputs(tx, store, args) {
  const {athleteId, date, anchorDay, now} = args;
  const period = lib.periodFor(date, anchorDay);
  const tokenPeriod = await rowOf(tx, store.collection('tokenPeriods')
      .doc(lib.tokenPeriodId(athleteId, period.periodKey)));
  const periodBookings = lib.rows(await tx.get(
      lib.periodBookingsQuery(store, athleteId, period)));
  const waitlist = lib.rows(await tx.get(store.collection('waitlist')
      .where('athleteId', '==', athleteId)));
  const graceTokens = lib.rows(await tx.get(store.collection('graceTokens')
      .where('athleteId', '==', athleteId)));
  const graceSpends = await lib.readGraceSpends((q) => tx.get(q),
      lib.graceSpendQueries(store, graceTokens, lib.chicagoDate(now)));
  return {period, tokenPeriod, periodBookings, waitlist, graceTokens,
    graceSpends};
}

module.exports = {loadTokenInputs, rowOf};
