/**
 * `checkout.session.completed` for a PAYMENT-mode session: the one-time
 * single session token (owner rulings 2026-09-29/30). One paid Checkout
 * Session is one `graceTokens/single_{cs}` document, good through
 * single.SEASON_END. The id is the idempotency key: a redelivery or a
 * manual Resend under a new event id finds it and writes nothing.
 *
 * Runs inside the webhook's stripeEvents transaction. The caller (stripe.js)
 * has read the household, the athlete and the line items; this module makes
 * its own reads (the token doc, the household's athletes when it is lapsed)
 * before any write. It never writes tokenPeriods or periodAnchorDay.
 */
'use strict';

const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const single = require('./single');
const {billingPatch} = require('./stripe-billing');
const {linkCustomer} = require('./stripe-checkout');
const {membershipPatch} = require('./stripe-legacy');

/**
 * @param {*} v A Stripe id or expanded object.
 * @return {?string} The id.
 */
function idOf(v) {
  if (!v) return null;
  return typeof v === 'string' ? v : (v.id || null);
}

/**
 * The token document for one paid session (spec `representation`).
 * @param {{session: !Object, event: !Object, athleteId: string,
 *     householdId: string, priceId: ?string}} a The purchase.
 * @return {!Object} The `graceTokens/single_{cs}` body.
 */
function singleTokenDoc(a) {
  const s = a.session || {};
  return {
    athleteId: a.athleteId,
    householdId: a.householdId,
    expiresAt: single.SEASON_END,
    reason: 'single-purchase',
    sourceSessionId: null,
    createdBy: 'stripe',
    createdAt: FieldValue.serverTimestamp(),
    checkoutSessionId: s.id || null,
    paymentIntentId: single.paymentIntentIdOf(s),
    amountTotal: Number.isFinite(s.amount_total) ? s.amount_total : null,
    currency: s.currency || null,
    priceId: a.priceId || null,
    purchasedOn: lib.chicagoDateFromUnix(a.event && a.event.created),
    eventId: (a.event && a.event.id) || null,
  };
}

/**
 * Does every OTHER athlete of the household carry its own billing block?
 * Only then may a paid single lift a lapsed household: lifting it would
 * otherwise re-open booking for a legacy sibling nobody paid for.
 * @param {!Object} snap The household's athletes query snapshot.
 * @param {string} athleteId The buyer.
 * @return {boolean} True when no other athlete is legacy (no billing).
 */
function othersAllBilled(snap, athleteId) {
  return snap.docs.every((d) => d.id === athleteId ||
      Boolean((d.data() || {}).billing));
}

/**
 * Issue one single token for a paid payment-mode Checkout Session.
 * @param {!Object} tx The transaction (no write has happened yet).
 * @param {{db: !Object, event: !Object, session: !Object, ref: !Object,
 *     priceId: ?string, athlete: !Object, athleteRef: !Object,
 *     hh: !Object}} args `ref` is the parsed client reference, `priceId`
 *     the single (or a retired) price the line items named.
 * @return {!Promise<{outcome: string, firstActive: boolean,
 *     detail: !Object}>} What was applied.
 */
async function applySinglePurchase(tx, args) {
  const {db, event, session, ref, priceId, athlete, athleteRef, hh} = args;
  const graceTokenId = single.tokenIdFor(session.id);
  const tokenRef = db.collection('graceTokens').doc(graceTokenId);
  const detail = {graceTokenId, expiresAt: single.SEASON_END,
    paymentIntentId: single.paymentIntentIdOf(session)};
  const none = (outcome) => ({outcome, firstActive: false, detail});

  // ---- reads ----
  if ((await tx.get(tokenRef)).exists) return none('duplicate-purchase');
  if (!ref || ref.product !== 'tier') return none('unexpected-one-time');
  if (session.payment_status !== 'paid') return none('single-unpaid');
  const membership = (hh.data && hh.data.membership) || {};
  const lapsed = membership.status === 'lapsed';
  let lift = false;
  if (lapsed) {
    const snap = await tx.get(db.collection('athletes')
        .where('householdId', '==', hh.id));
    lift = othersAllBilled(snap, athleteRef.id);
  }

  // ---- writes ----
  tx.set(tokenRef, singleTokenDoc({session, event, athleteId: athleteRef.id,
    householdId: hh.id, priceId}));
  const billing = athlete.billing || {};
  // A live monthly subscription keeps billing: the token is a top-up.
  const topUp = Boolean(billing.subscriptionId) && billing.oneTime !== true &&
      ['active', 'past_due'].includes(billing.status);
  const customerId = idOf(session.customer);
  if (!topUp) {
    const old = billing.subscriptionId || null;
    const patch = billingPatch('tier', {
      status: 'active', oneTime: true, subscriptionId: null,
      // Never clear a linked customer with a session that carries none.
      customerId: customerId || undefined,
      priceId, checkoutSessionId: session.id, lastEventId: event.id,
      retiredSubscriptionIds: old ? FieldValue.arrayUnion(old) : undefined,
    });
    if (athlete.packageId !== single.SINGLE_ID) {
      patch.packageId = single.SINGLE_ID;
      patch.updatedAt = FieldValue.serverTimestamp();
    }
    tx.update(athleteRef, patch);
  }
  // past_due is never touched: the card on the family's subscription still
  // needs updating, and a token purchase does not pay that invoice. The
  // lift rides in the customer link's update (one household write).
  linkCustomer(tx, hh, customerId, lift ?
      membershipPatch({status: 'active', lastEventId: event.id}) : undefined);

  const purchasedOn = lib.chicagoDateFromUnix(event.created);
  let outcome = 'issued-single';
  if (purchasedOn && purchasedOn > single.SEASON_END) {
    outcome = 'issued-single-late';
  } else if (topUp) {
    outcome = 'issued-single-topup';
  } else if (lapsed && !lift) {
    outcome = 'issued-single-household-lapsed';
  } else if (session.amount_total !== single.SINGLE_PRICE_CENTS) {
    outcome = 'issued-single-amount-check';
  }
  return {outcome,
    firstActive: !topUp && Boolean(athlete.billing) &&
        athlete.billing.status !== 'active',
    detail};
}

/**
 * A PAID payment-mode session of the portal's (it carries a client
 * reference) that left no token behind: the family is out the price until
 * ops repairs the ledger row (RUNBOOK 10.7). 'duplicate-purchase' is a
 * replay of a token already issued; a session with no reference is not the
 * portal's sale.
 * @param {?Object} session The checkout event's `data.object`.
 * @param {?string} outcome The ledger outcome.
 * @return {boolean} True when the row needs ops review.
 */
function paidWithoutToken(session, outcome) {
  const s = session || {};
  return s.mode === 'payment' && s.payment_status === 'paid' &&
      Boolean(s.client_reference_id) &&
      !String(outcome).startsWith('issued-single') &&
      outcome !== 'duplicate-purchase';
}

module.exports = {applySinglePurchase, paidWithoutToken, singleTokenDoc};
