'use strict';
// The moveBooking callable (booking changes, 2026-11-11) over a stand-in
// Firestore: one transaction, every read before a write, typed refusals
// that change nothing.
const assert = require('node:assert/strict');
const {FieldValue} = require('firebase-admin/firestore');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const notices = require('./notices');
const {moveBookingHandler, sendMoveReconfirm} = require('./move');

// Noon in Chicago on Tue, Nov 10 2026.
const NOW = new Date('2026-11-10T18:00:00Z');
const OLD_TS = {toMillis: () => 1};
const DELETE = FieldValue.delete();

const session = (date, over) => Object.assign({date, time: '4:00 PM',
  type: 'training', capacity: 12, status: 'scheduled'}, over);
const booking = (athleteId, sessionId, date, over) => ({
  [`bookings/${athleteId}_${sessionId}`]: Object.assign({athleteId,
    sessionId, householdId: 'hart', date, type: 'training',
    status: 'confirmed', periodKey: '2026-11-01', chargedFrom: 'period',
    graceTokenId: null, createdBy: 'u-parent', createdAt: OLD_TS}, over),
});
const samS1 = (over) => booking('sam', 's1', '2026-11-12', over);

/**
 * @param {...!Object} extra Documents to add to (or replace in) the world.
 * @return {!Object} The documents: Sam (household hart, 6 tokens) holds
 *     Thu Nov 12 `s1`; Fri Nov 13 `s2` has room.
 */
function world(...extra) {
  return Object.assign({
    'users/u-parent': {role: 'parent', householdId: 'hart'},
    'users/u-other': {role: 'parent', householdId: 'lopez'},
    'users/u-sam': {role: 'athlete', athleteId: 'sam', householdId: 'hart'},
    'athletes/sam': {name: 'Sam Hart', householdId: 'hart',
      packageId: 't-6', handicap: 4},
    'households/hart': {periodAnchorDay: 1},
    'packages/t-6': {kind: 'tokens', tokens: 6},
    'sessions/s1': session('2026-11-12', {booked: 2}),
    'sessions/s2': session('2026-11-13', {booked: 1}),
  }, samS1(), booking('ava', 's1', '2026-11-12', {householdId: 'lopez'}),
  ...extra);
}
const MOVE = {bookingId: 'sam_s1', toSessionId: 's2'};
const call = (docs, uid, data) => moveBookingHandler(
    data === undefined ? MOVE : data,
    uid === null ? {} : {auth: {uid: uid || 'u-parent'}},
    {db: fakeDb(docs), now: NOW});
const refusedWith = async (promise, code, reason) => {
  let err = null;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  assert.ok(err, `expected a refusal: ${reason}`);
  assert.deepEqual([err.code, err.details && err.details.reason],
      [code, reason]);
};

test('a move is four writes: old cancelled as moved, its seat back, the ' +
    'new row, the new seat', async () => {
  const docs = world();
  const out = await call(docs);
  const old = docs['bookings/sam_s1'];
  assert.deepEqual([old.status, old.cancelReason, old.movedTo,
    old.cancelledBy], ['cancelled', 'moved', 'sam_s2', 'u-parent']);
  assert.ok(old.cancelledAt);
  for (const k of ['cancelCategory', 'cancelNote', 'cancelledVia']) {
    assert.equal(k in old, false, k);
  }
  assert.equal(docs['sessions/s1'].booked, 1);
  const row = docs['bookings/sam_s2'];
  assert.deepEqual([row.status, row.movedFrom, row.createdVia,
    row.createdBy, row.periodKey, row.chargedFrom, row.graceTokenId,
    row.householdId, row.date, row.type, row.athleteId, row.sessionId], [
    'confirmed', 'sam_s1', 'move', 'u-parent', '2026-11-01', 'period', null,
    'hart', '2026-11-13', 'training', 'sam', 's2']);
  assert.equal(docs['sessions/s2'].booked, 2);
  assert.deepEqual(out, {bookingId: 'sam_s2', movedFrom: 'sam_s1',
    sessionId: 's2', periodKey: '2026-11-01', chargedFrom: 'period',
    graceTokenId: null, comp: false, rebooked: false, overrides: []});
});

test('a moved-away row loses a stale reason an older app\'s re-book left ' +
    'on it', async () => {
  const docs = world(samS1({cancelCategory: 'school',
    cancelledVia: 'series'}));
  await call(docs);
  const old = docs['bookings/sam_s1'];
  assert.ok(DELETE.isEqual(old.cancelCategory));
  assert.ok(DELETE.isEqual(old.cancelledVia));
  assert.equal('cancelNote' in old, false);
});

test('onto a row cancelled earlier: replaced whole, so no old cancel or ' +
    'comp field survives', async () => {
  const docs = world(booking('sam', 's2', '2026-11-13', {
    status: 'cancelled', cancelReason: 'member', cancelCategory: 'school',
    cancelledAt: OLD_TS, cancelledBy: 'u-parent', comp: true}));
  const out = await call(docs);
  const row = docs['bookings/sam_s2'];
  for (const k of ['cancelReason', 'cancelCategory', 'cancelNote',
    'cancelledAt', 'cancelledBy', 'comp']) {
    assert.equal(k in row, false, k);
  }
  assert.ok(row.rebookedAt);
  assert.ok(row.createdAt && row.createdAt !== OLD_TS);
  assert.equal(row.status, 'confirmed');
  assert.equal(out.rebooked, true);
});

