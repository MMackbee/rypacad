'use strict';
// openBillingPortal's customer (billing-portal-customer.js, review
// 2026-11-17 F2/F3): a household can hold several Stripe customers, and a
// subscription linked by scripts/link-subscription.mjs sits only on the
// athlete. Stripe is a stand-in - no test reaches Stripe - and Firestore is
// fake-firestore's map.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const portal = require('./billing-portal');
const {householdCustomers, pickCustomer} =
    require('./billing-portal-customer');

const NOW = new Date('2026-11-17T15:00:00Z');
const FIRST = 'cus_TESTFIRSTa1b2';
const SECOND = 'cus_TESTSECONDc3d4';
const LINKED = 'cus_TESTLINKEDe5f6';
const FACILITY = 'cus_TESTFACILg7h8';
const OTHER = 'cus_TESTOTHERi9j0';

/**
 * hh-a: a parent and two unpaid athletes, no customer yet. hh-b: another
 * family, paid. Each test pays what it needs with paid() and linked().
 * @return {!Object} `{'collection/id': body}`.
 */
function world() {
  return {
    'users/u-parent': {role: 'parent', householdId: 'hh-a'},
    'households/hh-a': {name: 'Family A', createdBy: 'u-parent',
      stripeCustomerId: null, stripeCustomerIds: []},
    'athletes/ath-a': {householdId: 'hh-a', name: 'Athlete A',
      billing: {status: 'pending', customerId: null, subscriptionId: null}},
    'athletes/ath-b': {householdId: 'hh-a', name: 'Athlete B',
      billing: {status: 'pending', customerId: null, subscriptionId: null}},
    'users/u-other': {role: 'parent', householdId: 'hh-b'},
    'households/hh-b': {name: 'Family B', createdBy: 'u-other',
      stripeCustomerId: OTHER, stripeCustomerIds: [OTHER]},
    'athletes/ath-x': {householdId: 'hh-b', name: 'Athlete X',
      billing: {status: 'active', customerId: OTHER}},
  };
}

/**
 * The athlete's membership paid on `customer` (stripe-checkout.js
 * applyCheckoutCompleted, or link-subscription.mjs).
 * @param {!Object} docs The world.
 * @param {string} athleteId The athlete.
 * @param {string} customer The Stripe customer.
 */
function paid(docs, athleteId, customer) {
  docs[`athletes/${athleteId}`].billing = {status: 'active',
    customerId: customer, subscriptionId: `sub_${athleteId}`};
}

/**
 * The webhook's linkCustomer: listed always, primary only when empty.
 * @param {!Object} docs The world.
 * @param {string} customer The Stripe customer.
 */
function linked(docs, customer) {
  const hh = docs['households/hh-a'];
  if (!hh.stripeCustomerIds.includes(customer)) {
    hh.stripeCustomerIds.push(customer);
  }
  if (!hh.stripeCustomerId) hh.stripeCustomerId = customer;
}

/**
 * One call through the handler, console quiet.
 * @param {*} data The payload.
 * @param {!Object} docs The world.
 * @param {string=} uid The caller.
 * @return {!Promise<!Object>} `{result, error, calls}`.
 */
async function open(data, docs, uid) {
  const calls = [];
  const stripe = {billingPortal: {sessions: {create: async (params) => {
    calls.push(params);
    return {url: 'https://billing.stripe.com/p/session/test_x'};
  }}}};
  const keep = {log: console.log, error: console.error};
  console.log = () => {};
  console.error = () => {};
  const context = {auth: {uid: uid || 'u-parent', token: {}},
    rawRequest: {headers: {}}};
  try {
    const result = await portal.openBillingPortalHandler(data, context,
        {db: fakeDb(docs), stripe, env: {}, now: NOW});
    return {result, error: null, calls};
  } catch (error) {
    return {result: null, error, calls};
  } finally {
    console.log = keep.log;
    console.error = keep.error;
  }
}

/**
 * @param {!Object} r A result of open().
 * @param {string} code The HttpsError code.
 * @param {string} reason The details.reason.
 */
function refused(r, code, reason) {
  assert.ok(r.error, `expected a refusal (${reason})`);
  assert.equal(r.error.code, code);
  assert.equal(r.error.details && r.error.details.reason, reason);
  assert.equal(r.calls.length, 0, 'Stripe is never called');
}

test('F3: a subscription linked to the athlete only (link-subscription.mjs ' +
    'writes no household customer) opens that athlete\'s customer',
async () => {
  const docs = world();
  paid(docs, 'ath-a', LINKED);
  const r = await open({}, docs);
  assert.equal(r.error, null);
  assert.equal(r.calls[0].customer, LINKED);
});

