# Functions - Sprint 20 Implementation Plan (part 2 of 8: Tasks 5-6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read `40-functions.md` first: its Goal, Architecture, Global Constraints, Execution order and emulator command apply here unchanged. This part covers the Stripe resolution order (Task 5) and the per-athlete billing writers (Task 6); Task 7 (the webhook rework that wires them) is in `40-functions-part3.md`. Ledger fields and outcomes named here (`stripeEvents.athleteId`, `via`, outcomes `facility-active`, `no-period`; `athletes.billing.lastEventId`; `athletes.facilityBilling.customerId` / `checkoutSessionId` / `lastEventId`) are in the contract (decision D8).

---

### Task 5: stripe-resolve.js - Basil accessors and the resolution order (closes part of #17)

**Files:**
- Create: `functions/portal/stripe-resolve.js`, `functions/portal/stripe-resolve.test.js`

**Interfaces:**
- Consumes: `lib.householdByCustomerQuery` (`lib.js:249`), `lib.chicagoDateFromUnix`, `stripe.customerIdOf` (`stripe.js:76`, duplicated here as `customerOf` to avoid a require cycle).
- Produces: `subscriptionIdOf(invoice) -> ?string`; `periodOf(subscription) -> {start: ?string, end: ?string}` (Chicago dates); `priceIdOf(subscription) -> ?string`; `metadataOf(object) -> Object` (new); `parseClientReference(ref) -> ?{householdId, athleteId, product}` (new); `class StripeLookupError` (new, `code = 'stripe-lookup-failed'`); `resolveSubject(event, {db, stripe}) -> Promise<?{householdId, athleteId, product, packageId, via}>`.

- [ ] **Step 1: Write the failing test** `stripe-resolve.test.js`

