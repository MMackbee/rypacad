/**
 * Pure checks for the single-token double-spend guard.
 *   node portal/single-guard.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const guard = require('./single-guard');

const TOK = 'single_cs_g';
const row = (over) => Object.assign({status: 'confirmed', graceTokenId: TOK},
    over);

test('spendsSingleToken: the truth table', () => {
  const s = guard.spendsSingleToken;
  // create
  assert.equal(s(null, row()), true);
  // re-book (cancelled -> confirmed)
  assert.equal(s(row({status: 'cancelled'}), row()), true);
  // attendance flip, both ways
  assert.equal(s(row(), row({status: 'attended'})), false);
  assert.equal(s(row({status: 'noshow'}), row()), false);
  // a bonus token is not a single token
  assert.equal(s(null, row({graceTokenId: 's9_ada_cancelled'})), false);
  assert.equal(s(null, row({graceTokenId: 'single_'})), false);
  assert.equal(s(null, row({graceTokenId: null})), false);
  // the same token, confirmed to confirmed (e.g. a note edit)
  assert.equal(s(row(), row()), false);
  // a changed token
  assert.equal(s(row({graceTokenId: 'single_cs_other'}), row()), true);
  assert.equal(s(row({graceTokenId: null}), row()), true);
  // a cancel or a delete
  assert.equal(s(row(), row({status: 'cancelled'})), false);
  assert.equal(s(row(), null), false);
});

test('spendKey: rebookedAt wins over createdAt; Timestamp, Date, number',
    () => {
      const ts = (ms) => ({toMillis: () => ms});
      assert.equal(guard.spendKey({createdAt: ts(100)}), 100);
      assert.equal(guard.spendKey({createdAt: new Date(200)}), 200);
      assert.equal(guard.spendKey({createdAt: 300}), 300);
      assert.equal(guard.spendKey({createdAt: ts(100), rebookedAt: ts(900)}),
          900);
      assert.equal(guard.spendKey({}), Infinity);
    });

test('pickKeeper: attended/noshow, then Calendly, then earliest, then id',
    () => {
      const early = row({id: 'b-early', createdAt: 100});
      const late = row({id: 'a-late', createdAt: 200});
      const cal = row({id: 'cal', createdAt: 900, source: 'calendly'});
      const attended = row({id: 'att', createdAt: 999, status: 'attended'});
      const noshow = row({id: 'ns', createdAt: 50, status: 'noshow'});
      assert.equal(guard.pickKeeper([late, early]).id, 'b-early');
      assert.equal(guard.pickKeeper([early, cal]).id, 'cal');
      assert.equal(guard.pickKeeper([cal, early, attended]).id, 'att');
      assert.equal(guard.pickKeeper([attended, noshow]).id, 'ns');
      const tieA = row({id: 'a', createdAt: 100});
      const tieB = row({id: 'b', createdAt: 100});
      assert.equal(guard.pickKeeper([tieB, tieA]).id, 'a');
      // a re-book with a later rebookedAt loses to an earlier create
      const rebook = row({id: 'rebook', createdAt: 10, rebookedAt: 500});
      const create = row({id: 'create', createdAt: 400});
      assert.equal(guard.pickKeeper([rebook, create]).id, 'create');
      assert.equal(guard.pickKeeper([]), null);
    });

test('planRelease: losers are confirmed non-Calendly non-keepers', () => {
  const keep = row({id: 'k', createdAt: 100});
  const lose = row({id: 'l', createdAt: 200});
  const cancelled = row({id: 'x', createdAt: 50, status: 'cancelled'});
  const cal = row({id: 'cal', createdAt: 300, source: 'calendly'});
  const att = row({id: 'att', createdAt: 400, status: 'attended'});
  let plan = guard.planRelease([lose, keep, cancelled]);
  assert.equal(plan.keeper.id, 'k');
  assert.deepEqual(plan.losers.map((r) => r.id), ['l']);
  assert.deepEqual(plan.stuck, []);
  // one live booking (the other is cancelled): nothing to do
  plan = guard.planRelease([keep, cancelled]);
  assert.equal(plan.keeper.id, 'k');
  assert.deepEqual([plan.losers, plan.stuck], [[], []]);
  // a Calendly row is never cancelled; an attended keeper survives
  plan = guard.planRelease([keep, cal, att]);
  assert.equal(plan.keeper.id, 'att');
  assert.deepEqual(plan.losers.map((r) => r.id), ['k']);
  assert.deepEqual(plan.stuck.map((r) => r.id), ['cal']);
  // two attended rows: the later one cannot be cancelled
  plan = guard.planRelease([att, row({id: 'att2', status: 'noshow',
    createdAt: 500})]);
  assert.deepEqual(plan.losers, []);
  assert.deepEqual(plan.stuck.map((r) => r.id), ['att2']);
  assert.deepEqual(guard.planRelease([]),
      {keeper: null, losers: [], stuck: []});
});

run();
