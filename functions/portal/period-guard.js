/**
 * onPeriodTokenSpent - the server's period-token check, step 1 of the
 * token-cap design (2026-11-04): FLAG ONLY, never cancel.
 *
 * Rules cannot count bookings, so the period cap lives in the client
 * (hooks/live.js assertPeriodTokensLeft). Two racing tabs, a stale bundle or
 * a hand-made commit can land a 7th booking on a 6-token month unnoticed.
 * No athlete had ever done so when this shipped (production read,
 * 2026-11-04: 0 of 86), so this is a safety net, not a cleanup.
 *
 * Whenever a booking BECOMES active - created confirmed, or re-booked
 * (cancelled -> confirmed) - for an athlete on a token package (kind
 * 'tokens'; Elite, the single token and no package are skipped), with no
 * graceTokenId, the athlete's period is counted exactly as
 * `lib.tokensPosition` counts it: non-cancelled bookings with the same
 * periodKey and no graceTokenId; the grant is tokenPeriods/{athlete}_{period}
 * `granted`, else the package. Waitlist holds are left out on purpose: they
 * hold a token, they do not spend one. The period's spends are ranked by when
 * each became active (rebookedAt, else createdAt - single-guard's spendKey),
 * then by id, so of two racing bookings only the later is flagged. A booking
 * ranked past the grant gets `flag: 'over-cap'` and `flaggedAt`, the flag the
 * Sign-ups report already lists - but only when it carries no flag yet (a
 * Calendly flag is never overwritten). The flag write is not a become-active
 * transition, so the trigger never re-enters itself.
 */
'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const {spendKey} = require('./single-guard');

/** The flag, from the Sign-ups report's closed list. @const {string} */
const OVER_CAP = 'over-cap';
/** @const {!RegExp} */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether this write makes the booking active: a create with status
 * 'confirmed', or a re-book (cancelled -> confirmed). Attendance flips, edits
 * and this guard's own flag write are not.
 * @param {?Object} before The booking before the write (null on create).
 * @param {?Object} after The booking after the write (null on delete).
 * @return {boolean} True when the period must be counted.
 */
function becomesActive(before, after) {
  if (!after || after.status !== 'confirmed') return false;
  return !before || before.status === 'cancelled';
}

/**
 * The period spends `lib.tokensPosition` counts as `used`: non-cancelled,
 * the same periodKey, no graceTokenId. CHANGE ONE, CHANGE BOTH.
 * @param {!Array<!Object>} rows Booking rows.
 * @param {string} periodKey The period.
 * @return {!Array<!Object>} The spends.
 */
function periodSpends(rows, periodKey) {
  return (rows || []).filter((b) => b && b.status !== 'cancelled' &&
      b.periodKey === periodKey && !b.graceTokenId);
}

/**
 * Where one booking ranks among its period's spends, and whether that is
 * past the grant. Pure.
 * @param {{bookingId: string, booking: !Object, rows: !Array<!Object>,
 *     pkg: ?Object, tokenPeriod: ?Object}} args The booking as the trigger
 *     saw it, the athlete's bookings read for the period, the package and
 *     the tokenPeriods doc (null when none was issued).
 * @return {{granted: ?number, used: number, rank: number, over: boolean}}
 *     `rank` is 1-based, 0 when the booking is not a period spend.
 */
function rankInPeriod(args) {
  const {bookingId, booking} = args;
  const periodKey = booking.periodKey;
  // The trigger's copy replaces the read one: it carries the re-book stamp
  // the handler may have filled in, and a range read can miss a hand-made
  // row whose date sits outside its own period.
  const rows = (args.rows || []).filter((r) => r && r.id !== bookingId)
      .concat([Object.assign({}, booking, {id: bookingId})]);
  const position = lib.tokensPosition({pkg: args.pkg,
    tokenPeriod: args.tokenPeriod, bookings: rows, waitlist: [],
    graceTokens: [], periodKey, today: periodKey});
  const spends = periodSpends(rows, periodKey).sort((a, b) =>
    spendKey(a) - spendKey(b) || String(a.id).localeCompare(String(b.id)));
  const rank = spends.findIndex((r) => r.id === bookingId) + 1;
  const granted = position.granted;
  return {granted, used: position.used, rank,
    over: rank > 0 && Number.isInteger(granted) && rank > granted};
}

