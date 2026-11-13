'use strict';
// The staffCancelBooking callable (staff cancel, owner approved 2026-11-12)
// over a stand-in Firestore: the owner or ops cancels one household's
// bookings on one session in one transaction; a refusal changes nothing.
// The last cases pin what the booking and session triggers do with a
// 'staff' cancel: no email, no bonus token, no single-token release, and
// no promotion into a session that already happened.

// index.js is loaded for the real cancel trigger. A project id that is no
// real project and an emulator address nothing listens on: no case here
// can reach a real Firestore, and the trigger's own store is swapped for
// the stand-in below.
process.env.GCLOUD_PROJECT = 'demo-staff-cancel';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9';

const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {FieldValue} = require('firebase-admin/firestore');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const lib = require('./lib');
const notify = require('./notify');
const {shouldNoticeMemberCancel, shouldNoticeMoveReconfirm} =
    require('./notify-gates');
const {spendsSingleToken} = require('./single-guard');
const promotion = require('./promotion');
const {staffCancelBookingHandler} = require('./staff-cancel');
const index = require('../index');

const sent = [];
notify.sendNotice = async (args) => {
  sent.push(args);
  return {sent: true};
};

// Noon in Chicago on Thu, Nov 12 2026. Anchor 1: the period is Nov 1-30.
const NOW = new Date('2026-11-12T18:00:00Z');
const OLD_TS = {toMillis: () => 1};
const DELETE = FieldValue.delete();
const STAMP = FieldValue.serverTimestamp();

const session = (date, over) => Object.assign({date, time: '4:00 PM',
  type: 'training', capacity: 12, status: 'scheduled'}, over);
const booking = (athleteId, sessionId, date, over) => ({
  [`bookings/${athleteId}_${sessionId}`]: Object.assign({athleteId,
    sessionId, householdId: 'fox', date, type: 'training',
    status: 'confirmed', periodKey: '2026-11-01', chargedFrom: 'period',
    graceTokenId: null, createdBy: 'u-parent', createdAt: OLD_TS}, over),
});
// Tue Nov 10 at 4 PM: the coach marked each Fox brother No-show.
const noshow = (athleteId, over) => booking(athleteId, 's1', '2026-11-10',
    Object.assign({status: 'noshow', noshowReason: 'Sick'}, over));

/**
 * @param {...!Object} extra Documents to add to (or replace in) the world.
 * @return {!Object} The documents: Jordan, Riley and Casey Fox were No-show
 *     on Tue Nov 10 `s1`; Jordan also holds Tue Nov 17 `s2` and held Oct 27
 *     `s0` (last period); Quinn of another household was on `s1` too.
 */
function world(...extra) {
  sent.length = 0;
  return Object.assign({
    'users/u-owner': {role: 'owner'},
    'users/u-ops': {role: 'ops'},
    'users/u-coach': {role: 'coach'},
    'users/u-phil': {role: 'coach', specialistId: 'phil'},
    'users/u-mental': {role: 'mental'},
    'users/u-parent': {role: 'parent', householdId: 'fox'},
    'users/u-jordan': {role: 'athlete', athleteId: 'jordan',
      householdId: 'fox'},
    'households/fox': {periodAnchorDay: 1},
    'households/lake': {periodAnchorDay: 1},
    'packages/t-6': {kind: 'tokens', tokens: 6},
    'athletes/kai': {name: 'Kai Lake', householdId: 'lake',
      packageId: 't-6'},
    'sessions/s0': session('2026-10-27', {booked: 1}),
    'sessions/s1': session('2026-11-10', {booked: 4}),
    'sessions/s2': session('2026-11-17', {booked: 1}),
  }, noshow('jordan'), noshow('riley'), noshow('casey'),
  booking('quinn', 's1', '2026-11-10', {householdId: 'lake'}),
  booking('jordan', 's2', '2026-11-17'),
  booking('jordan', 's0', '2026-10-27', {periodKey: '2026-10-01'}),
  ...extra);
}
const req = (...bookingIds) => ({bookingIds, category: 'sick'});
const call = (docs, uid, data) => staffCancelBookingHandler(
    data === undefined ? req('jordan_s1') : data,
    uid === null ? {} : {auth: {uid: uid || 'u-owner'}},
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
// A refusal that leaves every document as it was.
const refusedClean = async (docs, uid, data, code, reason) => {
  const before = JSON.stringify(docs);
  await refusedWith(call(docs, uid, data), code, reason);
  assert.equal(JSON.stringify(docs), before, `${reason} wrote something`);
};
const cancelledBy = (row, uid, category, from) => {
  assert.deepEqual([row.status, row.cancelledBy, row.cancelReason,
    row.cancelCategory, row.cancelledFrom], ['cancelled', uid, 'staff',
    category, from]);
  assert.ok(STAMP.isEqual(row.cancelledAt));
};
// The body a trigger sees once the sentinels are applied.
const stored = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (DELETE.isEqual(v)) continue;
    out[k] = STAMP.isEqual(v) ? {toMillis: () => 99} : v;
  }
  return out;
};
const rowsOf = (docs, athleteId) => Object.keys(docs)
    .filter((k) => k.startsWith('bookings/') &&
        docs[k].athleteId === athleteId)
    .map((k) => Object.assign({id: k.slice('bookings/'.length)}, docs[k]));

