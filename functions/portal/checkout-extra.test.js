'use strict';
// The extra session at the member rate (owner, 2026-10-10): what
// createCheckoutSession does with product 'extra'. checkout.test.js keeps
// the tier and single cases; extra.test.js the pure rules.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const lib = require('./lib');
const checkout = require('./checkout');

process.env.PORTAL_URL = 'https://portal.test';
process.env.STRIPE_MODE = 'test';
delete process.env.STRIPE_SIBLING_COUPON; // one case sets it itself
const CAT = {test: {'t-4': 'price_t4', 't-6': 'price_t6', 't-8': 'price_t8',
  't-12': 'price_t12', 't-16': 'price_t16', 'elite': 'price_elite',
  'single': 'price_single', 'facility-access': 'price_fac'}, live: {}};
// Single tokens - and with them extra sessions - are on sale from the
// instant booking opens (single.saleOpen).
const OPEN = lib.BOOKING_OPENS_AT;
const LIFE_MS = 24 * 60 * 60 * 1000 - 5 * 60 * 1000;
const PAID = {status: 'active', subscriptionId: 'sub_ari'};

/**
 * @param {!Object} docs `{'athletes/a1': {...}}`, mutated by merge sets.
 * @return {!Object} Firestore stand-in: doc get / merge set, `where ==`.
 */
function fakeDb(docs) {
  return {collection: (c) => ({
    doc: (id) => ({
      async get() {
        const data = docs[`${c}/${id}`];
        return {exists: !!data, data: () => data};
      },
      // One level of merge is all pendingCheckout needs.
      async set(data) {
        const cur = docs[`${c}/${id}`] || {};
        docs[`${c}/${id}`] = Object.assign({}, cur, data, {pendingCheckout:
          Object.assign({}, cur.pendingCheckout, data.pendingCheckout)});
      },
    }),
    where: (field, op, value) => ({async get() {
      return {docs: Object.entries(docs)
          .filter(([path, d]) => path.startsWith(`${c}/`) &&
              d[field] === value)
          .map(([path, d]) => ({id: path.slice(c.length + 1),
            data: () => d}))};
    }}),
  })};
}

/**
 * What each coupon takes off, as made in Stripe (amount_off, cents).
 * Tests replace an entry to stand for a coupon made wrong by hand.
 */
const COUPON_OFF = {MEMBER_RATE_4: 1025, MEMBER_RATE_6: 1517,
  MEMBER_RATE_8: 1637, MEMBER_RATE_12: 1758, MEMBER_RATE_16: 2006};

/**
 * A Stripe stand-in that records every call. Sessions keep the metadata
 * they were created with and carry Stripe's `amount_total` after the
 * coupon, as Stripe does.
 * @param {!Array} touched Receives `[method, arg]` for every call.
 * @param {!Object=} over Fields merged into the retrieved price.
 * @param {!Object=} off Replaces COUPON_OFF.
 * @return {!Object} The client, plus `calls` (create bodies), `sessions`.
 */
function fakeStripe(touched, over, off) {
  const calls = [];
  const sessions = {};
  const offs = off || COUPON_OFF;
  const totalOf = (body) => (body.discounts || []).reduce((left, d) =>
    left - (offs[d.coupon] || 0), 6500);
  return {
    calls,
    sessions,
    prices: {retrieve: async (id) => {
      touched.push(['price', id]);
      return id === 'price_single' ?
        Object.assign({id, type: 'one_time', unit_amount: 6500,
          currency: 'usd'}, over) :
        Object.assign({id, unit_amount: 38900, currency: 'usd'}, over);
    }},
    checkout: {sessions: {
      create: async (body) => {
        touched.push(['create', body]);
        calls.push(body);
        const id = `cs_test_${calls.length}`;
        sessions[id] = {id, status: 'open', metadata: body.metadata || {},
          amount_total: totalOf(body),
          url: `https://checkout.stripe.com/c/${id}`};
        return sessions[id];
      },
      retrieve: async (id) => {
        touched.push(['retrieve', id]);
        if (!sessions[id]) throw new Error(`No such checkout.session: ${id}`);
        return sessions[id];
      },
      expire: async (id) => {
        touched.push(['expire', id]);
        sessions[id].status = 'expired';
        return sessions[id];
      },
    }},
  };
}