test('F2: two customers (a second checkout before the first webhook) and ' +
    'no athleteId is several-customers - never one of them silently, and ' +
    'no slot is taken', async () => {
  const docs = world();
  paid(docs, 'ath-a', FIRST);
  linked(docs, FIRST);
  paid(docs, 'ath-b', SECOND);
  linked(docs, SECOND);
  const r = await open({}, docs);
  refused(r, 'failed-precondition', 'several-customers');
  assert.match(r.error.message, /academy/);
  assert.equal(docs['billingPortalLimits/u-parent'], undefined);
});

test('F2: with several, the athleteId picks that athlete\'s own customer',
    async () => {
      const docs = world();
      paid(docs, 'ath-a', FIRST);
      linked(docs, FIRST);
      paid(docs, 'ath-b', SECOND);
      linked(docs, SECOND);
      assert.equal((await open({athleteId: 'ath-b'}, docs)).calls[0]
          .customer, SECOND);
      assert.equal((await open({athleteId: 'ath-a'}, docs)).calls[0]
          .customer, FIRST);
    });

test('F2: with several, an athlete with no customer of its own cannot ' +
    'pick one', async () => {
  const docs = world();
  paid(docs, 'ath-a', FIRST);
  linked(docs, FIRST);
  linked(docs, SECOND); // on the household only
  refused(await open({athleteId: 'ath-b'}, docs), 'failed-precondition',
      'several-customers');
});

test('one customer: an athleteId of an athlete without its own still ' +
    'opens the family\'s one customer', async () => {
  const docs = world();
  paid(docs, 'ath-a', FIRST);
  linked(docs, FIRST);
  const r = await open({athleteId: 'ath-b'}, docs);
  assert.equal(r.error, null);
  assert.equal(r.calls[0].customer, FIRST);
});

test('an athleteId outside the caller\'s household is not-payer, whatever ' +
    'the count', async () => {
  const docs = world();
  paid(docs, 'ath-a', FIRST);
  linked(docs, FIRST);
  refused(await open({athleteId: 'ath-x'}, docs), 'permission-denied',
      'not-payer');
  refused(await open({athleteId: 'ath-ghost'}, docs), 'permission-denied',
      'not-payer');
  linked(docs, SECOND);
  refused(await open({athleteId: 'ath-x'}, docs), 'permission-denied',
      'not-payer');
});

test('an athleteId that is not a non-empty string is a bad request',
    async () => {
      const docs = world();
      paid(docs, 'ath-a', FIRST);
      for (const athleteId of [42, '', {}, ['ath-a'], true]) {
        refused(await open({athleteId}, docs), 'invalid-argument',
            'bad-request');
      }
      // null reads as absent.
      assert.equal((await open({athleteId: null}, docs)).calls[0].customer,
          FIRST);
    });

test('a customer listed only in stripeCustomerIds (the primary cleared by ' +
    'staff) still opens', async () => {
  const docs = world();
  docs['households/hh-a'].stripeCustomerIds = [SECOND];
  assert.equal((await open({}, docs)).calls[0].customer, SECOND);
});

test('the facility add-on\'s customer counts, and is the athlete\'s own ' +
    'when it has no membership customer', async () => {
  const docs = world();
  paid(docs, 'ath-a', FIRST);
  linked(docs, FIRST);
  docs['athletes/ath-b'].facilityBilling = {status: 'active',
    customerId: FACILITY};
  refused(await open({}, docs), 'failed-precondition', 'several-customers');
  assert.equal((await open({athleteId: 'ath-b'}, docs)).calls[0].customer,
      FACILITY);
});

test('householdCustomers: the primary first, no repeats, trimmed, ' +
    'non-strings ignored', () => {
  const household = {stripeCustomerId: ` ${FIRST} `,
    stripeCustomerIds: [FIRST, SECOND, '', null, 7, SECOND]};
  const athletes = [
    {id: 'a', billing: {customerId: SECOND}},
    {id: 'b', billing: {customerId: LINKED},
      facilityBilling: {customerId: FACILITY}},
    {id: 'c'},
    {id: 'd', billing: null, facilityBilling: {customerId: '  '}},
  ];
  assert.deepEqual(householdCustomers(household, athletes),
      [FIRST, SECOND, LINKED, FACILITY]);
  assert.deepEqual(householdCustomers({}, []), []);
});

test('pickCustomer: the answers, without Firestore', () => {
  const one = {stripeCustomerId: FIRST, stripeCustomerIds: [FIRST]};
  assert.deepEqual(pickCustomer(one, [], null), {customer: FIRST});
  assert.deepEqual(pickCustomer({}, [], null), {code: 'failed-precondition',
    reason: 'no-customer'});
  const two = [{id: 'a', billing: {customerId: FIRST}},
    {id: 'b', billing: {customerId: SECOND}}];
  assert.deepEqual(pickCustomer(one, two, null), {code: 'failed-precondition',
    reason: 'several-customers'});
  assert.deepEqual(pickCustomer(one, two, 'b'), {customer: SECOND});
  assert.deepEqual(pickCustomer(one, two, 'z'), {code: 'permission-denied',
    reason: 'not-payer'});
});

run();