```js
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const r = require('./stripe-resolve');

const secs = (y, m, d) => Date.UTC(y, m - 1, d, 12) / 1000;

test('subscriptionIdOf: legacy string, legacy object, Basil parent', () => {
  assert.equal(r.subscriptionIdOf({subscription: 'sub_a'}), 'sub_a');
  assert.equal(r.subscriptionIdOf({subscription: {id: 'sub_b'}}), 'sub_b');
  assert.equal(r.subscriptionIdOf({parent: {subscription_details:
    {subscription: 'sub_c'}}}), 'sub_c');
  assert.equal(r.subscriptionIdOf({}), null);
});

test('periodOf: top-level else items.data[0] (Basil)', () => {
  assert.deepEqual(r.periodOf({current_period_start: secs(2026, 11, 1),
    current_period_end: secs(2026, 11, 30)}),
  {start: '2026-11-01', end: '2026-11-30'});
  assert.deepEqual(r.periodOf({items: {data: [{
    current_period_start: secs(2026, 12, 1),
    current_period_end: secs(2026, 12, 31)}]}}),
  {start: '2026-12-01', end: '2026-12-31'});
  assert.deepEqual(r.periodOf({}), {start: null, end: null});
});

test('priceIdOf and metadataOf read both shapes', () => {
  assert.equal(r.priceIdOf({items: {data: [{price: {id: 'p1'}}]}}), 'p1');
  assert.equal(r.priceIdOf({plan: {id: 'p2'}}), 'p2');
  assert.deepEqual(r.metadataOf({metadata: {athleteId: 'a'}}),
      {athleteId: 'a'});
  assert.deepEqual(r.metadataOf({parent: {subscription_details:
    {metadata: {athleteId: 'b'}}}}), {athleteId: 'b'});
  assert.deepEqual(r.metadataOf({}), {});
});

test('parseClientReference: household__athlete__product', () => {
  assert.deepEqual(r.parseClientReference('hh1__ath1__tier'),
      {householdId: 'hh1', athleteId: 'ath1', product: 'tier'});
  assert.equal(r.parseClientReference('hh1__ath1__other'), null);
  assert.equal(r.parseClientReference(null), null);
});

/**
 * A Firestore stand-in: `hits[collection][field]` -> [{id, data}].
 * @param {!Object} hits Query answers.
 * @return {!Object} A fake db.
 */
function fakeDb(hits) {
  return {collection: (c) => {
    let field = null;
    const q = {
      where(f) {
        field = f; return q;
      },
      limit() {
        return q;
      },
      async get() {
        const docs = ((hits[c] || {})[field] || []).map((d) => ({
          id: d.id, ref: {path: `${c}/${d.id}`}, data: () => d.data}));
        return {empty: docs.length === 0, docs};
      },
    };
    return q;
  }};
}
const stripeNever = {checkout: {sessions: {list: async () => {
  throw new Error('should not be called');
}}}};
const inv = (extra) => ({type: 'invoice.paid', data: {object: Object.assign(
    {customer: 'cus_1', parent: {subscription_details: {subscription: 'sub_1'}}},
    extra)}});

test('resolveSubject: metadata first', async () => {
  const s = await r.resolveSubject(inv({parent: {subscription_details: {
    subscription: 'sub_1', metadata: {householdId: 'h', athleteId: 'a',
      product: 'tier', packageId: 't-6'}}}}), {db: fakeDb({}),
  stripe: stripeNever});
  assert.deepEqual(s, {householdId: 'h', athleteId: 'a', product: 'tier',
    packageId: 't-6', via: 'metadata'});
});

test('resolveSubject: billing.subscriptionId, then facility, then customer',
    async () => {
      const byBilling = fakeDb({athletes: {'billing.subscriptionId': [
        {id: 'a1', data: {householdId: 'h1', packageId: 't-12'}}]}});
      let s = await r.resolveSubject(inv({}), {db: byBilling,
        stripe: stripeNever});
      assert.deepEqual([s.athleteId, s.product, s.via],
          ['a1', 'tier', 'billing']);
      const byFac = fakeDb({athletes: {'facilityBilling.subscriptionId': [
        {id: 'a2', data: {householdId: 'h1'}}]}});
      s = await r.resolveSubject(inv({}), {db: byFac, stripe: stripeNever});
      assert.deepEqual([s.athleteId, s.product, s.via],
          ['a2', 'facility', 'facility']);
      const byCus = fakeDb({households: {stripeCustomerIds: [
        {id: 'h9', data: {}}]}});
      s = await r.resolveSubject(inv({}), {db: byCus, stripe: stripeNever});
      assert.deepEqual(s, {householdId: 'h9', athleteId: null, product: null,
        packageId: null, via: 'customer-ids'});
    });

test('resolveSubject: checkout.sessions.list last; a throw is typed',
    async () => {
      const ok = {checkout: {sessions: {list: async () => ({data: [
        {client_reference_id: 'h2__a3__facility'}]})}}};
      const s = await r.resolveSubject(inv({}), {db: fakeDb({}), stripe: ok});
      assert.deepEqual([s.householdId, s.athleteId, s.product, s.via],
          ['h2', 'a3', 'facility', 'checkout-session']);
      const none = {checkout: {sessions: {list: async () => ({data: []})}}};
      assert.equal(await r.resolveSubject(inv({}), {db: fakeDb({}),
        stripe: none}), null);
      await assert.rejects(r.resolveSubject(inv({}), {db: fakeDb({}),
        stripe: {checkout: {sessions: {list: async () => {
          throw new Error('boom');
        }}}}}), (e) => e instanceof r.StripeLookupError &&
          e.code === 'stripe-lookup-failed');
    });

run();
```

Run: `cd functions && node portal/stripe-resolve.test.js`
Expected: `Cannot find module './stripe-resolve'`.

- [ ] **Step 2: Implement `stripe-resolve.js`**

