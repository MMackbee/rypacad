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

// ---- review 2026-11-15 ----------------------------------------------------

test('rolloverPlan: a booking counts by its DATE, whatever periodKey it ' +
    'carries', () => {
  // A household whose anchor moved keeps old keys on its bookings; they
  // still spent this period's tokens.
  const stale = (date) => booking(date, {periodKey: '2026-10-14'});
  const plan = rollover.rolloverPlan(planArgs({bookings: [
    stale('2026-11-05'), stale('2026-11-12'), booking('2026-11-19'),
    // Outside the period by date: not this period's spend.
    booking('2026-12-02', {periodKey: '2026-11-01'}),
  ]}));
  assert.equal(plan.count, 3);
});

const {FieldValue} = require('firebase-admin/firestore');
const DELETE = FieldValue.delete();
/**
 * The stand-in stores a field delete as its sentinel; apply it, so a
 * second run reads the document the way Firestore would return it.
 * @param {!Object} docs The documents.
 */
function applyDeletes(docs) {
  for (const body of Object.values(docs)) {
    for (const k of Object.keys(body)) {
      if (body[k] instanceof FieldValue && body[k].isEqual(DELETE)) {
        delete body[k];
      }
    }
  }
}
const chargeOf = (docs, id) => {
  const b = docs[`bookings/${id}`];
  return [b.chargedFrom, b.graceTokenId || null];
};
const T1 = 'rollover_sam_2026-11-01_1';
const T2 = 'rollover_sam_2026-11-01_2';

test('rolled-over tokens pay first for sessions ALREADY booked in the new ' +
    'month, earliest first', async () => {
  // Booked back in November, so charged to December's own tokens.
  const docs = world({
    'bookings/sam_s7': booking('2026-12-10'),
    'bookings/sam_s8': booking('2026-12-17'),
  });
  const out = await rollover.runTokenRollover({now: DEC_1, db: fakeDb(docs)});
  assert.deepEqual(chargeOf(docs, 'sam_s5'), ['grace', T1]);
  assert.deepEqual(chargeOf(docs, 'sam_s7'), ['grace', T2]);
  assert.deepEqual(chargeOf(docs, 'sam_s8'), ['period', null]);
  // November's own bookings are never touched.
  assert.deepEqual(chargeOf(docs, 'sam_s1'), ['period', null]);
  assert.equal(out.recharged, 2);
  // December now has two more of its own tokens left to roll into January.
  const rows = Object.keys(docs).filter((p) => p.startsWith('bookings/'))
      .map((p) => Object.assign({id: p.split('/')[1]}, docs[p]));
  assert.equal(lib.tokensPosition({pkg: pkg6, tokenPeriod: {granted: 6},
    bookings: rows, waitlist: [], graceTokens: [], periodKey: DEC.periodKey,
    today: '2026-12-01'}).left, 5);
});

test('a token already spent in its own month is not free (rolled early, ' +
    'then used in November)', async () => {
  // Sam used 4 of 6; token 1 was rolled early and paid a NOVEMBER session.
  const docs = world({
    'graceTokens/rollover_sam_2026-11-01_1': {athleteId: 'sam',
      householdId: 'hart', expiresAt: '2026-12-31', reason: 'rollover',
      sourcePeriodKey: '2026-11-01'},
    'bookings/sam_n9': booking('2026-11-27', {chargedFrom: 'grace',
      graceTokenId: T1}),
    'bookings/sam_s7': booking('2026-12-10'),
  });
  const out = await rollover.runTokenRollover({now: DEC_1, db: fakeDb(docs)});
  // Token 1 stays on the November session; only token 2 is free to settle.
  assert.deepEqual(chargeOf(docs, 'sam_n9'), ['grace', T1]);
  assert.deepEqual(chargeOf(docs, 'sam_s5'), ['grace', T2]);
  assert.deepEqual(chargeOf(docs, 'sam_s7'), ['period', null]);
  assert.equal(out.recharged, 1);
});

test('settlePlan: a token held in another period displaces a later holder ' +
    'of the running period, never the other way', () => {
  const tokens = [{id: T1, expiresAt: '2026-12-31'}];
  const dec = Object.assign({id: 'd1'}, booking('2026-12-10',
      {chargedFrom: 'grace', graceTokenId: T1}));
  const nov = Object.assign({id: 'n1'}, booking('2026-11-27',
      {chargedFrom: 'grace', graceTokenId: T1}));
  assert.deepEqual(rollover.settlePlan({tokens, bookings: [dec],
    spends: [nov, dec], period: DEC}), [{bookingId: 'd1', graceTokenId: null}]);
  // Cancelled elsewhere: the token is free again.
  const plain = Object.assign({id: 'd2'}, booking('2026-12-11'));
  assert.deepEqual(rollover.settlePlan({tokens, bookings: [plain],
    spends: [Object.assign({}, nov, {status: 'cancelled'})], period: DEC}),
  [{bookingId: 'd2', graceTokenId: T1}]);
  assert.deepEqual(rollover.settlePlan({tokens, bookings: [plain],
    spends: [nov], period: DEC}), []);
});

