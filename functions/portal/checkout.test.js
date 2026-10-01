'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const prepaid = require('./prepaid');
const checkout = require('./checkout');

process.env.PORTAL_URL = 'https://portal.test';
process.env.STRIPE_MODE = 'test';
delete process.env.STRIPE_SIBLING_COUPON; // the sibling test sets it itself
const CAT = {test: {'t-6': 'price_t6', 'elite': 'price_elite', 'single': null,
  'facility-access': 'price_fac'}, live: {}};
const OCT = Date.parse('2026-10-05T18:00:00Z');

/**
 * @param {!Object} docs `{'athletes/a1': {...}}`.
 * @return {!Object} A Firestore stand-in for `collection().doc().get()`.
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
 * @param {number=} cents `unit_amount` of every price.
 * @return {!Object} A Stripe stand-in.
 */
function fakeStripe(calls, cents) {
  const sessions = {};
  return {
    prices: {retrieve: async (id) => ({id, unit_amount: cents || 29900,
      currency: 'usd'})},
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
  'athletes/sol': {householdId: 'novak', packageId: 'single',
    billing: {status: 'pending'}},
  'packages/single': {kind: 'single', tokens: 1, name: 'Single token'},
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
 */
async function refused(label, p, code, reason) {
  await assert.rejects(p, (e) => e.code === code &&
      e.details && e.details.reason === reason, label);
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
      assert.equal((await ok.p).url, 'https://checkout.stripe.com/c/cs_test_1');
      assert.equal(ok.calls.length, 1);
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

run();
