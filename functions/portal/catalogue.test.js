'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const cat = require('./catalogue');

const FIX = {
  test: {'t-6': 'price_t6_test', 'elite': 'price_elite_test',
    'facility-access': 'price_fac_test', 'single': null},
  live: {'t-6': 'price_t6_live'},
};

test('stripeMode: live only when STRIPE_MODE=live', () => {
  delete process.env.STRIPE_MODE;
  assert.equal(cat.stripeMode(), 'test');
  process.env.STRIPE_MODE = 'live';
  assert.equal(cat.stripeMode(), 'live');
  process.env.STRIPE_MODE = 'test';
});

test('priceIdFor / packageIdForPrice over the current mode', () => {
  assert.equal(cat.priceIdFor('t-6', FIX), 'price_t6_test');
  assert.equal(cat.priceIdFor('single', FIX), null);
  assert.equal(cat.priceIdFor(cat.FACILITY_KEY, FIX), 'price_fac_test');
  assert.equal(cat.packageIdForPrice('price_elite_test', FIX), 'elite');
  assert.equal(cat.packageIdForPrice('price_fac_test', FIX), null);
  assert.equal(cat.packageIdForPrice('price_t6_live', FIX), null);
  process.env.STRIPE_MODE = 'live';
  assert.equal(cat.priceIdFor('t-6', FIX), 'price_t6_live');
  process.env.STRIPE_MODE = 'test';
});

test('retiredPriceIdsFor: the top-level retired block, per mode', () => {
  const ROT = Object.assign({}, FIX, {retired: {
    test: {single: ['price_single_old_test', null, '']},
    live: {single: ['price_single_old_live'], elite: 'not-an-array'},
  }});
  assert.deepEqual(cat.retiredPriceIdsFor('single', ROT),
      ['price_single_old_test']);
  assert.deepEqual(cat.retiredPriceIdsFor('t-6', ROT), []);
  assert.deepEqual(cat.retiredPriceIdsFor('single', FIX), [],
      'no retired block at all');
  assert.deepEqual(cat.retiredPriceIdsFor('single',
      {test: {}, live: {}, retired: {live: {single: ['x']}}}), [],
  'no block for the current mode');
  process.env.STRIPE_MODE = 'live';
  assert.deepEqual(cat.retiredPriceIdsFor('single', ROT),
      ['price_single_old_live']);
  assert.deepEqual(cat.retiredPriceIdsFor('elite', ROT), []);
  process.env.STRIPE_MODE = 'test';
  // The committed JSON has no retired block today.
  assert.deepEqual(cat.retiredPriceIdsFor('single'), []);
});

test('the committed JSON has exactly the twelve keys; test ids present', () => {
  const json = cat.loadCatalogue();
  const keys = ['t-6', 't-12', 't-16', 'elite', 'single', 'facility-access'];
  assert.deepEqual(Object.keys(json).sort(), ['live', 'test']);
  assert.deepEqual(Object.keys(json.test).sort(), keys.slice().sort());
  assert.deepEqual(Object.keys(json.live).sort(), keys.slice().sort());
  for (const k of keys) {
    // Committed in 1b3dc3d - a null here means someone overwrote the file.
    assert.match(json.test[k], /^price_[A-Za-z0-9]{8,}$/, `test.${k}`);
  }
});

run();
