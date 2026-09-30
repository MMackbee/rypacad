/**
 * The pre-Sprint-20 household-wide Stripe path (contract v2.1, pin H), moved
 * out of stripe.js in Sprint 20 so that file stays under 500 lines. These
 * apply to events that resolved by CUSTOMER only - families provisioned
 * before per-athlete billing (`athletes.billing`) existed. Every function
 * here runs inside the webhook's idempotency transaction; the caller has
 * done the household read.
 */

'use strict';

const admin = require('firebase-admin');
// The modular entry point, not admin.firestore.FieldValue: the Functions
// emulator replaces the admin.firestore namespace with a plain function, so
// the sentinel is undefined there and every write throws at runtime.
const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const resolve = require('./stripe-resolve');

/** @return {!Object} The admin Firestore, resolved lazily. */
function db() {
  return admin.firestore();
}

/** @return {!Object} A server timestamp sentinel. */
function now() {
  return FieldValue.serverTimestamp();
}

/**
 * The billing period an invoice covers, as America/Chicago calendar dates.
 * The invoice LINE's period is authoritative (pin H); `period_start` /
 * `period_end` on the invoice itself are the documented fallback.
 * @param {!Object} invoice `event.data.object` for an invoice event.
 * @return {{start: ?string, end: ?string}} `'YYYY-MM-DD'` or nulls.
 */
function invoicePeriod(invoice) {
  const lines = ((invoice.lines && invoice.lines.data) || [])
      .filter((l) => l && l.period && l.period.start);
  // The checkout invoice also carries the one-time prepaid line (spec 4.2),
  // whose period is one instant; the subscription line owns the billing
  // period: Basil `parent.type` 'subscription_item_details' (pre-Basil
  // `type` 'subscription'), else any line with a real span, else the first.
  const isSub = (l) => (l.parent && l.parent.type ===
      'subscription_item_details') || l.type === 'subscription';
  const line = lines.find(isSub) ||
      lines.find((l) => l.period.end > l.period.start) || lines[0] || null;
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
    if (athlete.billing) {
      // A per-athlete billing block (a subscription of its own, or a paid
      // single token) is never granted tokens by the household-wide path.
      skipped.push({athleteId: doc.id, reason: 'per-athlete-billing'});
      continue;
    }
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
  const period = resolve.periodOf(sub);
  const membership = membershipPatch({
    stripeSubscriptionStatus: sub.status || null,
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
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
  // Athletes with a per-athlete billing block own their package; the
  // household's legacy subscription never remaps them.
  const changed = athletesSnap.docs.filter((d) => {
    const a = d.data() || {};
    return !a.billing && a.packageId !== packageId;
  });

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
 * The pre-Sprint-20 household-wide dispatch, for events that resolved by
 * customer only (families provisioned before per-athlete billing).
 * @param {!Object} tx The transaction.
 * @param {!Object} event The event.
 * @param {!Object} hh The household.
 * @param {!Object} object `event.data.object`.
 * @return {!Promise<!Object>} What was applied.
 */
async function applyLegacy(tx, event, hh, object) {
  if (event.type === 'invoice.paid') return applyInvoicePaid(tx, event, hh);
  if (event.type === 'invoice.payment_failed') {
    const final = object.next_payment_attempt === null ||
        object.next_payment_attempt === undefined;
    return final ? applyLapsed(tx, event, hh, 'unpaid') :
        applyPastDue(tx, event, hh);
  }
  if (event.type === 'customer.subscription.deleted') {
    return applyLapsed(tx, event, hh, object.status || 'canceled');
  }
  return applySubscriptionUpdated(tx, event, hh);
}

module.exports = {
  applyInvoicePaid,
  applyLapsed,
  applyLegacy,
  applyPastDue,
  applySubscriptionUpdated,
  invoicePeriod,
  membershipPatch,
};
