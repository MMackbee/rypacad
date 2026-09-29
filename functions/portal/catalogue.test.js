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
