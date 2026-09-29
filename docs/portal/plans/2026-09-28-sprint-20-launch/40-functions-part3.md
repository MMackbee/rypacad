# Functions - Sprint 20 Implementation Plan (part 3 of 8: Task 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read `40-functions.md` first: its Goal, Architecture, Global Constraints, Execution order and emulator command apply here unchanged. Task 7 rewires `stripe.js` around Tasks 5-6 and adds the Stripe launch harness. Task 8 (`family.js`) is in `40-functions-part4.md`, Task 9 (`createCheckoutSession`) in `40-functions-part5.md`.

---

### Task 7: stripe.js rework - checkout.session.completed and the new resolution (closes #17)

**Files:**
- Create: `functions/portal/stripe-checkout.js`, `functions/test/verify-stripe-launch.js`
- Modify: `functions/portal/stripe.js:26-42` (requires, `HANDLED`), `:89-98` (`invoicePeriod` prefers the subscription line - Step 2b), `:255-303` (`applySubscriptionUpdated` keeps the legacy household path), `:305-389` (`handleEvent`), `:395` (`runWith`), `:420-425` (exports); `functions/portal/revoke.js:88-103,147-160` (`deleteDocs`, `revokeAthlete` - Step 2b, D17)

**Interfaces:**
- Consumes: Tasks 3, 5, 6 (`billing.otherTierLive`); `revoke.revokeHousehold`, `revoke.trimDowngrade` (`stripe.js:375-379`), `revoke.revokeAthlete` (new, Step 2b); `stripe.customerIdOf`, `invoicePeriod` (Step 2b: prefers the subscription line), `applyInvoicePaid`, `applyPastDue`, `applyLapsed` (unchanged, the legacy household-wide path when no athlete resolves).
- Produces: `stripe-checkout.shapeOf(items) -> {ok: boolean, priceId: ?string, reason: ?string}` (new, pure: decision D13 - exactly one recurring line plus at most one one-time line, every quantity 1, else `'unexpected-quantity'`); `stripe-checkout.readLineItems(stripe, sessionId) -> Promise<{ok, priceId, reason}>` (new; `shapeOf` over `listLineItems`, or over the `STRIPE_LINE_ITEMS_STUB` entry under the emulator); `stripe-checkout.applyCheckoutCompleted(tx, {event, session, ref, priceId, athlete, athleteRef, hh, packageId}) -> {outcome, firstActive, detail}` (new); `stripe.js` exports `resolveSubject`, `subscriptionIdOf`, `periodOf`, `priceIdOf` from `stripe-resolve.js` beside its own names; `stripeWebhook` declares `runWith({secrets: ['STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', 'SMTP_USER', 'SMTP_PASS']})` (Task 11 replaces the literal with `secrets.STRIPE_WEBHOOK_SECRETS`, the same list).
- Facility add-on rule (decision D10): EVERY facility event - `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` - writes `athletes.facilityBilling` (+ `facilityAccess`) ONLY; none of them touches `households.membership` (no `householdActive`, no `membershipPatch`) and none revokes bookings. The tier product keeps the household-wide path for `invoice.paid` (`householdActive`) and a RETRYING `invoice.payment_failed` (`applyPastDue` - the accepted household freeze of spec 14, one card serves the family), but `customer.subscription.deleted` - and a FINAL `invoice.payment_failed` (`next_payment_attempt` null; Stripe cancels the subscription next) - is PER ATHLETE (decision D17, review 2026-09-28): that athlete's `billing.status` -> `'lapsed'` and only that athlete's future bookings and waitlist entries go (`revoke.revokeAthlete`, follow-up `'revoke-athlete'`, ledger outcome `athlete-lapsed`); the household lapses (`applyLapsed` + `revokeHousehold`) only when `billing.otherTierLive` finds no sibling with an active/past_due tier. Before D17 one child's cancellation cancelled the paid sibling's bookings.
- Ledger (contract 2, decision D8): `stripeEvents` rows carry `athleteId` and `via`; outcomes gain `facility-active`, `no-period` and `athlete-lapsed` beside `applied-checkout`, `issued-prepaid`, `unexpected-quantity`, `stripe-lookup-failed`.

- [ ] **Step 1: Write `stripe-checkout.js`**

```js
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
```

