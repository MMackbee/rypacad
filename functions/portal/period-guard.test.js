/**
 * The period-token flag (step 1 of the token-cap design, 2026-11-04).
 *   node portal/period-guard.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const lib = require('./lib');
const guard = require('./period-guard');

const DEC = '2026-12-01';
const ts = (ms) => ({toMillis: () => ms});

/**
 * A fresh store: Ada on `packageId`, with the three package docs.
 * @param {string=} packageId Ada's package.
 * @return {{docs: !Object, db: !Object}} The map and the fake.
 */
function world(packageId) {
  const docs = {
    'athletes/ada': {householdId: 'hh',
      packageId: packageId === undefined ? 't-6' : packageId},
    'packages/t-6': {kind: 'tokens', tokens: 6},
    'packages/elite': {kind: 'elite', tokens: null},
    'packages/single': {kind: 'single', tokens: 1},
  };
  return {docs, db: fakeDb(docs)};
}

/**
 * Put Ada's booking `id` in the store and return its body.
 * @param {!Object} docs The map.
 * @param {string} id The booking id.
 * @param {!Object=} over Fields over a confirmed December period booking.
 * @return {!Object} The stored body.
 */
function book(docs, id, over) {
  const day = String(Object.keys(docs).length % 28 + 1).padStart(2, '0');
  const body = Object.assign({athleteId: 'ada', sessionId: id,
    date: `2026-12-${day}`, periodKey: DEC, status: 'confirmed',
    chargedFrom: 'period', createdAt: ts(1000)}, over);
  docs[`bookings/${id}`] = body;
  return body;
}

/**
 * `n` confirmed December bookings b1..bn created at 100, 200, ...
 * @param {!Object} docs The map.
 * @param {number} n How many.
 */
function bookMany(docs, n) {
  for (let i = 1; i <= n; i++) book(docs, `b${i}`, {createdAt: ts(i * 100)});
}

/**
 * The trigger's call for a create of `id` as stored.
 * @param {!Object} w The world.
 * @param {string} id The booking.
 * @param {?Object=} before The body before the write (null: a create).
 * @return {!Promise<!Object>} checkPeriodCap's result.
 */
function check(w, id, before) {
  return guard.checkPeriodCap(w.db, {bookingId: id, before: before || null,
    after: w.docs[`bookings/${id}`], eventMillis: 99999});
}

test('becomesActive: creates and re-books only', () => {
  const s = guard.becomesActive;
  const c = {status: 'confirmed'};
  assert.equal(s(null, c), true);
  assert.equal(s({status: 'cancelled'}, c), true);
  assert.equal(s(null, {status: 'cancelled'}), false);
  assert.equal(s(c, c), false);
  assert.equal(s(c, Object.assign({flag: 'over-cap'}, c)), false);
  assert.equal(s(c, {status: 'attended'}), false);
  assert.equal(s({status: 'attended'}, c), false);
  assert.equal(s({status: 'noshow'}, c), false);
  assert.equal(s(c, {status: 'cancelled'}), false);
  assert.equal(s(c, null), false);
});

test('periodSpends counts what tokensPosition counts as used', () => {
  const rows = [
    {id: 'a', status: 'confirmed', periodKey: DEC},
    {id: 'b', status: 'attended', periodKey: DEC},
    {id: 'c', status: 'noshow', periodKey: DEC},
    {id: 'd', status: 'cancelled', periodKey: DEC},
    {id: 'e', status: 'confirmed', periodKey: DEC, graceTokenId: 'g1'},
    {id: 'f', status: 'confirmed', periodKey: '2026-11-01'},
    {id: 'g', status: 'confirmed', periodKey: DEC, flag: 'over-cadence'},
  ];
  const used = lib.tokensPosition({pkg: {kind: 'tokens', tokens: 6},
    tokenPeriod: null, bookings: rows, waitlist: [], graceTokens: [],
    periodKey: DEC, today: DEC}).used;
  assert.equal(guard.periodSpends(rows, DEC).length, used);
  assert.deepEqual(guard.periodSpends(rows, DEC).map((r) => r.id),
      ['a', 'b', 'c', 'g']);
});