test('a no-show from earlier this period: cancelled as staff, the seat ' +
    'goes down by one, nothing else moves', async () => {
  const docs = world();
  const out = await call(docs);
  const row = docs['bookings/jordan_s1'];
  cancelledBy(row, 'u-owner', 'sick', 'noshow');
  assert.ok(DELETE.isEqual(row.cancelNote));
  assert.equal('cancelledVia' in row, false);
  assert.equal(row.noshowReason, 'Sick');
  assert.deepEqual([row.chargedFrom, row.periodKey, row.graceTokenId],
      ['period', '2026-11-01', null]);
  assert.equal(docs['sessions/s1'].booked, 3);
  assert.equal(docs['bookings/riley_s1'].status, 'noshow');
  assert.equal(docs['bookings/jordan_s2'].status, 'confirmed');
  assert.deepEqual(out, {sessionId: 's1', cancelled: [{
    bookingId: 'jordan_s1', athleteId: 'jordan', cancelledFrom: 'noshow',
    tokenBack: true}]});
});

test('three brothers on one session in one call: booked goes down by 3',
    async () => {
      const docs = world();
      const out = await call(docs, 'u-owner',
          req('jordan_s1', 'riley_s1', 'casey_s1'));
      for (const a of ['jordan', 'riley', 'casey']) {
        cancelledBy(docs[`bookings/${a}_s1`], 'u-owner', 'sick', 'noshow');
      }
      assert.equal(docs['sessions/s1'].booked, 1);
      assert.equal(docs['bookings/quinn_s1'].status, 'confirmed');
      assert.deepEqual(out.cancelled.map((c) => c.bookingId),
          ['jordan_s1', 'riley_s1', 'casey_s1']);
    });

test('the seat count floors at 0 (one read, one write)', async () => {
  const docs = world({'sessions/s1': session('2026-11-10', {booked: 1})});
  await call(docs, 'u-owner', req('jordan_s1', 'riley_s1', 'casey_s1'));
  assert.equal(docs['sessions/s1'].booked, 0);
});

test('ops cancels an upcoming confirmed booking with Other and its note',
    async () => {
      const docs = world();
      const out = await call(docs, 'u-ops', {bookingIds: ['jordan_s2'],
        category: 'other', note: '  Travel team weekend  '});
      const row = docs['bookings/jordan_s2'];
      cancelledBy(row, 'u-ops', 'other', 'confirmed');
      assert.equal(row.cancelNote, 'Travel team weekend');
      assert.equal(docs['sessions/s2'].booked, 0);
      assert.deepEqual(out.cancelled, [{bookingId: 'jordan_s2',
        athleteId: 'jordan', cancelledFrom: 'confirmed', tokenBack: true}]);
    });