- [ ] **Step 2: Rewrite `handleEvent` in `stripe.js`** (replace `:305-389`; add the requires `const catalogue = require('./catalogue'); const resolve = require('./stripe-resolve'); const billing = require('./stripe-billing'); const checkout = require('./stripe-checkout');` at `:34`; add `'checkout.session.completed'` to `HANDLED` at `:37-42`)

```js
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
```

Add these two helpers above `handleEvent` (`applyLegacy` is the old
`:336-348` dispatch verbatim, wrapped; `applyAthleteSubscriptionUpdated` is
the per-athlete version of `applySubscriptionUpdated`, which stays for the
legacy path with ONE edit: its `current_period_*` reads at `:262-263` become
`resolve.periodOf(sub)`):

```js
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
```

Change `:395` to
`const stripeWebhook = functions.runWith({secrets: ['STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', 'SMTP_USER', 'SMTP_PASS']}).https.onRequest(async (req, res) => {`
and the export list to
`{customerIdOf, handleEvent, invoicePeriod, periodOf: resolve.periodOf, priceIdOf: resolve.priceIdOf, resolveSubject: resolve.resolveSubject, stripeWebhook, subscriptionIdOf: resolve.subscriptionIdOf}`.
`revoke.trimDowngrade` (`revoke.js:64-97`) is unchanged: it reads
`detail.tokens` as the new grant (`:84`) and `detail.athleteIds` (`:74`).
The ledger fields `stripeEvents.athleteId` and `via` this writes are in the
contract (decision D8; report-visible).

If `stripe.js` crosses 500 lines after this edit, move `applyLegacy`,
`applyInvoicePaid`, `applyPastDue`, `applyLapsed` and
`applySubscriptionUpdated` into `functions/portal/stripe-legacy.js` (new) and
require them back.

- [ ] **Step 2b: `invoicePeriod` prefers the subscription line; `revoke.revokeAthlete`**

