# Functions - Sprint 20 Implementation Plan (part 5: Task 9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read `40-functions.md` first (Goal, Architecture, Global Constraints, Execution order, emulator command). Task 9 depends on Task 2 (`prepaid.js`), Task 3 (`catalogue.js`, the JSON at `functions/config/stripe-catalogue.json` per decision D3) and Task 8 (`secrets.js`).

---

### Task 9: checkout.js - createCheckoutSession (closes part of #17)

**Files:**
- Create: `functions/portal/checkout.js`, `functions/portal/checkout.test.js`
- Test: `functions/portal/checkout.test.js` (unit, stubbed Stripe client); owner-run test-mode verification (Step 6)

**Interfaces:**
- Consumes: `prepaid.prepaidPeriodFor(now, {priceCents, tokens})` (Task 2); `catalogue.priceIdFor(key, cat?)`, `catalogue.FACILITY_KEY` (Task 3); `secrets.CHECKOUT_SECRETS` (Task 8); `lib.membershipAllowsBooking(household, athlete)` (Task 1) for the facility gate; `process.env.PORTAL_URL` (`functions/.env`, contract 8); `process.env.STRIPE_SECRET_KEY` (secret).
- Produces: `createCheckoutSessionHandler(data, context, deps) -> Promise<{url}>` with `deps = {db?, stripe?, now?, catalogue?}`; `sessionBody(args) -> Object` (new, the exact Stripe request body, pure); `prepaidFor(nowMs, {priceCents, tokens})` (new: `prepaidPeriodFor` plus the 48-hour rule below); callable `createCheckoutSession` = `functions.runWith({secrets: CHECKOUT_SECRETS}).https.onCall`.
- Reason strings, all in contract 1.5 (decision D7): `invalid-argument` / `invalid-product` (product not `tier`|`facility`, or `athleteId` not a non-empty string - checked right after `signed-out`, before `athlete-not-found`); `failed-precondition` / `already-active` fires for the tier when `billing.status == 'active'` AND for `product: 'facility'` when `facilityBilling.status == 'active'`.
- **Ruled, D12 - key scopes:** the recurring price's amount comes from Stripe (`stripe.prices.retrieve(priceId).unit_amount`) because neither the `packages` docs nor the catalogue JSON carry a price (`seed-firestore.mjs:438` strips it; contract 7.2 holds ids only). The restricted `STRIPE_SECRET_KEY` therefore has exactly three scopes: **Checkout Sessions write, Customers read, Prices read** (runbook, Task 12 section 0).
- **Ruled, D11 - the 48-hour rule:** Stripe refuses a Checkout `trial_end` under 48 hours away, so when the next 1st is under 48 h from checkout (the 29th-31st, possible from Nov 1 under ruling 0.13) `prepaidFor` rolls the prepaid month forward: the session prepays the NEXT month in full, `trial_end` is the 1st after that, and the remaining day or two of the current month are free. Documented in the runbook (Task 12 section 6) and asserted by the `under 48 h to the 1st` test below (Nov 30 -> `2026-12-01`, full price, `trialEnd` = Jan 1; Nov 28 -> `2026-11-01` untouched).

- [ ] **Step 1: Write the failing test** `functions/portal/checkout.test.js`

