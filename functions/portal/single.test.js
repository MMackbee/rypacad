'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test, run} = require('./tiny');
const lib = require('./lib');
const single = require('./single');

const HOUR = 60 * 60 * 1000;

test('tokenIdFor / isSingleTokenId: the id format', () => {
  assert.equal(single.tokenIdFor('cs_test_a1'), 'single_cs_test_a1');
  assert.equal(single.isSingleTokenId('single_cs_test_a1'), true);
  assert.equal(single.isSingleTokenId('single_'), false);
  assert.equal(single.isSingleTokenId('jordan_sess-1'), false);
  assert.equal(single.isSingleTokenId(null), false);
  assert.equal(single.isSingleTokenId(undefined), false);
});

test('isSingleOnly: packageId, package kind or a one-time billing block',
    () => {
      assert.equal(single.isSingleOnly({packageId: 'single'}), true);
      assert.equal(single.isSingleOnly({packageId: 'x'}, {kind: 'single'}),
          true);
      assert.equal(single.isSingleOnly({packageId: 't-6',
        billing: {status: 'active', oneTime: true}}), true);
      assert.equal(single.isSingleOnly({packageId: 't-6',
        billing: {status: 'active'}}, {kind: 'tokens'}), false);
      assert.equal(single.isSingleOnly({packageId: 't-6',
        billing: {oneTime: false}}), false);
      assert.equal(single.isSingleOnly(null, null), false);
    });

test('paymentIntentIdOf: string or expanded object', () => {
  assert.equal(single.paymentIntentIdOf({payment_intent: 'pi_1'}), 'pi_1');
  assert.equal(single.paymentIntentIdOf({payment_intent: {id: 'pi_2'}}),
      'pi_2');
  assert.equal(single.paymentIntentIdOf({payment_intent: null}), null);
  assert.equal(single.paymentIntentIdOf({}), null);
  assert.equal(single.paymentIntentIdOf(null), null);
});

test('seasonCheckoutOpen: closes 30 minutes before the cutoff', () => {
  assert.equal(single.SEASON_CUTOFF_MS, Date.parse('2027-02-28T06:00:00Z'));
  assert.equal(single.seasonCheckoutOpen(
      Date.parse('2027-02-28T05:29:59Z')), true);
  assert.equal(single.seasonCheckoutOpen(
      Date.parse('2027-02-28T05:30:00Z')), true);
  assert.equal(single.seasonCheckoutOpen(
      Date.parse('2027-02-28T05:30:01Z')), false);
  assert.equal(single.seasonCheckoutOpen(Date.parse('2026-10-10T12:00:00Z')),
      true);
});

test('checkoutExpiresAt: 24 h less 5 min, capped at the cutoff', () => {
  const now = Date.parse('2026-10-10T12:00:00.500Z');
  assert.equal(single.checkoutExpiresAt(now),
      Math.floor((now + 24 * HOUR - 5 * 60 * 1000) / 1000));
  const feb27 = Date.parse('2027-02-27T18:00:00Z');
  assert.equal(single.checkoutExpiresAt(feb27),
      single.SEASON_CUTOFF_MS / 1000);
  assert.ok(Number.isInteger(single.checkoutExpiresAt(now)));
});

test('isRetiredSubscription: tier only, listed ids only', () => {
  const athlete = {billing: {retiredSubscriptionIds: ['sub_old']}};
  assert.equal(single.isRetiredSubscription(athlete, 'tier', 'sub_old'), true);
  assert.equal(single.isRetiredSubscription(athlete, 'tier', 'sub_new'),
      false);
  assert.equal(single.isRetiredSubscription(athlete, 'facility', 'sub_old'),
      false);
  assert.equal(single.isRetiredSubscription(athlete, 'tier', null), false);
  assert.equal(single.isRetiredSubscription({billing: {}}, 'tier', 'sub_old'),
      false);
  assert.equal(single.isRetiredSubscription(null, 'tier', 'sub_old'), false);
});

test('the cutoff is the first instant after SEASON_END in Chicago', () => {
  assert.equal(lib.chicagoDate(new Date(single.SEASON_CUTOFF_MS - 1)),
      single.SEASON_END);
  assert.equal(lib.chicagoDate(new Date(single.SEASON_CUTOFF_MS)),
      '2027-02-28');
});

test('SEASON_END mirrors frontend data/season.js SEASON_BOUNDS.end', () => {
  const src = fs.readFileSync(path.join(__dirname,
      '../../frontend/src/portal/data/season.js'), 'utf8');
  const m = /SEASON_BOUNDS\s*=\s*\{[^}]*\bend:\s*'(\d{4}-\d{2}-\d{2})'/
      .exec(src);
  assert.ok(m, 'SEASON_BOUNDS end literal not found in season.js');
  assert.equal(single.SEASON_END, m[1]);
});

test('constants are the rulings', () => {
  assert.equal(single.SINGLE_ID, 'single');
  assert.equal(single.SINGLE_PRICE_CENTS, 6500);
  assert.equal(single.CHECKOUT_MIN_MS, 30 * 60 * 1000);
});

run();