const DOCS = {
  'households/kim': {guardian: {email: 'kim@example.test'},
    stripeCustomerId: 'cus_kim'},
  'households/lee': {guardian: {email: 'lee@example.test'},
    stripeCustomerId: null},
  'households/pd': {guardian: {email: 'p@example.test'},
    membership: {status: 'past_due'}},
  'households/lap': {guardian: {email: 'l@example.test'},
    membership: {status: 'lapsed'}},
  'users/u-kim': {role: 'parent', householdId: 'kim'},
  'users/u-lee': {role: 'parent', householdId: 'lee'},
  'users/u-pd': {role: 'parent', householdId: 'pd'},
  'users/u-lap': {role: 'parent', householdId: 'lap'},
  'users/u-ari': {role: 'athlete', athleteId: 'ari', householdId: 'kim'},
  'athletes/ari': {name: 'Ari Kim', householdId: 'kim', packageId: 't-8',
    billing: PAID},
  'athletes/bo': {name: 'Bo Lee', householdId: 'lee', packageId: 't-6',
    billing: {status: 'active', subscriptionId: 'sub_bo'}},
  'athletes/pia': {name: 'Pia', householdId: 'pd', packageId: 't-8',
    billing: {status: 'active', subscriptionId: 'sub_pia'}},
  'athletes/tia': {name: 'Tia', householdId: 'lap', packageId: 't-8',
    billing: {status: 'active', subscriptionId: 'sub_tia'}},
  'packages/t-4': {kind: 'tokens', tokens: 4, name: '4 tokens'},
  'packages/t-6': {kind: 'tokens', tokens: 6, name: '6 tokens'},
  'packages/t-8': {kind: 'tokens', tokens: 8, name: '8 tokens'},
  'packages/t-12': {kind: 'tokens', tokens: 12, name: '12 tokens'},
  'packages/t-16': {kind: 'tokens', tokens: 16, name: '16 tokens'},
  'packages/t-20': {kind: 'tokens', tokens: 20, name: '20 tokens'},
  'packages/elite': {kind: 'elite', tokens: null, name: 'Elite'},
  'packages/single': {kind: 'single', tokens: 1, name: 'Single token'},
};
const ctx = (uid) => ({auth: {uid, token: {email: 'kim@example.test',
  email_verified: true, firebase: {sign_in_provider: 'password'}}}});

/**
 * One handler call.
 * @param {!Object} data The request.
 * @param {!Object} c The context.
 * @param {!Object=} o `docs` replaces entries of DOCS (or `db` the whole
 *     store), `price` is merged into the retrieved price, `now`, `stripe`
 *     and `catalogue` override the defaults.
 * @return {{p: !Promise, touched: !Array, st: !Object, docs: !Object}} The
 *     call, every Stripe call it made, the Stripe stand-in, the store.
 */
function call(data, c, o) {
  const opts = o || {};
  const touched = [];
  const docs = opts.db || Object.assign({}, DOCS, opts.docs);
  const st = opts.stripe || fakeStripe(touched, opts.price);
  const p = checkout.createCheckoutSessionHandler(data, c, {
    db: fakeDb(docs), stripe: st, catalogue: opts.catalogue || CAT,
    now: opts.now === undefined ? OPEN : opts.now});
  return {p, touched, st, docs};
}
const buy = (athleteId, uid, o) => call({athleteId, product: 'extra'},
    ctx(uid || 'u-kim'), o);

/**
 * The refusal, with its code and reason, before any Stripe call.
 * @param {string} label The case.
 * @param {{p: !Promise, touched: !Array}} r `call`'s result.
 * @param {string} reason Expected `details.reason`.
 * @param {string=} code Expected HttpsError code.
 * @param {string=} message Expected copy, when given.
 */
async function refusedFirst(label, r, reason, code, message) {
  await assert.rejects(r.p, (e) => e.code === (code || 'failed-precondition') &&
      e.details && e.details.reason === reason &&
      (message === undefined || e.message === message), label);
  assert.deepEqual(r.touched, [], `${label}: Stripe was never called`);
}
const meta = (ath, rate) => ({householdId: 'kim', athleteId: ath,
  product: 'tier', packageId: 'single', memberRate: rate});

