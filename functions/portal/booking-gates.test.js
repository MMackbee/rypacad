'use strict';
// The server copies of two client booking gates (owner ruling R4,
// 2026-10-01). The cases are the client's own, from
// frontend/src/portal/data/amendments.test.js and calendar.test.js, so the
// two sides are held to the same answers.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const gates = require('./booking-gates');

const ELITE = {kind: 'elite', tokens: null};
const T12 = {kind: 'tokens', tokens: 12};
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

test('windowMonthsFor: two months for Elite, one for everyone else ' +
    '(owner ruling 2026-11-02)', () => {
  assert.equal(gates.windowMonthsFor(ELITE), 2);
  assert.equal(gates.windowMonthsFor({id: 'elite'}), 2);
  assert.equal(gates.windowMonthsFor(T12), 1);
  assert.equal(gates.windowMonthsFor({kind: 'single', tokens: 1}), 1);
  assert.equal(gates.windowMonthsFor(null), 1);
  // A production doc may still carry the retired field; it changes nothing.
  assert.equal(gates.windowMonthsFor({kind: 'tokens', windowDays: 45}), 1);
  assert.equal(gates.windowMonthsFor({kind: 'elite', windowDays: 30}), 2);
});

test('openThrough: the end of the month N ahead, a further month opening ' +
    'at 7 AM Chicago on the 1st', () => {
  for (const [iso, months, last] of [
    ['2026-11-02T13:00:00Z', 1, '2026-12-31'],
    ['2026-11-02T13:00:00Z', 2, '2027-01-31'],
    ['2026-11-30T23:00:00Z', 1, '2026-12-31'], // Nov 30, 5 PM Chicago
    ['2026-12-01T12:59:00Z', 1, '2026-12-31'], // Dec 1, 6:59 AM: yesterday
    ['2026-12-01T13:00:00Z', 1, '2027-01-31'], // Dec 1, 7 AM: January opens
    ['2026-12-01T13:00:00Z', 2, '2027-02-28'],
    ['2026-10-01T17:00:00Z', 1, '2026-11-30'],
    ['2026-10-01T17:00:00Z', 2, '2026-12-31'],
    ['2027-01-15T18:00:00Z', 2, '2027-03-31'],
  ]) {
    assert.equal(gates.openThrough(new Date(iso), months), last, iso);
  }
});

run();