```js
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const prepaid = require('./prepaid');
const checkout = require('./checkout');

process.env.PORTAL_URL = 'https://portal.test';
process.env.STRIPE_MODE = 'test';
const CAT = {test: {'t-6': 'price_t6', 'elite': 'price_elite', 'single': null,
  'facility-access': 'price_fac'}, live: {}};
const OCT = Date.parse('2026-10-05T18:00:00Z');

/**
 * @param {!Object} docs `{'athletes/a1': {...}}`.
 * @return {!Object} A Firestore stand-in for `collection().doc().get()`.
 */
function fakeDb(docs) {
  return {collection: (c) => ({doc: (id) => ({async get() {
    const data = docs[`${c}/${id}`];
    return {exists: !!data, data: () => data};
  }})})};
}
/**
 * @param {!Array} calls Receives every `sessions.create` body.
 * @param {number=} cents `unit_amount` of every price.
 * @return {!Object} A Stripe stand-in.
 */
function fakeStripe(calls, cents) {
  return {
    prices: {retrieve: async (id) => ({id, unit_amount: cents || 29900,
      currency: 'usd'})},
    checkout: {sessions: {create: async (body) => {
      calls.push(body);
      return {id: 'cs_test_1', url: 'https://checkout.stripe.com/c/cs_1'};
    }}},
  };
}
const DOCS = {
  'households/novak': {guardian: {email: 'nina@example.test'},
    stripeCustomerId: null},
  'households/oye': {guardian: {email: 'k@example.test'},
    stripeCustomerId: 'cus_oye'},
  'athletes/lena': {householdId: 'novak', packageId: 't-6',
    billing: {status: 'pending'}},
  'athletes/max': {householdId: 'novak', packageId: 'elite',
    billing: {status: 'active'}},
  'athletes/femi': {householdId: 'oye', packageId: 't-6'},
  'athletes/nopkg': {householdId: 'novak', packageId: null},
  'athletes/fac': {householdId: 'novak', packageId: 't-6',
    billing: {status: 'active'}, facilityBilling: {status: 'active'}},
  'users/u-nina': {role: 'parent', householdId: 'novak'},
  'users/u-kemi': {role: 'parent', householdId: 'oye'},
  'users/u-femi': {role: 'athlete', athleteId: 'femi', householdId: 'oye'},
  'packages/t-6': {kind: 'tokens', tokens: 6, name: '6 tokens'},
  'packages/elite': {kind: 'elite', tokens: null, name: 'Elite'},
};
const ctx = (uid, over) => ({auth: {uid, token: Object.assign({
  email: 'nina@example.test', email_verified: true,
  firebase: {sign_in_provider: 'password'}}, over || {})}});
const call = (data, c, over) => {
  const calls = [];
  const d = Object.assign({db: fakeDb(DOCS), stripe: fakeStripe(calls),
    now: OCT, catalogue: CAT}, over || {});
  return {calls, p: checkout.createCheckoutSessionHandler(data, c, d)};
};
/**
 * @param {string} label The case.
 * @param {!Promise} p The handler call.
 * @param {string} code Expected HttpsError code.
 * @param {string} reason Expected `details.reason`.
 */
async function refused(label, p, code, reason) {
  await assert.rejects(p, (e) => e.code === code &&
      e.details && e.details.reason === reason, label);
}

test('tier before Nov 1: the exact session body', async () => {
  const {calls, p} = call({athleteId: 'lena', product: 'tier'}, ctx('u-nina'));
  assert.deepEqual(await p, {url: 'https://checkout.stripe.com/c/cs_1'});
  assert.deepEqual(calls[0], {
    mode: 'subscription',
    client_reference_id: 'novak__lena__tier',
    line_items: [
      {price: 'price_t6', quantity: 1},
      {quantity: 1, price_data: {currency: 'usd', unit_amount: 29900,
        product_data: {name: '6 tokens - November 2026, prepaid'}}},
    ],
    subscription_data: {trial_end: 1796104800, metadata: {
      householdId: 'novak', athleteId: 'lena', product: 'tier',
      packageId: 't-6', prepaidPeriodKey: '2026-11-01', prepaidTokens: '6'}},
    success_url: 'https://portal.test/portal/family?paid=lena' +
        '&cs={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://portal.test/portal/family',
    customer_email: 'nina@example.test',
  });
});

test('athlete role, existing customer, Google account, prorated', async () => {
  const nov12 = Date.parse('2026-11-12T18:00:00Z');
  const {calls, p} = call({athleteId: 'femi', product: 'tier'},
      ctx('u-femi', {firebase: {sign_in_provider: 'google.com'},
        email_verified: false}), {now: nov12});
  await p;
  const b = calls[0];
  assert.equal(b.customer, 'cus_oye');
  assert.equal(b.customer_email, undefined);
  assert.equal(b.success_url,
      'https://portal.test/portal/home?paid=femi&cs={CHECKOUT_SESSION_ID}');
  assert.equal(b.cancel_url, 'https://portal.test/portal/home');
  assert.equal(b.line_items[1].price_data.unit_amount,
      Math.round(29900 * 19 / 30));
  assert.equal(b.subscription_data.metadata.prepaidTokens, '4');
});

test('facility add-on: $300 line, elite sends empty tokens', async () => {
  const {calls, p} = call({athleteId: 'fac', product: 'tier'}, ctx('u-nina'));
  await refused('tier already paid', p, 'failed-precondition',
      'already-active');
  const ok = call({athleteId: 'max', product: 'tier'}, ctx('u-nina'));
  await refused('max already active', ok.p, 'failed-precondition',
      'already-active');
  const f = call({athleteId: 'lena', product: 'facility'}, ctx('u-nina'));
  await refused('facility before the tier', f.p, 'failed-precondition',
      'billing-not-active');
  const e = call({athleteId: 'max', product: 'facility'}, ctx('u-nina'));
  await refused('elite includes it', e.p, 'failed-precondition',
      'elite-includes-facility');
  const dup = call({athleteId: 'fac', product: 'facility'}, ctx('u-nina'));
  await refused('facility already active', dup.p, 'failed-precondition',
      'already-active');
  const docs = Object.assign({}, DOCS, {'athletes/fac':
    {householdId: 'novak', packageId: 't-6', billing: {status: 'active'}}});
  const good = call({athleteId: 'fac', product: 'facility'}, ctx('u-nina'),
      {db: fakeDb(docs), stripe: fakeStripe(calls, 30000)});
  await good.p;
  assert.equal(calls[0].client_reference_id, 'novak__fac__facility');
  assert.equal(calls[0].line_items[0].price, 'price_fac');
  assert.equal(calls[0].line_items[1].price_data.product_data.name,
      'Facility access - November 2026, prepaid');
  assert.deepEqual([calls[0].subscription_data.metadata.product,
    calls[0].subscription_data.metadata.prepaidTokens], ['facility', '']);
});

test('under 48 h to the 1st: prepay next month in full (D11)', async () => {
  const nov30 = Date.parse('2026-11-30T12:00:00Z');
  const p = checkout.prepaidFor(nov30, {priceCents: 29900, tokens: 6});
  assert.deepEqual([p.periodKey, p.label, p.amountCents, p.tokens,
    p.prorated, p.trialEnd], ['2026-12-01', 'December 2026', 29900, 6,
    false, prepaid.chicagoMidnightUnix('2027-01-01')]);
  const nov28 = Date.parse('2026-11-28T12:00:00Z');
  assert.equal(checkout.prepaidFor(nov28, {priceCents: 29900, tokens: 6})
      .periodKey, '2026-11-01');
});

test('refusals in the contract order', async () => {
  await refused('signed-out', call({athleteId: 'lena', product: 'tier'},
      {auth: null}).p, 'unauthenticated', 'signed-out');
  await refused('invalid-product', call({athleteId: 'lena', product: 'x'},
      ctx('u-nina')).p, 'invalid-argument', 'invalid-product');
  await refused('athlete-not-found', call({athleteId: 'zz', product: 'tier'},
      ctx('u-nina')).p, 'not-found', 'athlete-not-found');
  await refused('not-owner', call({athleteId: 'lena', product: 'tier'},
      ctx('u-kemi')).p, 'permission-denied', 'not-owner');
  await refused('email-unverified', call({athleteId: 'lena', product: 'tier'},
      ctx('u-nina', {email_verified: false})).p, 'failed-precondition',
  'email-unverified');
  await refused('no-package', call({athleteId: 'nopkg', product: 'tier'},
      ctx('u-nina')).p, 'failed-precondition', 'no-package');
  await refused('price-missing', call({athleteId: 'lena', product: 'tier'},
      ctx('u-nina'), {catalogue: {test: {}, live: {}}}).p,
  'failed-precondition', 'price-missing');
  const boom = {prices: {retrieve: async () => {
    throw new Error('boom');
  }}};
  await refused('stripe-error', call({athleteId: 'lena', product: 'tier'},
      ctx('u-nina'), {stripe: boom}).p, 'unavailable', 'stripe-error');
});

run();
```

