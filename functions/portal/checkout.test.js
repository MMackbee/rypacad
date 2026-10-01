'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test, run} = require('./tiny');
const lib = require('./lib');
const prepaid = require('./prepaid');
const single = require('./single');
const checkout = require('./checkout');

process.env.PORTAL_URL = 'https://portal.test';
process.env.STRIPE_MODE = 'test';
delete process.env.STRIPE_SIBLING_COUPON; // the sibling test sets it itself
const CAT = {test: {'t-6': 'price_t6', 'elite': 'price_elite',
  'single': 'price_single', 'facility-access': 'price_fac'}, live: {}};
const OCT = Date.parse('2026-10-05T18:00:00Z');
const NOV12 = Date.parse('2026-11-12T18:00:00Z');
// The instant booking opens, and with it the single token's sale (owner
// ruling 2026-10-01). OCT is before it; the single cases run at OPEN.
const OPEN = lib.BOOKING_OPENS_AT;

/**
 * @param {!Object} docs `{'athletes/a1': {...}}`.
 * @return {!Object} A Firestore stand-in for `collection().doc().get()`
 *     and `collection().where(field, '==', v).get()`.
 */
function fakeDb(docs) {
  return {collection: (c) => ({
    doc: (id) => ({
      async get() {
        const data = docs[`${c}/${id}`];
        return {exists: !!data, data: () => data};
      },
      // One level of merge is all pendingCheckout needs.
      async set(data, opts) {
        const cur = docs[`${c}/${id}`] || {};
        docs[`${c}/${id}`] = opts && opts.merge ?
            Object.assign({}, cur, data, {pendingCheckout: Object.assign({},
                cur.pendingCheckout, data.pendingCheckout)}) : data;
      },
    }),
    // Equality queries only: `where(field, '==', value).get()`.
    where: (field, op, value) => ({async get() {
      const hits = Object.entries(docs)
          .filter(([path, d]) => path.startsWith(`${c}/`) &&
              d[field] === value)
          .map(([path, d]) => ({id: path.slice(c.length + 1), data: () => d}));
      return {docs: hits};
    }}),
  })};
}
/**
 * @param {!Array} calls Receives every `sessions.create` body.
 * @param {number=} cents `unit_amount` of every monthly price.
 * @param {!Object=} over Fields merged into every retrieved price.
 * @return {!Object} A Stripe stand-in. `price_single` is the one-time $65
 *     price; every other price is typeless, as the monthly cases expect.
 */