test('the 7th booking on a 6-token month is flagged', async () => {
  const w = world();
  bookMany(w.docs, 7);
  const out = await check(w, 'b7');
  assert.equal(out.outcome, 'flagged');
  assert.deepEqual([out.rank, out.granted, out.used], [7, 6, 7]);
  assert.equal(w.docs['bookings/b7'].flag, 'over-cap');
  assert.ok(w.docs['bookings/b7'].flaggedAt, 'flaggedAt is set');
  // Flag only: nothing is cancelled, no other booking is touched.
  assert.equal(w.docs['bookings/b7'].status, 'confirmed');
  for (let i = 1; i <= 6; i++) {
    assert.equal(w.docs[`bookings/b${i}`].flag, undefined);
  }
});

test('the 6th booking is not flagged', async () => {
  const w = world();
  bookMany(w.docs, 6);
  const out = await check(w, 'b6');
  assert.equal(out.outcome, 'within');
  assert.deepEqual([out.rank, out.granted], [6, 6]);
  assert.equal(w.docs['bookings/b6'].flag, undefined);
  // A Calendly booking stores flag: null when clean - still unflagged.
  const w2 = world();
  bookMany(w2.docs, 5);
  book(w2.docs, 'cal', {createdAt: ts(900), source: 'calendly', flag: null});
  assert.equal((await check(w2, 'cal')).outcome, 'within');
  assert.equal(w2.docs['bookings/cal'].flag, null);
});

test('an ops grant of 7 is respected; the 8th is flagged', async () => {
  const w = world();
  w.docs[`tokenPeriods/ada_${DEC}`] = {granted: 7, source: 'ops'};
  bookMany(w.docs, 8);
  assert.equal((await check(w, 'b7')).outcome, 'within');
  const out = await check(w, 'b8');
  assert.equal(out.outcome, 'flagged');
  assert.deepEqual([out.rank, out.granted], [8, 7]);
  // A lower issued grant (a prorated joiner month) wins over the package.
  const w2 = world();
  w2.docs[`tokenPeriods/ada_${DEC}`] = {granted: 3, source: 'stripe'};
  bookMany(w2.docs, 4);
  assert.equal((await check(w2, 'b4')).outcome, 'flagged');
});

test('a grace booking is ignored and does not count', async () => {
  const w = world();
  bookMany(w.docs, 6);
  book(w.docs, 'grace', {createdAt: ts(50), chargedFrom: 'grace',
    graceTokenId: 'g1'});
  // Charged to a bonus token: not a period spend, never flagged.
  assert.equal((await check(w, 'grace')).outcome, 'grace');
  assert.equal(w.docs['bookings/grace'].flag, undefined);
  // ...and it does not push the 6th period booking past the grant.
  const out = await check(w, 'b6');
  assert.equal(out.outcome, 'within');
  assert.deepEqual([out.rank, out.used], [6, 6]);
});

test('cancelled bookings and other periods are ignored', async () => {
  const w = world();
  book(w.docs, 'gone1', {createdAt: ts(10), status: 'cancelled'});
  book(w.docs, 'gone2', {createdAt: ts(20), status: 'cancelled'});
  book(w.docs, 'nov', {createdAt: ts(30), date: '2026-11-30',
    periodKey: '2026-11-01'});
  bookMany(w.docs, 6);
  const out = await check(w, 'b6');
  assert.equal(out.outcome, 'within');
  assert.deepEqual([out.rank, out.used], [6, 6]);
});

test('a re-book (cancelled -> confirmed) is counted', async () => {
  const w = world();
  bookMany(w.docs, 6);
  // Created first, cancelled, re-booked after the other six: it is the 7th
  // spend even though its createdAt is the oldest.
  const was = book(w.docs, 'old', {createdAt: ts(1), status: 'cancelled'});
  const before = Object.assign({}, was);
  Object.assign(was, {status: 'confirmed', rebookedAt: ts(5000)});
  const out = await check(w, 'old', before);
  assert.equal(out.outcome, 'flagged');
  assert.equal(out.rank, 7);
  assert.equal(w.docs['bookings/old'].flag, 'over-cap');
  // A status-only re-book (no rebookedAt: an older bundle, a script) is
  // dated by the trigger's event time.
  const w2 = world();
  bookMany(w2.docs, 6);
  const was2 = book(w2.docs, 'old', {createdAt: ts(1), status: 'cancelled'});
  const before2 = Object.assign({}, was2);
  was2.status = 'confirmed';
  assert.equal((await check(w2, 'old', before2)).outcome, 'flagged');
  // A re-book that fits the grant stays clean.
  const w3 = world();
  bookMany(w3.docs, 5);
  const was3 = book(w3.docs, 'old', {createdAt: ts(1), status: 'cancelled'});
  const before3 = Object.assign({}, was3);
  Object.assign(was3, {status: 'confirmed', rebookedAt: ts(5000)});
  assert.equal((await check(w3, 'old', before3)).outcome, 'within');
});

