'use strict';
// The server copies of two client booking gates (owner ruling R4,
// 2026-10-01). The cases are the client's own, from
// frontend/src/portal/data/amendments.test.js and calendar.test.js, so the
// two sides are held to the same answers.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const gates = require('./booking-gates');

const ELITE = {kind: 'elite', tokens: null, windowDays: 45};
const T12 = {kind: 'tokens', tokens: 12, windowDays: 30};
const b = (type, date, status = 'confirmed') => ({type, date, status});
const DAY = '2026-09-20';

test('eliteDailyCapHit: one training, one Tour event, one Phil a day', () => {
  const hit = (type, rows) => gates.eliteDailyCapHit(ELITE, type, DAY, rows);
  assert.equal(hit('training', [b('training', DAY)]), true);
  assert.equal(hit('tournament', [b('training', DAY)]), false);
  assert.equal(hit('training', [b('tournament', DAY)]), false);
  assert.equal(hit('tournament', [b('tournament', DAY)]), true);
  assert.equal(hit('training', [b('training', '2026-09-21')]), false);
  assert.equal(hit('training', [b('training', DAY, 'cancelled')]), false);
  assert.equal(hit('phil', [b('training', DAY)]), false);
  assert.equal(hit('phil', [b('phil', DAY)]), true);
  assert.equal(hit('training', [b('phil', DAY)]), false);
});

test('eliteDailyCapHit: only Elite, never a mental session', () => {
  assert.equal(gates.eliteDailyCapHit(ELITE, 'mental', DAY,
      [b('mental', DAY)]), false);
  assert.equal(gates.eliteDailyCapHit(T12, 'training', DAY,
      [b('training', DAY)]), false);
  assert.equal(gates.eliteDailyCapHit(null, 'training', DAY,
      [b('training', DAY)]), false);
});

test('windowDaysFor: the package\'s own window, 30 without one', () => {
  assert.equal(gates.windowDaysFor(ELITE), 45);
  assert.equal(gates.windowDaysFor({kind: 'tokens'}), 30);
  assert.equal(gates.windowDaysFor(null), 30);
});

test('openThrough: anchored at Nov 1, then rolls at 7 AM Chicago', () => {
  for (const [iso, days, last] of [
    ['2026-09-30T17:00:00Z', 45, '2026-12-16'],
    ['2026-09-30T17:00:00Z', 30, '2026-12-01'],
    ['2026-10-10T12:00:00Z', 30, '2026-12-01'],
    ['2026-11-01T12:59:00Z', 45, '2026-12-16'],
    ['2026-11-02T12:59:00Z', 45, '2026-12-16'],
    ['2026-11-02T13:00:00Z', 45, '2026-12-17'],
    ['2026-11-10T13:00:00Z', 30, '2026-12-10'],
    ['2026-11-10T12:59:00Z', 30, '2026-12-09'],
  ]) {
    assert.equal(gates.openThrough(new Date(iso), days), last, iso);
  }
});

run();
