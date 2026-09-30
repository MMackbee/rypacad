'use strict';
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {test, run} = require('./tiny');
const legacy = require('./stripe-legacy');

// stripe-legacy resolves admin.firestore() lazily; an own property shadows
// the namespace getter so no Firebase app is needed.
let DATA = {};
const fakeDb = {collection: (c) => ({
  doc: (id) => ({kind: 'doc', c, id, path: `${c}/${id}`}),
  where: (field, op, value) => {
    const q = {kind: 'query', c, field, value};
    q.limit = () => q;
    return q;
  },
})};
Object.defineProperty(admin, 'firestore',
    {value: () => fakeDb, configurable: true, writable: true});

/** @return {{tx: !Object, writes: !Array, gets: !Array}} A recording tx. */
function recorder() {
  const writes = [];
  const gets = [];
  const snapOf = (c, id) => ({id, ref: {path: `${c}/${id}`},
    data: () => DATA[c][id]});
  return {writes, gets, tx: {
    get: async (ref) => {
      if (ref.kind === 'doc') {
        gets.push(ref.path);
        const d = (DATA[ref.c] || {})[ref.id];
        return {exists: d !== undefined, id: ref.id, data: () => d};
      }
      gets.push(`${ref.c}?${ref.field}==${ref.value}`);
      const docs = Object.entries(DATA[ref.c] || {})
          .filter(([, d]) => d[ref.field] === ref.value)
          .map(([id]) => snapOf(ref.c, id));
      return {empty: docs.length === 0, docs};
    },
    set: (ref, data) => writes.push({op: 'set', path: ref.path, data}),
    update: (ref, data) => writes.push({op: 'update', path: ref.path, data}),
  }};
}

const secs = (y, m, d) => Date.UTC(y, m - 1, d, 12) / 1000;
const hh = {id: 'h1', ref: {path: 'households/h1'}, data: {}};
const PACKAGES = {
  't-6': {kind: 'tokens', tokens: 6, stripePriceId: 'price_t6'},
  't-12': {kind: 'tokens', tokens: 12, stripePriceId: 'price_t12'},
  'elite': {kind: 'unlimited', tokens: null, stripePriceId: 'price_elite'},
  'single': {kind: 'single', tokens: 1, windowDays: 30},
};
const ATHLETES = {
  leg: {householdId: 'h1', packageId: 't-6'},
  eli: {householdId: 'h1', packageId: 'elite'},
  sol: {householdId: 'h1', packageId: 'single',
    billing: {status: 'active', oneTime: true, subscriptionId: null}},
  mon: {householdId: 'h1', packageId: 't-6',
    billing: {status: 'active', subscriptionId: 'sub_mon'}},
  other: {householdId: 'h2', packageId: 't-6'},
};
const invoicePaid = {id: 'evt_legacy_paid', type: 'invoice.paid',
  data: {object: {lines: {data: [{type: 'subscription',
    period: {start: secs(2026, 10, 5), end: secs(2026, 11, 5)}}]}}}};

test('applyInvoicePaid: no tokenPeriods for a billing athlete', async () => {
  DATA = {athletes: ATHLETES, packages: PACKAGES};
  const {tx, writes, gets} = recorder();
  const out = await legacy.applyInvoicePaid(tx, invoicePaid, hh);
  assert.equal(out.outcome, 'issued');
  const tps = writes.filter((w) => w.path.startsWith('tokenPeriods/'));
  assert.deepEqual(tps.map((w) => w.path), ['tokenPeriods/leg_2026-10-05'],
      'only the legacy t-6 athlete');
  assert.deepEqual(out.detail.issued, [{athleteId: 'leg', granted: 6}]);
  assert.deepEqual(out.detail.skipped, [
    {athleteId: 'eli', reason: 'unlimited'},
    {athleteId: 'sol', reason: 'per-athlete-billing'},
    {athleteId: 'mon', reason: 'per-athlete-billing'},
  ]);
  assert.equal(gets.includes('packages/single'), false,
      'a billing-block athlete costs no package read');
  // The legacy athlete's grant is exactly what it was before.
  const tp = tps[0].data;
  assert.deepEqual([tp.athleteId, tp.householdId, tp.periodKey, tp.periodEnd,
    tp.granted, tp.source, tp.eventId],
  ['leg', 'h1', '2026-10-05', '2026-11-04', 6, 'stripe', 'evt_legacy_paid']);
  const h = writes.find((w) => w.path === 'households/h1').data;
  assert.deepEqual([h['membership.status'], h.periodAnchorDay], ['active', 5]);
  assert.equal(writes.some((w) => w.path.startsWith('athletes/')), false);
});

test('applyInvoicePaid: an all-billing household issues nothing', async () => {
  DATA = {athletes: {sol: ATHLETES.sol, mon: ATHLETES.mon},
    packages: PACKAGES};
  const {tx, writes} = recorder();
  const out = await legacy.applyInvoicePaid(tx, invoicePaid, hh);
  assert.deepEqual(out.detail.issued, []);
  assert.equal(writes.some((w) => w.path.startsWith('tokenPeriods/')), false);
});

const subUpdated = (priceId) => ({id: 'evt_legacy_upd',
  type: 'customer.subscription.updated',
  data: {object: {status: 'active', items: {data: [{price: {id: priceId},
    current_period_start: secs(2026, 10, 5),
    current_period_end: secs(2026, 11, 5)}]}}}});

test('applySubscriptionUpdated: never remaps a billing-block athlete',
    async () => {
      DATA = {athletes: ATHLETES, packages: PACKAGES};
      const {tx, writes} = recorder();
      const out = await legacy.applySubscriptionUpdated(tx,
          subUpdated('price_t12'), hh);
      assert.equal(out.outcome, 'processing');
      assert.equal(out.followUp, 'downgrade');
      assert.deepEqual(out.detail.athleteIds, ['leg', 'eli'],
          'legacy athletes remap exactly as before');
      const remapped = writes.filter((w) => w.path.startsWith('athletes/'))
          .map((w) => [w.path, w.data.packageId]);
      assert.deepEqual(remapped,
          [['athletes/leg', 't-12'], ['athletes/eli', 't-12']]);
      assert.ok(writes.some((w) => w.path === 'households/h1'));
    });

test('applySubscriptionUpdated: only billing athletes differ -> no-change',
    async () => {
      DATA = {athletes: {leg: ATHLETES.leg, sol: ATHLETES.sol,
        mon: Object.assign({}, ATHLETES.mon, {packageId: 't-12'})},
      packages: PACKAGES};
      const {tx, writes} = recorder();
      const out = await legacy.applySubscriptionUpdated(tx,
          subUpdated('price_t6'), hh);
      assert.equal(out.outcome, 'no-change');
      assert.equal(writes.some((w) => w.path.startsWith('athletes/')), false);
      assert.deepEqual(writes.map((w) => w.path), ['households/h1']);
    });

run();