```js
/**
 * Basil-safe accessors and the subject resolution order (spec 4.3). Reads
 * BOTH the pre-Basil shapes (`invoice.subscription`,
 * `subscription.current_period_*`) and the 2025-07-30.basil ones
 * (`invoice.parent.subscription_details.*`, `items.data[0].current_period_*`).
 * `resolveSubject` runs BEFORE the webhook's transaction: it may call Stripe.
 */
'use strict';

const lib = require('./lib');

/** Thrown when Stripe itself failed during resolution. */
class StripeLookupError extends Error {
  /** @param {!Error} cause The Stripe error. */
  constructor(cause) {
    super(`stripe lookup failed: ${cause && cause.message}`);
    this.code = 'stripe-lookup-failed';
    this.cause = cause;
  }
}

/** @param {*} v A Stripe id or expanded object. @return {?string} The id. */
function idOf(v) {
  if (!v) return null;
  return typeof v === 'string' ? v : (v.id || null);
}

/** @param {!Object} invoice `event.data.object`. @return {?string} sub id. */
function subscriptionIdOf(invoice) {
  const inv = invoice || {};
  const basil = inv.parent && inv.parent.subscription_details;
  return idOf(inv.subscription) || idOf(basil && basil.subscription) || null;
}

/**
 * @param {!Object} subscription A subscription object.
 * @return {{start: ?string, end: ?string}} Chicago calendar dates.
 */
function periodOf(subscription) {
  const s = subscription || {};
  const item = (s.items && s.items.data && s.items.data[0]) || {};
  const start = s.current_period_start !== undefined ?
      s.current_period_start : item.current_period_start;
  const end = s.current_period_end !== undefined ?
      s.current_period_end : item.current_period_end;
  return {start: lib.chicagoDateFromUnix(start),
    end: lib.chicagoDateFromUnix(end)};
}

/** @param {!Object} subscription A subscription. @return {?string} price. */
function priceIdOf(subscription) {
  const s = subscription || {};
  const item = (s.items && s.items.data && s.items.data[0]) || {};
  return (item.price && item.price.id) || (s.plan && s.plan.id) || null;
}

/**
 * Subscription metadata from a subscription OR an invoice (Basil carries it
 * under `parent.subscription_details.metadata`).
 * @param {!Object} object `event.data.object`.
 * @return {!Object} The metadata map, possibly empty.
 */
function metadataOf(object) {
  const o = object || {};
  const basil = o.parent && o.parent.subscription_details;
  const legacy = o.subscription_details;
  return o.metadata || (basil && basil.metadata) ||
      (legacy && legacy.metadata) || {};
}

/**
 * @param {?string} ref `client_reference_id`, `${hh}__${ath}__${product}`.
 * @return {?{householdId: string, athleteId: string, product: string}}
 */
function parseClientReference(ref) {
  const parts = String(ref || '').split('__');
  if (parts.length !== 3 || !parts[0] || !parts[1]) return null;
  if (parts[2] !== 'tier' && parts[2] !== 'facility') return null;
  return {householdId: parts[0], athleteId: parts[1], product: parts[2]};
}

/**
 * @param {!Object} db Firestore.
 * @param {string} field The dotted field.
 * @param {string} subId The subscription id.
 * @return {!Promise<?{id: string, data: !Object}>} The first athlete.
 */
async function athleteBy(db, field, subId) {
  const snap = await db.collection('athletes').where(field, '==', subId)
      .limit(1).get();
  if (snap.empty) return null;
  return {id: snap.docs[0].id, data: snap.docs[0].data() || {}};
}

/**
 * Who an event is about, in the spec's order: metadata -> billing sub ->
 * facility sub -> stripeCustomerId -> stripeCustomerIds -> the Checkout
 * Session's client_reference_id (a Stripe read).
 * @param {!Object} event The Stripe event.
 * @param {{db: !Object, stripe: !Object}} deps Firestore and Stripe.
 * @return {!Promise<?{householdId: string, athleteId: ?string,
 *     product: ?string, packageId: ?string, via: string}>} Or null.
 */
async function resolveSubject(event, deps) {
  const o = (event.data && event.data.object) || {};
  const subId = o.object === 'subscription' ? o.id : subscriptionIdOf(o);
  const customer = idOf(o.customer);
  const meta = metadataOf(o);
  if (meta.householdId && meta.athleteId) {
    return {householdId: meta.householdId, athleteId: meta.athleteId,
      product: meta.product || 'tier', packageId: meta.packageId || null,
      via: 'metadata'};
  }
  if (subId) {
    const a = await athleteBy(deps.db, 'billing.subscriptionId', subId);
    if (a) {
      return {householdId: a.data.householdId, athleteId: a.id,
        product: 'tier', packageId: a.data.packageId || null, via: 'billing'};
    }
    const f = await athleteBy(deps.db, 'facilityBilling.subscriptionId',
        subId);
    if (f) {
      return {householdId: f.data.householdId, athleteId: f.id,
        product: 'facility', packageId: null, via: 'facility'};
    }
  }
  if (customer) {
    const hh = lib.householdFromSnap(
        await lib.householdByCustomerQuery(deps.db, customer).get());
    if (hh) {
      return {householdId: hh.id, athleteId: null, product: null,
        packageId: null, via: 'customer'};
    }
    const many = await deps.db.collection('households')
        .where('stripeCustomerIds', 'array-contains', customer).limit(1).get();
    if (!many.empty) {
      return {householdId: many.docs[0].id, athleteId: null, product: null,
        packageId: null, via: 'customer-ids'};
    }
  }
  if (!subId) return null;
  let sessions;
  try {
    sessions = await deps.stripe.checkout.sessions.list(
        {subscription: subId, limit: 1});
  } catch (err) {
    throw new StripeLookupError(err);
  }
  const ref = parseClientReference(sessions.data && sessions.data[0] &&
      sessions.data[0].client_reference_id);
  return ref ? Object.assign(ref, {packageId: null, via: 'checkout-session'}) :
      null;
}

module.exports = {
  StripeLookupError, metadataOf, parseClientReference, periodOf, priceIdOf,
  resolveSubject, subscriptionIdOf,
};
```

