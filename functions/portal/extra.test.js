'use strict';
// The extra session at the member rate (owner, 2026-10-10): extra.js, the
// pure half. The checkout is checkout-extra.test.js; the webhook,
// stripe-single.test.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test, run} = require('./tiny');
const lib = require('./lib');
const single = require('./single');
const extra = require('./extra');

const OPEN = lib.BOOKING_OPENS_AT;
const PAID = {status: 'active', subscriptionId: 'sub_1'};

test('the five member rates, their coupons and what each takes off $65',
    () => {
      const rows = ['t-4', 't-6', 't-8', 't-12', 't-16'].map((id) => {
        const r = extra.memberRateFor(id);
        return [r.packageId, r.tokens, r.cents, r.offCents, r.coupon,
          r.label];
      });
      assert.deepEqual(rows, [
        ['t-4', 4, 5475, 1025, 'MEMBER_RATE_4', '$54.75'],
        ['t-6', 6, 4983, 1517, 'MEMBER_RATE_6', '$49.83'],
        ['t-8', 8, 4863, 1637, 'MEMBER_RATE_8', '$48.63'],
        ['t-12', 12, 4742, 1758, 'MEMBER_RATE_12', '$47.42'],
        ['t-16', 16, 4494, 2006, 'MEMBER_RATE_16', '$44.94'],
      ]);
      assert.equal(single.SINGLE_PRICE_CENTS, 6500);
      for (const id of ['elite', 'single', 't-20', '', null, undefined,
        'toString', '__proto__', 8]) {
        assert.equal(extra.memberRateFor(id), null, String(id));
      }
    });

test('the rates are the catalogue\'s own: round(price * 100 / tokens)',
    () => {
      // frontend/src/portal/data/packages.js is the one catalogue: a price
      // or package change there fails here until extra.js (and the Stripe
      // coupon) follow.
      const src = fs.readFileSync(path.join(__dirname,
          '../../frontend/src/portal/data/packages.js'), 'utf8');
      const block = /export const TOKEN_PACKAGES = \[([\s\S]*?)\];/.exec(src);
      assert.ok(block, 'TOKEN_PACKAGES not found in packages.js');
      const re = /id: '([^']+)',[^}]*?tokens: (\d+),\s*price: (\d+)/g;
      const found = {};
      let m;
      while ((m = re.exec(block[1])) !== null) {
        const tokens = Number(m[2]);
        found[m[1]] = {tokens,
          cents: Math.round(Number(m[3]) * 100 / tokens)};
      }
      assert.deepEqual(Object.keys(found).sort(),
          Object.keys(extra.MEMBER_RATES).sort());
      for (const [id, f] of Object.entries(found)) {
        const r = extra.MEMBER_RATES[id];
        assert.deepEqual([r.tokens, r.cents, r.coupon],
            [f.tokens, f.cents, `MEMBER_RATE_${f.tokens}`], id);
      }
    });

test('paidSubscription: the webhook\'s top-up condition minus past_due',
    () => {
      assert.equal(extra.paidSubscription(PAID), true);
      assert.equal(extra.paidSubscription({status: 'active',
        subscriptionId: 'sub_1', oneTime: false}), true);
      for (const b of [null, undefined, {}, {status: 'active'},
        {status: 'past_due', subscriptionId: 'sub_1'},
        {status: 'pending', subscriptionId: 'sub_1'},
        {status: 'lapsed', subscriptionId: 'sub_1'},
        {status: 'active', subscriptionId: 'sub_1', oneTime: true},
        {status: 'active', oneTime: true, subscriptionId: null}]) {
        assert.equal(extra.paidSubscription(b), false, JSON.stringify(b));
      }
    });

test('athleteRefusal: package, card, subscription, then the sale', () => {
  const tokens = {kind: 'tokens'};
  const no = (athlete, pkg, nowMs) => {
    const r = extra.athleteRefusal({athlete, pkg, nowMs: nowMs || OPEN});
    return r && r.reason;
  };
  const a = (over) => Object.assign({packageId: 't-8', billing: PAID}, over);
  assert.equal(no(a(), tokens), null);
  assert.equal(no(a(), null), null, 'a missing package doc: the id decides');
  assert.equal(no(a({packageId: 'elite'}), {kind: 'elite'}),
      'extra-not-tokens');
  assert.equal(no(a({packageId: 'single'}), {kind: 'single'}),
      'extra-not-tokens');
  assert.equal(no(a({packageId: 't-20'}), tokens), 'extra-not-tokens');
  assert.equal(no(a(), {kind: 'single'}), 'extra-not-tokens');
  assert.equal(no(a({packageId: null}), null), 'extra-not-tokens');
  assert.equal(no(a({billing: {status: 'past_due', subscriptionId: 's'}}),
      tokens), 'billing-past-due');
  for (const billing of [undefined, {status: 'pending'},
    {status: 'lapsed', subscriptionId: 's'}, {status: 'active'},
    {status: 'active', subscriptionId: 's', oneTime: true}]) {
    assert.equal(no(a({billing}), tokens), 'extra-no-subscription',
        JSON.stringify(billing));
  }
  assert.equal(no(a(), tokens, OPEN - 1), 'single-not-open');
  assert.equal(no(a(), tokens, Date.parse('2027-02-28T05:31:00Z')),
      'season-over');
  assert.equal(no(a(), tokens, Date.parse('2027-02-28T05:29:00Z')), null);
  // The order: the package outranks the card, the card the sale.
  assert.equal(no(a({packageId: 'elite',
    billing: {status: 'past_due', subscriptionId: 's'}}), {kind: 'elite'},
  OPEN - 1), 'extra-not-tokens');
  assert.equal(no(a({billing: {status: 'past_due', subscriptionId: 's'}}),
      tokens, OPEN - 1), 'billing-past-due');
  const card = extra.athleteRefusal({athlete: a({billing:
    {status: 'past_due', subscriptionId: 's'}}), pkg: tokens, nowMs: OPEN});
  assert.equal(card.message, 'The card on this membership needs updating ' +
      'before you can buy an extra session. Nothing has been charged.');
});

test('householdRefusal: a frozen or lapsed family', () => {
  const reason = (hh) => (extra.householdRefusal(hh) || {}).reason || null;
  assert.equal(reason({}), null);
  assert.equal(reason({membership: {status: 'active'}}), null);
  assert.equal(reason({membership: {status: 'past_due'}}),
      'household-past-due');
  assert.equal(reason({membership: {status: 'lapsed'}}), 'household-lapsed');
});

test('expectedAmountCents: $65, or exactly the rate the metadata names',
    () => {
      assert.equal(extra.expectedAmountCents({}), 6500);
      assert.equal(extra.expectedAmountCents({metadata: {}}), 6500);
      assert.equal(extra.expectedAmountCents(null), 6500);
      assert.equal(extra.expectedAmountCents({metadata:
        {memberRate: 't-8'}}), 4863);
      assert.equal(extra.expectedAmountCents({metadata:
        {memberRate: 't-16'}}), 4494);
      assert.equal(extra.expectedAmountCents({metadata:
        {memberRate: 'elite'}}), null);
      assert.equal(extra.dollars(4863), '$48.63');
      assert.equal(extra.dollars(6500), '$65.00');
    });

run();
