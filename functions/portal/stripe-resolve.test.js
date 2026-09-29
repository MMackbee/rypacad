'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const r = require('./stripe-resolve');

const secs = (y, m, d) => Date.UTC(y, m - 1, d, 12) / 1000;

test('subscriptionIdOf: legacy string, legacy object, Basil parent', () => {
  assert.equal(r.subscriptionIdOf({subscription: 'sub_a'}), 'sub_a');
  assert.equal(r.subscriptionIdOf({subscription: {id: 'sub_b'}}), 'sub_b');
  assert.equal(r.subscriptionIdOf({parent: {subscription_details:
    {subscription: 'sub_c'}}}), 'sub_c');
  assert.equal(r.subscriptionIdOf({}), null);
});

test('periodOf: top-level else items.data[0] (Basil)', () => {
  assert.deepEqual(r.periodOf({current_period_start: secs(2026, 11, 1),
    current_period_end: secs(2026, 11, 30)}),
  {start: '2026-11-01', end: '2026-11-30'});
  assert.deepEqual(r.periodOf({items: {data: [{
    current_period_start: secs(2026, 12, 1),
    current_period_end: secs(2026, 12, 31)}]}}),
  {start: '2026-12-01', end: '2026-12-31'});
  assert.deepEqual(r.periodOf({}), {start: null, end: null});
});

test('priceIdOf and metadataOf read both shapes', () => {
  assert.equal(r.priceIdOf({items: {data: [{price: {id: 'p1'}}]}}), 'p1');
  assert.equal(r.priceIdOf({plan: {id: 'p2'}}), 'p2');
  assert.deepEqual(r.metadataOf({metadata: {athleteId: 'a'}}),
      {athleteId: 'a'});
  assert.deepEqual(r.metadataOf({parent: {subscription_details:
    {metadata: {athleteId: 'b'}}}}), {athleteId: 'b'});
  assert.deepEqual(r.metadataOf({}), {});
});

test('parseClientReference: household__athlete__product', () => {
  assert.deepEqual(r.parseClientReference('hh1__ath1__tier'),
      {householdId: 'hh1', athleteId: 'ath1', product: 'tier'});
  assert.equal(r.parseClientReference('hh1__ath1__other'), null);
  assert.equal(r.parseClientReference(null), null);
});

/**
 * A Firestore stand-in: `hits[collection][field]` -> [{id, data}].
 * @param {!Object} hits Query answers.
 * @return {!Object} A fake db.
 */
function fakeDb(hits) {
  return {collection: (c) => {
    let field = null;
    const q = {
      where(f) {
        field = f; return q;
      },
      limit() {
        return q;
      },
      async get() {
        const docs = ((hits[c] || {})[field] || []).map((d) => ({
          id: d.id, ref: {path: `${c}/${d.id}`}, data: () => d.data}));
        return {empty: docs.length === 0, docs};
      },
    };
    return q;
  }};
}
const stripeNever = {checkout: {sessions: {list: async () => {
  throw new Error('should not be called');
}}}};
const inv = (extra) => ({type: 'invoice.paid', data: {object: Object.assign(
    {customer: 'cus_1',
      parent: {subscription_details: {subscription: 'sub_1'}}},
    extra)}});

test('resolveSubject: metadata first', async () => {
  const s = await r.resolveSubject(inv({parent: {subscription_details: {
    subscription: 'sub_1', metadata: {householdId: 'h', athleteId: 'a',
      product: 'tier', packageId: 't-6'}}}}), {db: fakeDb({}),
    stripe: stripeNever});
  assert.deepEqual(s, {householdId: 'h', athleteId: 'a', product: 'tier',
    packageId: 't-6', via: 'metadata'});
});

test('resolveSubject: billing.subscriptionId, then facility, then customer',
    async () => {
      const byBilling = fakeDb({athletes: {'billing.subscriptionId': [
        {id: 'a1', data: {householdId: 'h1', packageId: 't-12'}}]}});
      let s = await r.resolveSubject(inv({}), {db: byBilling,
        stripe: stripeNever});
      assert.deepEqual([s.athleteId, s.product, s.via],
          ['a1', 'tier', 'billing']);
      const byFac = fakeDb({athletes: {'facilityBilling.subscriptionId': [
        {id: 'a2', data: {householdId: 'h1'}}]}});
      s = await r.resolveSubject(inv({}), {db: byFac, stripe: stripeNever});
      assert.deepEqual([s.athleteId, s.product, s.via],
          ['a2', 'facility', 'facility']);
      const byCus = fakeDb({households: {stripeCustomerIds: [
        {id: 'h9', data: {}}]}});
      s = await r.resolveSubject(inv({}), {db: byCus, stripe: stripeNever});
      assert.deepEqual(s, {householdId: 'h9', athleteId: null, product: null,
        packageId: null, via: 'customer-ids'});
    });

test('resolveSubject: checkout.sessions.list last; a throw is typed',
    async () => {
      const ok = {checkout: {sessions: {list: async () => ({data: [
        {client_reference_id: 'h2__a3__facility'}]})}}};
      const s = await r.resolveSubject(inv({}), {db: fakeDb({}), stripe: ok});
      assert.deepEqual([s.householdId, s.athleteId, s.product, s.via],
          ['h2', 'a3', 'facility', 'checkout-session']);
      const none = {checkout: {sessions: {list: async () => ({data: []})}}};
      assert.equal(await r.resolveSubject(inv({}), {db: fakeDb({}),
        stripe: none}), null);
      await assert.rejects(r.resolveSubject(inv({}), {db: fakeDb({}),
        stripe: {checkout: {sessions: {list: async () => {
          throw new Error('boom');
        }}}}}), (e) => e instanceof r.StripeLookupError &&
          e.code === 'stripe-lookup-failed');
    });

run();