test('a stale cancelledVia and an earlier note are removed; a note sent ' +
    'with another reason is ignored', async () => {
  const docs = world(booking('jordan', 's2', '2026-11-17', {
    cancelledVia: 'series', cancelCategory: 'school', cancelNote: 'old'}));
  await call(docs, 'u-owner', {bookingIds: ['jordan_s2'],
    category: 'injured', note: 'ignored'});
  const row = docs['bookings/jordan_s2'];
  assert.equal(row.cancelCategory, 'injured');
  assert.ok(DELETE.isEqual(row.cancelNote));
  assert.ok(DELETE.isEqual(row.cancelledVia));
});

test('tokenBack: none for a free comp or Elite; a bonus token and a ' +
    'single token come back', async () => {
  const docs = world(
      noshow('jordan', {comp: true, compNote: 'trial'}),
      noshow('riley', {chargedFrom: 'elite'}),
      noshow('casey', {chargedFrom: 'grace', graceTokenId: 'g-casey'}),
      noshow('drew', {comp: true, chargedFrom: 'grace',
        graceTokenId: 'single_cs1'}));
  const out = await call(docs, 'u-owner',
      req('jordan_s1', 'riley_s1', 'casey_s1', 'drew_s1'));
  assert.deepEqual(out.cancelled.map((c) => [c.athleteId, c.tokenBack]), [
    ['jordan', false], ['riley', false], ['casey', true], ['drew', true]]);
  // The charge stays on the row: the return is derived, never written.
  const casey = docs['bookings/casey_s1'];
  assert.deepEqual([casey.chargedFrom, casey.graceTokenId],
      ['grace', 'g-casey']);
  assert.equal(docs['bookings/jordan_s1'].compNote, 'trial');
});

test('the token comes back by derivation: one fewer spend in its period, ' +
    'a bonus token unspent again', async () => {
  const docs = world(
      noshow('casey', {chargedFrom: 'grace', graceTokenId: 'g-casey'}));
  const position = (athleteId) => lib.tokensPosition({
    pkg: docs['packages/t-6'], tokenPeriod: {granted: 2},
    bookings: rowsOf(docs, athleteId), waitlist: [],
    graceTokens: [{id: 'g-casey', expiresAt: '2026-12-05'}],
    periodKey: '2026-11-01', today: '2026-11-12'});
  assert.deepEqual([position('jordan').left, position('casey').grace],
      [0, []]);
  await call(docs, 'u-owner', req('jordan_s1', 'casey_s1'));
  assert.equal(position('jordan').left, 1);
  assert.deepEqual(position('casey').grace,
      [{id: 'g-casey', expiresAt: '2026-12-05'}]);
});

test('the period, not the session start: last period refused, the ' +
    'anchor day decides', async () => {
  await refusedClean(world(), 'u-owner', req('jordan_s0'),
      'failed-precondition', 'period-over');
  // Anchor 15: Oct 14 is in Sep 15 - Oct 14 (over); Oct 15 is in the
  // period that runs to Nov 14 (open, though the session is long past).
  const anchored = (date) => world({'households/fox': {periodAnchorDay: 15},
    'sessions/s1': session(date, {booked: 3})},
  noshow('jordan', {date}));
  await refusedClean(anchored('2026-10-14'), 'u-owner', req('jordan_s1'),
      'failed-precondition', 'period-over');
  const docs = anchored('2026-10-15');
  await call(docs);
  assert.equal(docs['bookings/jordan_s1'].status, 'cancelled');
});

