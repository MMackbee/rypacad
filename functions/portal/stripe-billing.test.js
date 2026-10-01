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
  assert.equal(a.data['billing.oneTime'], false,
      'a paid subscription clears the single token\'s oneTime');
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
      assert.equal(Object.keys(a.data).some((k) => k.endsWith('.oneTime')),
          false, 'the add-on never touches oneTime');
      assert.equal(writes.some((w) => w.path.startsWith('tokenPeriods/')),
          false);
      assert.equal(writes.some((w) => w.path === 'households/h1'), false,
          'D10: a facility invoice never writes households.membership');
    });

test('invoice.paid before checkout on an upgrade from the single token',
    () => {
      // The single athlete ({active, oneTime}) subscribes to t-6; Stripe
      // delivers invoice.paid first. It must leave billing.oneTime false.
      const {tx, writes} = recorder();
      const out = b.applyAthleteInvoicePaid(tx, {db, hh, athleteRef: aRef,
        athlete: {packageId: 't-6', billing: {status: 'active',
          oneTime: true, subscriptionId: null}},
        pkg: T6, product: 'tier',
        period: {start: '2026-10-05', end: '2026-11-05'},
        event: {id: 'evt_4', data: {object: {
          billing_reason: 'subscription_create'}}}});
      assert.equal(out.firstActive, false);
      const a = writes.find((w) => w.path === 'athletes/a1');
      assert.deepEqual([a.data['billing.status'], a.data['billing.oneTime']],
          ['active', false]);
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
      const legacy = {id: 'a3', data: () => ({})}; // absent billing == active
      assert.equal(await live([doc('a1', 'lapsed'), legacy]), true);
    });

test('otherTiers: unbilled only when every live sibling is a single token',
    async () => {
      const doc = (id, billing) => ({id, data: () => ({billing})});
      const single = {status: 'active', oneTime: true, subscriptionId: null};
      const monthly = {status: 'active', subscriptionId: 'sub_2'};
      const dbWith = (docs) => ({collection: () => ({where: () => docs})});
      const tx = {get: async (docs) => ({docs})};
      const others = (docs) => b.otherTiers(tx, dbWith(docs), 'h1', 'a1');
      const ben = doc('a1', {status: 'past_due', subscriptionId: 'sub_1'});
      assert.deepEqual(await others([ben, doc('a2', single)]),
          {live: true, unbilled: true});
      assert.deepEqual(await others([ben, doc('a2', single),
        doc('a3', single), doc('a4', {status: 'pending'})]),
      {live: true, unbilled: true}, 'a pending sibling bills nothing');
      // A sibling Stripe still bills (or still retries) clears it itself.
      assert.deepEqual(await others([ben, doc('a2', single),
        doc('a3', monthly)]), {live: true, unbilled: false});
      assert.deepEqual(await others([ben, doc('a2', single),
        doc('a3', {status: 'past_due', subscriptionId: 'sub_3'})]),
      {live: true, unbilled: false});
      assert.deepEqual(await others([ben, doc('a2', single),
        {id: 'a3', data: () => ({})}]), {live: true, unbilled: false},
      'a legacy sibling is billed on the household subscription');
      // A one-time block that subscribed since is a subscription.
      assert.deepEqual(await others([ben, doc('a2',
          {status: 'active', oneTime: true, subscriptionId: 'sub_4'})]),
      {live: true, unbilled: false});
      // Nobody live: the household lapses, nothing to lift.
      assert.deepEqual(await others([ben, doc('a2', {status: 'lapsed'})]),
          {live: false, unbilled: false});
      assert.deepEqual(await others([ben]), {live: false, unbilled: false});
    });

test('liftEndedFreeze: past_due ends with the subscription, singles only',
    () => {
      const frozen = {id: 'h1', ref: {path: 'households/h1'}, data: {
        membership: {status: 'past_due', attemptCount: 3,
          nextPaymentAttempt: null, lastFailedAt: '2026-12-08'}}};
      const lift = recorder();
      assert.equal(b.liftEndedFreeze(lift.tx, frozen,
          {live: true, unbilled: true}, 'evt_9', 'canceled'), true);
      assert.equal(lift.writes.length, 1);
      const h = Object.assign({}, lift.writes[0].data);
      assert.ok(h['membership.updatedAt'], 'updatedAt is a server timestamp');
      delete h['membership.updatedAt'];
      assert.deepEqual([lift.writes[0].op, lift.writes[0].path, h],
          ['update', 'households/h1', {
            'membership.status': 'active',
            'membership.stripeSubscriptionStatus': 'canceled',
            'membership.lastEventId': 'evt_9',
            'membership.attemptCount': null,
            'membership.nextPaymentAttempt': null,
            'membership.lastFailedAt': null}]);
      // A sibling Stripe still bills keeps the freeze until its invoice.
      const kept = recorder();
      assert.equal(b.liftEndedFreeze(kept.tx, frozen,
          {live: true, unbilled: false}, 'evt_9', 'canceled'), false);
      // Nobody live: applyLapsed owns the household write.
      assert.equal(b.liftEndedFreeze(kept.tx, frozen,
          {live: false, unbilled: false}, 'evt_9', 'unpaid'), false);
      // Never a lift of anything but the card freeze.
      for (const membership of [undefined, {status: 'active'},
        {status: 'lapsed'}]) {
        assert.equal(b.liftEndedFreeze(kept.tx, {id: 'h1',
          ref: {path: 'households/h1'}, data: {membership}},
        {live: true, unbilled: true}, 'evt_9', 'canceled'), false,
        String(membership && membership.status));
      }
      assert.equal(kept.writes.length, 0);
    });

run();
