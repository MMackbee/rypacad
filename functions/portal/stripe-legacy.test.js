'use strict';
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {test, run} = require('./tiny');
const legacy = require('./stripe-legacy');
// The per-athlete webhook path shares membershipPatch and, since the
// review of 2026-11-03, the initial-status rule.
const stripe = require('./stripe');

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
// The 2026-10-21 shape: the period fields written, no status.
const legacyMap = () => Object.assign({}, hh, {data: {membership: {
  stripeSubscriptionStatus: 'active', currentPeriodStart: '2026-10-21',
  currentPeriodEnd: '2026-11-21', lastEventId: 'evt_x'}}});
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

test('applySubscriptionUpdated: a household with no membership.status gets ' +
    'one from the subscription (2026-11-03: the rules refused every ' +
    'booking by a family whose map had none)', async () => {
  DATA = {athletes: ATHLETES, packages: PACKAGES};
  // The 2026-10-21 shape (a map with the period fields and no status) and
  // a household with no map at all: both get one.
  for (const household of [legacyMap(), hh]) {
    const {tx, writes} = recorder();
    await legacy.applySubscriptionUpdated(tx, subUpdated('price_t6'),
        household);
    const h = writes.find((w) => w.path === 'households/h1').data;
    assert.deepEqual([h['membership.status'],
      h['membership.stripeSubscriptionStatus']], ['active', 'active']);
  }
});

test('applySubscriptionUpdated: an existing membership.status is left to ' +
    'the invoice events', async () => {
  DATA = {athletes: ATHLETES, packages: PACKAGES};
  const {tx, writes} = recorder();
  const frozen = Object.assign({}, hh,
      {data: {membership: {status: 'past_due'}}});
  await legacy.applySubscriptionUpdated(tx, subUpdated('price_t6'), frozen);
  const h = writes.find((w) => w.path === 'households/h1').data;
  assert.equal('membership.status' in h, false);
  assert.equal(h['membership.stripeSubscriptionStatus'], 'active');
});

test('applySubscriptionUpdated: only an active subscription starts the map; ' +
    'past_due, canceled and incomplete leave status unset (a freeze is the ' +
    'invoice events\', with their revoke and notice)', async () => {
  DATA = {athletes: ATHLETES, packages: PACKAGES};
  for (const [status, wanted] of [['trialing', 'active'],
    ['past_due', undefined], ['canceled', undefined],
    ['incomplete', undefined]]) {
    const {tx, writes} = recorder();
    const ev = subUpdated('price_t6');
    ev.data.object.status = status;
    await legacy.applySubscriptionUpdated(tx, ev, hh);
    const h = writes.find((w) => w.path === 'households/h1').data;
    assert.equal(h['membership.status'], wanted, status);
  }
});

test('stripe.js applyAthleteSubscriptionUpdated: the tier map gets the same ' +
    'initial status, once (review 2026-11-03: this path wrote the incident ' +
    'shape when the update landed before invoice.paid)', async () => {
  DATA = {athletes: ATHLETES, packages: PACKAGES};
  const athlete = {householdId: 'h1', packageId: 't-6',
    billing: {status: 'pending', subscriptionId: 'sub_mon'}};
  const athleteRef = {path: 'athletes/mon'};
  const frozen = Object.assign({}, hh,
      {data: {membership: {status: 'past_due'}}});
  for (const [household, wanted] of [[legacyMap(), 'active'],
    [hh, 'active'], [frozen, undefined]]) {
    const {tx, writes} = recorder();
    // An unmapped price: the membership write happens before the package
    // comparison, which then reports no-change.
    const out = await stripe.applyAthleteSubscriptionUpdated(tx,
        subUpdated('price_unmapped'), household, athlete, athleteRef, 'tier');
    assert.equal(out.outcome, 'no-change');
    const h = writes.find((w) => w.path === 'households/h1').data;
    assert.equal(h['membership.status'], wanted);
    assert.equal(h['membership.stripeSubscriptionStatus'], 'active');
    assert.equal('membership.status' in h, wanted !== undefined);
  }
  // The add-on never speaks for the household map.
  const {writes} = recorder();
  assert.equal(writes.some((w) => w.path === 'households/h1'), false);
});

run();
