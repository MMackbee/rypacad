# Functions - Sprint 20 Implementation Plan (part 3 of 5: Tasks 7-8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read `40-functions.md` first: its Goal, Architecture, Global Constraints and emulator command apply here unchanged. Task 7 rewires `stripe.js` around Tasks 5-6 and adds the Stripe launch harness; Task 8 is `createCheckoutSession`.

---

### Task 7: stripe.js rework - checkout.session.completed and the new resolution (closes #17)

**Files:**
- Create: `functions/portal/stripe-checkout.js`, `functions/test/verify-stripe-launch.js`
- Modify: `functions/portal/stripe.js:26-42` (requires, `HANDLED`), `:255-303` (`applySubscriptionUpdated` keeps the legacy household path), `:305-389` (`handleEvent`), `:395` (`runWith`), `:420-425` (exports)

**Interfaces:**
- Consumes: Tasks 3, 5, 6; `revoke.revokeHousehold`, `revoke.trimDowngrade` (`stripe.js:375-379`); `stripe.customerIdOf`, `invoicePeriod`, `applyInvoicePaid`, `applyPastDue`, `applyLapsed` (unchanged, the legacy household-wide path when no athlete resolves).
- Produces: `stripe-checkout.readLineItems(stripe, sessionId) -> Promise<{ok: boolean, priceId: ?string, reason: ?string}>` (new); `stripe-checkout.applyCheckoutCompleted(tx, {db, event, session, ref, athlete, athleteRef, hh, packageIdForPrice}) -> {outcome, firstActive, detail}` (new); `stripe.js` re-exports `resolveSubject`, `subscriptionIdOf`, `periodOf`, `priceIdOf`; `stripeWebhook` declares `runWith({secrets: ['STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', 'SMTP_USER', 'SMTP_PASS']})`.

- [ ] **Step 1: Write `stripe-checkout.js`**

