'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test, run} = require('./tiny');
const calendly = require('./calendly');

test('overCadence: no cap means never over, whatever the count', () => {
  for (const n of [0, 1, 2, 3, 50]) {
    assert.equal(calendly.overCadence(n, null), false);
    assert.equal(calendly.overCadence(n, undefined), false);
  }
});

test('overCadence: a numeric cap bites at the cap and over it', () => {
  assert.equal(calendly.overCadence(0, 1), false);
  assert.equal(calendly.overCadence(1, 1), true);
  assert.equal(calendly.overCadence(2, 1), true);
  assert.equal(calendly.overCadence(1, 2), false);
  assert.equal(calendly.overCadence(2, 2), true);
  assert.equal(calendly.overCadence(5, 0), true);
});

test('mentalCapFor: no limit for Elite, a token package or no package',
    () => {
      assert.equal(calendly.mentalCapFor({kind: 'elite'}), null);
      assert.equal(calendly.mentalCapFor({kind: 'tokens'}), null);
      assert.equal(calendly.mentalCapFor(null), null);
      assert.deepEqual(calendly.MENTAL_MONTHLY_CAP,
          {elite: null, default: null});
    });

test('MENTAL_MONTHLY_CAP mirrors frontend data/specialists.js', () => {
  const src = fs.readFileSync(path.join(__dirname,
      '../../frontend/src/portal/data/specialists.js'), 'utf8');
  const m = /MENTAL_MONTHLY_CAP = \{ elite: (\w+), default: (\w+) \}/
      .exec(src);
  assert.ok(m, 'MENTAL_MONTHLY_CAP literal not found in specialists.js');
  const lit = (s) => (s === 'null' ? null : Number(s));
  assert.deepEqual(calendly.MENTAL_MONTHLY_CAP,
      {elite: lit(m[1]), default: lit(m[2])});
});

test('the handler flags over-cadence through overCadence()', () => {
  // Only the emulator harness runs the handler, so read the source (as the
  // pin test above does): the call site must use the guarded function.
  const src = fs.readFileSync(path.join(__dirname, 'calendly.js'), 'utf8');
  assert.ok(src.includes('overCadence(mentalThisMonth, mentalCapFor(pkg))'),
      'the handler must call overCadence(mentalThisMonth, mentalCapFor(pkg))');
  assert.ok(!/mentalThisMonths*>=/.test(src),
      'a bare mentalThisMonth >= comparison would flag a null cap');
});

run();
