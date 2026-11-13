'use strict';
// The staffBookSession callable (staff booking tools, 2026-11-13) over a
// stand-in Firestore: the owner or ops adds one athlete to one session in
// one transaction; the row written whole, the seat counted once, the
// athlete's own waitlist entry removed, and a refusal that changes nothing.

// A project id that is no real project and an emulator address nothing
// listens on: no case here can reach a real Firestore.
process.env.GCLOUD_PROJECT = 'demo-staff-book';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9';

const assert = require('node:assert/strict');
const {FieldValue} = require('firebase-admin/firestore');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const notify = require('./notify');
const promotion = require('./promotion');
const {staffBookSessionHandler} = require('./staff-book');
const {staffCancelBookingHandler} = require('./staff-cancel');

const sent = [];
notify.sendNotice = async (args) => {
  sent.push(args);
  return {sent: true};
};

// Noon in Chicago on Thu, Nov 12 2026. Anchor 1: the period is Nov 1-30.
const NOW = new Date('2026-11-12T18:00:00Z');
const OLD_TS = {toMillis: () => 1};
const STAMP = FieldValue.serverTimestamp();
const PRE = 'failed-precondition';

const session = (date, over) => Object.assign({date, time: '4:00 PM',
  type: 'training', capacity: 12, status: 'scheduled'}, over);
const booking = (athleteId, sessionId, date, over) => ({
  [`bookings/${athleteId}_${sessionId}`]: Object.assign({athleteId,
    sessionId, householdId: 'hh1', date, type: 'training',
    status: 'confirmed', periodKey: '2026-11-01', chargedFrom: 'period',
    graceTokenId: null, createdBy: 'u-parent', createdAt: OLD_TS}, over),
});
const entry = (sessionId, athleteId, date, householdId) => ({
  [`waitlist/${sessionId}_${athleteId}`]: {sessionId, athleteId,
    householdId: householdId || 'hh1', date, periodKey: '2026-11-01',
    joinedAt: new Date('2026-11-05T15:00:00Z'), createdBy: 'u-parent'}});

/**
 * @param {...!Object} extra Documents to add to (or replace in) the world.
 * @return {!Object} The documents: Jordan (hh1, t-6), Riley (hh1, a test
 *     athlete) and Casey (hh2, billing pending); Tue Nov 17 `s2` has 3 of
 *     12 taken.
 */
function world(...extra) {
  sent.length = 0;
  return Object.assign({
    'users/u-owner': {role: 'owner'},
    'users/u-ops': {role: 'ops'},
    'users/u-coach': {role: 'coach'},
    'users/u-parent': {role: 'parent', householdId: 'hh1'},
    'households/hh1': {periodAnchorDay: 1},
    'households/hh2': {periodAnchorDay: 1},
    'packages/t-6': {kind: 'tokens', tokens: 6},
    'packages/single': {kind: 'single', tokens: 1},
    'athletes/jordan': {name: 'Jordan Whitfield', householdId: 'hh1',
      packageId: 't-6', handicap: 4},
    'athletes/riley': {name: 'Riley Whitfield', householdId: 'hh1',
      packageId: 't-6', test: true},
    'athletes/casey': {name: 'Casey Lane', householdId: 'hh2',
      packageId: 't-6', billing: {status: 'pending'}},
    'sessions/s2': session('2026-11-17', {booked: 3}),
  }, ...extra);
}
const ADD = {athleteId: 'jordan', sessionId: 's2'};
const call = (docs, uid, data, db) => staffBookSessionHandler(
    data === undefined ? ADD : data,
    uid === null ? {} : {auth: {uid: uid || 'u-owner'}},
    {db: db || fakeDb(docs), now: NOW});
