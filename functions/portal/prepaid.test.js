'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const prepaid = require('./prepaid');

const OCT = new Date('2026-10-05T18:00:00Z');
const NOV12 = new Date('2026-11-12T18:00:00Z'); // 19 of 30 days remain

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

test('after Nov 1: prorate price and tokens by days remaining', () => {
  const p = prepaid.prepaidPeriodFor(NOV12, {priceCents: 29900, tokens: 6});
  assert.equal(p.periodKey, '2026-11-01');
  assert.equal(p.trialEnd, 1796104800);
  assert.equal(p.amountCents, Math.round(29900 * 19 / 30));
  assert.equal(p.tokens, 4); // ceil(6 * 19/30) = 4
  assert.equal(p.prorated, true);
});

test('prorated tokens never 0; Elite null stays null; prorate off', () => {
  const late = new Date('2026-11-30T18:00:00Z');
  assert.equal(prepaid.prepaidPeriodFor(late,
      {priceCents: 6500, tokens: 1}).tokens, 1);
  assert.equal(prepaid.prepaidPeriodFor(late,
      {priceCents: 99900, tokens: null}).tokens, null);
  const full = prepaid.prepaidPeriodFor(NOV12,
      {priceCents: 29900, tokens: 6, prorate: false});
  assert.deepEqual([full.amountCents, full.tokens, full.prorated],
      [29900, 6, false]);
});

test('PRORATE_JOINERS is the ruling', () => {
  assert.equal(prepaid.PRORATE_JOINERS, true);
});

run();