test('signed out and bad requests', async () => {
  await refusedClean(world(), null, req('jordan_s1'), 'unauthenticated',
      'signed-out');
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => `${x}_s1`);
  for (const data of [null, {}, {category: 'sick'},
    {bookingIds: [], category: 'sick'},
    {bookingIds: 'jordan_s1', category: 'sick'},
    {bookingIds: seven, category: 'sick'},
    req('jordan_s1', 'jordan_s1'), req('a/b'), req('..'), req('__x__'),
    req('x'.repeat(201)), req(7), req(''),
    {bookingIds: ['jordan_s1']},
    {bookingIds: ['jordan_s1'], category: 'bored'},
    {bookingIds: ['jordan_s1'], category: 'other'},
    {bookingIds: ['jordan_s1'], category: 'other', note: '   '},
    {bookingIds: ['jordan_s1'], category: 'other', note: 'x'.repeat(141)},
    {bookingIds: ['jordan_s1'], category: 'other', note: 42}]) {
    await refusedClean(world(), 'u-owner', data, 'invalid-argument',
        'bad-request');
  }
  const docs = world();
  await call(docs, 'u-owner', {bookingIds: ['jordan_s1'],
    category: 'other', note: 'x'.repeat(140)});
  assert.equal(docs['bookings/jordan_s1'].cancelNote, 'x'.repeat(140));
});

test('owner and ops only: coach, Phil, mental, parent, athlete and an ' +
    'unknown account are refused', async () => {
  for (const uid of ['u-coach', 'u-phil', 'u-mental', 'u-parent',
    'u-jordan', 'u-nobody']) {
    await refusedClean(world(), uid, req('jordan_s1'), 'permission-denied',
        'not-staff');
  }
  const docs = world();
  await call(docs, 'u-ops');
  assert.equal(docs['bookings/jordan_s1'].cancelledBy, 'u-ops');
});

test('not found, mixed sessions or households', async () => {
  await refusedClean(world(), 'u-owner', req('nobody_s1'), 'not-found',
      'not-found');
  await refusedClean(world(), 'u-owner', req('jordan_s1', 'nobody_s1'),
      'not-found', 'not-found');
  await refusedClean(world(), 'u-owner', req('jordan_s1', 'jordan_s2'),
      'invalid-argument', 'mixed');
  await refusedClean(world(), 'u-owner', req('jordan_s1', 'quinn_s1'),
      'invalid-argument', 'mixed');
});

test('already cancelled, attended, Calendly - and one bad booking ' +
    'cancels none of the others', async () => {
  const PRE = 'failed-precondition';
  await refusedClean(world(noshow('riley', {status: 'cancelled'})),
      'u-owner', req('jordan_s1', 'riley_s1'), PRE, 'already-cancelled');
  await refusedClean(world(noshow('riley', {status: 'attended'})),
      'u-owner', req('jordan_s1', 'riley_s1'), PRE, 'attended');
  await refusedClean(world(noshow('jordan', {status: 'confirmed',
    source: 'calendly'})), 'u-owner', req('jordan_s1'), PRE, 'calendly');
  await refusedClean(world(noshow('jordan', {source: 'calendly'})),
      'u-owner', req('jordan_s1'), PRE, 'calendly');
});

test('a second call for the same booking is refused and moves no seat',
    async () => {
      const docs = world();
      const db = fakeDb(docs);
      const go = () => staffCancelBookingHandler(req('jordan_s1'),
          {auth: {uid: 'u-owner'}}, {db, now: NOW});
      await go();
      assert.equal(docs['sessions/s1'].booked, 3);
      await refusedWith(go(), 'failed-precondition', 'already-cancelled');
      assert.equal(docs['sessions/s1'].booked, 3);
    });

test('a portal 1:1 is refused as mental', async () => {
  const mental = (over) => world(
      {'sessions/m1': session('2026-11-17', {type: 'mental', booked: 1})},
      booking('jordan', 'm1', '2026-11-17', over));
  await refusedClean(mental({type: 'mental'}), 'u-owner', req('jordan_m1'),
      'failed-precondition', 'mental');
  // No type on the row: the session's type decides.
  await refusedClean(mental({type: undefined}), 'u-owner',
      req('jordan_m1'), 'failed-precondition', 'mental');
  // A Calendly row is still Calendly's (the order is kept).
  await refusedClean(mental({type: 'mental', source: 'calendly'}),
      'u-owner', req('jordan_m1'), 'failed-precondition', 'calendly');
});