Replace `invoicePeriod` (`stripe.js:89-98`). The checkout invoice carries
TWO lines (spec 4.2): the one-time prepaid line, whose `period` is a single
instant (`start == end == now`), and the $0 trialing subscription line whose
period runs to `trial_end`. `lines.find(first with a period)` takes whichever
Stripe lists first, and the one-time line would write
`membership.currentPeriodStart/End = today` (the hub then reads "Tokens reset
<today>"). Tokens are unaffected either way - the prepaid period comes from
metadata - only `households.membership` was wrong.

```js
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
```

In `functions/portal/revoke.js`, split `deleteAll` (`:93-103`) so the
per-athlete variant can filter in memory, and add `revokeAthlete` after
`revokeHousehold` (`:160`); export it beside `revokeHousehold`:

```js
/**
 * Delete documents in chunked batches.
 * @param {!Array<!Object>} docs `QueryDocumentSnapshot`s.
 * @return {!Promise<number>} How many documents were deleted.
 */
async function deleteDocs(docs) {
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    for (const doc of docs.slice(i, i + BATCH_LIMIT)) batch.delete(doc.ref);
    await batch.commit();
  }
  return docs.length;
}

/**
 * Delete every document a query returns, in chunked batches.
 * @param {!Object} query A Firestore `Query`.
 * @return {!Promise<number>} How many documents were deleted.
 */
async function deleteAll(query) {
  return deleteDocs((await query.get()).docs);
}

/**
 * The per-athlete lapse follow-up (Sprint 20, D17): ONE athlete's future
 * confirmed bookings are cancelled with reason 'lapsed', their seats
 * released, and that athlete's waitlist entries deleted; siblings keep
 * theirs. Rides the same `bookings (householdId, date)` composite as
 * `revokeHousehold`; `athleteId` and `status` are filtered in memory.
 * @param {!Object} hh The resolved household `{id, data, ref}`.
 * @param {string} athleteId The athlete whose tier subscription ended.
 * @param {?string=} eventId The Stripe `event.id`, for the notice's ledger
 *     id.
 * @return {!Promise<!Object>} A summary for the event ledger.
 */
async function revokeAthlete(hh, athleteId, eventId) {
  const today = lib.todayISO();
  const snap = await db().collection('bookings')
      .where('householdId', '==', hh.id)
      .where('date', '>', today)
      .get();
  const mine = (d) => (d.data() || {}).athleteId === athleteId;
  const confirmed = snap.docs.filter(
      (d) => mine(d) && (d.data() || {}).status === 'confirmed');
  const cancelled = await cancelBookings(confirmed, 'lapsed');
  const wl = await db().collection('waitlist')
      .where('householdId', '==', hh.id).get();
  const waitlistDeleted = await deleteDocs(wl.docs.filter(mine));
  await notifyRevoked(hh, eventId, cancelled.cancelled, 'lapsed');
  return Object.assign({today, athleteId, waitlistDeleted}, cancelled);
}
```

`notifyRevoked` (`revoke.js:118`) keys the notice on `${hh.id}_${eventId}`,
so each lapse event tells the family once - as today. `verify-lane.js` still
passes: `revokeHousehold` itself is untouched.

- [ ] **Step 3: Run the existing harness** (regression - every legacy family resolves by customer, so STEP 1-8 must still pass)

Run: `cd functions && npm run lint && node test/verify-lane.js`
Expected: lint clean; `ALL CHECKS PASSED`.

- [ ] **Step 4: Write `functions/test/verify-stripe-launch.js`** (the header below is `verify-lane.js:6-65` copied - `check`, `checkTrue`, `secs`, `TS`, `get`, `exists`, `post`, `settle`, `wipe` verbatim, the same `SECRET` and `URL`; it wipes the same emulator instance, so never run two harnesses at once; `test/` is not linted, `.eslintignore:2`)

```js
/* Sprint 20 Stripe launch replay harness - runs against the ISOLATED emulator
 * (firestore 8082 / functions 5001, config firebase.functions-lane.json at the
 * repo root). It WIPES and reseeds that instance; never point it at 8080.
 *   cd functions && npx firebase-tools emulators:start --only firestore,functions --project rypacad --config ../firebase.functions-lane.json
 *   node test/verify-stripe-launch.js   (from functions/)
 * Needs functions/.env.local (Task 11 Step 4): STRIPE_WEBHOOK_SECRET equal to
 * SECRET below, STRIPE_LINE_ITEMS_STUB for STEP B/C/E, and
 * STRIPE_SECRET_KEY=sk_test_harness so Task 13 STEP H fails deterministically. */
'use strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082';
process.env.GCLOUD_PROJECT = 'rypacad';

const admin = require('firebase-admin');
const Stripe = require('stripe');

const SECRET = 'whsec_functionslane_emulator_only_not_a_real_secret';
const URL = 'http://127.0.0.1:5001/rypacad/us-central1/stripeWebhook';
const stripe = new Stripe('sk_test_harness');

admin.initializeApp({projectId: 'rypacad'});
const db = admin.firestore();

let failures = 0;
const log = (...a) => console.log(...a);
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { log(`    PASS  ${label} = ${a}`); }
  else { failures++; log(`    FAIL  ${label}\n          expected ${e}\n          actual   ${a}`); }
}
function checkTrue(label, cond, detail) {
  if (cond) log(`    PASS  ${label}`);
  else { failures++; log(`    FAIL  ${label} ${detail === undefined ? '' : detail}`); }
}

const secs = (y, m, d) => Date.UTC(y, m - 1, d, 12) / 1000;
const TS = (ms) => admin.firestore.Timestamp.fromMillis(ms);

async function get(col, id) {
  const s = await db.collection(col).doc(id).get();
  return s.exists ? s.data() : null;
}
async function exists(col, id) {
  return (await db.collection(col).doc(id).get()).exists;
}
async function post(event) {
  const payload = JSON.stringify(event);
  const sig = stripe.webhooks.generateTestHeaderString({payload, secret: SECRET});
  const res = await fetch(URL, {
    method: 'POST',
    headers: {'content-type': 'application/json', 'stripe-signature': sig},
    body: payload,
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return {status: res.status, body};
}
async function settle(ms) { await new Promise((r) => setTimeout(r, ms)); }
async function wipe() {
  for (const c of ['households', 'athletes', 'packages', 'sessions', 'bookings',
    'waitlist', 'graceTokens', 'tokenPeriods', 'stripeEvents', 'users',
    'notifications']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

async function seed() {
  await wipe();
  const B = db.batch();
  const set = (c, id, d) => B.set(db.collection(c).doc(id), d);
  set('households', 'novak', {name: 'Novak family', stripeCustomerId: null,
    stripeSubscriptionId: null, stripeCustomerIds: [], guardian: {
      name: 'Nina Novak', email: 'nina@example.test', phone: '+15550199'}});
  set('athletes', 'lena', {name: 'Lena', householdId: 'novak',
    packageId: 't-6', contractMinutes: null, coachId: null,
    facilityAccess: false, billing: {status: 'pending'}});
  set('athletes', 'max', {name: 'Max', householdId: 'novak',
    packageId: 'elite', contractMinutes: null, coachId: null,
    facilityAccess: false, billing: {status: 'pending'}});
  set('packages', 't-6', {name: '6 tokens', kind: 'tokens', tokens: 6,
    windowDays: 30, stripePriceId: 'price_t6'});
  set('packages', 'elite', {name: 'Elite', kind: 'elite', tokens: null,
    windowDays: 45, access247: true, stripePriceId: 'price_elite'});
  set('users', 'u-nina', {role: 'parent', householdId: 'novak',
    email: 'nina@example.test'});
  // STEP D2 (D17): two paid siblings, each with a future booking and a
  // waitlist entry, so a per-athlete lapse can be told from a household one.
  set('households', 'reyes', {name: 'Reyes family',
    stripeCustomerId: 'cus_reyes', stripeSubscriptionId: null,
    stripeCustomerIds: ['cus_reyes'], periodAnchorDay: 1,
    membership: {status: 'active'},
    guardian: {name: 'Ana Reyes', email: 'ana@example.test',
      phone: '+15550188'}});
  set('sessions', 'reyes-s1', {date: '2026-11-10', time: '4:00 PM',
    type: 'training', capacity: 8, booked: 2, bookable: true,
    status: 'scheduled'});
  set('sessions', 'reyes-s2', {date: '2026-11-12', time: '4:00 PM',
    type: 'training', capacity: 1, booked: 1, bookable: true,
    status: 'scheduled'});
  for (const a of ['ivy', 'kai']) {
    set('athletes', a, {name: a, householdId: 'reyes', packageId: 't-6',
      contractMinutes: null, coachId: null, facilityAccess: false,
      billing: {status: 'active', customerId: 'cus_reyes',
        subscriptionId: 'sub_' + a}});
    set('bookings', `${a}_reyes-s1`, {athleteId: a, householdId: 'reyes',
      sessionId: 'reyes-s1', date: '2026-11-10', type: 'training',
      status: 'confirmed', periodKey: '2026-11-01', chargedFrom: 'period',
      graceTokenId: null, createdBy: 'u-ana', createdAt: TS(Date.now())});
    set('waitlist', `${a}_reyes-s2`, {athleteId: a, householdId: 'reyes',
      sessionId: 'reyes-s2', date: '2026-11-12', periodKey: '2026-11-01',
      joinedAt: TS(Date.now()), createdBy: 'u-ana'});
  }
  await B.commit();
}
const META = (ath, pk) => ({householdId: 'novak', athleteId: ath,
  product: 'tier', packageId: pk, prepaidPeriodKey: '2026-11-01',
  prepaidTokens: pk === 'elite' ? '' : '6'});
// Lines in the order Stripe may list them on the checkout invoice: the
// one-time prepaid line (a single instant) FIRST, then the subscription line
// (review finding 7 - invoicePeriod must pick the subscription line).
const basilInvoice = (id, sub, ath, pk, reason) => ({id, object: 'event',
  type: 'invoice.paid', data: {object: {id: 'in_' + id, object: 'invoice',
    customer: 'cus_novak', status: 'paid', billing_reason: reason,
    parent: {subscription_details: {subscription: sub, metadata: META(ath, pk)}},
    lines: {data: [
      {period: {start: secs(2026, 10, 6), end: secs(2026, 10, 6)},
        parent: {type: 'invoice_item_details'},
        pricing: {price_details: {price: 'price_prepaid_' + ath}}},
      {period: {start: secs(2026, 10, 6), end: secs(2026, 12, 1)},
        parent: {type: 'subscription_item_details'},
        price: {id: 'price_' + pk.replace('-', '')}}]}}}});
const deleted = (id, sub, ath) => ({id, object: 'event',
  type: 'customer.subscription.deleted', data: {object: {id: sub,
    object: 'subscription', customer: 'cus_reyes', status: 'canceled',
    metadata: {householdId: 'reyes', athleteId: ath, product: 'tier',
      packageId: 't-6'},
    items: {data: [{price: {id: 'price_t6'}}]}}}});
const completed = (id, sub, ath) => ({id, object: 'event',
  type: 'checkout.session.completed', data: {object: {id: 'cs_' + id,
    object: 'checkout.session', mode: 'subscription', payment_status: 'paid',
    customer: 'cus_novak', subscription: sub,
    client_reference_id: `novak__${ath}__tier`}}});

async function main() {
  log('\n=== Sprint 20 Stripe launch replay (isolated emulator) ===');
  await seed();
  // The emulator has no Stripe: listLineItems must be stubbed. The webhook
  // reads STRIPE_LINE_ITEMS_STUB (functions/.env.local, emulator only) as a
  // JSON map sessionId -> line items; see stripe.js stripe() note.
  log('STEP A  invoice.paid (Basil shape, subscription_create) BEFORE checkout');
  let r = await post(basilInvoice('evt_a', 'sub_lena', 'lena', 't-6',
      'subscription_create'));
  check('HTTP', [r.status, r.body.outcome], [200, 'issued-prepaid']);
  const tp = await get('tokenPeriods', 'lena_2026-11-01');
  check('prepaid tokenPeriods', [tp.granted, tp.prepaid, tp.periodEnd],
      [6, true, '2026-11-30']);
  check('lena.billing.status', (await get('athletes', 'lena')).billing.status,
      'active');
  const hhA = await get('households', 'novak');
  check('novak.periodAnchorDay', hhA.periodAnchorDay, 1);
  check('membership period from the SUBSCRIPTION line, not the one-time ' +
      'prepaid line (review finding 7)',
  [hhA.membership.currentPeriodStart, hhA.membership.currentPeriodEnd],
  ['2026-10-06', '2026-12-01']);
  check('notice membership_lena_paid', await exists('notifications',
      'membership_lena_paid'), true);
  check('ledger via', (await get('stripeEvents', 'evt_a')).via, 'metadata');

  log('\nSTEP B  checkout.session.completed AFTER the invoice (lena)');
  r = await post(completed('evt_b', 'sub_lena', 'lena'));
  check('HTTP', [r.status, r.body.outcome], [200, 'applied-checkout']);
  const lena = await get('athletes', 'lena');
  check('billing ids', [lena.billing.customerId, lena.billing.subscriptionId,
    lena.billing.checkoutSessionId], ['cus_novak', 'sub_lena', 'cs_evt_b']);
  const hh = await get('households', 'novak');
  check('customer linked', [hh.stripeCustomerId, hh.stripeCustomerIds],
      ['cus_novak', ['cus_novak']]);
  check('notice not duplicated', (await db.collection('notifications')
      .where('athleteId', '==', 'lena').get()).size, 1);

  log('\nSTEP C  checkout.session.completed BEFORE invoice.paid (max, Elite)');
  r = await post(completed('evt_c', 'sub_max', 'max'));
  check('HTTP', [r.status, r.body.outcome], [200, 'applied-checkout']);
  check('max active at checkout (payment_status paid)',
      (await get('athletes', 'max')).billing.status, 'active');
  r = await post(basilInvoice('evt_d', 'sub_max', 'max', 'elite',
      'subscription_create'));
  check('HTTP', [r.status, r.body.outcome], [200, 'issued-prepaid']);
  check('Elite gets NO tokenPeriods doc', await exists('tokenPeriods',
      'max_2026-11-01'), false);
  check('exactly one notice for max', (await db.collection('notifications')
      .where('athleteId', '==', 'max').get()).size, 1);

  log('\nSTEP D  invoice.payment_failed lands on lena only');
  r = await post({id: 'evt_e', object: 'event', type: 'invoice.payment_failed',
    data: {object: {id: 'in_e', object: 'invoice', customer: 'cus_novak',
      next_payment_attempt: secs(2026, 12, 5),
      parent: {subscription_details: {subscription: 'sub_lena'}}}}});
  check('HTTP', [r.status, r.body.outcome], [200, 'past_due']);
  check('lena past_due, max untouched',
      [(await get('athletes', 'lena')).billing.status,
        (await get('athletes', 'max')).billing.status],
      ['past_due', 'active']);
  check('ledger via billing.subscriptionId',
      (await get('stripeEvents', 'evt_e')).via, 'billing');

  log('\nSTEP D2  customer.subscription.deleted (tier) is per athlete (D17)');
  r = await post(deleted('evt_d2a', 'sub_ivy', 'ivy'));
  check('HTTP', [r.status, r.body.outcome], [200, 'athlete-lapsed']);
  check('ivy lapsed, kai active',
      [(await get('athletes', 'ivy')).billing.status,
        (await get('athletes', 'kai')).billing.status], ['lapsed', 'active']);
  check('ivy booking cancelled (lapsed), kai booking kept',
      [(await get('bookings', 'ivy_reyes-s1')).status,
        (await get('bookings', 'ivy_reyes-s1')).cancelReason,
        (await get('bookings', 'kai_reyes-s1')).status],
      ['cancelled', 'lapsed', 'confirmed']);
  check('ivy waitlist gone, kai waitlist kept',
      [await exists('waitlist', 'ivy_reyes-s2'),
        await exists('waitlist', 'kai_reyes-s2')], [false, true]);
  check('household reyes stays active (a sibling is live)',
      (await get('households', 'reyes')).membership.status, 'active');
  check('ledger outcome', (await get('stripeEvents', 'evt_d2a')).outcome,
      'athlete-lapsed');
  r = await post(deleted('evt_d2b', 'sub_kai', 'kai'));
  check('HTTP (last live tier -> the household lapses)',
      [r.status, r.body.outcome], [200, 'lapsed']);
  check('kai lapsed, household lapsed, kai booking cancelled',
      [(await get('athletes', 'kai')).billing.status,
        (await get('households', 'reyes')).membership.status,
        (await get('bookings', 'kai_reyes-s1')).status],
      ['lapsed', 'lapsed', 'cancelled']);

  log('\nSTEP E  unexpected-quantity and duplicate');
  r = await post(completed('evt_f', 'sub_bad', 'lena'));
  check('HTTP (stub returns qty 2 for cs_evt_f)', [r.status, r.body.outcome],
      [200, 'unexpected-quantity']);
  r = await post(completed('evt_b', 'sub_lena', 'lena'));
  check('duplicate', [r.status, r.body.outcome], [200, 'duplicate']);

  log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' :
      failures + ' CHECK(S) FAILED'} ===`);
  process.exitCode = failures === 0 ? 0 : 1;
}
main().catch((e) => {
  console.error(e); process.exitCode = 1;
});
```

The line-item stub `readLineItems` reads (Step 1) comes from
`functions/.env.local` (gitignored by `functions/.gitignore` `*.local`,
emulator only; the file is created in Task 11 Step 4 - see Execution order
in `40-functions.md`), one line:
`STRIPE_LINE_ITEMS_STUB={"cs_evt_b":[{"quantity":1,"price":{"id":"price_t6","recurring":{"interval":"month"}}},{"quantity":1,"price":{"id":"price_1x"}}],"cs_evt_c":[{"quantity":1,"price":{"id":"price_elite","recurring":{"interval":"month"}}}],"cs_evt_f":[{"quantity":2,"price":{"id":"price_t6","recurring":{"interval":"month"}}}]}`
(Task 13 adds `cs_evt_g`). Never read in production: the guard is
`FUNCTIONS_EMULATOR`. Restart the emulator after editing the file.

- [ ] **Step 5: Run the new harness**

Run: `cd functions && node test/verify-stripe-launch.js`
Expected: `ALL CHECKS PASSED`. Then `node test/verify-lane.js` again (it
reseeds) - still `ALL CHECKS PASSED`.

- [ ] **Step 6: Commit**

```bash
git add functions/portal/stripe.js functions/portal/stripe-checkout.js functions/portal/revoke.js functions/test/verify-stripe-launch.js
git commit -m "feat(functions): checkout.session.completed, per-athlete resolution, Basil shapes" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---
Continue with `40-functions-part4.md` (Task 8, `family.js`).
