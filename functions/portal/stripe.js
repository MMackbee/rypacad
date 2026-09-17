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
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
// The modular entry point, not admin.firestore.FieldValue: the Functions
// emulator replaces the admin.firestore namespace with a plain function, so
// the sentinel is undefined there and every write throws at runtime.
const {FieldValue} = require('firebase-admin/firestore');
const Stripe = require('stripe');
const lib = require('./lib');
const revoke = require('./revoke');

/** Event types this handler acts on; anything else is recorded as ignored. */
const HANDLED = new Set([
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.deleted',
  'customer.subscription.updated',
]);

let stripeClient;

/**
 * A Stripe client. Only `webhooks.constructEvent` is used, which needs no
 * API key, but the constructor wants a string — the placeholder keeps
 * signature verification working on an instance with no secret key set.
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
 * The billing period an invoice covers, as America/Chicago calendar dates.
 * The invoice LINE's period is authoritative (pin H); `period_start` /
 * `period_end` on the invoice itself are the documented fallback.
 * @param {!Object} invoice `event.data.object` for an invoice event.
 * @return {{start: ?string, end: ?string}} `'YYYY-MM-DD'` or nulls.
 */
function invoicePeriod(invoice) {
  const lines = (invoice.lines && invoice.lines.data) || [];
  const line = lines.find((l) => l && l.period && l.period.start) || null;
  const startUnix = line ? line.period.start : invoice.period_start;
  const endUnix = line ? line.period.end : invoice.period_end;
  return {
    start: lib.chicagoDateFromUnix(startUnix),
    end: lib.chicagoDateFromUnix(endUnix),
  };
}

/**
 * Flatten a membership patch into dot paths, so an update only touches the
 * fields it names and leaves the rest of `households.membership` alone
 * (absent == active, so a partial map is always a legal state).
 * @param {!Object} fields The membership fields to set.
 * @return {!Object} A Firestore update payload.
 */
function membershipPatch(fields) {
  const patch = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) patch[`membership.${k}`] = v;
  }
  patch['membership.updatedAt'] = now();
  return patch;
}

/**
 * `invoice.paid` — issue the period's tokens and set the household active.
 * Reinstatement after a lapse is this same path; revoked bookings stay
 * cancelled. Elite athletes get no `tokenPeriods` document.
 * @param {!Object} tx The transaction.
 * @param {!Object} event The Stripe event.
 * @param {!Object} hh The resolved household.
 * @return {!Promise<{outcome: string, detail: !Object}>} What was applied.
 */
async function applyInvoicePaid(tx, event, hh) {
  const invoice = event.data.object || {};
  const period = invoicePeriod(invoice);
  if (!period.start) return {outcome: 'no-period', detail: {}};

  // The anchor the app derives every period from. Clamped 1..28 (pin H), so
  // a cycle starting on the 29th-31st anchors on the 28th.
  const anchorDay = lib.anchorDayFromISO(period.start);
  // periodKey is the Stripe period start as a Chicago date. It is passed
  // through periodFor so the id is always one the hooks can look up by id
  // for "this period" — identical to period.start for every start on days
  // 1..28, i.e. every start the anchor clamp can represent.
  const derived = lib.periodFor(period.start, anchorDay);
  const periodKey = derived.periodKey;
  const periodEnd = derived.periodEnd;

  const athletesSnap = await tx.get(db().collection('athletes')
      .where('householdId', '==', hh.id));
  const issued = [];
  const skipped = [];
  for (const doc of athletesSnap.docs) {
    const athlete = doc.data() || {};
    if (!athlete.packageId) {
      skipped.push({athleteId: doc.id, reason: 'no-package'});
      continue;
    }
    const pkgSnap = await tx.get(
        db().collection('packages').doc(athlete.packageId));
    const pkg = pkgSnap.exists ? pkgSnap.data() : null;
    if (!pkg || pkg.tokens === null || pkg.tokens === undefined) {
      // Elite (tokens: null) never reads a tokenPeriods doc, so never gets
      // one. An unknown package id is recorded rather than guessed at.
      skipped.push({
        athleteId: doc.id,
        reason: pkg ? 'unlimited' : 'unknown-package',
      });
      continue;
    }
    issued.push({athleteId: doc.id, granted: pkg.tokens});
  }

  // ---- reads done ----
  for (const row of issued) {
    tx.set(db().collection('tokenPeriods')
        .doc(lib.tokenPeriodId(row.athleteId, periodKey)), {
      athleteId: row.athleteId,
      householdId: hh.id,
      periodKey,
      periodEnd,
      granted: row.granted,
      source: 'stripe',
      eventId: event.id,
      createdAt: now(),
    });
  }
  tx.update(hh.ref, Object.assign({periodAnchorDay: anchorDay},
      membershipPatch({
        status: 'active',
        stripeSubscriptionStatus: 'active',
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        lastEventId: event.id,
        // Contract v2.4: a paid invoice ends the retry sequence.
        attemptCount: null,
        nextPaymentAttempt: null,
        lastFailedAt: null,
      })));

  return {
    outcome: 'issued',
    detail: {periodKey, periodEnd, anchorDay, issued, skipped},
  };
}