test('the exact body: the single token\'s session, the 8-token coupon',
    async () => {
      const r = buy('ari');
      assert.deepEqual(await r.p,
          {url: 'https://checkout.stripe.com/c/cs_test_1'});
      assert.deepEqual(r.st.calls, [{
        mode: 'payment',
        client_reference_id: 'kim__ari__tier',
        line_items: [{price: 'price_single', quantity: 1}],
        payment_method_types: ['card'],
        metadata: meta('ari', 't-8'),
        payment_intent_data: {metadata: meta('ari', 't-8'),
          description: 'Extra session token - Ari Kim (8-token rate)'},
        custom_text: {submit: {message: 'Extra session for Ari Kim at ' +
          'your 8-token rate ($48.63), good through Sat, Feb 27, 2027.'}},
        expires_at: Math.floor((OPEN + LIFE_MS) / 1000),
        success_url: 'https://portal.test/portal/family?paid=ari' +
            '&cs={CHECKOUT_SESSION_ID}&single=1&extra=1',
        cancel_url: 'https://portal.test/portal/family',
        customer: 'cus_kim',
        discounts: [{coupon: 'MEMBER_RATE_8'}],
      }]);
      assert.deepEqual(r.touched.map(([m]) => m), ['price', 'create']);
      // Remembered in its own slot, its coupon as the discount.
      assert.deepEqual(r.docs['athletes/ari'].pendingCheckout, {extra: {
        sessionId: 'cs_test_1', priceId: 'price_single',
        discount: 'MEMBER_RATE_8', createdAt: new Date(OPEN).toISOString()}});
      // The webhook's single path reads the same reference, price, mode and
      // expiry as a $65 token's: only the money and the words differ.
      const a = {householdId: 'kim', athleteId: 'ari', athleteName: 'Ari',
        priceId: 'price_single', role: 'parent', portalUrl: 'https://p',
        customerId: 'cus_kim', email: null, nowMs: OPEN};
      const plain = checkout.singleSessionBody(a);
      const ext = checkout.extraSessionBody(Object.assign({rate:
        require('./extra').memberRateFor('t-8')}, a));
      for (const k of ['mode', 'client_reference_id', 'line_items',
        'payment_method_types', 'expires_at', 'cancel_url', 'customer']) {
        assert.deepEqual(ext[k], plain[k], k);
      }
      assert.equal(plain.discounts, undefined, 'the $65 token: no coupon');
      assert.equal(ext.success_url, `${plain.success_url}&extra=1`);
    });

test('the coupon and the rate follow the package, all five', async () => {
  const cases = [['t-4', 'MEMBER_RATE_4', '4-token rate ($54.75)'],
    ['t-6', 'MEMBER_RATE_6', '6-token rate ($49.83)'],
    ['t-8', 'MEMBER_RATE_8', '8-token rate ($48.63)'],
    ['t-12', 'MEMBER_RATE_12', '12-token rate ($47.42)'],
    ['t-16', 'MEMBER_RATE_16', '16-token rate ($44.94)']];
  for (const [packageId, coupon, words] of cases) {
    const r = buy('ari', 'u-kim', {docs: {'athletes/ari': {name: 'Ari Kim',
      householdId: 'kim', packageId, billing: PAID}}});
    await r.p;
    const b = r.st.calls[0];
    assert.deepEqual(b.discounts, [{coupon}], packageId);
    assert.equal(b.line_items[0].price, 'price_single',
        `${packageId}: always the single price, never the package's`);
    assert.equal(b.metadata.memberRate, packageId);
    assert.equal(b.payment_intent_data.metadata.memberRate, packageId);
    assert.ok(b.custom_text.submit.message.includes(`your ${words}`),
        b.custom_text.submit.message);
    assert.equal(b.allow_promotion_codes, undefined, packageId);
  }
});