test('a next-period row cancels with the token back', async () => {
  const docs = world({'sessions/s9': session('2026-12-03', {booked: 1})},
      booking('jordan', 's9', '2026-12-03', {periodKey: '2026-12-01'}));
  const used = () => lib.tokensPosition({pkg: docs['packages/t-6'],
    tokenPeriod: null, bookings: rowsOf(docs, 'jordan'), waitlist: [],
    graceTokens: [], periodKey: '2026-12-01', today: '2026-11-12'}).used;
  assert.equal(used(), 1);
  const out = await call(docs, 'u-owner', req('jordan_s9'));
  assert.equal(out.cancelled[0].tokenBack, true);
  assert.equal(used(), 0);
  assert.equal(docs['sessions/s9'].booked, 0);
});

// ---- what the triggers do with a 'staff' cancel ----

// The cancel trigger reads through index.js's own admin Firestore: point
// that one instance at the stand-in, so a broken gate would reach the
// stubbed sender here instead of any network.
const triggerDocs = {};
admin.firestore().collection = (name) => fakeDb(triggerDocs).collection(name);

test('no email: the cancel trigger and the receipt gate stay silent for a ' +
    'confirmed and a no-show row', async () => {
  const docs = world();
  const before = [docs['bookings/jordan_s2'], docs['bookings/jordan_s1']];
  await call(docs, 'u-owner', req('jordan_s2'));
  await call(docs, 'u-owner', req('jordan_s1'));
  Object.assign(triggerDocs, docs);
  const errors = [];
  const error = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    for (const [i, id] of [[0, 'jordan_s2'], [1, 'jordan_s1']]) {
      const after = stored(docs[`bookings/${id}`]);
      assert.equal(shouldNoticeMemberCancel(after), false);
      assert.equal(shouldNoticeMoveReconfirm(before[i], after), false);
      const out = await index.onBookingCancelled.run({
        before: {exists: true, data: () => before[i]},
        after: {exists: true, data: () => after}},
      {params: {bookingId: id}});
      assert.equal(out, null);
    }
  } finally {
    console.error = error;
  }
  assert.deepEqual([sent, errors], [[], []]);
});

test('no bonus token, no single-token release', async () => {
  const docs = world(noshow('jordan', {chargedFrom: 'grace',
    graceTokenId: 'single_cs1'}));
  const before = docs['bookings/jordan_s1'];
  const keys = Object.keys(docs).filter((k) => k.startsWith('graceTokens/'));
  await call(docs);
  assert.deepEqual(
      Object.keys(docs).filter((k) => k.startsWith('graceTokens/')), keys);
  assert.equal(spendsSingleToken(before,
      stored(docs['bookings/jordan_s1'])), false);
});

test('the seat trigger promotes nobody into a session that already ' +
    'happened; an upcoming seat goes to the waitlist', async () => {
  const wait = (sessionId, date) => ({[`waitlist/${sessionId}_kai`]: {
    sessionId, athleteId: 'kai', householdId: 'lake', date,
    periodKey: '2026-11-01', joinedAt: new Date('2026-11-05T15:00:00Z'),
    createdBy: 'u-lake'}});
  const seat = async (docs, id, sessionId) => {
    const before = docs[`sessions/${sessionId}`];
    await call(docs, 'u-owner', req(id));
    sent.length = 0;
    return promotion.handleSessionUpdate(before, docs[`sessions/${sessionId}`],
        sessionId, {db: fakeDb(docs), now: NOW});
  };
  const past = world(wait('s1', '2026-11-10'),
      {'sessions/s1': session('2026-11-10', {booked: 4, capacity: 4})});
  await seat(past, 'jordan_s1', 's1');
  assert.equal('bookings/kai_s1' in past, false);
  assert.equal('waitlist/s1_kai' in past, true);
  assert.equal(past['sessions/s1'].booked, 3);
  assert.deepEqual(sent, []);

  const soon = world(wait('s2', '2026-11-17'),
      {'sessions/s2': session('2026-11-17', {booked: 1, capacity: 1})});
  await seat(soon, 'jordan_s2', 's2');
  assert.equal(soon['bookings/kai_s2'].status, 'confirmed');
  assert.equal(soon['sessions/s2'].booked, 1);
  assert.deepEqual(sent.map((n) => n.kind), ['promoted']);
});

run();