- [ ] **Step 3: Run**

Run: `cd functions && node portal/stripe-resolve.test.js && npm run lint`
Expected: `7 passing`, lint clean.

- [ ] **Step 4: Commit**

```bash
git add functions/portal/stripe-resolve.js functions/portal/stripe-resolve.test.js
git commit -m "feat(functions): Basil-safe Stripe accessors and resolveSubject order" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: stripe-billing.js - per-athlete billing transitions (closes part of #17)

**Files:**
- Create: `functions/portal/stripe-billing.js`, `functions/portal/stripe-billing.test.js`

**Interfaces:**
- Consumes: `lib.tokenPeriodId`, `lib.periodFor`, `lib.bookingOpen`, `notices.paymentReceived` (Task 4), `notify.sendNotice` (`notify.js:298`), `stripe-resolve.metadataOf`, `stripe.invoicePeriod` (duplicated logic passed in as `period` by the caller to avoid a cycle).
- Produces: `billingPatch(product, fields) -> Object` (new); `applyAthleteInvoicePaid(tx, {db, event, hh, athleteRef, athlete, subject, pkg, period}) -> {outcome, firstActive, detail}`; `applyAthleteStatus(tx, {athleteRef, athlete, product, status, priceId}) -> {outcome}`; `sendPaymentReceived({householdId, athleteId, athleteName, pkg}) -> Promise`.

- [ ] **Step 1: Write the failing test** `stripe-billing.test.js`

```js
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const b = require('./stripe-billing');

/** @return {{tx: !Object, writes: !Array}} A recording transaction. */
function recorder() {
  const writes = [];
  return {writes, tx: {
    set: (ref, data) => writes.push({op: 'set', path: ref.path, data}),
    update: (ref, data) => writes.push({op: 'update', path: ref.path, data}),
  }};
}
const db = {collection: (c) => ({doc: (id) => ({path: `${c}/${id}`})})};
const hh = {id: 'h1', ref: {path: 'households/h1'}, data: {}};
const aRef = {path: 'athletes/a1'};
const T6 = {kind: 'tokens', tokens: 6};

test('invoice.paid subscription_create: prepaid period from metadata', () => {
  const {tx, writes} = recorder();
  const out = b.applyAthleteInvoicePaid(tx, {db, hh, athleteRef: aRef,
    athlete: {billing: {status: 'pending'}}, pkg: T6, product: 'tier',
    period: {start: '2026-10-05', end: '2026-11-05'},
    event: {id: 'evt_1', data: {object: {billing_reason: 'subscription_create',
      parent: {subscription_details: {metadata: {prepaidPeriodKey: '2026-11-01',
        prepaidTokens: '6'}}}}}}});
  assert.equal(out.outcome, 'issued-prepaid');
  assert.equal(out.firstActive, true);
  const tp = writes.find((w) => w.path === 'tokenPeriods/a1_2026-11-01');
  assert.deepEqual([tp.data.granted, tp.data.prepaid, tp.data.periodEnd],
      [6, true, '2026-11-30']);
  const a = writes.find((w) => w.path === 'athletes/a1');
  assert.equal(a.data['billing.status'], 'active');
  const h = writes.find((w) => w.path === 'households/h1');
  assert.deepEqual([h.data['membership.status'], h.data.periodAnchorDay],
      ['active', 1]);
});