test('refusals, each before any Stripe call', async () => {
  const athlete = (over) => ({'athletes/ari': Object.assign({name: 'Ari',
    householdId: 'kim', packageId: 't-8', billing: PAID}, over)});
  const NOTHING = 'Nothing has been charged.';
  await refusedFirst('signed out', call({athleteId: 'ari', product: 'extra'},
      {auth: null}), 'signed-out', 'unauthenticated');
  await refusedFirst('a product nobody sells', call({athleteId: 'ari',
    product: 'extras'}, ctx('u-kim')), 'invalid-product', 'invalid-argument');
  await refusedFirst('another family', buy('ari', 'u-lee'), 'not-owner',
      'permission-denied');
  await refusedFirst('a sibling\'s own login', buy('bo', 'u-ari'),
      'not-owner', 'permission-denied');
  await refusedFirst('Elite is unlimited', buy('ari', 'u-kim',
      {docs: athlete({packageId: 'elite'})}), 'extra-not-tokens', undefined,
  'Extra sessions at the member rate come with a monthly token package. ' +
      NOTHING);
  await refusedFirst('the single token', buy('ari', 'u-kim',
      {docs: athlete({packageId: 'single',
        billing: {status: 'active', oneTime: true}})}), 'extra-not-tokens');
  await refusedFirst('a token package with no member rate', buy('ari',
      'u-kim', {docs: athlete({packageId: 't-20'})}), 'extra-not-tokens');
  await refusedFirst('no package', buy('ari', 'u-kim',
      {docs: athlete({packageId: null})}), 'extra-not-tokens');
  await refusedFirst('a failing card', buy('ari', 'u-kim',
      {docs: athlete({billing: {status: 'past_due',
        subscriptionId: 'sub_ari'}})}), 'billing-past-due', undefined,
  'The card on this membership needs updating before you can buy an ' +
      'extra session. ' + NOTHING);
  for (const [label, billing] of [['never paid', {status: 'pending'}],
    ['ended', {status: 'lapsed', subscriptionId: 'sub_ari'}],
    ['active with no subscription', {status: 'active'}],
    ['a single buyer moved to t-8, still to pay',
      {status: 'active', oneTime: true, subscriptionId: null}],
    ['oneTime beside a subscription',
      {status: 'active', oneTime: true, subscriptionId: 'sub_ari'}],
    ['a legacy member (no billing map)', undefined]]) {
    await refusedFirst(label, buy('ari', 'u-kim', {docs: athlete({billing})}),
        'extra-no-subscription');
  }
  await refusedFirst('before the sale opens', buy('ari', 'u-kim',
      {now: OPEN - 1}), 'single-not-open', undefined,
  'Extra sessions are available from Sat, Oct 10 at 7 AM. ' + NOTHING);
  await refusedFirst('under 30 minutes before the season cutoff',
      buy('ari', 'u-kim', {now: Date.parse('2027-02-28T05:31:00Z')}),
      'season-over');
  await refusedFirst('no single price in the catalogue', buy('ari', 'u-kim',
      {catalogue: {test: {'t-8': 'price_t8'}, live: {}}}), 'price-missing');
  await refusedFirst('a frozen family', buy('pia', 'u-pd'),
      'household-past-due', undefined, 'A card on this family account ' +
      'needs updating before you can buy an extra session. ' + NOTHING);
  await refusedFirst('a lapsed family', buy('tia', 'u-lap'),
      'household-lapsed');
  // The monthly membership itself is still paid: Pay now stays refused.
  await refusedFirst('tier for a paid member', call({athleteId: 'ari',
    product: 'tier'}, ctx('u-kim')), 'already-active');
});

test('a wrong single price: price-mismatch, no session', async () => {
  for (const price of [{unit_amount: 4863}, {type: 'recurring'},
    {currency: 'eur'}, {custom_unit_amount: {enabled: true}}]) {
    const r = buy('ari', 'u-kim', {price});
    await assert.rejects(r.p, (e) => e.details.reason === 'price-mismatch');
    assert.deepEqual(r.touched.map(([m]) => m), ['price'],
        JSON.stringify(price));
  }
});

