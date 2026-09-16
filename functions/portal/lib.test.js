/**
 * Unit checks for the period math, the token derivation and the charge
 * order. Plain `node:assert` — the functions codebase has no test runner and
 * this needs none.
 *
 *   node functions/portal/lib.test.js
 *
 * The parity cases below are the ones that must agree with
 * `frontend/src/portal/data/packages.js` (change one, change both): the
 * anchor-15 period, the grace-charged booking that is not a period spend,
 * and the grace-first charge order.
 */

'use strict';

const assert = require('node:assert/strict');
const lib = require('./lib');

const T12 = {id: 't-12', kind: 'tokens', tokens: 12, windowDays: 32};
const ELITE = {id: 'elite', kind: 'elite', tokens: null, windowDays: 45};
const SINGLE = {id: 'single', kind: 'single', tokens: 1, windowDays: 32};

const cases = [];
/**
 * Register one case. Bodies may be async; they run in order below.
 * @param {string} name The case.
 * @param {function()} fn The body.
 */
function test(name, fn) {
  cases.push({name, fn});
}

// --- normalizeAnchorDay -----------------------------------------------------

test('normalizeAnchorDay: absent == 1, clamps to 1..28', () => {
  assert.equal(lib.normalizeAnchorDay(undefined), 1);
  assert.equal(lib.normalizeAnchorDay(null), 1);
  assert.equal(lib.normalizeAnchorDay(0), 1);
  assert.equal(lib.normalizeAnchorDay(15), 15);
  assert.equal(lib.normalizeAnchorDay(31), 28);
  assert.equal(lib.normalizeAnchorDay(15.5), 1);
});

test('anchorDayFromISO: day-of-month clamped (pin H)', () => {
  assert.equal(lib.anchorDayFromISO('2026-09-01'), 1);
  assert.equal(lib.anchorDayFromISO('2026-09-15'), 15);
  assert.equal(lib.anchorDayFromISO('2026-01-31'), 28);
  assert.equal(lib.anchorDayFromISO(''), 1);
});

// --- periodFor --------------------------------------------------------------

test('periodFor: anchor 1 is the calendar month', () => {
  assert.deepEqual(lib.periodFor('2026-09-16', 1),
      {periodKey: '2026-09-01', periodEnd: '2026-09-30'});
});

test('periodFor: anchor 15 straddles the month (packages.js parity)', () => {
  assert.deepEqual(lib.periodFor('2026-09-10', 15),
      {periodKey: '2026-08-15', periodEnd: '2026-09-14'});
  assert.deepEqual(lib.periodFor('2026-09-15', 15),
      {periodKey: '2026-09-15', periodEnd: '2026-10-14'});
  assert.deepEqual(lib.periodFor('2026-09-14', 15),
      {periodKey: '2026-08-15', periodEnd: '2026-09-14'});
});

test('periodFor: year boundary and February', () => {
  assert.deepEqual(lib.periodFor('2027-01-03', 5),
      {periodKey: '2026-12-05', periodEnd: '2027-01-04'});
  assert.deepEqual(lib.periodFor('2027-02-20', 28),
      {periodKey: '2027-01-28', periodEnd: '2027-02-27'});
});

test('periodFor: absent anchor behaves as 1', () => {
  assert.deepEqual(lib.periodFor('2026-11-04'), lib.periodFor('2026-11-04', 1));
});

test('nextPeriod: follows the anchor', () => {
  assert.deepEqual(lib.nextPeriod('2026-08-15', 15),
      {periodKey: '2026-09-15', periodEnd: '2026-10-14'});
});

// --- Chicago dates ----------------------------------------------------------

test('chicagoDateFromUnix: a Stripe period start becomes a local date', () => {
  // 2026-09-16 05:00:00Z is still 2026-09-16 00:00 in Chicago (CDT, -5).
  assert.equal(lib.chicagoDateFromUnix(Date.UTC(2026, 8, 16, 5) / 1000),
      '2026-09-16');
  // 2026-09-16 04:59:59Z is 2026-09-15 23:59 in Chicago — the day before.
  assert.equal(lib.chicagoDateFromUnix(Date.UTC(2026, 8, 16, 4, 59) / 1000),
      '2026-09-15');
  // Winter (CST, -6): 06:00Z is midnight local.
  assert.equal(lib.chicagoDateFromUnix(Date.UTC(2027, 0, 15, 6) / 1000),
      '2027-01-15');
  assert.equal(lib.chicagoDateFromUnix(null), null);
});

