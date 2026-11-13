'use strict';
// moveBooking's staff mode (staff booking tools, 2026-11-13) over a
// stand-in Firestore: the owner or ops moves any family's confirmed or
// No-show booking inside the open period, the skipped family limits come
// back as overrides, a full target needs allowFull, payment never changes,
// and a family caller gets exactly today's move.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const {moveBookingHandler} = require('./move');
const {decideMove} = require('./move-decide');
const {staffAthleteRefusal, staffOldRefusal, staffTargetRefusal} =
    require('./move-staff');

// Noon in Chicago on Thu, Nov 12 2026. Anchor 1: the period is Nov 1-30.
const NOW = new Date('2026-11-12T18:00:00Z');
const OLD_TS = {toMillis: () => 1};
const PRE = 'failed-precondition';
const T6 = {kind: 'tokens', tokens: 6};
const ELITE = {kind: 'elite', tokens: null};

const session = (date, over) => Object.assign({date, time: '4:00 PM',
  type: 'training', capacity: 12, status: 'scheduled'}, over);
const booking = (athleteId, sessionId, date, over) => ({
  [`bookings/${athleteId}_${sessionId}`]: Object.assign({athleteId,
    sessionId, householdId: 'hh1', date, type: 'training',
    status: 'confirmed', periodKey: `${date.slice(0, 8)}01`,
    chargedFrom: 'period', graceTokenId: null, createdBy: 'u-parent',
    createdAt: OLD_TS}, over),
});
const jordan = (over) => ({'athletes/jordan': Object.assign({
  name: 'Jordan Whitfield', householdId: 'hh1', packageId: 't-6',
  handicap: 4}, over)});

// A pure decideMove ctx: Jordan's Fri Nov 13 training to Tue Nov 17.
const old = (over) => Object.assign({id: 'jordan_s1', athleteId: 'jordan',
  sessionId: 's1', householdId: 'hh1', date: '2026-11-13', type: 'training',
  status: 'confirmed', periodKey: '2026-11-01', chargedFrom: 'period',
  graceTokenId: null}, over);
const withId = (id, date, over) => Object.assign({id}, session(date, over));
const ctx = (over) => Object.assign({uid: 'u-parent',
  user: {role: 'parent', householdId: 'hh1'}, old: old(),
  oldSession: withId('s1', '2026-11-13'),
  target: withId('s2', '2026-11-17', {booked: 3}),
  targetBooking: null, targetLive: 3,
  athlete: {householdId: 'hh1', packageId: 't-6', handicap: 4},
  household: {periodAnchorDay: 1}, pkg: T6, tokenPeriod: null,
  periodBookings: [old()], graceSpends: [], waitlist: [],
  graceTokens: [], now: NOW}, over);

/**
 * @param {...!Object} extra Documents to add to (or replace in) the world.
 * @return {!Object} The documents: Jordan (hh1, t-6) holds Fri Nov 13
 *     `s1` and was a No-show on Tue Nov 10 `s0`; Tue Nov 17 `s2` has room
 *     and Thu Nov 19 `s4` is full at 12 of 12.
 */
function world(...extra) {
  return Object.assign({
    'users/u-owner': {role: 'owner'},
    'users/u-ops': {role: 'ops'},
    'users/u-coach': {role: 'coach'},
    'users/u-parent': {role: 'parent', householdId: 'hh1'},
    'households/hh1': {periodAnchorDay: 1},
    'packages/t-6': T6,
    'packages/elite': ELITE,
    'sessions/s0': session('2026-11-10', {booked: 0}),
    'sessions/s1': session('2026-11-13', {booked: 2}),
    'sessions/s2': session('2026-11-17', {booked: 3}),
    'sessions/s4': session('2026-11-19', {booked: 12}),
  }, jordan(), booking('jordan', 's1', '2026-11-13'),
  booking('jordan', 's0', '2026-11-10',
      {status: 'noshow', noshowReason: 'Sick'}), ...extra);
}
const move = (bookingId, toSessionId, over) =>
  Object.assign({bookingId, toSessionId}, over);
const call = (docs, uid, data, db) => moveBookingHandler(
    data || move('jordan_s1', 's2'), {auth: {uid: uid || 'u-owner'}},
    {db: db || fakeDb(docs), now: NOW});
const caught = async (promise) => {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  return null;
};
const refusedClean = async (docs, uid, data, reason) => {
  const before = JSON.stringify(docs);
  const err = await caught(call(docs, uid, data));
  assert.ok(err, `expected a refusal: ${reason}`);
  assert.deepEqual([err.code, err.details && err.details.reason],
      [PRE, reason]);
  assert.equal(JSON.stringify(docs), before, `${reason} wrote something`);
  return err;
};
const logged = async (fn) => {
  const calls = [];
  const log = console.log;
  console.log = (...a) => calls.push(a);
  try {
    await fn();
  } finally {
    console.log = log;
  }
  return calls;
};