/**
 * `invoice.payment_failed` on a retry that Stripe will attempt again —
 * freeze only. Idempotent: writing 'past_due' twice is the same state.
 * @param {!Object} tx The transaction.
 * @param {!Object} event The Stripe event.
 * @param {!Object} hh The resolved household.
 * @return {{outcome: string, detail: !Object}} What was applied.
 */
function applyPastDue(tx, event, hh) {
  // Contract v2.4 (Sprint 16): the retry position the Billing hub draws -
  // Stripe's own attempt count and next attempt, plus when this one failed.
  const inv = event.data.object || {};
  tx.update(hh.ref, membershipPatch({
    status: 'past_due',
    stripeSubscriptionStatus: 'past_due',
    lastEventId: event.id,
    attemptCount: Number.isInteger(inv.attempt_count) ?
      inv.attempt_count : null,
    nextPaymentAttempt: lib.chicagoDateFromUnix(inv.next_payment_attempt),
    lastFailedAt: lib.chicagoDateFromUnix(event.created),
  }));
  return {outcome: 'past_due', detail: {}};
}

/**
 * The final failure, or a deleted subscription — lapse now, revoke in the
 * follow-up phase.
 * @param {!Object} tx The transaction.
 * @param {!Object} event The Stripe event.
 * @param {!Object} hh The resolved household.
 * @param {string} subStatus The Stripe subscription status to record.
 * @return {{outcome: string, followUp: string, detail: !Object}} Applied.
 */
function applyLapsed(tx, event, hh, subStatus) {
  tx.update(hh.ref, membershipPatch({
    status: 'lapsed',
    stripeSubscriptionStatus: subStatus,
    lastEventId: event.id,
  }));
  return {outcome: 'processing', followUp: 'revoke', detail: {}};
}

/**
 * `customer.subscription.updated` — remap the household's athletes when the
 * subscription's price maps to a different package.
 *
 * The decision is made by COMPARING STATE (does the mapped package differ
 * from what the athletes hold?) rather than by reading
 * `event.data.previous_attributes`, so a redelivered or out-of-order event
 * converges instead of double-applying.
 * @param {!Object} tx The transaction.
 * @param {!Object} event The Stripe event.
 * @param {!Object} hh The resolved household.
 * @return {!Promise<{outcome: string, followUp: (string|undefined),
 *     detail: !Object}>} What was applied.
 */
