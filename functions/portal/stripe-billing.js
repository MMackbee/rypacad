/**
 * Per-athlete billing state (spec 4.3-4.5): `athletes.billing` for the
 * tier subscription, `athletes.facilityBilling` + `facilityAccess` for the
 * add-on. Pure transaction writers; the caller has done every read.
 */
'use strict';

const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const notices = require('./notices');
const notify = require('./notify');
const {metadataOf} = require('./stripe-resolve');

/** @return {!Object} A server timestamp sentinel. */
function now() {
  return FieldValue.serverTimestamp();
}

/**
 * Dot-path patch for `billing` or `facilityBilling`, always stamping
 * `updatedAt`; a facility lapse also clears `facilityAccess`.
 * @param {string} product `'tier' | 'facility'`.
 * @param {!Object} fields Fields to set (undefined values are skipped).
 * @return {!Object} A Firestore update payload.
 */
function billingPatch(product, fields) {
  const key = product === 'facility' ? 'facilityBilling' : 'billing';
  const patch = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) patch[`${key}.${k}`] = v;
  }
  patch[`${key}.updatedAt`] = now();
  if (product === 'facility' && fields.status) {
    patch.facilityAccess = fields.status === 'active';
  }
  return patch;
}

/**
 * The household side of a paid invoice, exactly as `stripe.js:180-191`.
 * @param {!Object} tx The transaction.
 * @param {!Object} hh The household `{id, ref, data}`.
 * @param {string} eventId The event.
 * @param {{start: ?string, end: ?string}} period The invoice period.
 */
function householdActive(tx, hh, eventId, period) {
  const patch = {
    'membership.status': 'active',
    'membership.stripeSubscriptionStatus': 'active',
    'membership.currentPeriodStart': period.start,
    'membership.currentPeriodEnd': period.end,
    'membership.lastEventId': eventId,
    'membership.attemptCount': null,
    'membership.nextPaymentAttempt': null,
    'membership.lastFailedAt': null,
    'membership.updatedAt': now(),
  };
  if (!Number.isInteger(hh.data && hh.data.periodAnchorDay)) {
    patch.periodAnchorDay = 1;
  }
  tx.update(hh.ref, patch);
}

/**
 * `invoice.paid` for ONE athlete's subscription (spec 4.3). The checkout
 * invoice (`subscription_create`) lands in the PREPAID period named in the
 * subscription metadata with `granted = prepaidTokens`; every later invoice
 * uses the invoice line's period.
 * @param {!Object} tx The transaction.
 * @param {{db: !Object, event: !Object, hh: !Object, athleteRef: !Object,
 *     athlete: !Object, pkg: ?Object, product: string,
 *     period: {start: ?string, end: ?string}}} args Everything read.
 * @return {{outcome: string, firstActive: boolean, detail: !Object}}
 */
function applyAthleteInvoicePaid(tx, args) {
  const {db, event, hh, athleteRef, athlete, pkg, product, period} = args;
  const invoice = (event.data && event.data.object) || {};
  const wasActive = !athlete.billing || athlete.billing.status === 'active';
  if (product === 'facility') {
    // D10: the add-on never touches households.membership - a paid facility
    // invoice must not lift a tier freeze (past_due) or reset its dunning.
    tx.update(athleteRef, billingPatch('facility',
        {status: 'active', lastEventId: event.id}));
    return {outcome: 'facility-active', firstActive: false, detail: {}};
  }
  householdActive(tx, hh, event.id, period);
  // A paid subscription invoice is never a one-time purchase: clear
  // `oneTime` even when invoice.paid lands before checkout.session.completed
  // on an upgrade from the single token.
  tx.update(athleteRef, billingPatch('tier',
      {status: 'active', lastEventId: event.id, oneTime: false}));
  const meta = metadataOf(invoice);
  const prepaid = invoice.billing_reason === 'subscription_create' &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(meta.prepaidPeriodKey || ''));
  const firstActive = !wasActive;
  if (!pkg || pkg.tokens === null || pkg.tokens === undefined) {
    return {outcome: prepaid ? 'issued-prepaid' : 'issued', firstActive,
      detail: {skipped: pkg ? 'unlimited' : 'unknown-package'}};
  }
  const startKey = prepaid ? meta.prepaidPeriodKey : period.start;
  if (!startKey) return {outcome: 'no-period', firstActive, detail: {}};
  const derived = lib.periodFor(startKey, 1);
  const parsed = Number.parseInt(meta.prepaidTokens, 10);
  const granted = prepaid && Number.isInteger(parsed) ? parsed : pkg.tokens;
  const doc = {
    athleteId: athleteRef.id || athleteRef.path.split('/').pop(),
    householdId: hh.id,
    periodKey: derived.periodKey,
    periodEnd: derived.periodEnd,
    granted,
    source: 'stripe',
    eventId: event.id,
    createdAt: now(),
  };
  if (prepaid) doc.prepaid = true;
  tx.set(db.collection('tokenPeriods')
      .doc(lib.tokenPeriodId(doc.athleteId, derived.periodKey)), doc);
  return {outcome: prepaid ? 'issued-prepaid' : 'issued', firstActive,
    detail: {periodKey: derived.periodKey, granted}};
}

