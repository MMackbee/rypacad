'use strict';
// Family facility access (owner ruling 2026-09-30): createCheckoutSession's
// household checks for product 'facility'. checkout.test.js keeps the rest.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const checkout = require('./checkout');

process.env.PORTAL_URL = 'https://portal.test';
process.env.STRIPE_MODE = 'test';
delete process.env.STRIPE_SIBLING_COUPON;
const CAT = {test: {'t-6': 'price_t6', 'elite': 'price_elite',
  'facility-access': 'price_fac'}, live: {}};
const OCT = Date.parse('2026-10-05T18:00:00Z');

/**
 * @param {!Object} docs `{'athletes/a1': {...}}`.
 * @return {!Object} Firestore stand-in: doc get / merge set, `where ==`.
 */
function fakeDb(docs) {
  return {collection: (c) => ({
    doc: (id) => ({
      async get() {
        const data = docs[`${c}/${id}`];
        return {exists: !!data, data: () => data};
      },
      async set(data) {
        docs[`${c}/${id}`] = Object.assign({}, docs[`${c}/${id}`], data);
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
 * @param {!Array} touched Receives every Stripe call.
 * @return {!Object} A Stripe stand-in.
 */
function fakeStripe(touched) {
  return {
    prices: {retrieve: async (id) => {
      touched.push(id);
      return {id, unit_amount: 30000, currency: 'usd'};
    }},
    checkout: {sessions: {create: async (body) => {
      touched.push(body);
      return {id: 'cs_test_1', url: 'https://checkout.stripe.com/c/cs_test_1'};
    }}},
  };
}
const paid = (over) => Object.assign({householdId: 'ruiz',
  packageId: 't-6', billing: {status: 'active'}}, over);
const BASE = {
  'households/ruiz': {guardian: {email: 'r@example.test'},
    stripeCustomerId: null},
  'users/u-ruiz': {role: 'parent', householdId: 'ruiz'},
  'users/u-ana': {role: 'athlete', athleteId: 'ana', householdId: 'ruiz'},
  'packages/t-6': {kind: 'tokens', tokens: 6, name: '6 tokens'},
  'packages/elite': {kind: 'elite', tokens: null, name: 'Elite'},
  'athletes/ana': paid(),
  'athletes/ben': paid(),
};
const ctx = (uid) => ({auth: {uid, token: {email: 'r@example.test',
  email_verified: true, firebase: {sign_in_provider: 'password'}}}});
/**
 * @param {!Object} over Docs over BASE.
 * @param {string=} uid The caller.
 * @param {string=} athleteId Who the add-on would bill on.
 * @return {{touched: !Array, p: !Promise}} The call and its Stripe calls.
 */
function facilityCall(over, uid, athleteId) {
  const touched = [];
  const p = checkout.createCheckoutSessionHandler(
      {athleteId: athleteId || 'ana', product: 'facility'},
      ctx(uid || 'u-ruiz'), {db: fakeDb(Object.assign({}, BASE, over)),
        stripe: fakeStripe(touched), now: OCT, catalogue: CAT});
  return {touched, p};
}
/**
 * @param {{touched: !Array, p: !Promise}} call `facilityCall`'s result.
 * @param {string} reason Expected `details.reason`.
 * @param {string} message Expected plain message.
 */
async function refused(call, reason, message) {
  await assert.rejects(call.p, (e) => e.code === 'failed-precondition' &&
      e.details && e.details.reason === reason && e.message === message,
  reason);
  assert.deepEqual(call.touched, [], 'Stripe was never called');
}
const HAS = 'Your family already has facility access.';
const ELITE = 'Elite already includes facility access for your family.';
const ELITE_DUE = 'Elite includes facility access for your family. ' +
    'Pay for the Elite membership first.';

test('one add-on per family: the line is named for the family', async () => {
  const ok = facilityCall({});
  assert.deepEqual(await ok.p,
      {url: 'https://checkout.stripe.com/c/cs_test_1'});
  const body = ok.touched[1];
  assert.equal(body.client_reference_id, 'ruiz__ana__facility');
  assert.equal(body.line_items[0].price, 'price_fac');
  assert.equal(body.line_items[1].price_data.product_data.name,
      'Family facility access - November 2026, prepaid');
  assert.equal(body.subscription_data.metadata.athleteId, 'ana');
});

test('refused when another athlete in the household holds a live add-on',
    async () => {
      for (const status of ['active', 'past_due']) {
        await refused(facilityCall({'athletes/ben':
          paid({facilityBilling: {status}})}), 'family-has-facility', HAS);
      }
      // The athlete's own login gets the same answer.
      await refused(facilityCall({'athletes/ben':
        paid({facilityBilling: {status: 'active'}})}, 'u-ana'),
      'family-has-facility', HAS);
      // A sibling's add-on that ended, or was never paid, blocks nothing.
      for (const status of ['lapsed', 'pending']) {
        const again = facilityCall({'athletes/ben':
          paid({facilityBilling: {status}})});
        assert.equal((await again.p).url,
            'https://checkout.stripe.com/c/cs_test_1', status);
      }
      // Another family's add-on is not this family's.
      const other = facilityCall({'athletes/zed': {householdId: 'other',
        packageId: 't-6', billing: {status: 'active'},
        facilityBilling: {status: 'active'}}});
      assert.equal((await other.p).url,
          'https://checkout.stripe.com/c/cs_test_1');
    });

test('refused when any athlete in the household has a live Elite membership',
    async () => {
      for (const billing of [{status: 'active'}, {status: 'past_due'},
        undefined]) {
        await refused(facilityCall({'athletes/ben':
          {householdId: 'ruiz', packageId: 'elite', billing}}),
        'elite-includes-facility', ELITE);
      }
      // Elite still to pay: the add-on is not sold to a family about to
      // have it (review 2026-09-30) - paying Elite is the way in.
      await refused(facilityCall({'athletes/ben': {householdId: 'ruiz',
        packageId: 'elite', billing: {status: 'pending'}}}),
      'elite-includes-facility', ELITE_DUE);
      // Elite that ended blocks nothing.
      const ok = facilityCall({'athletes/ben': {householdId: 'ruiz',
        packageId: 'elite', billing: {status: 'lapsed'}}});
      assert.equal((await ok.p).url,
          'https://checkout.stripe.com/c/cs_test_1');
    });

test('the existing checks still answer first', async () => {
  // The membership is not paid yet.
  await assert.rejects(facilityCall({'athletes/ana':
    paid({billing: {status: 'pending'}}), 'athletes/ben':
    paid({facilityBilling: {status: 'active'}})}).p,
  (e) => e.details.reason === 'billing-not-active');
  // This athlete already holds the add-on.
  await assert.rejects(facilityCall({'athletes/ana':
    paid({facilityBilling: {status: 'active'}})}).p,
  (e) => e.details.reason === 'already-active');
  // This athlete is the Elite one.
  await assert.rejects(facilityCall({'athletes/ana':
    paid({packageId: 'elite'})}).p,
  (e) => e.details.reason === 'elite-includes-facility');
});

run();
