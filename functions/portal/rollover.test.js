'use strict';
// One-month rollover (owner ruling 2026-11-15): an unused monthly token is
// good for one more month, then gone. The pure plan and the daily job over
// a stand-in Firestore.
//   node portal/rollover.test.js
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const lib = require('./lib');
const rollover = require('./rollover');

const NOV = lib.periodFor('2026-11-10', 1);
const DEC = lib.periodFor('2026-12-10', 1);
const JAN = lib.periodFor('2027-01-10', 1);
const FEB = lib.periodFor('2027-02-10', 1);

// 00:05 in Chicago on Tue, Dec 1 2026.
const DEC_1 = new Date('2026-12-01T06:05:00Z');

test('rollsUntil: November rolls through Dec 31, not into January', () => {
  assert.equal(rollover.rollsUntil(NOV, 1), '2026-12-31');
  assert.equal(rollover.rollsUntil(DEC, 1), '2027-01-31');
});

test('rollsUntil: January rolls to the season end, February not at all',
    () => {
      assert.equal(rollover.rollsUntil(JAN, 1), '2027-02-27');
      assert.equal(rollover.rollsUntil(FEB, 1), null);
    });

test('rollsUntil: nothing before November rolls (starts Dec 1)', () => {
  assert.equal(rollover.rollsUntil(lib.periodFor('2026-10-10', 1), 1), null);
  // An off-anchor period that ends inside November is before the start too.
  assert.equal(rollover.rollsUntil(lib.periodFor('2026-11-10', 21), 21), null);
  assert.equal(rollover.rollsUntil(lib.periodFor('2026-11-25', 21), 21),
      '2027-01-20');
});

test('previousPeriod: the period that ended before today\'s began', () => {
  assert.deepEqual(rollover.previousPeriod('2026-12-01', 1), NOV);
  assert.deepEqual(rollover.previousPeriod('2026-12-31', 1), NOV);
  assert.deepEqual(rollover.previousPeriod('2027-01-01', 1), DEC);
});

test('tokenIdFor / isRolloverTokenId', () => {
  const id = rollover.tokenIdFor('sam', '2026-11-01', 2);
  assert.equal(id, 'rollover_sam_2026-11-01_2');
  assert.equal(rollover.isRolloverTokenId(id), true);
  assert.equal(rollover.isRolloverTokenId('single_cs_1'), false);
  assert.equal(rollover.isRolloverTokenId(null), false);
});

const pkg6 = {kind: 'tokens', tokens: 6};
const paid = {packageId: 't-6', householdId: 'hart',
  billing: {status: 'active'}};
const booking = (date, extra) => Object.assign({athleteId: 'sam', date,
  periodKey: lib.periodFor(date, 1).periodKey, status: 'confirmed',
  chargedFrom: 'period'}, extra || {});
const planArgs = (over) => Object.assign({athlete: paid, household: {},
  pkg: pkg6, tokenPeriod: {granted: 6}, period: NOV, anchorDay: 1,
  today: '2026-12-01',
  bookings: [booking('2026-11-05'), booking('2026-11-12'),
    booking('2026-11-19'), booking('2026-11-24')]}, over || {});

test('rolloverPlan: unused = granted minus the month\'s bookings', () => {
  assert.deepEqual(rollover.rolloverPlan(planArgs()),
      {count: 2, expiresAt: '2026-12-31', skip: null});
});

test('rolloverPlan: cancelled, bonus-paid and free bookings spend nothing',
    () => {
      const plan = rollover.rolloverPlan(planArgs({bookings: [
        booking('2026-11-05'),
        booking('2026-11-06', {status: 'cancelled'}),
        booking('2026-11-07', {chargedFrom: 'grace', graceTokenId: 'g1'}),
        booking('2026-11-08', {comp: true}),
        // A no-show is still a spent token.
        booking('2026-11-09', {status: 'noshow'}),
      ]}));
      assert.equal(plan.count, 4);
    });

test('rolloverPlan: a hand-issued grant rolls like a paid one', () => {
  const plan = rollover.rolloverPlan(planArgs({
    tokenPeriod: {granted: 9, source: 'ops'}}));
  assert.equal(plan.count, 5);
});

test('rolloverPlan: nothing unused, nothing rolls', () => {
  const plan = rollover.rolloverPlan(planArgs({tokenPeriod: {granted: 4}}));
  assert.deepEqual([plan.count, plan.skip], [0, null]);
});

test('rolloverPlan: a month with no issued tokens never rolls the package ' +
    'count', () => {
  const plan = rollover.rolloverPlan(planArgs({tokenPeriod: null,
    bookings: []}));
  assert.deepEqual([plan.count, plan.skip], [0, 'not-issued']);
});

