'use strict';
// rollTokenAhead (owner 2026-11-16, the Schmidt case): a family whose next
// month is fully booked uses this month's leftover token on a next-month
// session now, instead of waiting for the 1st. The callable turns one
// leftover token into a rolled-over token early; the booking then spends it
// like any other grace token.
//   node portal/roll-ahead.test.js
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const lib = require('./lib');
const rollover = require('./rollover');
const {decideRollAhead, rollTokenAheadHandler} = require('./roll-ahead');

// Noon in Chicago on Mon, Nov 16 2026.
const NOW = new Date('2026-11-16T18:00:00Z');
const TOKEN_1 = 'rollover_sam_2026-11-01_1';
const TOKEN_2 = 'rollover_sam_2026-11-01_2';

const booking = (id, date, over) => ({[`bookings/sam_${id}`]: Object.assign({
  athleteId: 'sam', sessionId: id, householdId: 'hart', date,
  type: 'training', status: 'confirmed',
  periodKey: lib.periodFor(date, 1).periodKey, chargedFrom: 'period',
}, over)});
const NOV_DAYS = ['03', '11', '17', '18', '24'];
const DEC_DAYS = ['08', '09', '15', '16', '22', '29'];
const month = (m, days) => Object.assign({}, ...days.map(
    (d) => booking(`${m}${d}`, `2026-${m}-${d}`)));

/**
 * @param {...!Object} extra Documents to add to (or replace in) the world.
 * @return {!Object} The documents: Sam (household hart, 6 tokens, a
 *     November record of 6) has used 5 in November and booked all 6 of
 *     December. The Schmidt case of 2026-11-15.
 */
function world(...extra) {
  return Object.assign({
    'users/u-parent': {role: 'parent', householdId: 'hart'},
    'users/u-other': {role: 'parent', householdId: 'lopez'},
    'users/u-sam': {role: 'athlete', athleteId: 'sam', householdId: 'hart'},
    'users/u-owner': {role: 'owner'},
    'athletes/sam': {name: 'Sam Hart', householdId: 'hart',
      packageId: 't-6', billing: {status: 'active'}},
    'households/hart': {periodAnchorDay: 1,
      membership: {status: 'active'}},
    'packages/t-6': {kind: 'tokens', tokens: 6},
    'packages/elite': {kind: 'elite', tokens: null},
    'packages/single': {kind: 'single', tokens: 1},
    'tokenPeriods/sam_2026-11-01': {athleteId: 'sam', householdId: 'hart',
      periodKey: '2026-11-01', periodEnd: '2026-11-30', granted: 6,
      source: 'ops'},
  }, month('11', NOV_DAYS), month('12', DEC_DAYS), ...extra);
}
const ASK = {athleteId: 'sam', date: '2026-12-10'};
const call = (docs, opts) => {
  const o = opts || {};
  return rollTokenAheadHandler(o.data === undefined ? ASK : o.data,
      o.uid === null ? {} : {auth: {uid: o.uid || 'u-parent'}},
      {db: fakeDb(docs), now: o.now || NOW});
};
const graceIds = (docs) => Object.keys(docs)
    .filter((p) => p.startsWith('graceTokens/')).sort();
const refusedWith = async (docs, opts, code, reason) => {
  const before = JSON.stringify(docs);
  await assert.rejects(call(docs, opts), (err) => {
    assert.equal(err.code, code);
    assert.equal(err.details && err.details.reason, reason);
    return true;
  });
  // A refusal writes nothing.
  assert.equal(JSON.stringify(docs), before);
};

test('the Schmidt case: the leftover token is rolled now', async () => {
  const docs = world();
  const out = await call(docs);
  assert.deepEqual(out, {graceTokenId: TOKEN_1, expiresAt: '2026-12-31',
    sourcePeriodKey: '2026-11-01'});
  const token = docs[`graceTokens/${TOKEN_1}`];
  assert.equal(token.athleteId, 'sam');
  assert.equal(token.householdId, 'hart');
  assert.equal(token.expiresAt, '2026-12-31');
  assert.equal(token.reason, rollover.REASON);
  assert.equal(token.sourcePeriodKey, '2026-11-01');
  assert.equal(token.createdBy, 'roll-ahead');
  assert.equal(token.requestedBy, 'u-parent');
  assert.deepEqual(graceIds(docs), [`graceTokens/${TOKEN_1}`]);
});

test('the athlete\'s own login may ask too', async () => {
  const out = await call(world(), {uid: 'u-sam'});
  assert.equal(out.graceTokenId, TOKEN_1);
});

test('a token rolled early is no longer November\'s to spend', async () => {
  const docs = world();
  await call(docs);
  const rows = (prefix) => Object.keys(docs)
      .filter((p) => p.startsWith(prefix))
      .map((p) => Object.assign({id: p.split('/')[1]}, docs[p]));
  const position = lib.tokensPosition({pkg: docs['packages/t-6'],
    tokenPeriod: docs['tokenPeriods/sam_2026-11-01'],
    bookings: rows('bookings/'), waitlist: [],
    graceTokens: rows('graceTokens/'), periodKey: '2026-11-01',
    today: '2026-11-16'});
  assert.equal(position.left, 0);
  assert.equal(position.rolledAhead, 1);
  // The rolled token pays a November session as well as a December one.
  assert.equal(lib.chargeFor({position, sessionDate: '2026-11-20'})
      .graceTokenId, TOKEN_1);
});