Run: `cd functions && node portal/checkout.test.js`
Expected: `Cannot find module './checkout'`.

- [ ] **Step 2: Implement `functions/portal/checkout.js`**

```js
/**
 * createCheckoutSession (contract 1.5, spec 4.2 / 4.5): ONE Stripe Checkout
 * Session in subscription mode carrying the recurring tier (or facility)
 * price AND a one-time "prepaid month" line, with `trial_end` at 00:00
 * Chicago on the next 1st so every subscription anchors on the 1st
 * (rulings 0.11-0.13). Every Firestore read happens before the Stripe
 * calls; nothing is written here - the webhook (stripe.js) writes.
 */
'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const catalogue = require('./catalogue');
const lib = require('./lib');
const prepaid = require('./prepaid');
const {CHECKOUT_SECRETS} = require('./secrets');

const {HttpsError} = functions.https;
/**
 * Decision D11: Stripe refuses a Checkout `trial_end` under 48 h out, so a
 * checkout that close to the 1st prepays the NEXT month in full. 49 h of
 * lead keeps a clock-skewed request clear of Stripe's boundary.
 */
const MIN_TRIAL_LEAD_MS = 49 * 60 * 60 * 1000;
const PRODUCTS = ['tier', 'facility'];
const FACILITY_NAME = 'Facility access';

let stripeClient;

/** @return {!Object} The Stripe client, from STRIPE_SECRET_KEY. */
function stripe() {
  if (!stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

/** @return {!Object} The admin Firestore, resolved lazily. */
function db() {
  return admin.firestore();
}

/**
 * @param {string} code An HttpsError code.
 * @param {string} reason The contract's `details.reason`.
 * @param {string} message Plain-language copy.
 * @return {!Error} An HttpsError.
 */
function refuse(code, reason, message) {
  return new HttpsError(code, message, {reason});
}

/**
 * @param {!Object} store Firestore.
 * @param {string} collection The collection.
 * @param {?string} id The id.
 * @return {!Promise<?Object>} The body or null.
 */
async function read(store, collection, id) {
  if (!id) return null;
  const snap = await store.collection(collection).doc(id).get();
  return snap.exists ? snap.data() || {} : null;
}

/**
 * The prepaid period for this checkout, rolled one month forward when the
 * trial would end under 48 h from now (Stripe's Checkout minimum; ruled,
 * D11): the remaining day or two of the current month are free.
 * @param {number} nowMs The clock.
 * @param {{priceCents: number, tokens: ?number}} args The package.
 * @return {!Object} `prepaid.prepaidPeriodFor`'s result.
 */
function prepaidFor(nowMs, args) {
  const p = prepaid.prepaidPeriodFor(nowMs, args);
  if (p.trialEnd * 1000 - nowMs >= MIN_TRIAL_LEAD_MS) return p;
  return prepaid.prepaidPeriodFor(p.trialEnd * 1000 + 60 * 60 * 1000, args);
}

/**
 * The Checkout Session request body (spec 4.2). Pure.
 * @param {{householdId: string, athleteId: string, product: string,
 *     packageId: ?string, priceId: string, currency: string,
 *     productName: string, prepaid: !Object, role: string,
 *     portalUrl: string, customerId: ?string, email: ?string}} a Inputs.
 * @return {!Object} What `stripe.checkout.sessions.create` receives.
 */
function sessionBody(a) {
  const screen = a.role === 'athlete' ? 'home' : 'family';
  const base = `${a.portalUrl}/portal/${screen}`;
  const body = {
    mode: 'subscription',
    client_reference_id: `${a.householdId}__${a.athleteId}__${a.product}`,
    line_items: [
      {price: a.priceId, quantity: 1},
      {quantity: 1, price_data: {
        currency: a.currency,
        unit_amount: a.prepaid.amountCents,
        product_data: {
          name: `${a.productName} - ${a.prepaid.label}, prepaid`,
        },
      }},
    ],
    subscription_data: {
      trial_end: a.prepaid.trialEnd,
      metadata: {
        householdId: a.householdId,
        athleteId: a.athleteId,
        product: a.product,
        packageId: a.packageId || '',
        prepaidPeriodKey: a.prepaid.periodKey,
        prepaidTokens: a.prepaid.tokens === null ? '' :
            String(a.prepaid.tokens),
      },
    },
    success_url: `${base}?paid=${a.athleteId}&cs={CHECKOUT_SESSION_ID}`,
    cancel_url: base,
  };
  if (a.customerId) body.customer = a.customerId;
  else body.customer_email = a.email;
  return body;
}

/**
 * createCheckoutSession. Checks in the contract's order, then one Stripe
 * price read and one session create.
 * @param {*} data `{athleteId, product}`.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), stripe: (!Object|undefined),
 *     now: (number|undefined), catalogue: (!Object|undefined)}=} deps
 *     Injectable Firestore, Stripe client, clock and catalogue (tests).
 * @return {!Promise<{url: string}>} Where the browser goes.
 */
async function createCheckoutSessionHandler(data, context, deps) {
  const d = deps || {};
  const store = d.db || db();
  const nowMs = d.now === undefined ? Date.now() : Number(d.now);
  const auth = context && context.auth;
  if (!auth || !auth.uid) {
    throw refuse('unauthenticated', 'signed-out', 'Sign in to continue.');
  }
  const token = auth.token || {};
  const req = data || {};
  if (!PRODUCTS.includes(req.product) || typeof req.athleteId !== 'string' ||
      !req.athleteId) {
    throw refuse('invalid-argument', 'invalid-product',
        'Choose what to pay for.');
  }
  const athlete = await read(store, 'athletes', req.athleteId);
  if (!athlete) {
    throw refuse('not-found', 'athlete-not-found',
        'That athlete no longer exists.');
  }
  const me = (await read(store, 'users', auth.uid)) || {};
  const owner = (me.role === 'parent' &&
      me.householdId === athlete.householdId) ||
      me.athleteId === req.athleteId;
  if (!owner) {
    throw refuse('permission-denied', 'not-owner',
        'You can only pay for athletes in your family.');
  }
  const provider = token.firebase && token.firebase.sign_in_provider;
  if (provider === 'password' && token.email_verified !== true) {
    throw refuse('failed-precondition', 'email-unverified',
        'Verify your email to pay.');
  }
  const tierPaid = Boolean(athlete.billing) &&
      athlete.billing.status === 'active';
  const facilityPaid = Boolean(athlete.facilityBilling) &&
      athlete.facilityBilling.status === 'active';
  if (req.product === 'tier') {
    if (!athlete.packageId) {
      throw refuse('failed-precondition', 'no-package',
          'Choose a package first.');
    }
    if (tierPaid) {
      throw refuse('failed-precondition', 'already-active',
          'This membership is already paid.');
    }
  }
  const pkg = await read(store, 'packages', athlete.packageId);
  if (req.product === 'facility') {
    // Absent `billing` == active (spec 4.4): legacy athletes may add on.
    if (!lib.membershipAllowsBooking(null, athlete)) {
      throw refuse('failed-precondition', 'billing-not-active',
          'Pay for the membership first.');
    }
    if (pkg && pkg.kind === 'elite') {
      throw refuse('failed-precondition', 'elite-includes-facility',
          'Elite already includes facility access.');
    }
    if (facilityPaid) {
      throw refuse('failed-precondition', 'already-active',
          'Facility access is already paid.');
    }
  }
  const key = req.product === 'facility' ? catalogue.FACILITY_KEY :
      athlete.packageId;
  const priceId = catalogue.priceIdFor(key, d.catalogue);
  if (!priceId) {
    throw refuse('failed-precondition', 'price-missing',
        'Pricing is not set up yet. Try again later.');
  }
  const hh = (await read(store, 'households', athlete.householdId)) || {};
  const tokens = req.product === 'tier' && pkg && pkg.tokens !== undefined ?
      pkg.tokens : null;
  try {
    const client = d.stripe || stripe();
    const price = await client.prices.retrieve(priceId);
    const session = await client.checkout.sessions.create(sessionBody({
      householdId: athlete.householdId,
      athleteId: req.athleteId,
      product: req.product,
      packageId: athlete.packageId || null,
      priceId,
      currency: price.currency || 'usd',
      productName: req.product === 'facility' ? FACILITY_NAME :
          (pkg && pkg.name) || athlete.packageId,
      prepaid: prepaidFor(nowMs, {priceCents: price.unit_amount, tokens}),
      role: me.role === 'athlete' ? 'athlete' : 'parent',
      portalUrl: String(process.env.PORTAL_URL || '').replace(/\/$/, ''),
      customerId: hh.stripeCustomerId || null,
      email: token.email || (hh.guardian && hh.guardian.email) || null,
    }));
    return {url: session.url};
  } catch (err) {
    console.error('createCheckoutSession stripe error:', err);
    throw refuse('unavailable', 'stripe-error',
        'Checkout is unavailable right now. Try again in a minute.');
  }
}

const createCheckoutSession = functions.runWith({secrets: CHECKOUT_SECRETS})
    .https.onCall((data, context) => createCheckoutSessionHandler(data,
        context));

module.exports = {
  createCheckoutSession, createCheckoutSessionHandler, prepaidFor,
  sessionBody,
};
```