test('two racing bookings: only the later createdAt is flagged', async () => {
  const w = world();
  bookMany(w.docs, 5);
  book(w.docs, 'tab-b', {createdAt: ts(901)});
  book(w.docs, 'tab-a', {createdAt: ts(900)});
  // Whichever trigger runs first, the verdicts are the same.
  assert.equal((await check(w, 'tab-b')).outcome, 'flagged');
  assert.equal((await check(w, 'tab-a')).outcome, 'within');
  assert.equal(w.docs['bookings/tab-a'].flag, undefined);
  assert.equal(w.docs['bookings/tab-b'].flag, 'over-cap');
  // The same instant: the id breaks the tie.
  const w2 = world();
  bookMany(w2.docs, 5);
  book(w2.docs, 'x2', {createdAt: ts(900)});
  book(w2.docs, 'x1', {createdAt: ts(900)});
  assert.equal((await check(w2, 'x1')).outcome, 'within');
  assert.equal((await check(w2, 'x2')).outcome, 'flagged');
});

test('an existing flag is kept, never overwritten', async () => {
  const w = world();
  bookMany(w.docs, 6);
  book(w.docs, 'cal', {createdAt: ts(900), source: 'calendly',
    flag: 'over-cadence'});
  assert.equal((await check(w, 'cal')).outcome, 'already-flagged');
  assert.equal(w.docs['bookings/cal'].flag, 'over-cadence');
  // A flag written between the trigger's snapshot and its own write.
  const w2 = world();
  bookMany(w2.docs, 7);
  const seen = Object.assign({}, w2.docs['bookings/b7']);
  w2.docs['bookings/b7'].flag = 'membership-inactive';
  const out = await guard.checkPeriodCap(w2.db,
      {bookingId: 'b7', before: null, after: seen});
  assert.equal(out.outcome, 'flag-kept');
  assert.equal(w2.docs['bookings/b7'].flag, 'membership-inactive');
  assert.equal(w2.docs['bookings/b7'].flaggedAt, undefined);
});

test('Elite, the single token and no package are skipped', async () => {
  for (const [pkg, outcome] of [['elite', 'not-token-package'],
    ['single', 'not-token-package'], ['', 'no-package'],
    ['t-gone', 'not-token-package']]) {
    const w = world(pkg);
    bookMany(w.docs, 9);
    assert.equal((await check(w, 'b9')).outcome, outcome, pkg);
    assert.equal(w.docs['bookings/b9'].flag, undefined, pkg);
  }
});

test('the second invocation after the flag write does nothing', async () => {
  const w = world();
  bookMany(w.docs, 7);
  const before = Object.assign({}, w.docs['bookings/b7']);
  assert.equal((await check(w, 'b7')).outcome, 'flagged');
  // The flag write re-fires onWrite: confirmed -> confirmed. A store that
  // throws on any read proves it does no work at all.
  const untouchable = {collection: () => {
    throw new Error('read');
  }, runTransaction: () => {
    throw new Error('write');
  }};
  const out = await guard.checkPeriodCap(untouchable, {bookingId: 'b7',
    before, after: w.docs['bookings/b7']});
  assert.equal(out.outcome, 'not-a-spend');
  // Nor do a cancel, an attendance mark or a delete.
  for (const after of [Object.assign({}, before, {status: 'cancelled'}),
    Object.assign({}, before, {status: 'attended'}), null]) {
    assert.equal((await guard.checkPeriodCap(untouchable,
        {bookingId: 'b7', before, after})).outcome, 'not-a-spend');
  }
});

test('a malformed booking is skipped without a read', async () => {
  const untouchable = {collection: () => {
    throw new Error('read');
  }};
  const run1 = (after) => guard.checkPeriodCap(untouchable,
      {bookingId: 'x', before: null, after});
  assert.equal((await run1({status: 'confirmed', athleteId: 'ada',
    periodKey: 'december'})).outcome, 'no-period');
  assert.equal((await run1({status: 'confirmed', periodKey: DEC}))
      .outcome, 'no-period');
});

run();
