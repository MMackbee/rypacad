'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const prepaid = require('./prepaid');
const single = require('./single');
const checkout = require('./checkout');

process.env.PORTAL_URL = 'https://portal.test';
process.env.STRIPE_MODE = 'test';
const CAT = {test: {'t-6': 'price_t6', 'elite': 'price_elite',
  'single': 'price_single', 'facility-access': 'price_fac'}, live: {}};
const OCT = Date.parse('2026-10-05T18:00:00Z');
const NOV12 = Date.parse('2026-11-12T18:00:00Z');

/**
 * @param {!Object} docs `{'athletes/a1': {...}}`.
 * @return {!Object} A Firestore stand-in for `collection().doc().get()`
 *     and `collection().where(field, '==', v).get()`.
 */
function fakeDb(docs) {
  return {collection: (c) => ({
    doc: (id) => ({async get() {
      const data = docs[`${c}/${id}`];
      return {exists: !!data, data: () => data};
    }}),
    where: (field, op, value) => ({async get() {
      const rows = Object.keys(docs)
          .filter((k) => k.startsWith(`${c}/`) && docs[k] &&
              docs[k][field] === value)
          .map((k) => ({id: k.slice(c.length + 1), data: () => docs[k]}));
      return {empty: rows.length === 0, size: rows.length, docs: rows};
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
  return {
    prices: {retrieve: async (id) => (id === 'price_single' ?
      Object.assign({id, type: 'one_time', unit_amount: 6500,
        currency: 'usd'}, over) :
      Object.assign({id, unit_amount: cents || 29900, currency: 'usd'},
          over))},
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
 *     `price` is merged into the retrieved price.
 * @param {string} reason Expected `details.reason`.
 * @param {string=} message Expected copy.
 */
async function refusedFirst(label, data, c, over, reason, message) {
  const calls = [];
  const o = over || {};
  const deps = {stripe: fakeStripe(calls, 29900, o.price)};
  if (o.docs) deps.db = fakeDb(Object.assign({}, DOCS, o.docs));
  if (o.now !== undefined) deps.now = o.now;
  await refused(label, call(data, c, deps).p, 'failed-precondition', reason,
      message);
  assert.equal(calls.length, 0, `${label}: sessions.create never called`);
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

test('single: the exact payment-mode body; prepaidFor never used',
    async () => {
      const orig = prepaid.prepaidPeriodFor;
      let prepaidCalls = 0;
      prepaid.prepaidPeriodFor = (...a) => {
        prepaidCalls++;
        return orig(...a);
      };
      try {
        for (const now of [OCT, NOV12]) {
          const {calls, p} = call({athleteId: 'sol', product: 'tier'},
              ctx('u-nina'), {now});
          assert.deepEqual(await p,
              {url: 'https://checkout.stripe.com/c/cs_1'});
          assert.equal(calls.length, 1);
          assert.deepEqual(calls[0], singleBody('sol', 'Sol', now));
        }
        assert.equal(prepaidCalls, 0, 'no prepaid month for a single');
        await call({athleteId: 'lena', product: 'tier'}, ctx('u-nina')).p;
        assert.ok(prepaidCalls > 0, 'the spy sees the monthly path');
      } finally {
        prepaid.prepaidPeriodFor = orig;
      }
      assert.equal(new Date(`${single.SEASON_END}T12:00:00Z`)
          .toLocaleDateString('en-US', {weekday: 'short', month: 'short',
            day: 'numeric', year: 'numeric', timeZone: 'UTC'}),
      checkout.SEASON_END_LABEL, 'the copy names single.SEASON_END');
    });

test('single: a linked customer only; athlete role; kind single', async () => {
  const {calls, p} = call({athleteId: 'osa', product: 'tier'}, ctx('u-osa'));
  await p;
  assert.equal(calls[0].customer, 'cus_oye');
  assert.equal('customer_email' in calls[0], false);
  assert.equal('customer_creation' in calls[0], false);
  assert.equal(calls[0].success_url, 'https://portal.test/portal/home' +
      '?paid=osa&cs={CHECKOUT_SESSION_ID}&single=1');
  const noPkg = Object.assign({}, DOCS);
  delete noPkg['packages/single'];
  const bare = call({athleteId: 'sol', product: 'tier'}, ctx('u-nina'),
      {db: fakeDb(noPkg)});
  await bare.p;
  assert.deepEqual(bare.calls[0], singleBody('sol', 'Sol', OCT),
      'packageId single alone is enough (no packages doc)');
  const kind = call({athleteId: 'kindsol', product: 'tier'}, ctx('u-nina'));
  await kind.p;
  assert.deepEqual(kind.calls[0], singleBody('kindsol', 'Kit', OCT),
      'a package of kind single sells the catalogue single price');
});

test('single: repeat purchases allowed; a monthly plan is refused',
    async () => {
      const repeat = call({athleteId: 'sol', product: 'tier'}, ctx('u-nina'),
          {db: fakeDb(Object.assign({}, DOCS, {'athletes/sol': {name: 'Sol',
            householdId: 'novak', packageId: 'single', billing: {
              status: 'active', oneTime: true, subscriptionId: null}}}))});
      await repeat.p;
      assert.equal(repeat.calls[0].mode, 'payment');
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
  const lap = call({athleteId: 'tia', product: 'tier'}, ctx('u-lap'));
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
      {stripe: failing}).p, 'unavailable', 'stripe-error');
});

test('a oneTime athlete moved to t-6 gets the subscription body', async () => {
  const {calls, p} = call({athleteId: 'mover', product: 'tier'},
      ctx('u-nina'));
  await p;
  assert.deepEqual(calls[0], {
    mode: 'subscription',
    client_reference_id: 'novak__mover__tier',
    line_items: [
      {price: 'price_t6', quantity: 1},
      {quantity: 1, price_data: {currency: 'usd', unit_amount: 29900,
        product_data: {name: '6 tokens - November 2026, prepaid'}}},
    ],
    subscription_data: {trial_end: 1796104800, metadata: {
      householdId: 'novak', athleteId: 'mover', product: 'tier',
      packageId: 't-6', prepaidPeriodKey: '2026-11-01', prepaidTokens: '6'}},
    success_url: 'https://portal.test/portal/family?paid=mover' +
        '&cs={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://portal.test/portal/family',
    customer_email: 'nina@example.test',
  });
});

run();