const caught = async (promise) => {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  return null;
};
const refusedWith = async (promise, code, reason) => {
  const err = await caught(promise);
  assert.ok(err, `expected a refusal: ${reason}`);
  assert.deepEqual([err.code, err.details && err.details.reason],
      [code, reason]);
  return err;
};
const refusedClean = async (docs, uid, data, code, reason) => {
  const before = JSON.stringify(docs);
  const err = await refusedWith(call(docs, uid, data), code, reason);
  assert.equal(JSON.stringify(docs), before, `${reason} wrote something`);
  return err;
};
const CREATED = {athleteId: 'jordan', sessionId: 's2', householdId: 'hh1',
  date: '2026-11-17', type: 'training', status: 'confirmed',
  periodKey: '2026-11-01', chargedFrom: 'period', graceTokenId: null,
  createdBy: 'u-owner', createdVia: 'staff', createdAt: STAMP};

test('the exact document on create', async () => {
  const docs = world();
  const out = await call(docs, 'u-owner',
      {athleteId: 'jordan', sessionId: 's2', householdId: 'hh2'});
  assert.deepEqual(docs['bookings/jordan_s2'], CREATED);
  assert.deepEqual(out, {bookingId: 'jordan_s2', athleteId: 'jordan',
    sessionId: 's2', periodKey: '2026-11-01', chargedFrom: 'period',
    graceTokenId: null, comp: false, rebooked: false, booked: 4,
    capacity: 12, overrides: []});
  assert.equal(docs['sessions/s2'].booked, 4);
  const byOps = world();
  await call(byOps, 'u-ops');
  assert.equal(byOps['bookings/jordan_s2'].createdBy, 'u-ops');
});

test('Free writes comp and spends nothing', async () => {
  const docs = world();
  const out = await call(docs, 'u-owner', Object.assign({free: true}, ADD));
  assert.deepEqual(docs['bookings/jordan_s2'],
      Object.assign({comp: true}, CREATED));
  assert.deepEqual([out.comp, out.chargedFrom, out.graceTokenId],
      [true, 'period', null]);
  const casey = {athleteId: 'casey', sessionId: 's2'};
  await refusedClean(world(), 'u-owner', casey, PRE, 'not-paid');
  const unpaid = world();
  await call(unpaid, 'u-owner', Object.assign({free: true}, casey));
  const row = unpaid['bookings/casey_s2'];
  assert.deepEqual([row.comp, row.householdId, row.chargedFrom],
      [true, 'hh2', 'period']);
});

test('whole-document replace over a cancelled row', async () => {
  const docs = world(booking('jordan', 's2', '2026-11-17', {
    status: 'cancelled', cancelledBy: 'u-parent', cancelReason: 'member',
    cancelCategory: 'sick', cancelNote: 'x', cancelledAt: OLD_TS,
    cancelledFrom: 'confirmed', movedTo: 'jordan_s9', movedFrom: 'jordan_s0',
    noshowReason: 'Sick', comp: true, compBy: 'staff', chargedFrom: 'grace',
    graceTokenId: 'g-old', createdAt: OLD_TS}));
  const out = await call(docs);
  const row = docs['bookings/jordan_s2'];
  assert.deepEqual(Object.keys(row).sort(),
      Object.keys(CREATED).concat(['rebookedAt']).sort());
  assert.ok(STAMP.isEqual(row.rebookedAt));
  assert.equal(row.graceTokenId, null);
  assert.equal(out.rebooked, true);
});

test('the seat count', async () => {
  const live = Object.assign({}, ...['x1', 'x2', 'x3', 'x4', 'x5'].map(
      (a) => booking(a, 's2', '2026-11-17', {householdId: 'hh9'})));
  const low = world({'sessions/s2': session('2026-11-17', {booked: 2})},
      live);
  assert.equal((await call(low)).booked, 6);
  assert.equal(low['sessions/s2'].booked, 6);
  const full = world({'sessions/s2': session('2026-11-17', {booked: 12})});
  const out = await call(full, 'u-owner',
      Object.assign({allowFull: true}, ADD));
  assert.equal(full['sessions/s2'].booked, 13);
  assert.ok(out.overrides.includes('full'));
});