test('todayISO: injectable, formats YYYY-MM-DD', () => {
  assert.equal(lib.todayISO(new Date(Date.UTC(2026, 8, 16, 18))), '2026-09-16');
  assert.match(lib.todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});

// --- tokensPosition ---------------------------------------------------------

const PK = '2026-09-01';
const BASE = {
  pkg: T12, tokenPeriod: null, bookings: [], waitlist: [], graceTokens: [],
  periodKey: PK, today: '2026-09-16',
};

/**
 * @param {!Object} over Overrides.
 * @return {!Object} A position.
 */
function position(over) {
  return lib.tokensPosition(Object.assign({}, BASE, over));
}

test('tokensPosition: granted falls back to the package (absent doc)', () => {
  const p = position({});
  assert.equal(p.granted, 12);
  assert.equal(p.left, 12);
  assert.equal(p.unlimited, false);
});

test('tokensPosition: an issued tokenPeriods doc wins over the package', () => {
  assert.equal(position({tokenPeriod: {granted: 6}}).granted, 6);
  assert.equal(position({tokenPeriod: {granted: 0}}).left, 0);
});

test('tokensPosition: used counts non-cancelled bookings in the period', () => {
  const p = position({bookings: [
    {id: 'a', periodKey: PK, status: 'confirmed'},
    {id: 'b', periodKey: PK, status: 'attended'},
    {id: 'c', periodKey: PK, status: 'cancelled'},
    {id: 'd', periodKey: '2026-10-01', status: 'confirmed'},
  ]});
  assert.equal(p.used, 2);
  assert.equal(p.left, 10);
});

test('tokensPosition: a grace-charged booking is not a period spend', () => {
  const p = position({bookings: [
    {id: 'a', periodKey: PK, status: 'confirmed', graceTokenId: 'g1'},
    {id: 'b', periodKey: PK, status: 'confirmed'},
  ]});
  assert.equal(p.used, 1);
  assert.equal(p.left, 11);
});

test('tokensPosition: reserved counts waitlist entries in the period', () => {
  const p = position({waitlist: [
    {id: 'w1', periodKey: PK},
    {id: 'w2', periodKey: PK},
    {id: 'w3', periodKey: '2026-10-01'},
  ]});
  assert.equal(p.reserved, 2);
  assert.equal(p.left, 10);
});

test('tokensPosition: the entry being promoted is not counted twice', () => {
  const p = position({
    pkg: SINGLE,
    waitlist: [{id: 'sess-1_jordan', periodKey: PK}],
    ignoreWaitlistIds: ['sess-1_jordan'],
  });
  assert.equal(p.reserved, 0);
  assert.equal(p.left, 1);
});

test('tokensPosition: grace is unconsumed, unexpired, soonest first', () => {
  const p = position({
    graceTokens: [
      {id: 'g-late', expiresAt: '2026-10-20'},
      {id: 'g-soon', expiresAt: '2026-09-20'},
      {id: 'g-gone', expiresAt: '2026-09-01'},
      {id: 'g-used', expiresAt: '2026-09-18'},
    ],
    bookings: [
      {id: 'b', periodKey: PK, status: 'confirmed', graceTokenId: 'g-used'},
    ],
  });
  assert.deepEqual(p.grace.map((g) => g.id), ['g-soon', 'g-late']);
});

test('tokensPosition: a cancelled booking releases its grace token', () => {
  const p = position({
    graceTokens: [{id: 'g1', expiresAt: '2026-09-30'}],
    bookings: [
      {id: 'b', periodKey: PK, status: 'cancelled', graceTokenId: 'g1'},
    ],
  });
  assert.deepEqual(p.grace.map((g) => g.id), ['g1']);
});

test('tokensPosition: Elite is unlimited, no package is zero', () => {
  const elite = position({pkg: ELITE});
  assert.equal(elite.unlimited, true);
  assert.equal(elite.granted, null);
  assert.equal(elite.left, null);
  const none = position({pkg: null});
  assert.equal(none.unlimited, false);
  assert.equal(none.granted, 0);
  assert.equal(none.left, 0);
});

test('tokensPosition: left floors at 0', () => {
  const p = position({
    pkg: SINGLE,
    bookings: [
      {id: 'a', periodKey: PK, status: 'confirmed'},
      {id: 'b', periodKey: PK, status: 'confirmed'},
    ],
  });
  assert.equal(p.left, 0);
});

// --- chargeFor --------------------------------------------------------------

test('chargeFor: Elite charges nothing', () => {
  assert.deepEqual(
      lib.chargeFor({position: position({pkg: ELITE}),
        sessionDate: '2026-09-20'}),
      {chargedFrom: 'elite', graceTokenId: null, reason: null});
});

test('chargeFor: grace before the period, soonest expiry', () => {
  const p = position({graceTokens: [
    {id: 'g-late', expiresAt: '2026-10-20'},
    {id: 'g-soon', expiresAt: '2026-09-20'},
  ]});
  assert.deepEqual(lib.chargeFor({position: p, sessionDate: '2026-09-18'}),
      {chargedFrom: 'grace', graceTokenId: 'g-soon', reason: null});
});

test('chargeFor: a grace token expiring before the session cannot pay', () => {
  const p = position({graceTokens: [{id: 'g-soon', expiresAt: '2026-09-20'}]});
  assert.deepEqual(lib.chargeFor({position: p, sessionDate: '2026-09-25'}),
      {chargedFrom: 'period', graceTokenId: null, reason: null});
});

test('chargeFor: falls to the period, then refuses', () => {
  assert.equal(
      lib.chargeFor({position: position({}), sessionDate: '2026-09-20'})
          .chargedFrom,
      'period');
  const spent = position({
    pkg: SINGLE,
    bookings: [{id: 'a', periodKey: PK, status: 'confirmed'}],
  });
  assert.deepEqual(lib.chargeFor({position: spent, sessionDate: '2026-09-20'}),
      {chargedFrom: null, graceTokenId: null, reason: 'no-tokens-left'});
});

test('chargeFor: a reservation alone can exhaust the period', () => {
  const p = position({
    pkg: SINGLE,
    waitlist: [{id: 'w1', periodKey: PK}],
  });
  assert.equal(
      lib.chargeFor({position: p, sessionDate: '2026-09-20'}).reason,
      'no-tokens-left');
});

// --- membership -------------------------------------------------------------

test('membershipAllowsBooking: absent == active (pin H)', () => {
  assert.equal(lib.membershipAllowsBooking({}), true);
  assert.equal(lib.membershipAllowsBooking(null), true);
  assert.equal(
      lib.membershipAllowsBooking({membership: {status: 'active'}}), true);
  assert.equal(
      lib.membershipAllowsBooking({membership: {status: 'past_due'}}), false);
  assert.equal(
      lib.membershipAllowsBooking({membership: {status: 'lapsed'}}), false);
});

// --- ids and lookups --------------------------------------------------------

test('ids compose as the data model pins them', () => {
  assert.equal(lib.bookingId('jordan', '2026-09-20-1'), 'jordan_2026-09-20-1');
  assert.equal(lib.waitlistId('2026-09-20-1', 'jordan'),
      '2026-09-20-1_jordan');
  assert.equal(lib.tokenPeriodId('jordan', '2026-09-01'),
      'jordan_2026-09-01');
});

test('householdByCustomer: resolves, or null when unmatched', async () => {
  const fakeDb = (docs) => ({
    collection: () => ({
      where: function() {
        return this;
      },
      limit: function() {
        return this;
      },
      get: async () => ({empty: docs.length === 0, docs}),
    }),
  });
  const hit = await lib.householdByCustomer(
      fakeDb([{id: 'whitfield', data: () => ({name: 'Whitfield family'})}]),
      'cus_123');
  assert.deepEqual(hit, {id: 'whitfield', data: {name: 'Whitfield family'}});
  assert.equal(await lib.householdByCustomer(fakeDb([]), 'cus_nope'), null);
  assert.equal(await lib.householdByCustomer(fakeDb([]), null), null);
});

/**
 * Run every registered case in order and exit non-zero on the first failure.
 * @return {!Promise<void>} Resolves when the suite has run.
 */
async function main() {
  for (const c of cases) {
    try {
      await c.fn();
    } catch (err) {
      console.error(`  FAIL  ${c.name}\n${err && err.stack}`);
      process.exitCode = 1;
      return;
    }
    console.log(`  ok  ${c.name}`);
  }
  console.log(`\n${cases.length} passing`);
}

main();