test('Stripe refuses the coupon: member-rate-missing, never a $65 page',
    async () => {
      for (const [code, message] of [['resource_missing',
        'No such coupon: MEMBER_RATE_8'], ['coupon_expired',
        'This coupon has expired.']]) {
        const touched = [];
        const st = fakeStripe(touched);
        const create = st.checkout.sessions.create;
        st.checkout.sessions.create = async (body) => {
          if (body.discounts) {
            touched.push(['create-refused', body]);
            const err = new Error(message);
            err.code = code;
            err.param = 'discounts[0][coupon]';
            throw err;
          }
          return create(body);
        };
        const r = buy('ari', 'u-kim', {stripe: st});
        await assert.rejects(r.p, (e) => e.code === 'failed-precondition' &&
            e.details.reason === 'member-rate-missing' &&
            e.message === 'The member rate is not set up right now. Try ' +
            'again later, or contact the academy. Nothing has been charged.',
        code);
        assert.deepEqual(touched.map(([m]) => m), ['price', 'create-refused'],
            `${code}: one attempt, with the coupon, and no retry without it`);
        assert.equal(st.calls.length, 0, 'no session was created');
        assert.equal(r.docs['athletes/ari'].pendingCheckout, undefined);
      }
      // Any other Stripe failure is the plain 'try again' refusal.
      const st = fakeStripe([]);
      st.checkout.sessions.create = async () => {
        const err = new Error('rate limited');
        err.code = 'rate_limit';
        throw err;
      };
      await assert.rejects(buy('ari', 'u-kim', {stripe: st}).p, (e) =>
        e.code === 'unavailable' && e.details.reason === 'stripe-error');
    });

test('a coupon Stripe accepts at the wrong amount: expired at once, refused',
    async () => {
      // Made by hand: a mistyped amount, $10 off, and one percent-off-like
      // coupon that took nothing off the price - each left on the page.
      for (const off of [1673, 1000, 0]) {
        const touched = [];
        const st = fakeStripe(touched, undefined,
            Object.assign({}, COUPON_OFF, {MEMBER_RATE_8: off}));
        const r = buy('ari', 'u-kim', {stripe: st});
        await assert.rejects(r.p, (e) => e.code === 'failed-precondition' &&
            e.details.reason === 'member-rate-missing' &&
            e.message === 'The member rate is not set up right now. Try ' +
            'again later, or contact the academy. Nothing has been charged.',
        String(off));
        assert.deepEqual(touched.map(([m, a]) => [m, m === 'expire' ? a : '']),
            [['price', ''], ['create', ''], ['expire', 'cs_test_1']],
            `${off}: one page, expired before anyone is sent to it`);
        assert.equal(st.sessions.cs_test_1.status, 'expired');
        assert.equal(r.docs['athletes/ari'].pendingCheckout, undefined,
            'never remembered for a second tap');
      }
      // The expire failing still refuses: the page lapses on its own.
      const st = fakeStripe([], undefined,
          Object.assign({}, COUPON_OFF, {MEMBER_RATE_8: 0}));
      st.checkout.sessions.expire = async () => {
        throw new Error('stripe down');
      };
      await assert.rejects(buy('ari', 'u-kim', {stripe: st}).p, (e) =>
        e.details.reason === 'member-rate-missing');
    });

test('two taps share one page; a $65 page is never reused for an extra',
    async () => {
      const docs = Object.assign({}, DOCS);
      const touched = [];
      const st = fakeStripe(touched);
      const again = () => buy('ari', 'u-kim', {db: docs, stripe: st}).p;
      const first = await again();
      assert.equal((await again()).url, first.url);
      assert.equal(st.calls.length, 1, 'the second tap reuses the open page');
      // Paid: the next tap is a new session - one more token.
      st.sessions.cs_test_1.status = 'complete';
      assert.equal((await again()).url,
          'https://checkout.stripe.com/c/cs_test_2');

      // A $65 session left open from when the athlete was on Single stays
      // in the tier slot: the extra never sees it.
      const single = await st.checkout.sessions.create({mode: 'payment',
        metadata: {householdId: 'kim', athleteId: 'ari', product: 'tier',
          packageId: 'single'}});
      docs['athletes/ari'].pendingCheckout.tier = {sessionId: single.id,
        priceId: 'price_single', discount: 'none'};
      const after = await again();
      assert.equal(after.url, 'https://checkout.stripe.com/c/cs_test_2',
          'the open extra page, not the $65 one');
      assert.equal(st.sessions[single.id].status, 'open',
          'the tier slot is not the extra\'s business');

      // Even a slot that names a $65 session with the extra's price and
      // coupon (a hand-edited doc): Stripe's record has no member rate, so
      // it is expired and a member-rate page made.
      docs['athletes/ari'].pendingCheckout.extra = {sessionId: single.id,
        priceId: 'price_single', discount: 'MEMBER_RATE_8'};
      const fresh = await again();
      assert.equal(st.sessions[single.id].status, 'expired');
      assert.equal(fresh.url, 'https://checkout.stripe.com/c/cs_test_4');
      assert.deepEqual(st.calls[3].discounts, [{coupon: 'MEMBER_RATE_8'}]);

      // An open member-rate page whose total is not that rate (made before
      // the check, or edited in Stripe) is expired, never handed out.
      st.sessions.cs_test_4.amount_total = 6500;
      const fixed = await again();
      assert.equal(st.sessions.cs_test_4.status, 'expired');
      assert.equal(fixed.url, 'https://checkout.stripe.com/c/cs_test_5');
      assert.equal(st.sessions.cs_test_5.amount_total, 4863);

      // The family moved to 12 tokens: the 8-token page is expired, not
      // reused.
      docs['athletes/ari'] = Object.assign({}, docs['athletes/ari'],
          {packageId: 't-12'});
      const moved = await again();
      assert.equal(st.sessions.cs_test_5.status, 'expired');
      assert.equal(moved.url, 'https://checkout.stripe.com/c/cs_test_6');
      assert.deepEqual(st.calls[5].discounts, [{coupon: 'MEMBER_RATE_12'}]);
      assert.equal(st.sessions.cs_test_6.amount_total, 4742);
      assert.equal(docs['athletes/ari'].pendingCheckout.extra.discount,
          'MEMBER_RATE_12');
    });

