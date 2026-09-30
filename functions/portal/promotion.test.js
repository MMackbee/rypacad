/**
 * Pure checks for the promotion order (pin F) under the single token
 * (owner rulings 2026-09-29/30): a purchased token earns no priority.
 *   node portal/promotion.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const promotion = require('./promotion');

const GRACE = [
  {id: 'single_cs_1', reason: 'single-purchase', expiresAt: '2027-02-27'},
  {id: 's9_ada_cancelled', reason: 'session-cancelled',
    expiresAt: '2026-12-01'},
  {id: 'no-expiry', reason: 'session-cancelled'},
];
const grace = (id) => ({chargedFrom: 'grace', graceTokenId: id,
  reason: null});

test('candidateGraceExpiry: a purchased single token earns no priority',
    () => {
      assert.equal(promotion.candidateGraceExpiry(grace('single_cs_1'),
          GRACE), null);
    });

test('candidateGraceExpiry: a bonus token keys on ITS expiry', () => {
  assert.equal(promotion.candidateGraceExpiry(grace('s9_ada_cancelled'),
      GRACE), '2026-12-01');
  assert.equal(promotion.candidateGraceExpiry(grace('no-expiry'), GRACE),
      '9999-12-31');
});

test('candidateGraceExpiry: period, elite and no charge are null', () => {
  const none = {graceTokenId: null, reason: null};
  assert.equal(promotion.candidateGraceExpiry(
      Object.assign({chargedFrom: 'period'}, none), GRACE), null);
  assert.equal(promotion.candidateGraceExpiry(
      Object.assign({chargedFrom: 'elite'}, none), GRACE), null);
  assert.equal(promotion.candidateGraceExpiry(null, GRACE), null);
});

test('orderCandidates: bonus holder first, single-purchase by joinedAt',
    () => {
      const cand = (id, joinedAt, charge) => ({
        entry: {id, joinedAt: new Date(joinedAt)}, ok: true,
        graceExpiry: promotion.candidateGraceExpiry(charge, GRACE),
      });
      const period = {chargedFrom: 'period', graceTokenId: null};
      const plain = cand('plain', '2026-11-01T10:00:00Z', period);
      const single = cand('single', '2026-11-01T11:00:00Z',
          grace('single_cs_1'));
      const bonus = cand('bonus', '2026-11-01T12:00:00Z',
          grace('s9_ada_cancelled'));
      const order = promotion.orderCandidates([single, plain, bonus])
          .map((c) => c.entry.id);
      assert.deepEqual(order, ['bonus', 'plain', 'single']);
      const early = cand('early-single', '2026-11-01T09:00:00Z',
          grace('single_cs_1'));
      assert.deepEqual(promotion.orderCandidates([plain, early, bonus])
          .map((c) => c.entry.id), ['bonus', 'early-single', 'plain']);
    });

run();