test('the staff checks never ask who owns it or whether it started', () => {
  const owner = (over) => ctx(Object.assign({user: {role: 'owner'},
    staff: true}, over));
  const nov10 = withId('s0', '2026-11-10');
  assert.equal(staffOldRefusal(owner({user: {role: 'parent',
    householdId: 'hh9'}})), null);
  assert.equal(staffOldRefusal(owner({oldSession: nov10,
    old: old({sessionId: 's0', date: '2026-11-10', status: 'noshow'})})),
  null);
  const oldReason = (over, more) => staffOldRefusal(owner(Object.assign(
      {old: old(over)}, more)));
  assert.equal(staffOldRefusal(owner({old: null})), 'booking-missing');
  assert.equal(oldReason({status: 'attended'}), 'attended');
  assert.equal(oldReason({status: 'cancelled'}), 'not-confirmed');
  assert.equal(oldReason({source: 'calendly'}), 'calendly-managed');
  assert.equal(oldReason({type: 'mental'}), 'mental-no-move');
  assert.equal(oldReason({}, {target: withId('s1', '2026-11-13')}),
      'same-session');
  assert.equal(oldReason({}, {oldSession: null}), 'session-missing');
  assert.equal(oldReason({date: '2026-10-27'}), 'period-over');
  const target = (date, over, more) => staffTargetRefusal(owner(
      Object.assign({target: withId('s2', date, over)}, more)));
  assert.equal(target('2026-11-10'), null);
  assert.equal(target('2027-01-05'), null);
  assert.equal(target('2026-11-17', {type: 'tournament'}), 'different-type');
  assert.equal(target('2026-11-17', {status: 'cancelled'}),
      'session-cancelled');
  assert.equal(target('2026-11-17', {hidden: true}), 'session-hidden');
  assert.equal(target('2026-11-17', {bookable: false}), 'display-only');
  assert.equal(target('2026-10-30'), 'period-over');
  assert.equal(target('2026-11-17', {}, {targetBooking: {status: 'noshow'}}),
      'already-booked');
  const athlete = (a, comp, more) => staffAthleteRefusal(owner(
      Object.assign({athlete: a}, more)), comp);
  assert.equal(athlete(null, true), 'membership-inactive');
  assert.equal(athlete({householdId: 'hh1', test: true}, true),
      'test-athlete');
  assert.equal(athlete({householdId: 'hh1'}, true,
      {household: {periodAnchorDay: 1, test: true}}), 'test-athlete');
  const pending = {householdId: 'hh1', billing: {status: 'pending'}};
  assert.equal(athlete(pending, false), 'membership-inactive');
  assert.equal(athlete(pending, true), null);
  assert.equal(athlete({householdId: 'hh1'}, false, {pkg: null}),
      'membership-inactive');
  assert.equal(athlete({householdId: 'hh1'}, false,
      {target: withId('s2', '2026-11-17', {maxHandicap: 1})}), null);
});

test('staff moves a family booking', async () => {
  for (const uid of ['u-owner', 'u-ops']) {
    const docs = world();
    const out = await call(docs, uid);
    const old = docs['bookings/jordan_s1'];
    assert.deepEqual([old.status, old.cancelReason, old.cancelledFrom,
      old.cancelledBy, old.movedTo], ['cancelled', 'moved', 'confirmed',
      uid, 'jordan_s2']);
    const row = docs['bookings/jordan_s2'];
    assert.deepEqual([row.status, row.createdBy, row.createdVia,
      row.movedFrom, row.householdId], ['confirmed', uid, 'move',
      'jordan_s1', 'hh1']);
    assert.deepEqual(out.overrides, []);
    assert.deepEqual([docs['sessions/s1'].booked, docs['sessions/s2'].booked],
        [1, 4]);
  }
});

test('a No-show from earlier this period moves', async () => {
  const docs = world();
  const out = await call(docs, 'u-owner', move('jordan_s0', 's2'));
  assert.equal(docs['bookings/jordan_s0'].cancelledFrom, 'noshow');
  assert.equal(docs['bookings/jordan_s2'].movedFrom, 'jordan_s0');
  assert.deepEqual(out.overrides, []);
  // The counter already read low: the move-out floors at 0.
  assert.equal(docs['sessions/s0'].booked, 0);
});

test('attended, cancelled, last period', async () => {
  await refusedClean(world(booking('jordan', 's0', '2026-11-10',
      {status: 'attended'})), 'u-owner', move('jordan_s0', 's2'),
  'attended');
  await refusedClean(world(booking('jordan', 's1', '2026-11-13',
      {status: 'cancelled'})), 'u-owner', null, 'not-confirmed');
  await refusedClean(world({'sessions/s9': session('2026-10-27')},
      booking('jordan', 's9', '2026-10-27')), 'u-owner',
  move('jordan_s9', 's2'), 'period-over');
  await refusedClean(world({'sessions/s8': session('2026-10-30')}),
      'u-owner', move('jordan_s1', 's8'), 'period-over');
  const docs = world({'sessions/s3': session('2026-11-11')});
  const out = await call(docs, 'u-owner', move('jordan_s1', 's3'));
  assert.deepEqual([out.overrides, out.chargedFrom], [['started'], 'period']);
});