/**
 * Set the flag in a transaction that re-reads the booking, so a flag written
 * meanwhile (Calendly, ops) or a cancel is never overwritten.
 * @param {!Object} store An admin Firestore.
 * @param {string} bookingId The booking.
 * @return {!Promise<boolean>} True when the flag was written.
 */
async function flagOverCap(store, bookingId) {
  const ref = store.collection('bookings').doc(bookingId);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const b = snap.exists ? snap.data() || {} : null;
    if (!b || b.status === 'cancelled' || b.graceTokenId || b.flag) {
      return false;
    }
    tx.update(ref, {flag: OVER_CAP, flaggedAt: FieldValue.serverTimestamp()});
    return true;
  });
}

/**
 * The whole check for one booking write. Reads, in order and only while
 * still needed: the athlete, the package, then the tokenPeriods doc and the
 * athlete's bookings in the period (one query on the existing
 * `bookings (athleteId, date)` index).
 * @param {!Object} store An admin Firestore.
 * @param {{bookingId: string, before: ?Object, after: ?Object,
 *     eventMillis: (number|undefined)}} args The write; `eventMillis` (the
 *     trigger's event time) dates a re-book that carries no rebookedAt.
 * @return {!Promise<{outcome: string}>} What happened: 'not-a-spend',
 *     'grace', 'already-flagged', 'no-period', 'no-package',
 *     'not-token-package', 'within', 'flagged' or 'flag-kept'.
 */
async function checkPeriodCap(store, args) {
  const {bookingId, before, after} = args;
  if (!becomesActive(before, after)) return {outcome: 'not-a-spend'};
  if (after.graceTokenId) return {outcome: 'grace'};
  if (after.flag) return {outcome: 'already-flagged'};
  const periodKey = String(after.periodKey || '');
  if (!after.athleteId || !ISO_DATE.test(periodKey)) {
    return {outcome: 'no-period'};
  }
  const aSnap = await store.collection('athletes').doc(after.athleteId).get();
  const packageId = aSnap.exists ? (aSnap.data() || {}).packageId : null;
  if (!packageId) return {outcome: 'no-package'};
  const pkgSnap = await store.collection('packages').doc(packageId).get();
  const pkg = pkgSnap.exists ? pkgSnap.data() || null : null;
  if (!pkg || pkg.kind !== 'tokens') return {outcome: 'not-token-package'};
  const period = lib.periodFor(periodKey, lib.anchorDayFromISO(periodKey));
  const [tpSnap, bookingsSnap] = await Promise.all([
    store.collection('tokenPeriods')
        .doc(lib.tokenPeriodId(after.athleteId, periodKey)).get(),
    lib.periodBookingsQuery(store, after.athleteId, period).get(),
  ]);
  // A re-book written without rebookedAt (an older bundle, a script) became
  // active at the event, not at its first create.
  const booking = before && !after.rebookedAt &&
      Number.isFinite(args.eventMillis) ?
      Object.assign({}, after, {rebookedAt: args.eventMillis}) : after;
  const check = rankInPeriod({bookingId, booking,
    rows: lib.rows(bookingsSnap), pkg,
    tokenPeriod: tpSnap.exists ? tpSnap.data() : null});
  if (!check.over) return Object.assign({outcome: 'within'}, check);
  const flagged = await flagOverCap(store, bookingId);
  if (flagged) {
    console.log(`onPeriodTokenSpent: flagged ${OVER_CAP} booking=` +
        `${bookingId} athlete=${after.athleteId} period=${periodKey} ` +
        `rank=${check.rank} granted=${check.granted}`);
  }
  return Object.assign({outcome: flagged ? 'flagged' : 'flag-kept'}, check);
}

/**
 * bookings onWrite: a period token was just spent - flag a booking past the
 * month's grant. No secrets: it sends nothing.
 */
const onPeriodTokenSpent = functions
    .firestore
    .document('bookings/{bookingId}')
    .onWrite(async (change, context) => {
      const before = change.before.exists ? change.before.data() : null;
      const after = change.after.exists ? change.after.data() : null;
      if (!becomesActive(before, after)) return null;
      try {
        await checkPeriodCap(admin.firestore(), {
          bookingId: context.params.bookingId, before, after,
          eventMillis: Date.parse(context.timestamp)});
      } catch (err) {
        console.error('onPeriodTokenSpent error:', err);
      }
      return null;
    });

module.exports = {
  OVER_CAP,
  becomesActive,
  checkPeriodCap,
  onPeriodTokenSpent,
  periodSpends,
  rankInPeriod,
};