function fakeStripe(calls, cents, over) {
  const sessions = {};
  return {
    prices: {retrieve: async (id) => (id === 'price_single' ?
      Object.assign({id, type: 'one_time', unit_amount: 6500,
        currency: 'usd'}, over) :
      Object.assign({id, unit_amount: cents || 29900, currency: 'usd'},
          over))},
    checkout: {sessions: {
      create: async (body) => {
        calls.push(body);
        const id = `cs_test_${calls.length}`;
        sessions[id] = {id, status: 'open',
          url: `https://checkout.stripe.com/c/${id}`};
        return sessions[id];
      },
      retrieve: async (id) => {
        if (!sessions[id]) throw new Error(`No such checkout.session: ${id}`);
        return sessions[id];
      },
      expire: async (id) => {
        sessions[id].status = 'expired';
        return sessions[id];
      },
    }},
    sessions,
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
  'athletes/sol': {name: 'Sol', householdId: 'novak', packageId: 'single',
    billing: {status: 'pending'}},
  'packages/single': {kind: 'single', tokens: 1, name: 'Single token'},
  // An athlete moved off Single by staff: payment-pending on t-6.
  'athletes/mover': {householdId: 'novak', packageId: 't-6',
    billing: {status: 'active', oneTime: true, subscriptionId: null}},
  // A package whose KIND is single under another id.
  'athletes/kindsol': {name: 'Kit', householdId: 'novak',
    packageId: 'single-legacy', billing: {status: 'pending'}},
  'packages/single-legacy': {kind: 'single', tokens: 1, name: 'Single'},
  'athletes/osa': {name: 'Osa', householdId: 'oye', packageId: 'single'},
  'users/u-osa': {role: 'athlete', athleteId: 'osa', householdId: 'oye'},
  'households/pd': {guardian: {email: 'p@example.test'},
    membership: {status: 'past_due'}},
  'athletes/pdsol': {name: 'Pia', householdId: 'pd', packageId: 'single',
    billing: {status: 'pending'}},
  'users/u-pd': {role: 'parent', householdId: 'pd'},
  'households/lap': {guardian: {email: 'l@example.test'},
    membership: {status: 'lapsed'}},
  'athletes/tia': {name: 'Tia', householdId: 'lap', packageId: 'single',
    billing: {status: 'pending'}},
  'athletes/tib': {name: 'Tib', householdId: 'lap', packageId: 't-6',
    billing: {status: 'lapsed', subscriptionId: 'sub_tib'}},
  'users/u-lap': {role: 'parent', householdId: 'lap'},
  'households/leg': {guardian: {email: 'g@example.test'},
    membership: {status: 'lapsed'}},
  'athletes/leo': {name: 'Leo', householdId: 'leg', packageId: 'single',
    billing: {status: 'pending'}},
  'athletes/lex': {name: 'Lex', householdId: 'leg', packageId: 't-6'},
  'users/u-leg': {role: 'parent', householdId: 'leg'},
};
// novak without max's Elite or fac's add-on: either one now refuses a
// facility checkout for the rest of the family (checkout-family.test.js).
const T6 = Object.assign({}, DOCS['athletes/fac'], {facilityBilling: null});
const PLAIN = Object.assign({}, DOCS, {'athletes/fac': T6, 'athletes/max': T6});
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
 * @param {string=} message Expected copy, when given.
 */
async function refused(label, p, code, reason, message) {
  await assert.rejects(p, (e) => e.code === code &&
      e.details && e.details.reason === reason &&
      (message === undefined || e.message === message), label);
}
/**
 * `call` with a fresh sessions.create spy; the refusal must come first.
 * @param {string} label The case.
 * @param {!Object} data The request.
 * @param {!Object} c The context.
 * @param {!Object} over Deps overrides; `docs` replaces entries of DOCS,
 *     `price` is merged into the retrieved price, `now` is the clock (OPEN
 *     when absent: single tokens are on sale).
 * @param {string} reason Expected `details.reason`.
 * @param {string=} message Expected copy.
 */
async function refusedFirst(label, data, c, over, reason, message) {
  const calls = [];
  const o = over || {};
  const deps = {stripe: fakeStripe(calls, 29900, o.price),
    now: o.now === undefined ? OPEN : o.now};
  if (o.docs) deps.db = fakeDb(Object.assign({}, DOCS, o.docs));
  await refused(label, call(data, c, deps).p, 'failed-precondition', reason,
      message);
  assert.equal(calls.length, 0, `${label}: sessions.create never called`);
}

test('tier before Nov 1: the exact session body', async () => {
  const {calls, p} = call({athleteId: 'lena', product: 'tier'}, ctx('u-nina'));
  assert.deepEqual(await p, {url: 'https://checkout.stripe.com/c/cs_test_1'});
  assert.deepEqual(calls[0], {
    mode: 'subscription',
    // novak: max is a paid Elite sibling, and no coupon is configured here.
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
    custom_text: {submit: {message: 'Today\'s charge covers November 2026 ' +
        'in full. Stripe calls the time until monthly billing starts on ' +
        'Dec 1 a free trial - nothing else is charged before then.'}},
    success_url: 'https://portal.test/portal/family?paid=lena' +
        '&cs={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://portal.test/portal/family',
    customer_email: 'nina@example.test',
  });
});

test('athlete role, existing customer, Google account, prorated', async () => {
  const {calls, p} = call({athleteId: 'femi', product: 'tier'},
      ctx('u-femi', {firebase: {sign_in_provider: 'google.com'},
        email_verified: false}), {now: NOV12});
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
  assert.equal(b.custom_text.submit.message, 'Today\'s charge covers the ' +
      'rest of November 2026. Stripe calls the time until monthly billing ' +
      'starts on Dec 1 a free trial - nothing else is charged before then.');
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
  const good = call({athleteId: 'fac', product: 'facility'}, ctx('u-nina'),
      {db: fakeDb(PLAIN), stripe: fakeStripe(calls, 30000)});
  await good.p;
  assert.equal(calls[0].client_reference_id, 'novak__fac__facility');
  assert.equal(calls[0].success_url, 'https://portal.test/portal/family' +
      '?paid=fac&product=facility&cs={CHECKOUT_SESSION_ID}');
  assert.equal(calls[0].line_items[0].price, 'price_fac');
  assert.equal(calls[0].line_items[1].price_data.product_data.name,
      'Family facility access - November 2026, prepaid');
  assert.deepEqual([calls[0].subscription_data.metadata.product,
    calls[0].subscription_data.metadata.prepaidTokens], ['facility', '']);
  assert.match(calls[0].custom_text.submit.message,
      /^Today's charge covers November 2026 in full\. .* on Dec 1 a free /);
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
  const late = call({athleteId: 'lena', product: 'tier'}, ctx('u-nina'),
      {now: nov30});
  await late.p;
  assert.match(late.calls[0].custom_text.submit.message,
      /covers December 2026 in full\. .* starts on Jan 1 a free trial - /);
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

const LIFE_MS = 24 * 60 * 60 * 1000 - 5 * 60 * 1000;
const metaOf = (hh, ath) => ({householdId: hh, athleteId: ath,
  product: 'tier', packageId: 'single'});
/**
 * The single-token body the spec pins, for the novak family's parent.
 * @param {string} ath The athlete id.
 * @param {string} name The athlete's name.
 * @param {number} nowMs The clock.
 * @return {!Object} The expected `sessions.create` body.
 */
function singleBody(ath, name, nowMs) {
  return {
    mode: 'payment',
    client_reference_id: `novak__${ath}__tier`,
    line_items: [{price: 'price_single', quantity: 1}],
    payment_method_types: ['card'],
    metadata: metaOf('novak', ath),
    payment_intent_data: {metadata: metaOf('novak', ath),
      description: `Single session token - ${name}`},
    custom_text: {submit: {message: 'One-time payment: one session token ' +
      `for ${name}, good through Sat, Feb 27, 2027.`}},
    expires_at: Math.floor((nowMs + LIFE_MS) / 1000),
    success_url: `https://portal.test/portal/family?paid=${ath}` +
        '&cs={CHECKOUT_SESSION_ID}&single=1',
    cancel_url: 'https://portal.test/portal/family',
    customer_email: 'nina@example.test',
    customer_creation: 'always',
  };
}

test('single: not on sale until booking opens (2026-10-01), no Stripe call',
    async () => {
      const touched = [];
      const note = (what) => async (x) => {
        touched.push([what, x]);
        return {id: 'cs_x', status: 'open', url: 'x'};
      };
      const spy = {prices: {retrieve: note('price')}, checkout: {sessions: {
        create: note('create'), retrieve: note('retrieve'),
        expire: note('expire')}}};
      const NOT_YET = 'Single tokens are available from Sat, Oct 10 at 7 AM. ' +
          'Nothing has been charged.';
      const early = (label, athleteId, over) => refused(label, call(
          {athleteId, product: 'tier'}, ctx('u-nina'),
          Object.assign({stripe: spy}, over)).p,
      'failed-precondition', 'single-not-open', NOT_YET);
      // The gate is booking's own (lib.BOOKING_OPENS_AT), not a second date.
      assert.equal(OPEN, Date.parse('2026-10-10T12:00:00Z'));
      assert.equal(single.saleOpen(OPEN - 1), false);
      assert.equal(single.saleOpen(OPEN), true);
      assert.equal(single.saleOpen(OPEN), lib.bookingOpen(OPEN, null));
      await early('single, Oct 5', 'sol');
      await early('single, one millisecond early', 'sol', {now: OPEN - 1});
      // Same refusal when the packages/single doc is missing in Firestore.
      const noPkg = Object.assign({}, DOCS);
      delete noPkg['packages/single'];
      await early('single, no package doc', 'sol', {db: fakeDb(noPkg)});
      await early('a package of kind single', 'kindsol');
      // A remembered open session is not handed back before the gate.
      await early('single with a remembered session', 'sol', {db: fakeDb(
          Object.assign({}, DOCS, {'athletes/sol': {name: 'Sol',
            householdId: 'novak', packageId: 'single',
            billing: {status: 'active', oneTime: true, subscriptionId: null},
            pendingCheckout: {tier: {sessionId: 'cs_x',
              priceId: 'price_single', discount: 'none'}}}}))});
      // The athlete's own login is refused the same way.
      await refused('single, the athlete\'s own login', call(
          {athleteId: 'osa', product: 'tier'}, ctx('u-osa'), {stripe: spy}).p,
      'failed-precondition', 'single-not-open', NOT_YET);
      assert.deepEqual(touched, [], 'Stripe was never called');
      // The same words the client pins: data/singleToken.js builds its copy
      // from calendar.js BOOKING_OPENS_LABEL.
      const cal = fs.readFileSync(path.join(__dirname,
          '../../frontend/src/portal/data/calendar.js'), 'utf8');
      const label = /BOOKING_OPENS_LABEL = '([^']+)'/.exec(cal);
      assert.ok(label, 'BOOKING_OPENS_LABEL not found in calendar.js');
      assert.equal(NOT_YET, `Single tokens are available from ${label[1]}. ` +
          'Nothing has been charged.');
      // From the gate on, the same request is sold.
      const open = call({athleteId: 'sol', product: 'tier'}, ctx('u-nina'),
          {now: OPEN});
      await open.p;
      assert.equal(open.calls.length, 1);
      assert.equal(open.calls[0].mode, 'payment');
      // The monthly packages are untouched by the gate.
      const ok = call({athleteId: 'lena', product: 'tier'}, ctx('u-nina'));
      assert.equal((await ok.p).url, 'https://checkout.stripe.com/c/cs_test_1');
      assert.equal(ok.calls.length, 1);
      assert.equal(ok.calls[0].mode, 'subscription');
    });

test('sibling discount (2026-09-30): 2+ membership families, coupon or code',
    async () => {
      // novak has lena, max and fac on monthly packages (nopkg and the single
      // token sol do not count); oye has femi alone.
      const two = fakeDb(DOCS);
      // Owner 2026-10-01 ("lesser value"): the saving is 20% of the LOWER
      // membership in either payment order. lena (6 tokens) with max's
      // Elite paid: the plain coupon. max's Elite with only 6-token siblings
      // paid: eligible, measured against that cheaper package.
      const sib = (...a) => checkout.siblingEligible(...a);
      assert.deepEqual(await sib(two, 'novak', 'lena', 't-6'),
          {eligible: true, lower: null});
      assert.deepEqual(await sib(two, 'novak', 'max', 'elite'),
          {eligible: true, lower: 't-6'});
      assert.deepEqual(await sib(two, 'novak', 'max', 't-16'),
          {eligible: true, lower: 't-6'});
      assert.deepEqual(await sib(two, 'novak', 'lena', 'elite'),
          {eligible: true, lower: null});
      assert.deepEqual(await sib(two, 'oye', 'femi', 't-6'),
          {eligible: false, lower: null});
      assert.deepEqual(await sib(two, 'novak', 'lena', 'mystery'),
          {eligible: false, lower: null});
      assert.equal(checkout.siblingCouponId('SIBLING20', null, 't-6'),
          'SIBLING20');
      assert.equal(checkout.siblingCouponId('SIBLING20', 't-6', 'elite'),
          'SIBLING20_6_ELITE');
      assert.equal(checkout.siblingCouponId('SIBLING20', 't-12', 't-16'),
          'SIBLING20_12_16');
      assert.equal(checkout.siblingCouponId(null, 't-6', 'elite'), null);
      const only = fakeDb(Object.assign({}, DOCS, {'athletes/max':
        {householdId: 'novak', packageId: 'single'}, 'athletes/fac':
        {householdId: 'novak', packageId: null}}));
      assert.equal((await checkout.siblingEligible(only, 'novak', 'lena',
          't-6')).eligible, false);
      // The single token is not a membership: `only` still holds mover, a
      // single buyer moved to t-6 and yet to pay for it (a one-time billing
      // block), and that never counts. Once the subscription is paid, it
      // does.
      assert.equal(DOCS['athletes/mover'].billing.oneTime, true);
      const moved = fakeDb(Object.assign({}, DOCS, {'athletes/max':
        {householdId: 'novak', packageId: 'single'}, 'athletes/fac':
        {householdId: 'novak', packageId: null}, 'athletes/mover':
        {householdId: 'novak', packageId: 't-6', billing: {status: 'active',
          oneTime: false, subscriptionId: 'sub_mover'}}}));
      assert.deepEqual(await sib(moved, 'novak', 'lena', 't-6'),
          {eligible: true, lower: null});
      // A single token never earns the discount either (no rank).
      assert.deepEqual(await sib(two, 'novak', 'sol', 'single'),
          {eligible: false, lower: null});
      // A never-paid (pending) sibling does not count (review 2026-09-30).
      const unpaid = fakeDb(Object.assign({}, DOCS, {'athletes/max':
        {householdId: 'novak', packageId: 'elite',
          billing: {status: 'pending'}},
      'athletes/fac': {householdId: 'novak', packageId: 't-6',
        billing: {status: 'pending'}}}));
      assert.equal((await checkout.siblingEligible(unpaid, 'novak', 'lena',
          't-6')).eligible, false);
      // The athlete being paid for never counts as their own sibling.
      const self = fakeDb(Object.assign({}, DOCS, {'athletes/max':
        {householdId: 'novak', packageId: 'single'}, 'athletes/fac':
        {householdId: 'novak', packageId: null}, 'athletes/lena':
        {householdId: 'novak', packageId: 't-6',
          billing: {status: 'active'}}}));
      assert.equal((await checkout.siblingEligible(self, 'novak', 'lena',
          't-6')).eligible, false);
      // No coupon configured: the eligible family gets the code field only.
      const saved = process.env.STRIPE_SIBLING_COUPON;
      delete process.env.STRIPE_SIBLING_COUPON;
      try {
        const code = call({athleteId: 'lena', product: 'tier'}, ctx('u-nina'));
        await code.p;
        assert.equal(code.calls[0].allow_promotion_codes, true);
        assert.equal(code.calls[0].discounts, undefined);
        const solo = call({athleteId: 'femi', product: 'tier'},
            ctx('u-kemi'));
        await solo.p;
        assert.equal(solo.calls[0].allow_promotion_codes, undefined);
        assert.equal(solo.calls[0].discounts, undefined);
        // Coupon configured: applied for them, nothing to type.
        process.env.STRIPE_SIBLING_COUPON = ' SIBLING10 ';
        const auto = call({athleteId: 'lena', product: 'tier'}, ctx('u-nina'));
        await auto.p;
        assert.deepStrictEqual(auto.calls[0].discounts,
            [{coupon: 'SIBLING10'}]);
        assert.equal(auto.calls[0].allow_promotion_codes, undefined);
        // The dearer membership paid second: the pair coupon, which takes
        // 20% of the cheaper paid membership off it.
        const dear = call({athleteId: 'lena', product: 'tier'}, ctx('u-nina'),
            {db: fakeDb(Object.assign({}, DOCS, {
              'athletes/lena': {householdId: 'novak', packageId: 'elite',
                billing: {status: 'pending'}},
              'athletes/max': {householdId: 'novak', packageId: 't-6',
                billing: {status: 'active'}}}))});
        await dear.p;
        assert.deepStrictEqual(dear.calls[0].discounts,
            [{coupon: 'SIBLING10_6_ELITE'}]);
        // The facility add-on is not a membership: neither, even for them.
        const fac = call({athleteId: 'lena', product: 'facility'},
            ctx('u-nina'), {db: fakeDb(Object.assign({}, PLAIN,
                {'athletes/lena': T6}))});
        await fac.p;
        assert.equal(fac.calls[0].discounts, undefined);
        assert.equal(fac.calls[0].allow_promotion_codes, undefined);
      } finally {
        if (saved === undefined) delete process.env.STRIPE_SIBLING_COUPON;
        else process.env.STRIPE_SIBLING_COUPON = saved;
      }
    });

test('sibling: lapsed siblings do not count; a missing coupon falls back',
    async () => {
      const lapsed = fakeDb(Object.assign({}, DOCS, {
        'athletes/max': {householdId: 'novak', packageId: 'elite',
          billing: {status: 'lapsed'}},
        'athletes/fac': {householdId: 'novak', packageId: 't-6',
          billing: {status: 'lapsed'}}}));
      assert.equal((await checkout.siblingEligible(lapsed, 'novak', 'lena',
          't-6')).eligible, false);
      // A read failure costs the discount, not the checkout.
      const broken = Object.assign(fakeDb(DOCS), {collection: (c) =>
        Object.assign(fakeDb(DOCS).collection(c), {where: () => ({
          get: async () => {
            throw new Error('firestore down');
          }})})});
      const noDisc = call({athleteId: 'lena', product: 'tier'},
          ctx('u-nina'), {db: broken});
      await noDisc.p;
      assert.equal(noDisc.calls[0].allow_promotion_codes, undefined);
      assert.equal(noDisc.calls[0].discounts, undefined);
      // The coupon id is set but Stripe has no such coupon in this mode:
      // one retry with the code field, never a refusal.
      process.env.STRIPE_SIBLING_COUPON = 'SIBLING';
      try {
        const calls = [];
        const missing = fakeStripe(calls);
        const create = missing.checkout.sessions.create;
        missing.checkout.sessions.create = async (body) => {
          if (body.discounts) {
            const err = new Error('No such coupon: SIBLING');
            err.code = 'resource_missing';
            err.param = 'discounts[0][coupon]';
            throw err;
          }
          return create(body);
        };
        const r = call({athleteId: 'lena', product: 'tier'}, ctx('u-nina'),
            {stripe: missing});
        assert.deepEqual(await r.p,
            {url: 'https://checkout.stripe.com/c/cs_test_1'});
        assert.equal(calls.length, 1);
        assert.equal(calls[0].allow_promotion_codes, true);
        assert.equal(calls[0].discounts, undefined);
        // Any other Stripe error is still the plain refusal.
        const other = fakeStripe([]);
        other.checkout.sessions.create = async () => {
          const err = new Error('rate limited');
          err.code = 'rate_limit';
          throw err;
        };
        await refused('other stripe error', call({athleteId: 'lena',
          product: 'tier'}, ctx('u-nina'), {stripe: other}).p,
        'unavailable', 'stripe-error');
      } finally {
        delete process.env.STRIPE_SIBLING_COUPON;
      }
    });

test('a second Pay now reuses the open session (QA S9: no double charge)',
    async () => {
      const docs = Object.assign({}, DOCS, {'athletes/lena': {
        householdId: 'novak', packageId: 't-6',
        billing: {status: 'pending'}}});
      const db = fakeDb(docs);
      const calls = [];
      const st = fakeStripe(calls);
      const first = await checkout.createCheckoutSessionHandler(
          {athleteId: 'lena', product: 'tier'}, ctx('u-nina'),
          {db, stripe: st, now: OCT, catalogue: CAT});
      assert.equal(first.url, 'https://checkout.stripe.com/c/cs_test_1');
      // novak is a 2+ membership family with no coupon configured: 'code'.
      assert.deepEqual(docs['athletes/lena'].pendingCheckout.tier,
          {sessionId: 'cs_test_1', priceId: 'price_t6', discount: 'code',
            createdAt: new Date(OCT).toISOString()});
      // Same price and discount, still open: the same page, no new session.
      const again = await checkout.createCheckoutSessionHandler(
          {athleteId: 'lena', product: 'tier'}, ctx('u-nina'),
          {db, stripe: st, now: OCT, catalogue: CAT});
      assert.equal(again.url, first.url);
      assert.equal(calls.length, 1);
      // Paid or timed out: a fresh session.
      st.sessions.cs_test_1.status = 'expired';
      const fresh = await checkout.createCheckoutSessionHandler(
          {athleteId: 'lena', product: 'tier'}, ctx('u-nina'),
          {db, stripe: st, now: OCT, catalogue: CAT});
      assert.equal(fresh.url, 'https://checkout.stripe.com/c/cs_test_2');
      assert.equal(calls.length, 2);
      // The family changed package: the old offer is expired, not reused.
      docs['athletes/lena'].packageId = 'elite';
      const changed = await checkout.createCheckoutSessionHandler(
          {athleteId: 'lena', product: 'tier'}, ctx('u-nina'),
          {db, stripe: st, now: OCT, catalogue: CAT});
      assert.equal(changed.url, 'https://checkout.stripe.com/c/cs_test_3');
      assert.equal(st.sessions.cs_test_2.status, 'expired');
      assert.equal(calls[2].line_items[0].price, 'price_elite');
      // Stripe cannot find the remembered session: a fresh one, no error.
      docs['athletes/lena'].pendingCheckout.tier.sessionId = 'cs_gone';
      const gone = await checkout.createCheckoutSessionHandler(
          {athleteId: 'lena', product: 'tier'}, ctx('u-nina'),
          {db, stripe: st, now: OCT, catalogue: CAT});
      assert.equal(gone.url, 'https://checkout.stripe.com/c/cs_test_4');
      // The add-on keeps its own slot.
      docs['athletes/lena'].billing = {status: 'active'};
      docs['athletes/lena'].packageId = 't-6';
      docs['athletes/max'] = docs['athletes/fac'] = T6;
      await checkout.createCheckoutSessionHandler(
          {athleteId: 'lena', product: 'facility'}, ctx('u-nina'),
          {db, stripe: st, now: OCT, catalogue: CAT});
      assert.equal(docs['athletes/lena'].pendingCheckout.facility.sessionId,
          'cs_test_5');
      assert.equal(docs['athletes/lena'].pendingCheckout.tier.sessionId,
          'cs_test_4');
    });

test('an open session is not reused once the sibling decision changed',
    async () => {
      // femi is alone in oye: no discount. A sibling arrives while the
      // session is open, so the next Pay now must be a discounted page.
      const docs = Object.assign({}, DOCS, {'athletes/femi':
        {householdId: 'oye', packageId: 't-6', billing: {status: 'pending'}}});
      const db = fakeDb(docs);
      const calls = [];
      const st = fakeStripe(calls);
      const deps = {db, stripe: st, now: OCT, catalogue: CAT};
      const alone = await checkout.createCheckoutSessionHandler(
          {athleteId: 'femi', product: 'tier'}, ctx('u-femi'), deps);
      assert.equal(alone.url, 'https://checkout.stripe.com/c/cs_test_1');
      assert.equal(docs['athletes/femi'].pendingCheckout.tier.discount, 'none');
      docs['athletes/oye-kid2'] = {householdId: 'oye', packageId: 't-12',
        billing: {status: 'active'}};
      const withSib = await checkout.createCheckoutSessionHandler(
          {athleteId: 'femi', product: 'tier'}, ctx('u-femi'), deps);
      assert.equal(withSib.url, 'https://checkout.stripe.com/c/cs_test_2');
      assert.equal(st.sessions.cs_test_1.status, 'expired');
      assert.equal(calls[1].allow_promotion_codes, true);
      assert.equal(docs['athletes/femi'].pendingCheckout.tier.discount, 'code');
    });

test('a coupon refused for any reason falls back to the code field',
    async () => {
      process.env.STRIPE_SIBLING_COUPON = 'SIBLING';
      try {
        const calls = [];
        const st = fakeStripe(calls);
        const create = st.checkout.sessions.create;
        st.checkout.sessions.create = async (body) => {
          if (body.discounts) {
            const err = new Error('This coupon has expired.');
            err.code = 'coupon_expired';
            err.param = 'discounts[0][coupon]';
            throw err;
          }
          return create(body);
        };
        const r = call({athleteId: 'lena', product: 'tier'}, ctx('u-nina'),
            {stripe: st});
        assert.equal((await r.p).url, 'https://checkout.stripe.com/c/cs_test_1');
        assert.equal(calls[0].allow_promotion_codes, true);
        assert.equal(calls[0].discounts, undefined);
      } finally {
        delete process.env.STRIPE_SIBLING_COUPON;
      }
    });

test('single: the exact payment-mode body; prepaidFor never used',
    async () => {
      const orig = prepaid.prepaidPeriodFor;
      let prepaidCalls = 0;
      prepaid.prepaidPeriodFor = (...a) => {
        prepaidCalls++;
        return orig(...a);
      };
      // novak has paid siblings and a coupon is configured: the single
      // token is not a membership, so neither a discount nor the code field.
      process.env.STRIPE_SIBLING_COUPON = 'SIBLING20';
      try {
        for (const now of [OPEN, NOV12]) {
          const {calls, p} = call({athleteId: 'sol', product: 'tier'},
              ctx('u-nina'), {now});
          assert.deepEqual(await p,
              {url: 'https://checkout.stripe.com/c/cs_test_1'});
          assert.equal(calls.length, 1);
          assert.deepEqual(calls[0], singleBody('sol', 'Sol', now));
        }
        assert.equal(prepaidCalls, 0, 'no prepaid month for a single');
        await call({athleteId: 'lena', product: 'tier'}, ctx('u-nina')).p;
        assert.ok(prepaidCalls > 0, 'the spy sees the monthly path');
      } finally {
        prepaid.prepaidPeriodFor = orig;
        delete process.env.STRIPE_SIBLING_COUPON;
      }
      assert.equal(new Date(`${single.SEASON_END}T12:00:00Z`)
          .toLocaleDateString('en-US', {weekday: 'short', month: 'short',
            day: 'numeric', year: 'numeric', timeZone: 'UTC'}),
      checkout.SEASON_END_LABEL, 'the copy names single.SEASON_END');
    });

test('single: a linked customer only; athlete role; kind single', async () => {
  const {calls, p} = call({athleteId: 'osa', product: 'tier'}, ctx('u-osa'),
      {now: OPEN});
  await p;
  assert.equal(calls[0].customer, 'cus_oye');
  assert.equal('customer_email' in calls[0], false);
  assert.equal('customer_creation' in calls[0], false);
  assert.equal(calls[0].success_url, 'https://portal.test/portal/home' +
      '?paid=osa&cs={CHECKOUT_SESSION_ID}&single=1');
  const noPkg = Object.assign({}, DOCS);
  delete noPkg['packages/single'];
  const bare = call({athleteId: 'sol', product: 'tier'}, ctx('u-nina'),
      {db: fakeDb(noPkg), now: OPEN});
  await bare.p;
  assert.deepEqual(bare.calls[0], singleBody('sol', 'Sol', OPEN),
      'packageId single alone is enough (no packages doc)');
  const kind = call({athleteId: 'kindsol', product: 'tier'}, ctx('u-nina'),
      {now: OPEN});
  await kind.p;
  assert.deepEqual(kind.calls[0], singleBody('kindsol', 'Kit', OPEN),
      'a package of kind single sells the catalogue single price');
});

test('single: repeat purchases allowed; a monthly plan is refused',
    async () => {
      const paidOnce = () => Object.assign({}, DOCS, {'athletes/sol': {
        name: 'Sol', householdId: 'novak', packageId: 'single', billing: {
          status: 'active', oneTime: true, subscriptionId: null}}});
      const repeat = call({athleteId: 'sol', product: 'tier'}, ctx('u-nina'),
          {db: fakeDb(paidOnce()), now: OPEN});
      await repeat.p;
      assert.equal(repeat.calls[0].mode, 'payment');
      // Two taps on Buy share one open page (QA S9); once that session is
      // paid, the next Buy is a new session - one more token.
      const docs = paidOnce();
      const calls = [];
      const st = fakeStripe(calls);
      const deps = {db: fakeDb(docs), stripe: st, now: OPEN, catalogue: CAT};
      const buy = () => checkout.createCheckoutSessionHandler(
          {athleteId: 'sol', product: 'tier'}, ctx('u-nina'), deps);
      const first = await buy();
      assert.deepEqual(docs['athletes/sol'].pendingCheckout.tier,
          {sessionId: 'cs_test_1', priceId: 'price_single', discount: 'none',
            createdAt: new Date(OPEN).toISOString()});
      assert.equal((await buy()).url, first.url);
      assert.equal(calls.length, 1);
      st.sessions.cs_test_1.status = 'complete';
      assert.equal((await buy()).url,
          'https://checkout.stripe.com/c/cs_test_2');
      assert.equal(calls.length, 2);
      assert.equal(calls[1].mode, 'payment');
      const academy = 'This athlete still has a monthly plan - contact the ' +
          'academy to switch to session tokens.';
      await refusedFirst('active without oneTime', {athleteId: 'sol',
        product: 'tier'}, ctx('u-nina'), {docs: {'athletes/sol': {
        householdId: 'novak', packageId: 'single',
        billing: {status: 'active'}}}}, 'already-active', academy);
      await refusedFirst('past_due athlete', {athleteId: 'sol',
        product: 'tier'}, ctx('u-nina'), {docs: {'athletes/sol': {
        householdId: 'novak', packageId: 'single',
        billing: {status: 'past_due', subscriptionId: 'sub_x'}}}},
      'already-active', academy);
      await refusedFirst('oneTime alongside a live subscription',
          {athleteId: 'sol', product: 'tier'}, ctx('u-nina'), {docs: {
            'athletes/sol': {householdId: 'novak', packageId: 'single',
              billing: {status: 'active', oneTime: true,
                subscriptionId: 'sub_x'}}}}, 'already-active', academy);
    });

test('single: household gates', async () => {
  await refusedFirst('past_due household', {athleteId: 'pdsol',
    product: 'tier'}, ctx('u-pd'), {}, 'household-past-due',
  'A card on this family account needs updating before you can buy a ' +
      'session token. Nothing has been charged.');
  const lap = call({athleteId: 'tia', product: 'tier'}, ctx('u-lap'),
      {now: OPEN});
  await lap.p;
  assert.equal(lap.calls[0].client_reference_id, 'lap__tia__tier',
      'lapsed, every sibling billed: allowed');
  await refusedFirst('lapsed with a legacy sibling', {athleteId: 'leo',
    product: 'tier'}, ctx('u-leg'), {}, 'household-lapsed-legacy',
  'This family account needs the academy\'s help before you can buy a ' +
      'session token. Nothing has been charged.');
});

test('single: no facility add-on', async () => {
  await refusedFirst('facility for sol', {athleteId: 'sol',
    product: 'facility'}, ctx('u-nina'), {}, 'single-no-facility');
  await refusedFirst('facility for a kind-single package', {
    athleteId: 'kindsol', product: 'facility'}, ctx('u-nina'), {
    docs: {'athletes/kindsol': {householdId: 'novak',
      packageId: 'single-legacy', billing: {status: 'active',
        oneTime: true}}}}, 'single-no-facility');
});

test('single: season cutoff (Feb 28 00:00 Chicago)', async () => {
  const cutoff = Date.UTC(2027, 1, 28, 6) / 1000;
  assert.equal(cutoff, 1803794400);
  await refusedFirst('under 30 minutes left', {athleteId: 'sol',
    product: 'tier'}, ctx('u-nina'),
  {now: Date.parse('2027-02-28T05:31:00Z')}, 'season-over',
  'Session tokens for this season are no longer on sale. Nothing has ' +
      'been charged.');
  for (const iso of ['2027-02-28T05:29:00Z', '2027-02-27T12:00:00Z']) {
    const ok = call({athleteId: 'sol', product: 'tier'}, ctx('u-nina'),
        {now: Date.parse(iso)});
    await ok.p;
    assert.equal(ok.calls[0].expires_at, cutoff, `${iso}: capped`);
  }
  const monthly = call({athleteId: 'lena', product: 'tier'}, ctx('u-nina'),
      {now: Date.parse('2027-02-28T05:31:00Z')});
  await monthly.p;
  assert.equal(monthly.calls[0].mode, 'subscription',
      'the cutoff is for single tokens only');
});

test('price-mismatch, never stripe-error, before any session', async () => {
  const cases = {
    'a recurring type': {type: 'recurring'},
    'a recurring object': {recurring: {interval: 'month'}},
    'unit_amount 650': {unit_amount: 650},
    'custom_unit_amount': {custom_unit_amount: {enabled: true}},
    'another currency': {currency: 'eur'},
  };
  for (const [label, price] of Object.entries(cases)) {
    await refusedFirst(label, {athleteId: 'sol', product: 'tier'},
        ctx('u-nina'), {price}, 'price-mismatch');
  }
  await refusedFirst('a t-6 price of type one_time', {athleteId: 'lena',
    product: 'tier'}, ctx('u-nina'), {price: {type: 'one_time'}},
  'price-mismatch');
  const failing = {prices: fakeStripe([]).prices, checkout: {sessions: {
    create: async () => {
      throw new Error('stripe down');
    }}}};
  await refused('sessions.create failing is stripe-error', call(
      {athleteId: 'sol', product: 'tier'}, ctx('u-nina'),
      {stripe: failing, now: OPEN}).p, 'unavailable', 'stripe-error');
});

test('a oneTime athlete moved to t-6 gets the subscription body', async () => {
  const {calls, p} = call({athleteId: 'mover', product: 'tier'},
      ctx('u-nina'));
  await p;
  assert.deepEqual(calls[0], {
    mode: 'subscription',
    // novak: max is a paid Elite sibling, and no coupon is configured here.
    allow_promotion_codes: true,
    client_reference_id: 'novak__mover__tier',
    line_items: [
      {price: 'price_t6', quantity: 1},
      {quantity: 1, price_data: {currency: 'usd', unit_amount: 29900,
        product_data: {name: '6 tokens - November 2026, prepaid'}}},
    ],
    subscription_data: {trial_end: 1796104800, metadata: {
      householdId: 'novak', athleteId: 'mover', product: 'tier',
      packageId: 't-6', prepaidPeriodKey: '2026-11-01', prepaidTokens: '6'}},
    custom_text: {submit: {message: 'Today\'s charge covers November 2026 ' +
        'in full. Stripe calls the time until monthly billing starts on ' +
        'Dec 1 a free trial - nothing else is charged before then.'}},
    success_url: 'https://portal.test/portal/family?paid=mover' +
        '&cs={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://portal.test/portal/family',
    customer_email: 'nina@example.test',
  });
});

run();