test('an unspent rolled token is used before another is rolled', async () => {
  const docs = world();
  delete docs['bookings/sam_1103']; // 4 used: two leftover tokens
  await call(docs);
  await refusedWith(docs, {}, 'failed-precondition', 'not-needed');
});

test('two leftover tokens: the second is rolled once the first is spent',
    async () => {
      const docs = world();
      delete docs['bookings/sam_1103'];
      await call(docs);
      Object.assign(docs, booking('1210', '2026-12-10',
          {chargedFrom: 'grace', graceTokenId: TOKEN_1}));
      const out = await call(docs, {data: {athleteId: 'sam',
        date: '2026-12-11'}});
      assert.equal(out.graceTokenId, TOKEN_2);
      // Both leftovers are out of November now, spent or not.
      await refusedWith(docs, {data: {athleteId: 'sam', date: '2026-12-12'}},
          'failed-precondition', 'none-left');
      Object.assign(docs, booking('1211', '2026-12-11',
          {chargedFrom: 'grace', graceTokenId: TOKEN_2}));
      await refusedWith(docs, {data: {athleteId: 'sam', date: '2026-12-12'}},
          'failed-precondition', 'none-left');
    });

test('nothing left this month: refused', async () => {
  await refusedWith(world(booking('1125', '2026-11-25')), {},
      'failed-precondition', 'none-left');
});

test('a waitlist place holds the last token: refused', async () => {
  await refusedWith(world({'waitlist/s1125_sam': {athleteId: 'sam',
    sessionId: 's1125', householdId: 'hart', date: '2026-11-25',
    periodKey: '2026-11-01'}}), {}, 'failed-precondition', 'none-left');
});

test('next month can still pay for it: refused as not needed', async () => {
  const docs = world();
  delete docs['bookings/sam_1229']; // December: 5 of 6
  await refusedWith(docs, {}, 'failed-precondition', 'not-needed');
});

test('a bonus token covers the date: refused as not needed', async () => {
  await refusedWith(world({'graceTokens/bonus1': {athleteId: 'sam',
    householdId: 'hart', expiresAt: '2026-12-15',
    reason: 'session-cancelled'}}), {}, 'failed-precondition', 'not-needed');
});

test('a spent bonus token does not count as cover', async () => {
  const docs = world({'graceTokens/bonus1': {athleteId: 'sam',
    householdId: 'hart', expiresAt: '2026-12-15',
    reason: 'session-cancelled'}}, booking('1028', '2026-10-28',
      {chargedFrom: 'grace', graceTokenId: 'bonus1'}));
  const out = await call(docs);
  assert.equal(out.graceTokenId, TOKEN_1);
});

test('no November record (the package fallback) never rolls', async () => {
  const docs = world();
  delete docs['tokenPeriods/sam_2026-11-01'];
  await refusedWith(docs, {}, 'failed-precondition', 'not-issued');
});

test('who may ask', async () => {
  await refusedWith(world(), {uid: null}, 'unauthenticated', 'signed-out');
  await refusedWith(world(), {uid: 'u-other'}, 'permission-denied',
      'not-yours');
  await refusedWith(world(), {uid: 'u-nobody'}, 'permission-denied',
      'not-yours');
  // Staff book through staffBookSession, which has its own charge.
  await refusedWith(world(), {uid: 'u-owner'}, 'permission-denied',
      'not-yours');
});

test('bad requests', async () => {
  for (const data of [null, {}, {athleteId: 'sam'}, {date: '2026-12-10'},
    {athleteId: 'a/b', date: '2026-12-10'},
    {athleteId: 'sam', date: '12/10/2026'},
    {athleteId: 'sam', date: 20261210}]) {
    await refusedWith(world(), {data}, 'invalid-argument', 'bad-request');
  }
  await refusedWith(world(), {data: {athleteId: 'nobody',
    date: '2026-12-10'}}, 'not-found', 'athlete-missing');
});

test('only a session in the month that follows', async () => {
  for (const date of ['2026-11-20', '2027-01-05', '2026-11-30']) {
    await refusedWith(world(), {data: {athleteId: 'sam', date}},
        'failed-precondition', 'not-next-period');
  }
  const first = await call(world(), {data: {athleteId: 'sam',
    date: '2026-12-01'}});
  assert.equal(first.graceTokenId, TOKEN_1);
  const docs = world();
  delete docs['bookings/sam_1229'];
  Object.assign(docs, booking('1231', '2026-12-31'));
  const last = await call(docs, {data: {athleteId: 'sam',
    date: '2026-12-31'}});
  assert.equal(last.expiresAt, '2026-12-31');
});

