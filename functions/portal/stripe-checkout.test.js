'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const c = require('./stripe-checkout');

const SINGLE = 'price_single_test';
const RETIRED = 'price_single_old';
const PAY = {mode: 'payment', singlePriceId: SINGLE, retired: [RETIRED]};
const line = (id, extra) => Object.assign({quantity: 1, price: {id}}, extra);
const monthly = (id) => ({quantity: 1,
  price: {id, recurring: {interval: 'month'}}});
const REFUSED = {ok: false, priceId: null, reason: 'unexpected-one-time'};

/** @return {{tx: !Object, writes: !Array}} A recording transaction. */
function recorder() {
  const writes = [];
  return {writes, tx: {
    set: (ref, data) => writes.push({op: 'set', path: ref.path, data}),
    update: (ref, data) => writes.push({op: 'update', path: ref.path, data}),
  }};
}

test('payment mode: the single price and a retired id are accepted', () => {
  assert.deepEqual(c.shapeOf([line(SINGLE)], PAY),
      {ok: true, priceId: SINGLE, oneTime: true, reason: null});
  assert.deepEqual(c.shapeOf([line(RETIRED)], PAY),
      {ok: true, priceId: RETIRED, oneTime: true, reason: null});
  assert.deepEqual(c.shapeOf([line(RETIRED)],
      {mode: 'payment', singlePriceId: null, retired: [RETIRED]}),
  {ok: true, priceId: RETIRED, oneTime: true, reason: null},
  'a retired id still matches after the live id is cleared');
});

test('payment mode: every other shape is unexpected-one-time', () => {
  const cases = {
    'another one-time id': [line('price_1x')],
    'quantity 2': [line(SINGLE, {quantity: 2})],
    'two lines': [line(SINGLE), line(SINGLE)],
    'the single plus another line': [line(SINGLE), line('price_1x')],
    'a recurring line': [monthly(SINGLE)],
    'no lines': [],
    'a line without a price': [{quantity: 1}],
    'a price without an id': [{quantity: 1, price: {}}],
    'not an array': null,
  };
  for (const [label, items] of Object.entries(cases)) {
    assert.deepEqual(c.shapeOf(items, PAY), REFUSED, label);
  }
  assert.deepEqual(c.shapeOf([line(SINGLE)],
      {mode: 'payment', singlePriceId: null}), REFUSED,
  'singlePriceId null (catalogue not filled) accepts nothing');
  assert.deepEqual(c.shapeOf([{quantity: 1, price: {id: null}}],
      {mode: 'payment', singlePriceId: null, retired: [null]}), REFUSED,
  'a null price id never matches a null catalogue entry');
});

test('without opts the D13 subscription shape is unchanged', () => {
  const ok = (id) => ({ok: true, priceId: id, reason: null});
  const bad = {ok: false, priceId: null, reason: 'unexpected-quantity'};
  assert.deepEqual(c.shapeOf([monthly('price_t6')]), ok('price_t6'));
  assert.deepEqual(c.shapeOf([monthly('price_t6'), line('price_1x')]),
      ok('price_t6'), 'recurring + one prepaid line');
  assert.deepEqual(c.shapeOf([monthly('price_t6')], {mode: 'subscription'}),
      ok('price_t6'), 'a non-payment mode is the default path');
  assert.deepEqual(c.shapeOf([Object.assign(monthly('price_t6'),
      {quantity: 2})]), bad, 'quantity 2');
  assert.deepEqual(c.shapeOf([monthly('a'), monthly('b')]), bad, 'two subs');
  assert.deepEqual(c.shapeOf([monthly('a'), line('x'), line('y')]), bad,
      'two one-time lines');
  assert.deepEqual(c.shapeOf([line(SINGLE)]), bad, 'one-time only');
  assert.deepEqual(c.shapeOf([monthly('a'), {quantity: 1}]), bad,
      'a line without a price');
  assert.deepEqual(c.shapeOf([]), bad, 'no lines');
});