test('rolloverPlan: payment failed, cancelled or unpaid gets nothing', () => {
  for (const status of ['past_due', 'lapsed']) {
    const plan = rollover.rolloverPlan(planArgs({
      household: {membership: {status}}}));
    assert.deepEqual([plan.count, plan.skip], [0, 'not-active'], status);
  }
  for (const status of ['pending', 'lapsed', 'past_due']) {
    const plan = rollover.rolloverPlan(planArgs({
      athlete: Object.assign({}, paid, {billing: {status}})}));
    assert.deepEqual([plan.count, plan.skip], [0, 'not-active'], status);
  }
});

test('rolloverPlan: Elite and the single token do not roll', () => {
  assert.equal(rollover.rolloverPlan(planArgs({
    pkg: {kind: 'elite', tokens: null}})).skip, 'not-monthly');
  assert.equal(rollover.rolloverPlan(planArgs({
    pkg: {kind: 'single', tokens: 1}})).skip, 'not-monthly');
  assert.equal(rollover.rolloverPlan(planArgs({pkg: null})).skip,
      'not-monthly');
});

test('rolloverPlan: February\'s leftovers end with the season', () => {
  const plan = rollover.rolloverPlan(planArgs({period: FEB,
    today: '2027-03-01', bookings: []}));
  assert.deepEqual([plan.count, plan.skip], [0, 'no-rollover']);
});

test('rolloverPlan: a rollover already past its use-by date is not minted',
    () => {
      // January rolls to Feb 27; a run on Feb 28 has nothing left to give.
      const plan = rollover.rolloverPlan(planArgs({period: JAN,
        today: '2027-02-28', bookings: []}));
      assert.deepEqual([plan.count, plan.skip], [0, 'no-rollover']);
    });

/**
 * @param {...!Object} extra Documents to add to the base world.
 * @return {!Object} The documents.
 */
function world(...extra) {
  return Object.assign({
    'packages/t-6': pkg6,
    'packages/elite': {kind: 'elite', tokens: null},
    'households/hart': {periodAnchorDay: 1, membership: {status: 'active'}},
    'athletes/sam': Object.assign({name: 'Sam Hart'}, paid),
    'tokenPeriods/sam_2026-11-01': {athleteId: 'sam', householdId: 'hart',
      periodKey: '2026-11-01', periodEnd: '2026-11-30', granted: 6,
      source: 'stripe'},
    'bookings/sam_s1': booking('2026-11-05'),
    'bookings/sam_s2': booking('2026-11-12'),
    'bookings/sam_s3': booking('2026-11-19'),
    'bookings/sam_s4': booking('2026-11-24'),
    // December bookings are December's business.
    'bookings/sam_s5': booking('2026-12-03'),
  }, ...extra);
}
const minted = (docs) => Object.keys(docs)
    .filter((p) => p.startsWith('graceTokens/')).sort();

test('runTokenRollover: Dec 1 mints November\'s two unused tokens',
    async () => {
      const docs = world();
      const out = await rollover.runTokenRollover({now: DEC_1,
        db: fakeDb(docs)});
      assert.deepEqual(minted(docs), ['graceTokens/rollover_sam_2026-11-01_1',
        'graceTokens/rollover_sam_2026-11-01_2']);
      const token = docs['graceTokens/rollover_sam_2026-11-01_1'];
      assert.deepEqual([token.athleteId, token.householdId, token.expiresAt,
        token.reason, token.sourcePeriodKey, token.sourceSessionId,
        token.createdBy],
      ['sam', 'hart', '2026-12-31', 'rollover', '2026-11-01', null,
        'rollover']);
      assert.ok(token.createdAt);
      assert.deepEqual([out.today, out.minted, out.athletes, out.errors],
          ['2026-12-01', 2, 1, 0]);
    });

test('runTokenRollover: a second run the same month mints nothing more',
    async () => {
      const docs = world();
      const db = fakeDb(docs);
      await rollover.runTokenRollover({now: DEC_1, db});
      // The family spends one rolled-over token, then the job runs again.
      docs['bookings/sam_s6'] = booking('2026-12-08', {chargedFrom: 'grace',
        graceTokenId: 'rollover_sam_2026-11-01_1'});
      const out = await rollover.runTokenRollover({
        now: new Date('2026-12-09T06:05:00Z'), db});
      assert.equal(minted(docs).length, 2);
      assert.equal(out.minted, 0);
    });

test('runTokenRollover: a card fixed on Dec 3 gets the rollover then',
    async () => {
      const docs = world({'households/hart': {periodAnchorDay: 1,
        membership: {status: 'past_due'}}});
      const db = fakeDb(docs);
      await rollover.runTokenRollover({now: DEC_1, db});
      assert.deepEqual(minted(docs), []);
      docs['households/hart'].membership.status = 'active';
      await rollover.runTokenRollover({
        now: new Date('2026-12-04T06:05:00Z'), db});
      assert.equal(minted(docs).length, 2);
    });