```js
/**
 * `checkout.session.completed` (spec 4.3). Line items are read from Stripe
 * BEFORE the transaction; one recurring line (qty 1) plus at most one
 * one-time prepaid line (qty 1) is the only accepted shape.
 */
'use strict';

const {FieldValue} = require('firebase-admin/firestore');
const {parseClientReference} = require('./stripe-resolve');
const {billingPatch} = require('./stripe-billing');

/**
 * @param {!Object} stripe The Stripe client.
 * @param {string} sessionId The Checkout Session id.
 * @return {!Promise<{ok: boolean, priceId: ?string, reason: ?string}>}
 *     The recurring price, or why the shape is refused.
 */
async function readLineItems(stripe, sessionId) {
  const list = await stripe.checkout.sessions.listLineItems(sessionId,
      {limit: 10});
  const items = (list && list.data) || [];
  const recurring = items.filter((i) => i.price && i.price.recurring);
  const oneTime = items.filter((i) => i.price && !i.price.recurring);
  const badQty = items.some((i) => Number(i.quantity) !== 1);
  if (recurring.length !== 1 || oneTime.length > 1 || badQty ||
      items.length !== recurring.length + oneTime.length) {
    return {ok: false, priceId: null, reason: 'unexpected-quantity'};
  }
  return {ok: true, priceId: recurring[0].price.id, reason: null};
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

module.exports = {applyCheckoutCompleted, parseClientReference, readLineItems};
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
        athleteRef, athlete, pkg, product, period: invoicePeriod(object)});
    } else if (event.type === 'invoice.payment_failed') {
      const final = object.next_payment_attempt === null ||
          object.next_payment_attempt === undefined;
      applied = final ? applyLapsed(tx, event, hh, 'unpaid') :
          applyPastDue(tx, event, hh);
      billing.applyAthleteStatus(tx, {athleteRef, athlete, product,
        status: final ? 'lapsed' : 'past_due', priceId: null});
    } else if (event.type === 'customer.subscription.deleted') {
      applied = applyLapsed(tx, event, hh, object.status || 'canceled');
      billing.applyAthleteStatus(tx, {athleteRef, athlete, product,
        status: 'lapsed', priceId: resolve.priceIdOf(object)});
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
        pkg} : null};
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
 * @param {!Object} tx The transaction.
 * @param {!Object} event The event.
 * @param {!Object} hh The household.
 * @param {!Object} athlete The athlete body.
 * @param {!Object} athleteRef Its ref.
 * @param {string} product `'tier' | 'facility'`.
 * @return {!Promise<!Object>} What was applied.
 */
async function applyAthleteSubscriptionUpdated(tx, event, hh, athlete,
    athleteRef, product, pkg) {
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
  tx.update(hh.ref, membershipPatch({
    stripeSubscriptionStatus: sub.status || null,
    currentPeriodStart: period.start, currentPeriodEnd: period.end,
    lastEventId: event.id,
  }));
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

(`pkg` - the CURRENT package - is unused by this helper; drop the parameter
and the argument in `handleEvent`, and `await` the call there.)

Change `:395` to
`const stripeWebhook = functions.runWith({secrets: ['STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', 'SMTP_USER', 'SMTP_PASS']}).https.onRequest(async (req, res) => {`
and the export list to
`{customerIdOf, handleEvent, invoicePeriod, periodOf: resolve.periodOf, priceIdOf: resolve.priceIdOf, resolveSubject: resolve.resolveSubject, stripeWebhook, subscriptionIdOf: resolve.subscriptionIdOf}`.
`revoke.trimDowngrade` (`revoke.js:64-97`) is unchanged: it reads
`detail.tokens` as the new grant (`:84`) and `detail.athleteIds` (`:74`).
New ledger fields on `stripeEvents`: `athleteId`, `via` (new, not in
contract; report-visible only).

If `stripe.js` crosses 500 lines after this edit, move `applyLegacy`,
`applyInvoicePaid`, `applyPastDue`, `applyLapsed` and
`applySubscriptionUpdated` into `functions/portal/stripe-legacy.js` (new) and
require them back.

- [ ] **Step 3: Run the existing harness** (regression - every legacy family resolves by customer, so STEP 1-8 must still pass)

Run: `cd functions && npm run lint && node test/verify-lane.js`
Expected: lint clean; `ALL CHECKS PASSED`.

- [ ] **Step 4: Write `functions/test/verify-stripe-launch.js`** (same helpers as `verify-lane.js:6-65` - copy `check`, `checkTrue`, `post`, `get`, `exists`, `settle`, `wipe` verbatim; it wipes the same emulator, so never run together)

```js
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
  await B.commit();
}
const META = (ath, pk) => ({householdId: 'novak', athleteId: ath,
  product: 'tier', packageId: pk, prepaidPeriodKey: '2026-11-01',
  prepaidTokens: pk === 'elite' ? '' : '6'});
const basilInvoice = (id, sub, ath, pk, reason) => ({id, object: 'event',
  type: 'invoice.paid', data: {object: {id: 'in_' + id, object: 'invoice',
    customer: 'cus_novak', status: 'paid', billing_reason: reason,
    parent: {subscription_details: {subscription: sub, metadata: META(ath, pk)}},
    lines: {data: [{period: {start: secs(2026, 10, 6), end: secs(2026, 12, 1)},
      price: {id: 'price_' + pk.replace('-', '')}}]}}}});
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
  check('novak.periodAnchorDay', (await get('households', 'novak'))
      .periodAnchorDay, 1);
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

The line-item stub: in `stripe-checkout.readLineItems`, before calling
Stripe, add

```js
  if (process.env.FUNCTIONS_EMULATOR === 'true' &&
      process.env.STRIPE_LINE_ITEMS_STUB) {
    const stub = JSON.parse(process.env.STRIPE_LINE_ITEMS_STUB)[sessionId];
    if (stub) return shapeOf(stub);
  }
```

where `shapeOf(items)` is the body of `readLineItems` after the `list` call
(extract it into a function). `functions/.env.local` (gitignored, emulator
only) then carries
`STRIPE_LINE_ITEMS_STUB={"cs_evt_b":[{"quantity":1,"price":{"id":"price_t6","recurring":{"interval":"month"}}},{"quantity":1,"price":{"id":"price_1x"}}],"cs_evt_c":[{"quantity":1,"price":{"id":"price_elite","recurring":{"interval":"month"}}}],"cs_evt_f":[{"quantity":2,"price":{"id":"price_t6","recurring":{"interval":"month"}}}]}`
(one line). Never read in production: the guard is `FUNCTIONS_EMULATOR`.

- [ ] **Step 5: Run the new harness**

Run: `cd functions && node test/verify-stripe-launch.js`
Expected: `ALL CHECKS PASSED`. Then `node test/verify-lane.js` again (it
reseeds) - still `ALL CHECKS PASSED`.

- [ ] **Step 6: Commit**

```bash
git add functions/portal/stripe.js functions/portal/stripe-checkout.js functions/test/verify-stripe-launch.js
git commit -m "feat(functions): checkout.session.completed, per-athlete resolution, Basil shapes" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