/**
 * A failed/updated/deleted subscription lands on the owning athlete.
 * @param {!Object} tx The transaction.
 * @param {{athleteRef: !Object, athlete: !Object, product: string,
 *     status: string, priceId: ?string}} args `status` is
 *     `'past_due' | 'lapsed' | 'active'`.
 * @return {{outcome: string}} The status written.
 */
function applyAthleteStatus(tx, args) {
  tx.update(args.athleteRef, billingPatch(args.product,
      {status: args.status, priceId: args.priceId || undefined,
        lastEventId: args.eventId || undefined}));
  return {outcome: args.status};
}

/**
 * The household's OTHER athletes when one athlete's tier subscription ends
 * (D17), from one read. `live`: one of them still holds a live tier
 * (`billing.status` active or past_due) - a pending or lapsed sibling keeps
 * nothing alive. `unbilled`: every live one is a paid single token
 * (`oneTime`, no subscription), so Stripe will never send this household
 * another invoice.paid. Legacy athletes (no `billing`) never reach here as
 * the subject: they resolve by customer -> applyLegacy.
 * @param {!Object} tx The transaction (the read precedes every write).
 * @param {!Object} db Firestore.
 * @param {string} householdId The household.
 * @param {string} athleteId The athlete whose subscription ended.
 * @return {!Promise<{live: boolean, unbilled: boolean}>} The two facts.
 */
async function otherTiers(tx, db, householdId, athleteId) {
  const snap = await tx.get(db.collection('athletes')
      .where('householdId', '==', householdId));
  // Absent `billing` == active (spec 4.4): a legacy sibling keeps the
  // household live too, and its household subscription still bills.
  const live = snap.docs.filter((d) => d.id !== athleteId)
      .map((d) => (d.data() || {}).billing)
      .filter((b) => !b || ['active', 'past_due'].includes(b.status));
  return {
    live: live.length > 0,
    unbilled: live.length > 0 && live.every((b) => Boolean(b) &&
        b.status === 'active' && b.oneTime === true && !b.subscriptionId),
  };
}

/**
 * Does any OTHER athlete in the household still hold a live tier
 * (`otherTiers(...).live`)? Decides whether one athlete's
 * `customer.subscription.deleted` lapses the household (D17).
 * @param {!Object} tx The transaction (the read precedes every write).
 * @param {!Object} db Firestore.
 * @param {string} householdId The household.
 * @param {string} athleteId The athlete whose subscription ended.
 * @return {!Promise<boolean>} True when a sibling keeps the household live.
 */
async function otherTierLive(tx, db, householdId, athleteId) {
  return (await otherTiers(tx, db, householdId, athleteId)).live;
}

/**
 * End a card freeze that has outlived its subscription. A retrying card
 * sets `membership.status` 'past_due' for the whole household, and only a
 * later tier invoice.paid clears it (householdActive). When the athlete's
 * subscription then ENDS and the siblings still live are all paid single
 * tokens (`others.unbilled`), no invoice will ever come: their paid tokens
 * would stay unbookable and a single checkout refused
 * ('household-past-due') with no card left to update. So the freeze ends
 * with the subscription. A sibling with a subscription of its own, a
 * legacy sibling, or one still past_due keeps the freeze exactly as before.
 * @param {!Object} tx The transaction.
 * @param {!Object} hh The household `{id, ref, data}`.
 * @param {{live: boolean, unbilled: boolean}} others `otherTiers`' result.
 * @param {string} eventId The event.
 * @param {string} subStatus The ended subscription's Stripe status.
 * @return {boolean} True when the freeze was lifted.
 */
function liftEndedFreeze(tx, hh, others, eventId, subStatus) {
  const membership = (hh.data && hh.data.membership) || {};
  if (membership.status !== 'past_due' || !others.unbilled) return false;
  tx.update(hh.ref, {
    'membership.status': 'active',
    'membership.stripeSubscriptionStatus': subStatus,
    'membership.lastEventId': eventId,
    'membership.attemptCount': null,
    'membership.nextPaymentAttempt': null,
    'membership.lastFailedAt': null,
    'membership.updatedAt': now(),
  });
  return true;
}

/**
 * The payment-received notice on an athlete's FIRST active (spec 4.3).
 * Idempotent on `membership_${athleteId}_paid`. Never throws.
 * @param {{householdId: string, athleteId: string, athleteName: ?string,
 *     pkg: ?Object}} args The athlete.
 * @return {!Promise<void>} Resolves when recorded.
 */
async function sendPaymentReceived(args) {
  const copy = notices.paymentReceived({
    bookingOpen: lib.bookingOpen(Date.now(), args.pkg),
    athleteName: args.athleteName || null,
  });
  try {
    await notify.sendNotice({
      kind: 'membership', category: 'billing',
      householdId: args.householdId, athleteId: args.athleteId,
      subjectKey: `${args.athleteId}_paid`,
      title: copy.title, body: copy.body,
    });
  } catch (err) {
    console.error('sendPaymentReceived error:', err);
  }
}

module.exports = {
  applyAthleteInvoicePaid, applyAthleteStatus, billingPatch, householdActive,
  liftEndedFreeze, otherTierLive, otherTiers, sendPaymentReceived,
};
