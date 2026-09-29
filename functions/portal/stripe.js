/**
 * The Stripe webhook (contract v2.1, TEAM.md Sprint 13 pin H).
 *
 * The first authenticated production HTTPS function this app has. It reads
 * the RAW body, verifies Stripe's signature against STRIPE_WEBHOOK_SECRET,
 * and is idempotent on `event.id` via `stripeEvents/{eventId}` — an
 * admin-only collection no client can read or write. The event document is
 * created in the SAME transaction as its effect, so a redelivery is a no-op
 * by construction.
 *
 * Bounded effects (issuing tokens, flipping membership status, remapping
 * packages) commit inside that transaction. Unbounded ones (revoking a
 * household's future bookings, cancelling downgrade excess) would blow a
 * transaction's write budget, so the transaction commits the event document
 * with outcome 'processing' and the follow-up phase runs in chunked batches,
 * then writes the final outcome. A crash mid-follow-up leaves 'processing'
 * on the record — visible in the ledger, which is the point of the ledger.
 *
 * Freeze before revoke is deliberate (policy section 10): an expired card
 * blocks NEW bookings immediately and costs nothing already booked until
 * Stripe's final retry.
 *
 * Sprint 20 (spec 4.3): billing is per ATHLETE. `checkout.session.completed`
 * joins the handled set; every event resolves to an athlete first
 * (stripe-resolve.js), the athlete writers live in stripe-billing.js and
 * stripe-checkout.js, and the pre-Sprint-20 household-wide path
 * (stripe-legacy.js) serves families that still resolve by customer only.
 * Stripe reads (line items, the checkout-session lookup) happen BEFORE the
 * transaction; every Firestore effect and its ledger row commit in ONE.
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
// The modular entry point, not admin.firestore.FieldValue: the Functions
// emulator replaces the admin.firestore namespace with a plain function, so
// the sentinel is undefined there and every write throws at runtime.
const {FieldValue} = require('firebase-admin/firestore');
const Stripe = require('stripe');
const revoke = require('./revoke');
const catalogue = require('./catalogue');
const resolve = require('./stripe-resolve');
const billing = require('./stripe-billing');
const checkout = require('./stripe-checkout');
const legacy = require('./stripe-legacy');

const {applyLapsed, applyLegacy, applyPastDue, invoicePeriod,
  membershipPatch} = legacy;

/** Event types this handler acts on; anything else is recorded as ignored. */
const HANDLED = new Set([
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.deleted',
  'customer.subscription.updated',
]);

let stripeClient;

/**
 * A Stripe client. `webhooks.constructEvent` needs no API key; the
 * checkout-session lookup and `listLineItems` (Sprint 20) use
 * STRIPE_SECRET_KEY when it is set — the placeholder keeps signature
 * verification working on an instance with no secret key set.
 * @return {!Object} The Stripe SDK client.
 */
function stripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(
        process.env.STRIPE_SECRET_KEY || 'sk_test_signature_verification_only');
  }
  return stripeClient;
}

/** @return {!Object} The admin Firestore, resolved lazily. */
function db() {
  return admin.firestore();
}

/** @return {!Object} A server timestamp sentinel. */
function now() {
  return FieldValue.serverTimestamp();
}

/**
 * The Stripe customer id an event is about. Invoices and subscriptions both
 * carry `customer` at the top level of `data.object`.
 * @param {!Object} object `event.data.object`.
 * @return {?string} The customer id.
 */
function customerIdOf(object) {
  const c = object && object.customer;
  if (!c) return null;
  return typeof c === 'string' ? c : (c.id || null);
}

/**
 * Subscription status -> the athlete billing status it means.
 * @param {?string} s Stripe's `subscription.status`.
 * @return {?string} `'active' | 'past_due' | 'lapsed'`, or null to leave.
 */
function athleteStatusFor(s) {
  if (s === 'active' || s === 'trialing') return 'active';
  if (s === 'past_due') return 'past_due';
  if (s === 'canceled' || s === 'unpaid' ||
      s === 'incomplete_expired') return 'lapsed';
  return null;
}