test('runTokenRollover: a token handed back late is rolled on the next run',
    async () => {
      const docs = world();
      const db = fakeDb(docs);
      await rollover.runTokenRollover({now: DEC_1, db});
      // Staff cancel a November booking on Dec 2 (token back).
      docs['bookings/sam_s4'].status = 'cancelled';
      await rollover.runTokenRollover({
        now: new Date('2026-12-03T06:05:00Z'), db});
      assert.deepEqual(minted(docs), ['graceTokens/rollover_sam_2026-11-01_1',
        'graceTokens/rollover_sam_2026-11-01_2',
        'graceTokens/rollover_sam_2026-11-01_3']);
    });

test('runTokenRollover: in November nothing is minted (October never rolls)',
    async () => {
      const docs = world({'tokenPeriods/sam_2026-10-01': {athleteId: 'sam',
        householdId: 'hart', periodKey: '2026-10-01',
        periodEnd: '2026-10-31', granted: 6, source: 'ops'}});
      const out = await rollover.runTokenRollover({
        now: new Date('2026-11-20T06:05:00Z'), db: fakeDb(docs)});
      assert.deepEqual(minted(docs), []);
      assert.equal(out.minted, 0);
    });

test('runTokenRollover: Elite, unpaid and package-less athletes are left ' +
    'alone', async () => {
  const docs = world({
    'athletes/eli': {packageId: 'elite', householdId: 'hart',
      billing: {status: 'active'}},
    'athletes/una': {packageId: 't-6', householdId: 'hart',
      billing: {status: 'pending'}},
    'tokenPeriods/una_2026-11-01': {athleteId: 'una', householdId: 'hart',
      periodKey: '2026-11-01', periodEnd: '2026-11-30', granted: 2,
      source: 'ops'},
    'athletes/nop': {householdId: 'hart'},
  });
  await rollover.runTokenRollover({now: DEC_1, db: fakeDb(docs)});
  assert.deepEqual(minted(docs), ['graceTokens/rollover_sam_2026-11-01_1',
    'graceTokens/rollover_sam_2026-11-01_2']);
});

test('runTokenRollover: one athlete\'s failure does not stop the others',
    async () => {
      const docs = world({
        'athletes/amy': Object.assign({}, paid, {householdId: 'gone'}),
        'tokenPeriods/amy_2026-11-01': {athleteId: 'amy',
          householdId: 'gone', periodKey: '2026-11-01',
          periodEnd: '2026-11-30', granted: 6, source: 'stripe'},
      });
      const db = fakeDb(docs);
      const real = db.collection.bind(db);
      db.collection = (name) => {
        const c = real(name);
        if (name !== 'tokenPeriods') return c;
        return Object.assign({}, c, {doc: (id) => {
          if (id.startsWith('amy_')) throw new Error('boom');
          return c.doc(id);
        }});
      };
      const out = await rollover.runTokenRollover({now: DEC_1, db});
      assert.equal(out.errors, 1);
      assert.equal(minted(docs).length, 2);
    });

test('the rolled-over tokens are spent first, soonest use-by date first',
    async () => {
      const docs = world({'graceTokens/single_cs_1': {athleteId: 'sam',
        householdId: 'hart', expiresAt: '2027-02-27',
        reason: 'single-purchase'}});
      await rollover.runTokenRollover({now: DEC_1, db: fakeDb(docs)});
      const graceTokens = Object.keys(docs)
          .filter((p) => p.startsWith('graceTokens/'))
          .map((p) => Object.assign({id: p.split('/')[1]}, docs[p]));
      const position = lib.tokensPosition({pkg: pkg6,
        tokenPeriod: {granted: 6}, bookings: [], waitlist: [], graceTokens,
        periodKey: DEC.periodKey, today: '2026-12-01'});
      const charge = lib.chargeFor({position, sessionDate: '2026-12-08'});
      assert.equal(charge.chargedFrom, 'grace');
      assert.equal(rollover.isRolloverTokenId(charge.graceTokenId), true);
      // In January the November rollover is gone; the month's own tokens pay
      // once the bought token is spent.
      const jan = lib.tokensPosition({pkg: pkg6, tokenPeriod: {granted: 6},
        bookings: [], waitlist: [],
        graceTokens: graceTokens.filter((g) => g.id !== 'single_cs_1'),
        periodKey: JAN.periodKey, today: '2027-01-02'});
      assert.equal(lib.chargeFor({position: jan,
        sessionDate: '2027-01-05'}).chargedFrom, 'period');
    });

run();