test('readLineItems forwards opts to the stub and to Stripe', async () => {
  const saved = [process.env.FUNCTIONS_EMULATOR,
    process.env.STRIPE_LINE_ITEMS_STUB];
  try {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.STRIPE_LINE_ITEMS_STUB =
        JSON.stringify({cs_stub: [line(SINGLE)]});
    const calls = [];
    const stripe = {checkout: {sessions: {listLineItems: async (id, o) => {
      calls.push([id, o]);
      return {data: [line(RETIRED)]};
    }}}};
    assert.deepEqual(await c.readLineItems(stripe, 'cs_stub', PAY),
        {ok: true, priceId: SINGLE, oneTime: true, reason: null});
    assert.equal(calls.length, 0, 'the stub answered');
    assert.deepEqual(await c.readLineItems(stripe, 'cs_live', PAY),
        {ok: true, priceId: RETIRED, oneTime: true, reason: null});
    assert.deepEqual(calls, [['cs_live', {limit: 10}]]);
    assert.equal((await c.readLineItems(stripe, 'cs_live')).reason,
        'unexpected-quantity', 'no opts: the D13 shape');
  } finally {
    if (saved[0] === undefined) delete process.env.FUNCTIONS_EMULATOR;
    else process.env.FUNCTIONS_EMULATOR = saved[0];
    if (saved[1] === undefined) delete process.env.STRIPE_LINE_ITEMS_STUB;
    else process.env.STRIPE_LINE_ITEMS_STUB = saved[1];
  }
});

test('applyCheckoutCompleted: tier sets billing.oneTime false; facility not',
    () => {
      const hh = {id: 'h1', ref: {path: 'households/h1'}, data: {}};
      const args = (product) => ({
        event: {id: 'evt_1'}, priceId: 'price_t6', hh,
        session: {id: 'cs_1', customer: 'cus_1', subscription: 'sub_1',
          payment_status: 'paid'},
        ref: {householdId: 'h1', athleteId: 'a1', product},
        athlete: {packageId: 't-6', billing: {status: 'pending',
          oneTime: true}},
        athleteRef: {id: 'a1', path: 'athletes/a1'}, packageId: 't-6'});
      const tier = recorder();
      c.applyCheckoutCompleted(tier.tx, args('tier'));
      const a = tier.writes.find((w) => w.path === 'athletes/a1').data;
      assert.equal(a['billing.oneTime'], false);
      assert.equal(a['billing.subscriptionId'], 'sub_1');
      const fac = recorder();
      c.applyCheckoutCompleted(fac.tx, args('facility'));
      const f = fac.writes.find((w) => w.path === 'athletes/a1').data;
      assert.equal('facilityBilling.oneTime' in f, false);
      assert.equal('billing.oneTime' in f, false);
      assert.equal(f['facilityBilling.subscriptionId'], 'sub_1');
    });

test('linkCustomer: stripeCustomerId only when absent; null writes nothing',
    () => {
      const fresh = recorder();
      c.linkCustomer(fresh.tx, {ref: {path: 'households/h1'}, data: {}},
          'cus_new');
      assert.equal(fresh.writes.length, 1);
      assert.equal(fresh.writes[0].path, 'households/h1');
      assert.equal(fresh.writes[0].data.stripeCustomerId, 'cus_new');
      assert.ok(fresh.writes[0].data.stripeCustomerIds, 'arrayUnion');
      const linked = recorder();
      c.linkCustomer(linked.tx, {ref: {path: 'households/h1'},
        data: {stripeCustomerId: 'cus_old'}}, 'cus_new');
      assert.equal('stripeCustomerId' in linked.writes[0].data, false);
      assert.ok(linked.writes[0].data.stripeCustomerIds);
      const none = recorder();
      c.linkCustomer(none.tx, {ref: {path: 'households/h1'}, data: {}}, null);
      assert.equal(none.writes.length, 0);
      const both = recorder();
      c.linkCustomer(both.tx, {ref: {path: 'households/h1'}, data: {}},
          'cus_new', {'membership.status': 'active'});
      assert.equal(both.writes.length, 1, 'one household write');
      assert.deepEqual([both.writes[0].data['membership.status'],
        both.writes[0].data.stripeCustomerId], ['active', 'cus_new']);
      const extraOnly = recorder();
      c.linkCustomer(extraOnly.tx, {ref: {path: 'households/h1'}, data: {}},
          null, {'membership.status': 'active'});
      assert.deepEqual(extraOnly.writes.map((w) => Object.keys(w.data)),
          [['membership.status']]);
    });

run();