test('the waitlist entry on this session is deleted, no other',
    async () => {
      const docs = world(entry('s2', 'jordan', '2026-11-17'),
          entry('s2', 'casey', '2026-11-17', 'hh2'),
          entry('s5', 'jordan', '2026-11-19'));
      await call(docs);
      assert.equal('waitlist/s2_jordan' in docs, false);
      assert.equal('waitlist/s2_casey' in docs, true);
      assert.equal('waitlist/s5_jordan' in docs, true);
    });

test('an overfill keeps promotion off until a seat really opens',
    async () => {
      const docs = world(
          {'sessions/s2': session('2026-11-17', {booked: 12})},
          {'athletes/casey': {name: 'Casey Lane', householdId: 'hh2',
            packageId: 't-6'}},
          booking('riley', 's2', '2026-11-17'),
          entry('s2', 'casey', '2026-11-17', 'hh2'));
      const db = fakeDb(docs);
      await call(docs, 'u-owner', Object.assign({allowFull: true}, ADD), db);
      assert.equal(docs['sessions/s2'].booked, 13);
      const cancel = async (bookingId) => {
        const before = docs['sessions/s2'];
        await staffCancelBookingHandler(
            {bookingIds: [bookingId], category: 'sick'},
            {auth: {uid: 'u-owner'}}, {db, now: NOW});
        sent.length = 0;
        await promotion.handleSessionUpdate(before, docs['sessions/s2'],
            's2', {db, now: NOW});
      };
      await cancel('riley_s2');
      assert.equal(docs['sessions/s2'].booked, 12);
      assert.equal('bookings/casey_s2' in docs, false);
      assert.equal('waitlist/s2_casey' in docs, true);
      assert.deepEqual(sent, []);
      // Not vacuous: the next cancel really opens a seat.
      await cancel('jordan_s2');
      assert.equal(docs['bookings/casey_s2'].status, 'confirmed');
      assert.equal('waitlist/s2_casey' in docs, false);
      assert.deepEqual(sent.map((n) => n.kind), ['promoted']);
    });

test('an anchor-15 household spends the session\'s own period',
    async () => {
      const rows = ['2026-11-17', '2026-11-19', '2026-11-24', '2026-12-01',
        '2026-12-03'].map((date) => booking('jordan', `d${date.slice(5)}`,
          date, {periodKey: '2026-11-15'}));
      const anchored = (...extra) => world(
          {'households/hh1': {periodAnchorDay: 15}},
          {'sessions/s16': session('2026-11-16', {booked: 0})},
          ...rows, ...extra);
      const add = {athleteId: 'jordan', sessionId: 's16'};
      const docs = anchored();
      const out = await call(docs, 'u-owner', add);
      assert.deepEqual([out.chargedFrom, out.periodKey],
          ['period', '2026-11-15']);
      // Only a read over Nov 15 - Dec 14 sees the December rows.
      await refusedClean(anchored(booking('jordan', 'd12-08', '2026-12-08',
          {periodKey: '2026-11-15'})), 'u-owner', add, PRE,
      'no-tokens-left');
    });

