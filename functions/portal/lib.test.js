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
 * the grace-first charge order, and the single token (rulings 2026-09-29/30:
 * periodFallback 0, perPurchase, held, graceSpends).
 */

'use strict';

const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const lib = require('./lib');

const T12 = {id: 't-12', kind: 'tokens', tokens: 12, windowDays: 30};
const ELITE = {id: 'elite', kind: 'elite', tokens: null, windowDays: 45};
const SINGLE = {id: 'single', kind: 'single', tokens: 1, windowDays: 30};
// A one-token PERIOD package. The cases below that were written against the
// single token when it was a one-token period package (pre 2026-09-29) now
// use this, with the same intent: the single token grants no period token.
const ONE = {id: 'one', kind: 'tokens', tokens: 1, windowDays: 30};


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
    pkg: ONE,
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
    pkg: ONE,
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
    pkg: ONE,
    bookings: [{id: 'a', periodKey: PK, status: 'confirmed'}],
  });
  assert.deepEqual(lib.chargeFor({position: spent, sessionDate: '2026-09-20'}),
      {chargedFrom: null, graceTokenId: null, reason: 'no-tokens-left'});
});

test('chargeFor: a reservation alone can exhaust the period', () => {
  const p = position({
    pkg: ONE,
    waitlist: [{id: 'w1', periodKey: PK}],
  });
  assert.equal(
      lib.chargeFor({position: p, sessionDate: '2026-09-20'}).reason,
      'no-tokens-left');
});

// --- single token (owner rulings 2026-09-29/30) -----------------------------

const SEASON = {id: 'single_cs_a', expiresAt: '2027-02-27'};
const SEASON_2 = {id: 'single_cs_b', expiresAt: '2027-02-27'};
const BONUS = {id: 'jordan_sess-9', expiresAt: '2026-10-15'};
const ids = (p) => p.grace.map((g) => g.id);
const charge = (p, sessionDate) => lib.chargeFor({position: p, sessionDate});
const pick = (p) => [p.granted, p.left, p.perPurchase, p.held];

test('periodFallback: 0 for the single token, the package tokens else', () => {
  assert.deepEqual([SINGLE, T12, ONE, null, {kind: 'tokens'}]
      .map(lib.periodFallback), [0, 12, 1, 0, 0]);
});

test('single: no doc grants nothing; an ops doc (granted 1) wins', () => {
  const none = position({pkg: SINGLE});
  assert.deepEqual(pick(none), [0, 0, true, 0]);
  assert.equal(charge(none, '2026-09-20').reason, 'no-tokens-left');
  assert.deepEqual(pick(position({pkg: SINGLE, tokenPeriod: {granted: 1}})),
      [1, 1, true, 0]);
});

test('single: an unexpired purchased token pays as grace', () => {
  assert.deepEqual(charge(position({pkg: SINGLE, graceTokens: [SEASON]}),
      '2026-12-02'),
  {chargedFrom: 'grace', graceTokenId: 'single_cs_a', reason: null});
});

test('single: a spend in another period (graceSpends) consumes it', () => {
  const other = {id: 'sol_nov20', periodKey: '2026-11-01',
    status: 'confirmed', graceTokenId: 'single_cs_a'};
  const at = (spend) => position({pkg: SINGLE, periodKey: '2026-12-01',
    today: '2026-11-25', graceTokens: [SEASON], graceSpends: [spend]});
  assert.deepEqual(ids(at(other)), []);
  assert.equal(charge(at(other), '2026-12-02').reason, 'no-tokens-left');
  assert.deepEqual(ids(at(Object.assign({}, other, {status: 'cancelled'}))),
      ['single_cs_a']);
});

test('single: each waitlist entry holds the latest-expiring token', () => {
  const entry = [{id: 'sess-2_jordan', periodKey: '2026-10-01'}];
  const p = position({pkg: SINGLE, graceTokens: [SEASON, BONUS],
    waitlist: entry});
  assert.equal(p.held, 1);
  // The soonest-expiring bonus stays offered before a season token.
  assert.deepEqual(ids(p), ['jordan_sess-9']);
  assert.equal(charge(p, '2026-09-20').graceTokenId, 'jordan_sess-9');
  assert.equal(position({pkg: SINGLE, graceTokens: [SEASON, SEASON_2],
    waitlist: entry}).grace.length, 1);
  const allHeld = position({pkg: SINGLE, graceTokens: [SEASON],
    waitlist: entry});
  assert.deepEqual(ids(allHeld), []);
  assert.equal(charge(allHeld, '2026-09-20').reason, 'no-tokens-left');
});

test('single: the entry being promoted holds nothing', () => {
  const p = position({pkg: SINGLE, graceTokens: [SEASON],
    waitlist: [{id: 'sess-1_jordan', periodKey: PK}],
    ignoreWaitlistIds: ['sess-1_jordan']});
  assert.equal(p.held, 0);
  assert.deepEqual(ids(p), ['single_cs_a']);
});

test('monthly: held is 0 and reserved is unchanged', () => {
  const waitlist = [{id: 'w1', periodKey: PK}, {id: 'w2', periodKey: PK}];
  const p = position({pkg: T12, graceTokens: [BONUS], waitlist});
  assert.deepEqual([p.perPurchase, p.held, p.reserved, p.left, ids(p)],
      [false, 0, 2, 10, ['jordan_sess-9']]);
  const elite = position({pkg: ELITE, waitlist});
  assert.deepEqual([elite.perPurchase, elite.held], [false, 0]);
});