test('nor is a member-rate page ever reused for a $65 token', async () => {
  const docs = Object.assign({}, DOCS, {'athletes/sol': {name: 'Sol',
    householdId: 'kim', packageId: 'single',
    billing: {status: 'active', oneTime: true, subscriptionId: null}}});
  const touched = [];
  const st = fakeStripe(touched);
  const memberPage = await st.checkout.sessions.create({mode: 'payment',
    metadata: meta('sol', 't-8'), discounts: [{coupon: 'MEMBER_RATE_8'}]});
  docs['athletes/sol'].pendingCheckout = {tier: {sessionId: memberPage.id,
    priceId: 'price_single', discount: 'none'}};
  const r = await call({athleteId: 'sol', product: 'tier'}, ctx('u-kim'),
      {db: docs, stripe: st}).p;
  assert.equal(st.sessions[memberPage.id].status, 'expired');
  assert.equal(r.url, 'https://checkout.stripe.com/c/cs_test_2');
  assert.equal(st.calls[1].discounts, undefined, 'the $65 token, in full');
  assert.equal(st.calls[1].metadata.memberRate, undefined);
});

test('the athlete\'s own login, an unlinked family, a sibling coupon',
    async () => {
      // Who may pay is the server's rule, unchanged: the athlete's own login
      // may (the screens ask an under-18 athlete to fetch a parent).
      const own = buy('ari', 'u-ari');
      await own.p;
      assert.equal(own.st.calls[0].success_url, 'https://portal.test/portal/' +
          'home?paid=ari&cs={CHECKOUT_SESSION_ID}&single=1&extra=1');
      assert.equal(own.st.calls[0].cancel_url,
          'https://portal.test/portal/home');
      const unlinked = buy('bo', 'u-lee');
      await unlinked.p;
      const b = unlinked.st.calls[0];
      assert.equal(b.customer, undefined);
      assert.deepEqual([b.customer_email, b.customer_creation],
          ['kim@example.test', 'always']);
      assert.deepEqual(b.discounts, [{coupon: 'MEMBER_RATE_6'}]);
      // A family with a sibling discount configured and an unpaid sibling:
      // the extra carries its member rate alone, never the sibling coupon or
      // the code field.
      process.env.STRIPE_SIBLING_COUPON = 'SIBLING20';
      try {
        const sib = buy('ari', 'u-kim', {docs: {'athletes/kid2':
          {householdId: 'kim', packageId: 't-6',
            billing: {status: 'pending'}}}});
        await sib.p;
        assert.deepEqual(sib.st.calls[0].discounts,
            [{coupon: 'MEMBER_RATE_8'}]);
        assert.equal(sib.st.calls[0].allow_promotion_codes, undefined);
      } finally {
        delete process.env.STRIPE_SIBLING_COUPON;
      }
    });

run();