test('every refusal writes nothing', async () => {
  const six = Object.assign({}, ...['02', '03', '04', '05', '06', '09'].map(
      (d) => booking('jordan', `n${d}`, `2026-11-${d}`)));
  const s2 = (over, date) => ({'sessions/s2': session(date || '2026-11-17',
      Object.assign({booked: 3}, over))});
  const jordan = (over) => ({'athletes/jordan': Object.assign({
    name: 'Jordan Whitfield', householdId: 'hh1', packageId: 't-6'}, over)});
  const cases = [
    ['u-coach', ADD, {}, 'permission-denied', 'not-staff'],
    ['u-owner', {athleteId: 'nobody', sessionId: 's2'}, {},
      'not-found', 'athlete-missing'],
    ['u-owner', ADD, jordan({householdId: undefined}), PRE, 'no-household'],
    ['u-owner', ADD, jordan({householdId: 'hh7'}), PRE, 'no-household'],
    ['u-owner', {athleteId: 'riley', sessionId: 's2'}, {}, PRE,
      'test-athlete'],
    ['u-owner', ADD, {'households/hh1': {test: true}}, PRE, 'test-athlete'],
    ['u-owner', {athleteId: 'jordan', sessionId: 'nope'}, {}, PRE,
      'session-missing'],
    ['u-owner', ADD, s2({type: 'mental'}), PRE, 'calendly'],
    ['u-owner', ADD, s2({source: 'calendly'}), PRE, 'calendly'],
    ['u-owner', ADD, s2({status: 'cancelled'}), PRE, 'session-cancelled'],
    ['u-owner', ADD, s2({hidden: true}), PRE, 'session-hidden'],
    ['u-owner', ADD, s2({bookable: false}), PRE, 'display-only'],
    ['u-owner', ADD, s2({}, '2026-10-27'), PRE, 'period-over'],
    ['u-owner', ADD, booking('jordan', 's2', '2026-11-17',
        {status: 'noshow'}), PRE, 'already-booked'],
    ['u-owner', {athleteId: 'casey', sessionId: 's2'}, {}, PRE, 'not-paid'],
    ['u-owner', ADD, six, PRE, 'no-tokens-left'],
    ['u-owner', ADD, jordan({packageId: 'single'}), PRE, 'no-session-token'],
    ['u-owner', ADD, s2({booked: 12}), PRE, 'full'],
  ];
  for (const [uid, data, extra, code, reason] of cases) {
    const err = await refusedClean(world(extra), uid, data, code, reason);
    if (reason === 'full') {
      assert.deepEqual(err.details, {reason: 'full', taken: 12,
        capacity: 12});
    }
  }
});

test('signed out and bad requests', async () => {
  await refusedClean(world(), null, ADD, 'unauthenticated', 'signed-out');
  for (const data of [{}, null, {athleteId: 'a/b', sessionId: 's2'},
    {athleteId: 'jordan', sessionId: 's2', free: 'yes'},
    {athleteId: 'jordan', sessionId: 's2', allowFull: 1}]) {
    await refusedClean(world(), 'u-owner', data, 'invalid-argument',
        'bad-request');
  }
});

test('a caller who is not staff reads nothing past users', async () => {
  const docs = world();
  const inner = fakeDb(docs);
  const paths = [];
  const db = Object.assign({}, inner, {
    runTransaction: (fn) => inner.runTransaction((tx) => fn(
        Object.assign({}, tx, {get: (target) => {
          paths.push(target.path || 'query');
          return tx.get(target);
        }}))),
  });
  await refusedWith(call(docs, 'u-coach', ADD, db), 'permission-denied',
      'not-staff');
  assert.deepEqual(paths, ['users/u-coach']);
});

test('a second call is refused and writes nothing', async () => {
  const docs = world();
  const db = fakeDb(docs);
  await call(docs, 'u-owner', ADD, db);
  const row = JSON.stringify(docs['bookings/jordan_s2']);
  assert.equal(docs['sessions/s2'].booked, 4);
  await refusedWith(call(docs, 'u-owner', ADD, db), PRE, 'already-booked');
  assert.equal(docs['sessions/s2'].booked, 4);
  assert.equal(JSON.stringify(docs['bookings/jordan_s2']), row);
});

test('one log line of ids', async () => {
  const calls = [];
  const log = console.log;
  console.log = (...a) => calls.push(a);
  try {
    await call(world());
  } finally {
    console.log = log;
  }
  assert.deepEqual(calls, [['staff booking', JSON.stringify({action: 'add',
    by: 'u-owner', role: 'owner', athleteId: 'jordan', sessionId: 's2',
    chargedFrom: 'period', comp: false, overrides: []})]]);
  assert.doesNotMatch(calls[0][1], /Whitfield|Jordan/);
});

run();