test('graceSpendQueries: unexpired ids only, chunks of 30, [] when none',
    () => {
      const calls = [];
      const db = {collection: (name) => ({where: (...w) => {
        calls.push([name, ...w]);
        return {name, w};
      }})};
      const today = '2026-11-25';
      assert.equal(lib.graceSpendQueries(db, [SEASON,
        {id: 'old_bonus', expiresAt: '2026-11-01'},
        {id: 'single_cs_void', expiresAt: '2000-01-01'},
        {id: 'no_expiry'}], today).length, 1);
      assert.deepEqual(calls,
          [['bookings', 'graceTokenId', 'in', ['single_cs_a', 'no_expiry']]]);
      assert.deepEqual(lib.graceSpendQueries(db, [], today), []);
      assert.deepEqual(lib.graceSpendQueries(db,
          [{id: 'single_cs_void', expiresAt: '2000-01-01'}], today), []);
      calls.length = 0;
      const many = Array.from({length: 31},
          (_, i) => ({id: `single_cs_${i}`, expiresAt: '2027-02-27'}));
      assert.equal(lib.graceSpendQueries(db, many, today).length, 2);
      assert.deepEqual(calls.map((c) => c[3].length), [30, 1]);
    });

test('readGraceSpends: flattens every query through the reader', async () => {
  const snap = (id, g) => ({docs: [{id, data: () => ({graceTokenId: g})}]});
  const out = await lib.readGraceSpends(async (q) => q === 'q1' ?
      snap('b1', 'single_cs_a') : snap('b2', 'single_cs_b'), ['q1', 'q2']);
  assert.deepEqual(out, [{id: 'b1', graceTokenId: 'single_cs_a'},
    {id: 'b2', graceTokenId: 'single_cs_b'}]);
  assert.deepEqual(await lib.readGraceSpends(async () => null, []), []);
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
  const ref = {path: 'households/whitfield'};
  const doc = {id: 'whitfield', ref, data: () => ({name: 'Whitfield family'})};
  const hit = await lib.householdByCustomer(fakeDb([doc]), 'cus_123');
  assert.deepEqual(hit,
      {id: 'whitfield', data: {name: 'Whitfield family'}, ref});
  assert.equal(await lib.householdByCustomer(fakeDb([]), 'cus_nope'), null);
  assert.equal(await lib.householdByCustomer(fakeDb([]), null), null);
});

// --- Sprint 20 launch helpers ----------------------------------------------

test('chicagoTime: h:mm AM/PM with a plain U+0020 (sync parity)', () => {
  assert.equal(lib.chicagoTime(new Date('2026-10-14T21:00:00Z')), '4:00 PM');
  assert.equal(lib.chicagoTime(new Date('2026-12-02T15:30:00Z')), '9:30 AM');
  assert.equal(lib.chicagoTime(new Date('2026-10-14T21:00:00Z')).charCodeAt(4),
      32);
});

test('bookingOpen: gate at BOOKING_OPENS_AT, Elite exempt', () => {
  assert.equal(lib.BOOKING_OPENS_AT, 1791633600000);
  assert.equal(lib.bookingOpen(1791633600000 - 1, T12), false);
  assert.equal(lib.bookingOpen(1791633600000, T12), true);
  assert.equal(lib.bookingOpen(new Date(1791633600000 - 1), ELITE), true);
  assert.equal(lib.bookingOpen(1791633600000 - 1, null), false);
});

test('ageAt: whole years, birthday-aware, null when unparseable', () => {
  assert.equal(lib.ageAt('2008-09-28', '2026-09-28'), 18);
  assert.equal(lib.ageAt('2008-09-29', '2026-09-28'), 17);
  assert.equal(lib.ageAt('2013-02-01', '2026-09-28'), 13);
  assert.equal(lib.ageAt('nope', '2026-09-28'), null);
  assert.equal(lib.ageAt(null, '2026-09-28'), null);
});

test('membershipAllowsBooking: athlete billing gates too (absent == active)',
    () => {
      assert.equal(lib.membershipAllowsBooking({}, {}), true);
      assert.equal(lib.membershipAllowsBooking({}, null), true);
      assert.equal(lib.membershipAllowsBooking({},
          {billing: {status: 'active'}}), true);
      assert.equal(lib.membershipAllowsBooking({},
          {billing: {status: 'pending'}}), false);
      assert.equal(lib.membershipAllowsBooking({membership: {status: 'lapsed'}},
          {billing: {status: 'active'}}), false);
    });

test('membershipAllowsBooking: one-time billing books only on single', () => {
  const oneTime = {status: 'active', oneTime: true};
  assert.equal(lib.membershipAllowsBooking({},
      {packageId: 'single', billing: oneTime}), true);
  assert.equal(lib.membershipAllowsBooking({},
      {packageId: 't-6', billing: oneTime}), false);
  assert.equal(lib.membershipAllowsBooking({},
      {packageId: 'elite', billing: oneTime}), false);
  assert.equal(lib.membershipAllowsBooking({},
      {packageId: 't-6', billing: {status: 'active', oneTime: false}}), true);
});

run();