/**
 * `customer.subscription.updated` for ONE athlete: status, price, and a
 * package remap (with the downgrade follow-up) for that athlete alone.
 * Signature `(tx, event, hh, athlete, athleteRef, product)` - exactly what
 * `handleEvent` passes; the athlete's CURRENT package is not needed here.
 * @param {!Object} tx The transaction.
 * @param {!Object} event The event.
 * @param {!Object} hh The household.
 * @param {!Object} athlete The athlete body.
 * @param {!Object} athleteRef Its ref.
 * @param {string} product `'tier' | 'facility'`.
 * @return {!Promise<!Object>} What was applied.
 */
async function applyAthleteSubscriptionUpdated(tx, event, hh, athlete,
    athleteRef, product) {
  const sub = event.data.object || {};
  const priceId = resolve.priceIdOf(sub);
  const period = resolve.periodOf(sub);
  const packageId = product === 'tier' ?
      catalogue.packageIdForPrice(priceId) : null;
  // The ONE read this helper makes, before any write: the NEW package's
  // token count is what revoke.trimDowngrade (`revoke.js:84`) falls back to
  // when a period has no tokenPeriods doc yet.
  let newPkg = null;
  if (packageId && packageId !== athlete.packageId) {
    const snap = await tx.get(db().collection('packages').doc(packageId));
    newPkg = snap.exists ? snap.data() : null;
  }
  if (product === 'tier') {
    // D10: only the tier subscription speaks for households.membership;
    // the add-on's status and period stay on athletes.facilityBilling.
    tx.update(hh.ref, membershipPatch({
      stripeSubscriptionStatus: sub.status || null,
      currentPeriodStart: period.start, currentPeriodEnd: period.end,
      lastEventId: event.id,
    }));
  }
  const status = athleteStatusFor(sub.status);
  if (status) {
    billing.applyAthleteStatus(tx, {athleteRef, athlete, product, status,
      priceId});
  }
  if (!packageId || packageId === athlete.packageId) {
    return {outcome: 'no-change', detail: {priceId, packageId}};
  }
  tx.update(athleteRef, {packageId, updatedAt: now()});
  return {outcome: 'processing', followUp: 'downgrade', detail: {
    priceId, packageId, athleteIds: [athleteRef.id],
    tokens: newPkg && newPkg.tokens !== undefined ? newPkg.tokens : null}};
}

/**
 * Verify, dedupe and apply one Stripe event. Stripe reads (line items, the
 * checkout-session lookup) happen BEFORE the transaction.
 * @param {!Object} event A signature-verified Stripe event.
 * @return {!Promise<!Object>} Always 200-shaped.
 */