- [ ] **Step 3: Run**

Run: `cd functions && node portal/checkout.test.js && npm run lint`
Expected: `5 passing`, lint clean.

- [ ] **Step 4: Emulator smoke (no Stripe)** - with the isolated emulator up, prove the callable is reachable and refuses unauthenticated calls at the HTTP layer:

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:5001/rypacad/us-central1/createCheckoutSession -H "content-type: application/json" -d "{\"data\":{}}"`
Expected: `401` (the callable protocol's UNAUTHENTICATED). This needs Task 11's `index.js` export; until then the URL 404s - run it again after Task 11.

- [ ] **Step 5: Commit**

```bash
git add functions/portal/checkout.js functions/portal/checkout.test.js
git commit -m "feat(functions): createCheckoutSession - recurring price + prepaid month, trial_end on the 1st" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Owner-run test-mode verification (spec 4.2, last paragraph)** - NOT an agent step; recorded in the runbook (Task 12) and repeated here so the lane knows what "verified" means before `--mode live`:

1. After the TEST functions deploy (spec 12.5) and `write-packages.mjs --mode test --yes` (12.8), sign up a smoke family on rypacad.ryptest.com and tap **Pay for <athlete>'s 6 tokens**.
2. On the Stripe Checkout page (test mode) confirm TWO lines: `6 tokens` (monthly, "starts Dec 1" / trial) and `6 tokens - November 2026, prepaid` (one-time), total = the tier price. Pay with `4242 4242 4242 4242`.
3. Stripe dashboard -> Customers -> the smoke customer: the subscription is **Trialing** with **trial ends Dec 1, 2026**; the first invoice (`billing_reason: subscription_create`) shows the prepaid line paid at checkout; Developers -> Webhooks -> the TEST endpoint shows `checkout.session.completed` and `invoice.paid` both **200**.
4. Firestore: `athletes/{id}.billing.status == 'active'`, `tokenPeriods/{id}_2026-11-01` with `granted: 6, prepaid: true`, `notifications/membership_{id}_paid` exists.
5. Only then: delete the smoke household (spec 12.8) and proceed to 12.9.

---
Continue with `40-functions-part6.md` (Task 10 Steps 1-4, `calendlyWebhook` + fixtures) and `40-functions-part6b.md` (Task 10 Steps 5-7, the harness).