test('invoice.paid subscription_cycle: the invoice line period', () => {
  const {tx, writes} = recorder();
  const out = b.applyAthleteInvoicePaid(tx, {db, hh, athleteRef: aRef,
    athlete: {billing: {status: 'active'}}, pkg: T6, product: 'tier',
    period: {start: '2026-12-01', end: '2026-12-31'},
    event: {id: 'evt_2', data: {object: {billing_reason: 'subscription_cycle'}}},
  });
  assert.equal(out.outcome, 'issued');
  assert.equal(out.firstActive, false);
  const tp = writes.find((w) => w.path === 'tokenPeriods/a1_2026-12-01');
  assert.equal(tp.data.granted, 6);
  assert.equal(tp.data.prepaid, undefined);
});

test('invoice.paid facility: no tokens, facilityBilling + facilityAccess',
    () => {
      const {tx, writes} = recorder();
      const out = b.applyAthleteInvoicePaid(tx, {db, hh, athleteRef: aRef,
        athlete: {}, pkg: T6, product: 'facility',
        period: {start: '2026-12-01', end: '2026-12-31'},
        event: {id: 'evt_3', data: {object: {}}}});
      assert.equal(out.outcome, 'facility-active');
      const a = writes.find((w) => w.path === 'athletes/a1');
      assert.deepEqual([a.data['facilityBilling.status'],
        a.data.facilityAccess], ['active', true]);
      assert.equal(writes.some((w) => w.path.startsWith('tokenPeriods/')),
          false);
    });

test('applyAthleteStatus: lapsed facility clears facilityAccess', () => {
  const {tx, writes} = recorder();
  b.applyAthleteStatus(tx, {athleteRef: aRef, athlete: {}, product: 'facility',
    status: 'lapsed', priceId: 'price_fac'});
  const a = writes[0].data;
  assert.deepEqual([a['facilityBilling.status'], a.facilityAccess,
    a['facilityBilling.priceId']], ['lapsed', false, 'price_fac']);
  const r2 = recorder();
  b.applyAthleteStatus(r2.tx, {athleteRef: aRef, athlete: {}, product: 'tier',
    status: 'past_due', priceId: null});
  assert.equal(r2.writes[0].data['billing.status'], 'past_due');
  assert.equal('facilityAccess' in r2.writes[0].data, false);
});

run();
```

Run: `cd functions && node portal/stripe-billing.test.js`
Expected: `Cannot find module './stripe-billing'`.

- [ ] **Step 2: Implement `stripe-billing.js`**

```js
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
  householdActive(tx, hh, event.id, period);
  if (product === 'facility') {
    tx.update(athleteRef, billingPatch('facility',
        {status: 'active', lastEventId: event.id}));
    return {outcome: 'facility-active', firstActive: false, detail: {}};
  }
  tx.update(athleteRef, billingPatch('tier',
      {status: 'active', lastEventId: event.id}));
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
      {status: args.status, priceId: args.priceId || undefined}));
  return {outcome: args.status};
}

/**
 * The payment-received notice on an athlete's FIRST active (spec 4.3).
 * Idempotent on `membership_${athleteId}_paid`. Never throws.
 * @param {{householdId: string, athleteId: string, athleteName: ?string,
 *     pkg: ?Object}} args The athlete.
 * @return {!Promise<void>} Resolves when recorded.
 */
async function sendPaymentReceived(args) {
  const copy = notices.paymentReceived(
      {bookingOpen: lib.bookingOpen(Date.now(), args.pkg)});
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
  sendPaymentReceived,
};
```

- [ ] **Step 3: Run**

Run: `cd functions && node portal/stripe-billing.test.js && npm run lint`
Expected: `4 passing`, lint clean. (`firebase-admin/firestore` resolves
without an app; `FieldValue.serverTimestamp()` is a sentinel.)

- [ ] **Step 4: Commit**

```bash
git add functions/portal/stripe-billing.js functions/portal/stripe-billing.test.js
git commit -m "feat(functions): per-athlete billing writers, prepaid tokenPeriods, payment-received" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
