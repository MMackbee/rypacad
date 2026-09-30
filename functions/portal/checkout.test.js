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
  'athletes/sol': {householdId: 'novak', packageId: 'single',
    billing: {status: 'pending'}},
  'packages/single': {kind: 'single', tokens: 1, name: 'Single token'},
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
    allow_promotion_codes: true,
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
  const pd = call({athleteId: 'fac', product: 'tier'}, ctx('u-nina'), {
    db: fakeDb(Object.assign({}, DOCS, {'athletes/fac': {householdId: 'novak',
      packageId: 't-6', billing: {status: 'past_due'}}})),
    stripe: fakeStripe([], 29900)});
  await refused('past_due keeps its subscription (no second checkout)', pd.p,
      'failed-precondition', 'already-active');
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

test('single token (one-time, 2026-09-29): refused before any Stripe call',
    async () => {
      const touched = [];
      const spy = {prices: {retrieve: async (id) => {
        touched.push(id);
        return {id, unit_amount: 6500, currency: 'usd'};
      }}, checkout: {sessions: {create: async (b) => {
        touched.push(b);
        return {url: 'x'};
      }}}};
      const cat = {test: Object.assign({}, CAT.test,
          {single: 'price_single'}), live: {}};
      await refused('single', call({athleteId: 'sol', product: 'tier'},
          ctx('u-nina'), {stripe: spy, catalogue: cat}).p,
      'failed-precondition', 'single-one-time');
      // Same refusal when the packages/single doc is missing in Firestore.
      const noPkg = Object.assign({}, DOCS);
      delete noPkg['packages/single'];
      await refused('single, no package doc', call(
          {athleteId: 'sol', product: 'tier'}, ctx('u-nina'),
          {stripe: spy, catalogue: cat, db: fakeDb(noPkg)}).p,
      'failed-precondition', 'single-one-time');
      assert.deepEqual(touched, [], 'Stripe was never called');
      // The monthly packages are untouched by the guard.
      const ok = call({athleteId: 'lena', product: 'tier'}, ctx('u-nina'));
      assert.equal((await ok.p).url, 'https://checkout.stripe.com/c/cs_1');
      assert.equal(ok.calls.length, 1);
    });

run();