async function applySubscriptionUpdated(tx, event, hh) {
  const sub = event.data.object || {};
  const items = (sub.items && sub.items.data) || [];
  const priceId = (items[0] && items[0].price && items[0].price.id) ||
      (sub.plan && sub.plan.id) || null;
  const membership = membershipPatch({
    stripeSubscriptionStatus: sub.status || null,
    currentPeriodStart: lib.chicagoDateFromUnix(sub.current_period_start),
    currentPeriodEnd: lib.chicagoDateFromUnix(sub.current_period_end),
    lastEventId: event.id,
  });
  if (!priceId) {
    tx.update(hh.ref, membership);
    return {outcome: 'no-price', detail: {}};
  }

  const pkgSnap = await tx.get(db().collection('packages')
      .where('stripePriceId', '==', priceId).limit(1));
  if (pkgSnap.empty) {
    tx.update(hh.ref, membership);
    return {outcome: 'unmapped-price', detail: {priceId}};
  }
  const packageId = pkgSnap.docs[0].id;
  const pkg = pkgSnap.docs[0].data() || {};

  const athletesSnap = await tx.get(db().collection('athletes')
      .where('householdId', '==', hh.id));
  const changed = athletesSnap.docs.filter(
      (d) => (d.data() || {}).packageId !== packageId);

  // ---- reads done ----
  tx.update(hh.ref, membership);
  for (const doc of changed) {
    tx.update(doc.ref, {packageId, updatedAt: now()});
  }
  if (changed.length === 0) {
    return {outcome: 'no-change', detail: {priceId, packageId}};
  }
  return {
    outcome: 'processing',
    followUp: 'downgrade',
    detail: {
      priceId,
      packageId,
      tokens: pkg.tokens === undefined ? null : pkg.tokens,
      athleteIds: changed.map((d) => d.id),
    },
  };
}

/**
 * Verify, dedupe and apply one Stripe event.
 * @param {!Object} event A signature-verified Stripe event.
 * @return {!Promise<!Object>} The response body: always 200-shaped, because
 *     a handled-and-recorded event must never be retried by Stripe.
 */
async function handleEvent(event) {
  const eventRef = db().collection('stripeEvents').doc(event.id);
  const object = (event.data && event.data.object) || {};
  const customer = customerIdOf(object);

  const planned = await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) {
      return {
        duplicate: true,
        outcome: (existing.data() || {}).outcome || 'duplicate',
      };
    }

    let hh = null;
    if (HANDLED.has(event.type)) {
      hh = lib.householdFromSnap(
          await tx.get(lib.householdByCustomerQuery(db(), customer)));
    }

    let applied = {outcome: 'ignored', detail: {}};
    if (!HANDLED.has(event.type)) {
      applied = {outcome: 'ignored', detail: {}};
    } else if (!hh) {
      applied = {outcome: 'unmatched', detail: {}};
    } else if (event.type === 'invoice.paid') {
      applied = await applyInvoicePaid(tx, event, hh);
    } else if (event.type === 'invoice.payment_failed') {
      const final = (object.next_payment_attempt === null ||
          object.next_payment_attempt === undefined);
      applied = final ?
          applyLapsed(tx, event, hh, 'unpaid') :
          applyPastDue(tx, event, hh);
    } else if (event.type === 'customer.subscription.deleted') {
      applied = applyLapsed(tx, event, hh, object.status || 'canceled');
    } else if (event.type === 'customer.subscription.updated') {
      applied = await applySubscriptionUpdated(tx, event, hh);
    }

    tx.set(eventRef, {
      type: event.type,
      customer: customer || null,
      householdId: hh ? hh.id : null,
      receivedAt: now(),
      outcome: applied.outcome,
    });
    return {
      duplicate: false,
      outcome: applied.outcome,
      followUp: applied.followUp || null,
      detail: applied.detail || {},
      household: hh,
    };
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
  } else if (planned.followUp === 'downgrade') {
    summary = await revoke.trimDowngrade(
        planned.household, planned.detail, event.id);
    outcome = 'downgraded';
  }
  if (outcome !== planned.outcome) {
    await eventRef.update({outcome});
  }

  console.log(`stripe event ${event.id} (${event.type}) -> ${outcome}` +
      `${summary ? ' ' + JSON.stringify(summary) : ''}`);
  return {received: true, outcome, eventId: event.id, summary};
}

/**
 * The HTTPS endpoint. Stripe posts server-to-server, so there is no CORS
 * wrapper and no caller but Stripe can produce a valid signature.
 */
const stripeWebhook = functions.https.onRequest(async (req, res) => {
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
  stripeWebhook,
};
