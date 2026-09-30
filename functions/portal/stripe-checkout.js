/**
 * `checkout.session.completed` (spec 4.3). Line items are read from Stripe
 * BEFORE the transaction; one recurring line (qty 1) plus at most one
 * one-time prepaid line (qty 1) is the only accepted shape (decision D13).
 * A payment-mode session (the one-time single token) has its own shape:
 * exactly one one-time line, qty 1, of the catalogue's single price (or a
 * retired one).
 */
'use strict';

const {FieldValue} = require('firebase-admin/firestore');
const {parseClientReference} = require('./stripe-resolve');
const {billingPatch} = require('./stripe-billing');

/**
 * The payment-mode shape (single token): exactly one line, quantity 1, no
 * `price.recurring`, and its price is the catalogue's single price
 * (non-null) or one of the retired ids.
 * @param {!Array<!Object>} list The line items.
 * @param {{singlePriceId: ?string, retired: (!Array<string>|undefined)}}
 *     opts The accepted price ids for the current STRIPE_MODE.
 * @return {{ok: boolean, priceId: ?string, oneTime: (boolean|undefined),
 *     reason: ?string}} The single price, or 'unexpected-one-time'.
 */
function paymentShapeOf(list, opts) {
  const line = list.length === 1 ? list[0] : null;
  const price = line && line.price;
  const id = (price && price.id) || null;
  const retired = Array.isArray(opts.retired) ? opts.retired : [];
  const known = id !== null &&
      ((Boolean(opts.singlePriceId) && id === opts.singlePriceId) ||
      retired.includes(id));
  if (!price || Number(line.quantity) !== 1 || price.recurring || !known) {
    return {ok: false, priceId: null, reason: 'unexpected-one-time'};
  }
  return {ok: true, priceId: id, oneTime: true, reason: null};
}

/**
 * The accepted line-item shape (D13): exactly one recurring line, at most
 * one one-time line, every quantity 1, nothing without a price. With
 * `opts.mode === 'payment'` the single-token shape applies instead
 * (paymentShapeOf).
 * @param {!Array<!Object>} items `listLineItems(...).data` (or the stub).
 * @param {{mode: string, singlePriceId: ?string,
 *     retired: (!Array<string>|undefined)}=} opts Payment mode only.
 * @return {{ok: boolean, priceId: ?string, reason: ?string}} The recurring
 *     price id, or `reason: 'unexpected-quantity'`; in payment mode the
 *     single price with `oneTime: true`, or 'unexpected-one-time'.
 */
function shapeOf(items, opts) {
  const list = Array.isArray(items) ? items : [];
  if (opts && opts.mode === 'payment') return paymentShapeOf(list, opts);
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
 * @param {!Object=} opts shapeOf's options (payment mode only).
 * @return {!Promise<{ok: boolean, priceId: ?string, reason: ?string}>}
 *     The recurring (or single) price, or why the shape is refused.
 */
async function readLineItems(stripe, sessionId, opts) {
  if (process.env.FUNCTIONS_EMULATOR === 'true' &&
      process.env.STRIPE_LINE_ITEMS_STUB) {
    const stub = JSON.parse(process.env.STRIPE_LINE_ITEMS_STUB)[sessionId];
    if (stub) return shapeOf(stub, opts);
  }
  const list = await stripe.checkout.sessions.listLineItems(sessionId,
      {limit: 10});
  return shapeOf((list && list.data) || [], opts);
}

/**
 * Link a Stripe customer to the household: always added to
 * `stripeCustomerIds`, and `stripeCustomerId` set only when absent.
 * @param {!Object} tx The transaction.
 * @param {!Object} hh The household `{id, ref, data}`.
 * @param {?string} customerId The session's customer (null == no write).
 */
function linkCustomer(tx, hh, customerId) {
  if (!customerId) return;
  const hp = {stripeCustomerIds: FieldValue.arrayUnion(customerId)};
  if (!hh.data.stripeCustomerId) hp.stripeCustomerId = customerId;
  tx.update(hh.ref, hp);
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
  // A tier subscription is not a one-time purchase: clear `oneTime` so an
  // athlete moving off the single token is no longer payment-pending.
  const patch = billingPatch(ref.product, {
    status, customerId, subscriptionId: subId, priceId,
    checkoutSessionId: session.id, lastEventId: event.id,
    oneTime: ref.product === 'tier' ? false : undefined,
  });
  if (ref.product === 'tier' && args.packageId &&
      args.packageId !== athlete.packageId) {
    patch.packageId = args.packageId;
    patch.updatedAt = FieldValue.serverTimestamp();
  }
  tx.update(athleteRef, patch);
  linkCustomer(tx, hh, customerId);
  return {outcome: 'applied-checkout',
    firstActive: ref.product === 'tier' && status === 'active' && !wasActive,
    detail: {product: ref.product, status, priceId,
      packageId: patch.packageId || null}};
}

module.exports = {
  applyCheckoutCompleted, linkCustomer, parseClientReference, readLineItems,
  shapeOf,
};