test('skipped limits come back as overrides', async () => {
  const far = world({'sessions/s5': session('2027-01-05')});
  assert.deepEqual((await call(far, 'u-owner', move('jordan_s1', 's5')))
      .overrides, ['outside-window']);
  const reserved = world({'sessions/s2': session('2026-11-17',
      {booked: 3, maxHandicap: 3})});
  assert.deepEqual((await call(reserved)).overrides, ['handicap-reserved']);
  const elite = world(jordan({packageId: 'elite'}),
      booking('jordan', 's1', '2026-11-13', {chargedFrom: 'elite'}),
      booking('jordan', 's7', '2026-11-17', {chargedFrom: 'elite'}));
  const out = await call(elite);
  assert.deepEqual([out.overrides, out.chargedFrom],
      [['one-per-day'], 'elite']);
});

test('full', async () => {
  const err = await refusedClean(world(), 'u-owner', move('jordan_s1', 's4'),
      'full');
  assert.deepEqual(err.details, {reason: 'full', taken: 12, capacity: 12});
  const docs = world();
  const out = await call(docs, 'u-owner',
      move('jordan_s1', 's4', {allowFull: true}));
  assert.equal(docs['sessions/s4'].booked, 13);
  assert.ok(out.overrides.includes('full'));
});

test('test-athlete', async () => {
  await refusedClean(world(jordan({test: true})), 'u-owner', null,
      'test-athlete');
  await refusedClean(world({'households/hh1': {test: true}}), 'u-owner',
      null, 'test-athlete');
});

test('payment never changes', async () => {
  const pending = jordan({billing: {status: 'pending'}});
  const docs = world(pending, booking('jordan', 's1', '2026-11-13',
      {comp: true, compBy: 'staff', compNote: 'x'}));
  const out = await call(docs);
  const row = docs['bookings/jordan_s2'];
  assert.deepEqual([row.comp, row.compBy, row.compNote, row.chargedFrom,
    row.graceTokenId, out.comp], [true, 'staff', 'x', 'period', null, true]);
  await refusedClean(world(pending), 'u-owner', null, 'membership-inactive');

  // Charges (a)-(d): staff get exactly what the family move gets.
  const bonus = old({chargedFrom: 'grace', graceTokenId: 'g1'});
  const eliteOld = old({chargedFrom: 'elite'});
  for (const [name, c] of [
    ['period carry', ctx()],
    ['bonus carry', ctx({old: bonus, periodBookings: [bonus],
      graceSpends: [bonus], graceTokens: [{id: 'g1',
        expiresAt: '2026-11-20'}]})],
    ['December token', ctx({periodBookings: [],
      target: withId('s9', '2026-12-03')})],
    ['Elite', ctx({pkg: ELITE, old: eliteOld, periodBookings: [eliteOld]})],
  ]) {
    const family = decideMove(c);
    const staff = decideMove(Object.assign({}, c, {staff: true,
      uid: 'u-owner', user: {role: 'owner'}}));
    assert.equal(family.ok, true, name);
    assert.deepEqual([staff.ok, staff.charge, staff.period],
        [true, family.charge, family.period], name);
  }
});

test('the family path is unchanged', async () => {
  const err = await refusedClean(world(), 'u-parent',
      move('jordan_s1', 's4', {allowFull: true, staff: true}), 'full');
  assert.deepEqual(err.details, {reason: 'full'});
  const docs = world();
  let out;
  const calls = await logged(async () => {
    out = await call(docs, 'u-parent');
  });
  assert.deepEqual(out, {bookingId: 'jordan_s2', movedFrom: 'jordan_s1',
    sessionId: 's2', periodKey: '2026-11-01', chargedFrom: 'period',
    graceTokenId: null, comp: false, rebooked: false, overrides: []});
  assert.equal('cancelledFrom' in docs['bookings/jordan_s1'], false);
  assert.deepEqual(calls.filter((c) => c[0] === 'staff booking'), []);
  // A started No-show is still not the family's to move.
  await refusedClean(world(), 'u-parent', move('jordan_s0', 's2'),
      'not-confirmed');
  const coach = await caught(call(world(), 'u-coach'));
  assert.deepEqual([coach.code, coach.details.reason],
      ['permission-denied', 'not-yours']);
});

test('one log line per staff move', async () => {
  const calls = await logged(() => call(world()));
  assert.deepEqual(calls, [['staff booking', JSON.stringify({action: 'move',
    by: 'u-owner', role: 'owner', athleteId: 'jordan', sessionId: 's2',
    chargedFrom: 'period', comp: false, overrides: []})]]);
});

run();