test('settling is stable: a second run rewrites nothing', async () => {
  const docs = world({'bookings/sam_s7': booking('2026-12-10')});
  const db = fakeDb(docs);
  await rollover.runTokenRollover({now: DEC_1, db});
  const before = JSON.stringify(docs);
  const out = await rollover.runTokenRollover({
    now: new Date('2026-12-02T06:05:00Z'), db});
  assert.equal(out.recharged, 0);
  assert.equal(JSON.stringify(docs), before);
});

test('a rolled-over token freed by a cancel moves to the next booked ' +
    'session on the next run', async () => {
  const docs = world({
    'bookings/sam_s7': booking('2026-12-10'),
    'bookings/sam_s8': booking('2026-12-17'),
  });
  const db = fakeDb(docs);
  await rollover.runTokenRollover({now: DEC_1, db});
  docs['bookings/sam_s7'].status = 'cancelled';
  const out = await rollover.runTokenRollover({
    now: new Date('2026-12-05T06:05:00Z'), db});
  assert.deepEqual(chargeOf(docs, 'sam_s8'), ['grace', T2]);
  assert.equal(out.recharged, 1);
});

test('only token-paid bookings inside the use-by date are re-charged',
    async () => {
      const docs = world({
        'graceTokens/single_cs_9': {athleteId: 'sam', householdId: 'hart',
          expiresAt: '2027-02-27', reason: 'single-purchase'},
        'bookings/sam_s5': booking('2026-12-03', {comp: true}),
        'bookings/sam_s6': booking('2026-12-04', {status: 'cancelled'}),
        'bookings/sam_s7': booking('2026-12-05', {chargedFrom: 'grace',
          graceTokenId: 'single_cs_9'}),
        'bookings/sam_s8': booking('2026-12-06', {status: 'revoked'}),
        'bookings/sam_s9': booking('2026-12-07', {chargedFrom: 'elite'}),
        // Next month: outside the rolled-over tokens' use-by date.
        'bookings/sam_sa': booking('2027-01-05'),
        'bookings/sam_sb': booking('2026-12-30'),
      });
      const before = ['sam_s5', 'sam_s6', 'sam_s7', 'sam_s8', 'sam_s9',
        'sam_sa'].map((id) => JSON.stringify(docs[`bookings/${id}`]));
      const out = await rollover.runTokenRollover({now: DEC_1,
        db: fakeDb(docs)});
      assert.deepEqual(['sam_s5', 'sam_s6', 'sam_s7', 'sam_s8', 'sam_s9',
        'sam_sa'].map((id) => JSON.stringify(docs[`bookings/${id}`])),
      before);
      assert.deepEqual(chargeOf(docs, 'sam_sb'), ['grace', T1]);
      assert.equal(out.recharged, 1);
    });

test('one rolled-over token on two bookings: the later one is moved to a ' +
    'free token, or back onto the month\'s own', async () => {
  const twice = (date) => booking(date, {chargedFrom: 'grace',
    graceTokenId: T1});
  const docs = world({
    'bookings/sam_s5': twice('2026-12-03'),
    'bookings/sam_s7': twice('2026-12-10'),
    'bookings/sam_s8': twice('2026-12-17'),
  });
  const db = fakeDb(docs);
  const out = await rollover.runTokenRollover({now: DEC_1, db});
  assert.deepEqual(chargeOf(docs, 'sam_s5'), ['grace', T1]);
  assert.deepEqual(chargeOf(docs, 'sam_s7'), ['grace', T2]);
  // No free token left: this one is a December spend after all.
  assert.equal(docs['bookings/sam_s8'].chargedFrom, 'period');
  assert.ok(docs['bookings/sam_s8'].graceTokenId.isEqual(DELETE));
  assert.equal(out.recharged, 2);
  applyDeletes(docs);
  const again = await rollover.runTokenRollover({
    now: new Date('2026-12-02T06:05:00Z'), db});
  assert.equal(again.recharged, 0);
});

test('a family on hold is not settled either', async () => {
  const docs = world({'bookings/sam_s7': booking('2026-12-10')});
  const db = fakeDb(docs);
  await rollover.runTokenRollover({now: DEC_1, db});
  docs['bookings/sam_s5'].status = 'cancelled';
  docs['households/hart'].membership.status = 'past_due';
  const out = await rollover.runTokenRollover({
    now: new Date('2026-12-05T06:05:00Z'), db});
  assert.equal(out.recharged, 0);
  assert.deepEqual(chargeOf(docs, 'sam_s7'), ['grace', T2]);
});

test('January\'s rolled-over tokens never pay for Feb 28 (after the season)',
    async () => {
      const docs = {
        'packages/t-6': pkg6,
        'households/hart': {periodAnchorDay: 1,
          membership: {status: 'active'}},
        'athletes/sam': Object.assign({name: 'Sam Hart'}, paid),
        'tokenPeriods/sam_2027-01-01': {athleteId: 'sam',
          householdId: 'hart', periodKey: '2027-01-01',
          periodEnd: '2027-01-31', granted: 6, source: 'stripe'},
        'bookings/sam_f1': booking('2027-02-28'),
        'bookings/sam_f2': booking('2027-02-27'),
      };
      await rollover.runTokenRollover({
        now: new Date('2027-02-01T06:05:00Z'), db: fakeDb(docs)});
      assert.deepEqual(chargeOf(docs, 'sam_f1'), ['period', null]);
      assert.deepEqual(chargeOf(docs, 'sam_f2'),
          ['grace', 'rollover_sam_2027-01-01_1']);
    });

run();