async function handleEvent(event) {
  const eventRef = db().collection('stripeEvents').doc(event.id);
  const object = (event.data && event.data.object) || {};
  const customer = customerIdOf(object);
  const handled = HANDLED.has(event.type);
  const isCheckout = event.type === 'checkout.session.completed';

  let subject = null;
  let pre = {outcome: null};
  if (handled && !(await eventRef.get()).exists) {
    try {
      if (isCheckout) {
        subject = resolve.parseClientReference(object.client_reference_id);
        if (object.mode !== 'subscription' || !subject) {
          pre.outcome = 'ignored';
        } else {
          pre = await checkout.readLineItems(stripe(), object.id);
          if (!pre.ok) pre.outcome = pre.reason;
        }
      } else {
        subject = await resolve.resolveSubject(event,
            {db: db(), stripe: stripe()});
      }
    } catch (err) {
      if (err instanceof resolve.StripeLookupError) {
        pre.outcome = 'stripe-lookup-failed';
      } else {
        throw err;
      }
    }
  }

  const planned = await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) {
      return {duplicate: true,
        outcome: (existing.data() || {}).outcome || 'duplicate'};
    }
    let hh = null;
    let athlete = null;
    let athleteRef = null;
    if (handled && !pre.outcome && subject && subject.householdId) {
      const hhSnap = await tx.get(
          db().collection('households').doc(subject.householdId));
      hh = hhSnap.exists ?
          {id: hhSnap.id, data: hhSnap.data() || {}, ref: hhSnap.ref} : null;
      if (hh && subject.athleteId) {
        athleteRef = db().collection('athletes').doc(subject.athleteId);
        const aSnap = await tx.get(athleteRef);
        athlete = aSnap.exists ? aSnap.data() || {} : null;
        if (!athlete || athlete.householdId !== hh.id) {
          athlete = null;
          hh = null;
        }
      }
    }
    let pkg = null;
    if (athlete && athlete.packageId) {
      const pkgSnap = await tx.get(
          db().collection('packages').doc(athlete.packageId));
      pkg = pkgSnap.exists ? pkgSnap.data() : null;
    }
    // The payment-received notice speaks for the PAID package (spec 4.3
    // remaps packageId to the paid price; the family may have changed its
    // choice after opening checkout): the checkout's line item, or the
    // subscription metadata's packageId. Read here, before any write.
    let paidPkg = pkg;
    const paidPackageId = isCheckout && pre.priceId ?
        catalogue.packageIdForPrice(pre.priceId) :
        (subject && subject.packageId) || null;
    if (athlete && paidPackageId && paidPackageId !== athlete.packageId) {
      const paidSnap = await tx.get(
          db().collection('packages').doc(paidPackageId));
      paidPkg = paidSnap.exists ? paidSnap.data() : pkg;
    }

    let applied = {outcome: 'ignored', detail: {}};
    const product = (subject && subject.product) || 'tier';
    if (!handled) {
      applied = {outcome: 'ignored', detail: {}};
    } else if (pre.outcome) {
      applied = {outcome: pre.outcome, detail: {}};
    } else if (!hh) {
      applied = {outcome: 'unmatched', detail: {}};
    } else if (isCheckout) {
      applied = checkout.applyCheckoutCompleted(tx, {
        event, session: object, ref: subject, priceId: pre.priceId,
        athlete, athleteRef, hh,
        packageId: catalogue.packageIdForPrice(pre.priceId)});
    } else if (!athlete) {
      // Legacy resolution by customer only: the household-wide path.
      applied = await applyLegacy(tx, event, hh, object);
    } else if (event.type === 'invoice.paid') {
      applied = billing.applyAthleteInvoicePaid(tx, {db: db(), event, hh,
        athleteRef, athlete, pkg: paidPkg, product,
        period: invoicePeriod(object)});
    } else if (event.type === 'invoice.payment_failed') {
      const final = object.next_payment_attempt === null ||
          object.next_payment_attempt === undefined;
      const status = final ? 'lapsed' : 'past_due';
      if (product === 'facility') {
        // D10: the add-on fails alone - membership and bookings untouched.
        applied = billing.applyAthleteStatus(tx, {athleteRef, athlete,
          product, status, priceId: null});
      } else if (final) {
        // D17: a FINAL failure ends this athlete's subscription (Stripe's
        // dunning cancels it next) - the same per-athlete rule as deleted.
        const siblingLive = await billing.otherTierLive(tx, db(), hh.id,
            athleteRef.id);
        billing.applyAthleteStatus(tx, {athleteRef, athlete, product,
          status, priceId: null});
        applied = siblingLive ?
            {outcome: 'processing', followUp: 'revoke-athlete', detail: {}} :
            applyLapsed(tx, event, hh, 'unpaid');
      } else {
        // A retrying card freezes the household (spec 14, accepted).
        applied = applyPastDue(tx, event, hh);
        billing.applyAthleteStatus(tx, {athleteRef, athlete, product,
          status, priceId: null});
      }
    } else if (event.type === 'customer.subscription.deleted') {
      if (product === 'facility') {
        // D10: facilityBilling.status 'lapsed' + facilityAccess false ONLY;
        // no applyLapsed, no followUp 'revoke'.
        applied = billing.applyAthleteStatus(tx, {athleteRef, athlete,
          product, status: 'lapsed', priceId: resolve.priceIdOf(object)});
      } else {
        // D17: THIS athlete lapses and loses their future bookings; the
        // household (and every sibling's bookings) only when no sibling
        // still holds a live tier. The read precedes every write here.
        const siblingLive = await billing.otherTierLive(tx, db(), hh.id,
            athleteRef.id);
        billing.applyAthleteStatus(tx, {athleteRef, athlete, product,
          status: 'lapsed', priceId: resolve.priceIdOf(object)});
        applied = siblingLive ?
            {outcome: 'processing', followUp: 'revoke-athlete', detail: {}} :
            applyLapsed(tx, event, hh, object.status || 'canceled');
      }
    } else if (event.type === 'customer.subscription.updated') {
      applied = await applyAthleteSubscriptionUpdated(tx, event, hh, athlete,
          athleteRef, product);
    }

    tx.set(eventRef, {
      type: event.type,
      customer: customer || null,
      householdId: hh ? hh.id : null,
      athleteId: athlete ? athleteRef.id : null,
      via: subject ? subject.via || 'client-reference' : null,
      receivedAt: now(),
      outcome: applied.outcome,
    });
    return {duplicate: false, outcome: applied.outcome,
      followUp: applied.followUp || null, detail: applied.detail || {},
      household: hh, firstActive: applied.firstActive === true,
      athlete: athlete ? {id: athleteRef.id, name: athlete.name || null,
        pkg: paidPkg} : null};
  });

  if (planned.duplicate) {
    console.log(`stripe event ${event.id} already applied ` +
        `(${planned.outcome}) - no effect`);
    return {received: true, outcome: 'duplicate', eventId: event.id};
  }
  let outcome = planned.outcome;
  let summary = null;
  if (planned.followUp === 'revoke') {
    summary = await revoke.revokeHousehold(planned.household, event.id);
    outcome = 'lapsed';
  } else if (planned.followUp === 'revoke-athlete') {
    summary = await revoke.revokeAthlete(planned.household,
        planned.athlete.id, event.id);
    outcome = 'athlete-lapsed';
  } else if (planned.followUp === 'downgrade') {
    summary = await revoke.trimDowngrade(
        planned.household, planned.detail, event.id);
    outcome = 'downgraded';
  }
  if (outcome !== planned.outcome) await eventRef.update({outcome});
  if (planned.firstActive && planned.athlete) {
    await billing.sendPaymentReceived({householdId: planned.household.id,
      athleteId: planned.athlete.id, athleteName: planned.athlete.name,
      pkg: planned.athlete.pkg});
  }
  console.log(`stripe event ${event.id} (${event.type}) -> ${outcome}` +
      `${summary ? ' ' + JSON.stringify(summary) : ''}`);
  return {received: true, outcome, eventId: event.id, summary};
}