test('a month that does not roll: October, and February', async () => {
  const oct = world({'tokenPeriods/sam_2026-10-01': {athleteId: 'sam',
    periodKey: '2026-10-01', periodEnd: '2026-10-31', granted: 6}});
  await refusedWith(oct, {now: new Date('2026-10-20T18:00:00Z'),
    data: {athleteId: 'sam', date: '2026-11-03'}},
  'failed-precondition', 'no-rollover');
  const feb = world({'tokenPeriods/sam_2027-02-01': {athleteId: 'sam',
    periodKey: '2027-02-01', periodEnd: '2027-02-28', granted: 6}});
  await refusedWith(feb, {now: new Date('2027-02-10T18:00:00Z'),
    data: {athleteId: 'sam', date: '2027-03-02'}},
  'failed-precondition', 'no-rollover');
});

test('January\'s leftover books February up to the season end', async () => {
  const jan = () => world({'tokenPeriods/sam_2027-01-01': {athleteId: 'sam',
    periodKey: '2027-01-01', periodEnd: '2027-01-31', granted: 6},
  'tokenPeriods/sam_2027-02-01': {athleteId: 'sam',
    periodKey: '2027-02-01', periodEnd: '2027-02-28', granted: 0}});
  const now = new Date('2027-01-20T18:00:00Z');
  const out = await call(jan(), {now, data: {athleteId: 'sam',
    date: '2027-02-27'}});
  assert.deepEqual(out, {graceTokenId: 'rollover_sam_2027-01-01_1',
    expiresAt: '2027-02-27', sourcePeriodKey: '2027-01-01'});
  await refusedWith(jan(), {now, data: {athleteId: 'sam',
    date: '2027-02-28'}}, 'failed-precondition', 'not-next-period');
});

test('payment failed, or not a monthly token package: refused', async () => {
  await refusedWith(world({'households/hart': {periodAnchorDay: 1,
    membership: {status: 'past_due'}}}), {}, 'failed-precondition',
  'membership-inactive');
  await refusedWith(world({'athletes/sam': {householdId: 'hart',
    packageId: 't-6', billing: {status: 'pending'}}}), {},
  'failed-precondition', 'membership-inactive');
  await refusedWith(world({'athletes/sam': {householdId: 'hart',
    packageId: 'elite', billing: {status: 'active'}}}), {},
  'failed-precondition', 'not-monthly');
  await refusedWith(world({'athletes/sam': {householdId: 'hart',
    packageId: 'single', billing: {status: 'active', oneTime: true}}}), {},
  'failed-precondition', 'not-monthly');
});

test('Dec 1: the nightly job mints nothing more and leaves the booking',
    async () => {
      const docs = world();
      await call(docs);
      Object.assign(docs, booking('1210', '2026-12-10',
          {chargedFrom: 'grace', graceTokenId: TOKEN_1}));
      const out = await rollover.runTokenRollover({
        now: new Date('2026-12-01T06:05:00Z'), db: fakeDb(docs)});
      assert.deepEqual([out.minted, out.recharged, out.errors], [0, 0, 0]);
      assert.deepEqual(graceIds(docs), [`graceTokens/${TOKEN_1}`]);
      assert.equal(docs['bookings/sam_1210'].graceTokenId, TOKEN_1);
    });

test('Dec 1: a November session cancelled after the early roll still rolls',
    async () => {
      const docs = world();
      await call(docs);
      Object.assign(docs, booking('1210', '2026-12-10',
          {chargedFrom: 'grace', graceTokenId: TOKEN_1}));
      docs['bookings/sam_1124'].status = 'cancelled';
      const out = await rollover.runTokenRollover({
        now: new Date('2026-12-01T06:05:00Z'), db: fakeDb(docs)});
      assert.equal(out.minted, 1);
      assert.deepEqual(graceIds(docs),
          [`graceTokens/${TOKEN_1}`, `graceTokens/${TOKEN_2}`]);
    });

test('decideRollAhead skips an id that is already taken', () => {
  const ctx = {
    user: {role: 'parent', householdId: 'hart'}, athleteId: 'sam',
    athlete: {householdId: 'hart', packageId: 't-6'},
    household: {periodAnchorDay: 1}, pkg: {kind: 'tokens', tokens: 6},
    date: '2026-12-10', now: NOW,
    current: {tokenPeriod: {granted: 6}, periodBookings: [], waitlist: []},
    next: {tokenPeriod: {granted: 0}, periodBookings: [], waitlist: []},
    // _2 exists and is spent; _1 does not exist.
    graceTokens: [{id: TOKEN_2, athleteId: 'sam', reason: 'rollover',
      sourcePeriodKey: '2026-11-01', expiresAt: '2026-12-31'}],
    graceSpends: [{id: 'b1', status: 'confirmed', date: '2026-12-09',
      periodKey: '2026-12-01', graceTokenId: TOKEN_2}],
  };
  const d = decideRollAhead(ctx);
  assert.equal(d.ok, true);
  assert.equal(d.tokenId, TOKEN_1);
});

run();