test('the seat count is the larger of the counter and the roster',
    async () => {
      const docs = world(
          {'sessions/s2': session('2026-11-13', {booked: 0, capacity: 3})},
          booking('kai', 's2', '2026-11-13', {householdId: 'reyes'}),
          booking('ava', 's2', '2026-11-13', {householdId: 'lopez'}));
      await call(docs);
      assert.equal(docs['sessions/s2'].booked, 3);
    });

test('a comp booking stays comp', async () => {
  const docs = world(samS1({comp: true, compNote: 'x'}), {
    'athletes/sam': {name: 'Sam Hart', householdId: 'hart',
      packageId: 't-6', billing: {status: 'pending'}}});
  const out = await call(docs);
  const row = docs['bookings/sam_s2'];
  assert.deepEqual([row.comp, row.compNote, row.chargedFrom,
    row.graceTokenId], [true, 'x', 'period', null]);
  assert.equal(out.comp, true);
});

test('the athlete\'s waitlist entry on the target is removed', async () => {
  const docs = world({'waitlist/s2_sam': {sessionId: 's2', athleteId: 'sam',
    householdId: 'hart', date: '2026-11-13', periodKey: '2026-11-01',
    joinedAt: OLD_TS, createdBy: 'u-parent'}});
  assert.ok(docs['waitlist/s2_sam']);
  await call(docs);
  assert.equal('waitlist/s2_sam' in docs, false);
  assert.equal(docs['bookings/sam_s2'].status, 'confirmed');
});

test('an athlete\'s own login moves its own booking', async () => {
  const docs = world();
  await call(docs, 'u-sam');
  assert.equal(docs['bookings/sam_s1'].cancelledBy, 'u-sam');
  assert.equal(docs['bookings/sam_s2'].createdBy, 'u-sam');
});

test('a refusal changes nothing', async () => {
  const docs = world(
      {'sessions/s2': session('2026-11-13', {capacity: 1, booked: 1})});
  const before = JSON.stringify(docs);
  await refusedWith(call(docs), 'failed-precondition', 'full');
  assert.equal(JSON.stringify(docs), before);
});

test('signed out, bad input, not found, not yours', async () => {
  await refusedWith(call(world(), null), 'unauthenticated', 'signed-out');
  for (const data of [{bookingId: 'a/b', toSessionId: 's2'},
    {bookingId: 'x'.repeat(201), toSessionId: 's2'},
    {bookingId: 'sam_s1'}, {toSessionId: 's2'}, {}, null,
    // Ids Firestore itself rejects: '.', '..' and '__x__'.
    {bookingId: '..', toSessionId: 's2'},
    {bookingId: 'sam_s1', toSessionId: '.'},
    {bookingId: '__x__', toSessionId: 's2'},
    {bookingId: 'sam_s1', toSessionId: '__s2__'}]) {
    await refusedWith(call(world(), 'u-parent', data), 'invalid-argument',
        'bad-request');
  }
  await refusedWith(call(world(), 'u-parent',
      {bookingId: 'nico_s1', toSessionId: 's2'}), 'not-found',
  'booking-missing');
  await refusedWith(call(world(), 'u-other'), 'permission-denied',
      'not-yours');
});

test('a second call for the same booking is refused and moves nothing',
    async () => {
      const docs = world();
      const db = fakeDb(docs);
      const go = () => moveBookingHandler(MOVE, {auth: {uid: 'u-parent'}},
          {db, now: NOW});
      await go();
      const counts = [docs['sessions/s1'].booked, docs['sessions/s2'].booked];
      await refusedWith(go(), 'failed-precondition', 'not-confirmed');
      assert.deepEqual(
          [docs['sessions/s1'].booked, docs['sessions/s2'].booked], counts);
    });

const RECONFIRMED = {athleteId: 'sam', sessionId: 's2', householdId: 'hart',
  status: 'confirmed', createdVia: 'move', createdAt: {toMillis: () => 77}};

test('sendMoveReconfirm: one booking-confirmed notice keyed by the move',
    async () => {
      const docs = world();
      const sent = [];
      await sendMoveReconfirm('sam_s2', RECONFIRMED, {db: fakeDb(docs),
        sendNotice: async (n) => {
          sent.push(n);
        }});
      const copy = notices.bookingConfirmed({athlete: docs['athletes/sam'],
        session: docs['sessions/s2'], booking: RECONFIRMED});
      assert.deepEqual(sent, [{kind: 'booking-confirmed',
        category: 'schedule', householdId: 'hart', athleteId: 'sam',
        sessionId: 's2', bookingId: 'sam_s2', subjectKey: 'sam_s2_move_77',
        title: copy.title, body: copy.body}]);
      assert.match(copy.body, /cancel or move it in the app/);
    });

test('sendMoveReconfirm: a failed send is logged, never thrown',
    async () => {
      const logged = [];
      const error = console.error;
      console.error = (...a) => logged.push(a.join(' '));
      try {
        await sendMoveReconfirm('sam_s2', RECONFIRMED, {db: fakeDb(world()),
          sendNotice: async () => {
            throw new Error('mail down');
          }});
      } finally {
        console.error = error;
      }
      assert.equal(logged.length, 1);
    });

run();