/**
 * The HTTPS endpoint. Stripe posts server-to-server, so there is no CORS
 * wrapper and no caller but Stripe can produce a valid signature.
 */
const stripeWebhook = functions.runWith({secrets: ['STRIPE_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY', 'SMTP_USER', 'SMTP_PASS']}).https.onRequest(
    async (req, res) => {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) {
        console.error('STRIPE_WEBHOOK_SECRET is not configured');
        res.status(500).send('Webhook secret not configured');
        return;
      }
      let event;
      try {
        event = stripe().webhooks.constructEvent(
            req.rawBody, req.header('stripe-signature') || '', secret);
      } catch (err) {
        console.error('Stripe signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
      }
      try {
        res.status(200).json(await handleEvent(event));
      } catch (err) {
        // 500 asks Stripe to retry; the event doc is the dedupe guard.
        console.error(`stripe event ${event.id} failed:`, err);
        res.status(500).json({error: err.message, eventId: event.id});
      }
    });

module.exports = {
  customerIdOf,
  handleEvent,
  invoicePeriod,
  periodOf: resolve.periodOf,
  priceIdOf: resolve.priceIdOf,
  resolveSubject: resolve.resolveSubject,
  stripeWebhook,
  subscriptionIdOf: resolve.subscriptionIdOf,
};
