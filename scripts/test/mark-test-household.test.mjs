import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, planWrites, refusal } from '../mark-test-household.mjs';

test('parseArgs: a household id and exactly one of --dry-run | --yes', () => {
  assert.deepEqual(parseArgs(['--prod', '--household', 'abc123', '--dry-run']), { prod: true, householdId: 'abc123', dryRun: true, yes: false });
  assert.ok(parseArgs(['--household', 'abc123']).error);
  assert.ok(parseArgs(['--household', 'abc123', '--dry-run', '--yes']).error);
  assert.ok(parseArgs(['--dry-run']).error);
  assert.ok(parseArgs(['--household', 'bad/id', '--yes']).error);
  assert.ok(parseArgs(['--wat']).error);
});

test('refusal: a real-looking household is never flagged', () => {
  assert.match(refusal(null, [], 0), /No such household/);
  assert.match(refusal({ stripeSubscriptionId: 'sub_1' }, [], 0), /Stripe subscription/);
  assert.match(refusal({}, [{ id: 'a', name: 'Kid', billing: { status: 'active', subscriptionId: 'sub_2' } }], 0), /active paid subscription/);
  assert.match(refusal({}, [], 2), /2 confirmed booking/);
  assert.equal(refusal({ name: 'XXMackbee family' }, [{ id: 'a', billing: { status: 'pending', subscriptionId: null } }], 0), null);
  assert.equal(refusal({}, [{ id: 'a' }], 0), null);
});

test('planWrites: one merge of test: true per doc, each requiring the doc to exist', () => {
  const writes = planWrites('hh1', [{ id: 'ath1' }, { id: 'ath2' }]);
  assert.equal(writes.length, 3);
  assert.match(writes[0].update.name, /\/documents\/households\/hh1$/);
  assert.match(writes[1].update.name, /\/documents\/athletes\/ath1$/);
  for (const w of writes) {
    assert.deepEqual(w.update.fields, { test: { booleanValue: true } });
    assert.deepEqual(w.updateMask, { fieldPaths: ['test'] });
    assert.deepEqual(w.currentDocument, { exists: true });
  }
});
