/**
 * `checkout.session.completed` (spec 4.3). Line items are read from Stripe
 * BEFORE the transaction; one recurring line (qty 1) plus at most one
 * one-time prepaid line (qty 1) is the only accepted shape (decision D13).
 */
'use strict';

const {FieldValue} = require('firebase-admin/firestore');
const {parseClientReference} = require('./stripe-resolve');
const {billingPatch} = require('./stripe-billing');

/**
 * The accepted line-item shape (D13): exactly one recurring line, at most
 * one one-time line, every quantity 1, nothing without a price.
 * @param {!Array<!Object>} items `listLineItems(...).data` (or the stub).
 * @return {{ok: boolean, priceId: ?string, reason: ?string}} The recurring
 *     price id, or `reason: 'unexpected-quantity'`.
 */
function shapeOf(items) {
  const list = Array.isArray(items) ? items : [];
  const recurring = list.filter((i) => i && i.price && i.price.recurring);
  const oneTime = list.filter((i) => i && i.price && !i.price.recurring);
  const badQty = list.some((i) => Number(i && i.quantity) !== 1);
  if (recurring.length !== 1 || oneTime.length > 1 || badQty ||
      list.length !== recurring.length + oneTime.length) {
    return {ok: false, priceId: null, reason: 'unexpected-quantity'};
  }
  return {ok: true, priceId: recurring[0].price.id, reason: null};
}

/**
 * The session's line items, shaped. Under the emulator ONLY, a JSON map
 * `STRIPE_LINE_ITEMS_STUB` (sessionId -> items, functions/.env.local)
 * stands in for Stripe so test/verify-stripe-launch.js runs offline; the
 * guard is FUNCTIONS_EMULATOR, so production never reads it.
 * @param {!Object} stripe The Stripe client.
 * @param {string} sessionId The Checkout Session id.
 * @return {!Promise<{ok: boolean, priceId: ?string, reason: ?string}>}
 *     The recurring price, or why the shape is refused.
 */
async function readLineItems(stripe, sessionId) {
  if (process.env.FUNCTIONS_EMULATOR === 'true' &&
      process.env.STRIPE_LINE_ITEMS_STUB) {
    const stub = JSON.parse(process.env.STRIPE_LINE_ITEMS_STUB)[sessionId];
    if (stub) return shapeOf(stub);
  }
  const list = await stripe.checkout.sessions.listLineItems(sessionId,
      {limit: 10});
  return shapeOf((list && list.data) || []);
}

/**
 * Write the athlete's billing block, correct `packageId` to the PAID
 * package, link the customer to the household.
 * @param {!Object} tx The transaction.
 * @param {{event: !Object, session: !Object, ref: !Object, priceId: string,
 *     athlete: !Object, athleteRef: !Object, hh: !Object,
 *     packageId: ?string}} args `ref` is the parsed client reference,
 *     `packageId` the catalogue's mapping of `priceId` (null == unknown).
 * @return {{outcome: string, firstActive: boolean, detail: !Object}}
 */
function applyCheckoutCompleted(tx, args) {
  const {event, session, ref, priceId, athlete, athleteRef, hh} = args;
  const customerId = typeof session.customer === 'string' ?
      session.customer : (session.customer && session.customer.id) || null;
  const subId = typeof session.subscription === 'string' ?
      session.subscription : (session.subscription &&
      session.subscription.id) || null;
  const status = session.payment_status === 'paid' ? 'active' : 'pending';
  // A SECOND completed checkout for an athlete whose live subscription is a
  // different one (two tabs, a double tap while confirming): never
  // overwrite - the first subscription keeps billing. The ledger row names
  // both so ops can cancel and refund the duplicate in Stripe.
  const current = ref.product === 'facility' ?
      athlete.facilityBilling : athlete.billing;
  if (current && current.subscriptionId && subId &&
      current.subscriptionId !== subId &&
      (current.status === 'active' || current.status === 'past_due')) {
    console.warn(`duplicate subscription ${subId} for athlete ` +
        `${athleteRef.id} (${ref.product}); keeping ${current.subscriptionId}`);
    return {outcome: 'duplicate-subscription', firstActive: false,
      detail: {product: ref.product, existing: current.subscriptionId,
        incoming: subId}};
  }
  const wasActive = !athlete.billing || athlete.billing.status === 'active';
  const patch = billingPatch(ref.product, {
    status, customerId, subscriptionId: subId, priceId,
    checkoutSessionId: session.id, lastEventId: event.id,
  });
  if (ref.product === 'tier' && args.packageId &&
      args.packageId !== athlete.packageId) {
    patch.packageId = args.packageId;
    patch.updatedAt = FieldValue.serverTimestamp();
  }
  tx.update(athleteRef, patch);
  if (customerId) {
    const hp = {stripeCustomerIds: FieldValue.arrayUnion(customerId)};
    if (!hh.data.stripeCustomerId) hp.stripeCustomerId = customerId;
    tx.update(hh.ref, hp);
  }
  return {outcome: 'applied-checkout',
    firstActive: ref.product === 'tier' && status === 'active' && !wasActive,
    detail: {product: ref.product, status, priceId,
      packageId: patch.packageId || null}};
}

module.exports = {
  applyCheckoutCompleted, parseClientReference, readLineItems, shapeOf,
};
