'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const prepaid = require('./prepaid');
const checkout = require('./checkout');

const OCT = new Date('2026-10-05T18:00:00Z');
const NOV12 = new Date('2026-11-12T18:00:00Z'); // 19 of 30 days remain
const NOV17 = new Date('2026-11-17T18:00:00Z'); // 14 of 30 days remain
const NOV30 = new Date('2026-11-30T18:00:00Z'); // the last day: 1 of 30
const DEC1 = new Date('2026-12-01T18:00:00Z');

test('chicagoMidnightUnix: Dec 1 00:00 CST', () => {
  assert.equal(prepaid.chicagoMidnightUnix('2026-12-01'), 1796104800);
  assert.equal(prepaid.chicagoMidnightUnix('2026-11-01'), 1793509200);
});

test('before Nov 1: November at full price, trial ends Dec 1', () => {
  const p = prepaid.prepaidPeriodFor(OCT, {priceCents: 29900, tokens: 6});
  assert.deepEqual(p, {periodKey: '2026-11-01', periodEnd: '2026-11-30',
    trialEnd: 1796104800, amountCents: 29900, tokens: 6, prorated: false,
    label: 'November 2026'});
});

test('after Nov 1: prorate the price, keep the full tokens (2026-11-17)',
    () => {
      // Owner ruling 2026-11-17: "Pro rate the rate, not the tokens."
      const p = prepaid.prepaidPeriodFor(NOV17, {priceCents: 29900, tokens: 6});
      assert.deepEqual(p, {periodKey: '2026-11-01', periodEnd: '2026-11-30',
        trialEnd: 1796104800, amountCents: 13953, tokens: 6, prorated: true,
        label: 'November 2026'});
      const p12 = prepaid.prepaidPeriodFor(NOV12,
          {priceCents: 29900, tokens: 6});
      assert.deepEqual([p12.amountCents, p12.tokens, p12.prorated],
          [Math.round(29900 * 19 / 30), 6, true]);
    });

test('the 1st of a month: full price, full tokens, not prorated', () => {
  const p = prepaid.prepaidPeriodFor(DEC1, {priceCents: 29900, tokens: 6});
  assert.deepEqual([p.periodKey, p.amountCents, p.tokens, p.prorated,
    p.label], ['2026-12-01', 29900, 6, false, 'December 2026']);
  assert.equal(p.trialEnd, prepaid.chicagoMidnightUnix('2027-01-01'));
});

// prepaidPeriodFor alone: a CHECKOUT at this instant prepays December
// instead (D11, checkout.prepaidFor) - see the Nov 28 case below.
test('the last day of a month: one day\'s price, the full tokens', () => {
  const p = prepaid.prepaidPeriodFor(NOV30, {priceCents: 29900, tokens: 6});
  assert.deepEqual([p.periodKey, p.amountCents, p.tokens, p.prorated],
      ['2026-11-01', Math.round(29900 / 30), 6, true]);
  assert.equal(prepaid.prepaidPeriodFor(NOV30,
      {priceCents: 21900, tokens: 4}).tokens, 4);
});

test('the last prorated checkout: Nov 28 22:59 Chicago pays 3 days and ' +
    'gets the full tokens; 23:01 prepays December (D11)', () => {
  const pkg = {priceCents: 29900, tokens: 6};
  const last = checkout.prepaidFor(Date.parse('2026-11-29T04:59:00Z'), pkg);
  assert.deepEqual([last.periodKey, last.amountCents, last.tokens,
    last.prorated], ['2026-11-01', 2990, 6, true]);
  const body = checkout.sessionBody({householdId: 'h1', athleteId: 'a1',
    product: 'tier', packageId: 't-6', priceId: 'price_t6', currency: 'usd',
    productName: '6 tokens', prepaid: last, role: 'parent',
    portalUrl: 'https://portal.test', customerId: 'cus_1'});
  assert.deepEqual([body.line_items[1].price_data.unit_amount,
    body.line_items[1].price_data.product_data.name,
    body.subscription_data.metadata.prepaidTokens],
  [2990, '6 tokens - November 2026, prepaid', '6']);
  const rolled = checkout.prepaidFor(Date.parse('2026-11-29T05:01:00Z'), pkg);
  assert.deepEqual([rolled.periodKey, rolled.amountCents, rolled.tokens,
    rolled.prorated], ['2026-12-01', 29900, 6, false]);
});

test('Elite null stays null when prorated; prorate off', () => {
  const elite = prepaid.prepaidPeriodFor(NOV30,
      {priceCents: 99900, tokens: null});
  assert.deepEqual([elite.amountCents, elite.tokens, elite.prorated],
      [Math.round(99900 / 30), null, true]);
  const full = prepaid.prepaidPeriodFor(NOV12,
      {priceCents: 29900, tokens: 6, prorate: false});
  assert.deepEqual([full.amountCents, full.tokens, full.prorated],
      [29900, 6, false]);
});

test('PRORATE_JOINERS is the ruling', () => {
  assert.equal(prepaid.PRORATE_JOINERS, true);
});

run();
