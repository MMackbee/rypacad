'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const b = require('./stripe-billing');

/** @return {{tx: !Object, writes: !Array}} A recording transaction. */
function recorder() {
  const writes = [];
  return {writes, tx: {
    set: (ref, data) => writes.push({op: 'set', path: ref.path, data}),
    update: (ref, data) => writes.push({op: 'update', path: ref.path, data}),
  }};
}
const db = {collection: (c) => ({doc: (id) => ({path: `${c}/${id}`})})};
const hh = {id: 'h1', ref: {path: 'households/h1'}, data: {}};
const aRef = {path: 'athletes/a1'};
const T6 = {kind: 'tokens', tokens: 6};

test('invoice.paid subscription_create: prepaid period from metadata', () => {
  const {tx, writes} = recorder();
  const out = b.applyAthleteInvoicePaid(tx, {db, hh, athleteRef: aRef,
    athlete: {billing: {status: 'pending'}}, pkg: T6, product: 'tier',
    period: {start: '2026-10-05', end: '2026-11-05'},
    event: {id: 'evt_1', data: {object: {billing_reason: 'subscription_create',
      parent: {subscription_details: {metadata: {prepaidPeriodKey: '2026-11-01',
        prepaidTokens: '6'}}}}}}});
  assert.equal(out.outcome, 'issued-prepaid');
  assert.equal(out.firstActive, true);
  const tp = writes.find((w) => w.path === 'tokenPeriods/a1_2026-11-01');
  assert.deepEqual([tp.data.granted, tp.data.prepaid, tp.data.periodEnd],
      [6, true, '2026-11-30']);
  const a = writes.find((w) => w.path === 'athletes/a1');
  assert.equal(a.data['billing.status'], 'active');
  const h = writes.find((w) => w.path === 'households/h1');
  assert.deepEqual([h.data['membership.status'], h.data.periodAnchorDay],
      ['active', 1]);
});

test('invoice.paid subscription_cycle: the invoice line period', () => {
  const {tx, writes} = recorder();
  const out = b.applyAthleteInvoicePaid(tx, {db, hh, athleteRef: aRef,
    athlete: {billing: {status: 'active'}}, pkg: T6, product: 'tier',
    period: {start: '2026-12-01', end: '2026-12-31'},
    event: {id: 'evt_2', data: {object: {
      billing_reason: 'subscription_cycle'}}},
  });
  assert.equal(out.outcome, 'issued');
  assert.equal(out.firstActive, false);
  const tp = writes.find((w) => w.path === 'tokenPeriods/a1_2026-12-01');
  assert.equal(tp.data.granted, 6);
  assert.equal(tp.data.prepaid, undefined);
});

test('invoice.paid facility: no tokens, facilityBilling + facilityAccess',
    () => {
      const {tx, writes} = recorder();
      const out = b.applyAthleteInvoicePaid(tx, {db, hh, athleteRef: aRef,
        athlete: {}, pkg: T6, product: 'facility',
        period: {start: '2026-12-01', end: '2026-12-31'},
        event: {id: 'evt_3', data: {object: {}}}});
      assert.equal(out.outcome, 'facility-active');
      const a = writes.find((w) => w.path === 'athletes/a1');
      assert.deepEqual([a.data['facilityBilling.status'],
        a.data.facilityAccess], ['active', true]);
      assert.equal(writes.some((w) => w.path.startsWith('tokenPeriods/')),
          false);
      assert.equal(writes.some((w) => w.path === 'households/h1'), false,
          'D10: a facility invoice never writes households.membership');
    });

test('applyAthleteStatus: lapsed facility clears facilityAccess', () => {
  const {tx, writes} = recorder();
  b.applyAthleteStatus(tx, {athleteRef: aRef, athlete: {}, product: 'facility',
    status: 'lapsed', priceId: 'price_fac'});
  const a = writes[0].data;
  assert.deepEqual([a['facilityBilling.status'], a.facilityAccess,
    a['facilityBilling.priceId']], ['lapsed', false, 'price_fac']);
  const r2 = recorder();
  b.applyAthleteStatus(r2.tx, {athleteRef: aRef, athlete: {}, product: 'tier',
    status: 'past_due', priceId: null});
  assert.equal(r2.writes[0].data['billing.status'], 'past_due');
  assert.equal('facilityAccess' in r2.writes[0].data, false);
});

test('otherTierLive: a live sibling keeps the household; pending/lapsed do not',
    async () => {
      const doc = (id, status) => ({id, data: () => ({billing: {status}})});
      const dbWith = (docs) => ({collection: () => ({where: () => docs})});
      const tx = {get: async (docs) => ({docs})};
      const live = (docs) =>
        b.otherTierLive(tx, dbWith(docs), 'h1', 'a1');
      assert.equal(await live([doc('a1', 'lapsed'), doc('a2', 'active')]),
          true);
      assert.equal(await live([doc('a1', 'lapsed'), doc('a2', 'past_due')]),
          true);
      assert.equal(await live([doc('a1', 'lapsed'), doc('a2', 'pending')]),
          false);
      assert.equal(await live([doc('a1', 'active')]), false);
    });

run();
