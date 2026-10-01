'use strict';
// waitlistPositions: a family's place in the EXACT order promotion uses
// (bonus-token holders first, then join time), for its own athletes only.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const notify = require('./notify');
const promotion = require('./promotion');
const {waitlistPositionsHandler} = require('./waitlist-positions');

notify.sendNotice = async () => ({sent: true});

const NOW = new Date('2026-11-10T18:00:00Z');
const T0 = Date.parse('2026-11-05T15:00:00Z');
const ctx = (uid) => ({auth: {uid, token: {}}});
const entry = (sessionId, athleteId, householdId, minutes) => ({
  [`waitlist/${sessionId}_${athleteId}`]: {sessionId, athleteId, householdId,
    date: '2026-11-12', periodKey: '2026-11-01',
    joinedAt: new Date(T0 + minutes * 60000), createdBy: 'u-parent'},
});
const session = (over) => Object.assign({date: '2026-11-12',
  time: '4:00 PM', type: 'training', capacity: 1, booked: 1,
  status: 'scheduled'}, over);
/**
 * @return {!Object} Two full sessions. On `s1`: Kai joined first, then Sam,
 *     then Ava, then Wren - and Wren holds a bonus token, so Wren is first.
 *     On `s2`: only Kai.
 */
function world() {
  return Object.assign({
    'users/u-pat': {role: 'parent', householdId: 'hart'},
    'users/u-ava': {role: 'athlete', athleteId: 'ava',
      householdId: 'lopez'},
    'users/u-coach': {role: 'coach'},
    'packages/t-12': {kind: 'tokens', tokens: 12, windowDays: 30},
    'packages/elite': {kind: 'elite', tokens: null, windowDays: 45},
    'households/hart': {periodAnchorDay: 1},
    'households/lopez': {periodAnchorDay: 1},
    'households/reyes': {periodAnchorDay: 1},
    'athletes/sam': {name: 'Sam Hart', householdId: 'hart',
      packageId: 't-12'},
    'athletes/wren': {name: 'Wren Hart', householdId: 'hart',
      packageId: 't-12'},
    'athletes/ava': {name: 'Ava Lopez', householdId: 'lopez',
      packageId: 'elite'},
    'athletes/kai': {name: 'Kai Reyes', householdId: 'reyes',
      packageId: 't-12'},
    'graceTokens/G': {athleteId: 'wren', householdId: 'hart',
      expiresAt: '2026-12-20', reason: 'session-cancelled'},
    'sessions/s1': session(),
    'sessions/s2': session(),
    'sessions/s3': session(),
    'bookings/x1_s1': {athleteId: 'x1', sessionId: 's1',
      date: '2026-11-12', type: 'training', status: 'confirmed'},
  }, entry('s1', 'kai', 'reyes', 0), entry('s1', 'sam', 'hart', 1),
  entry('s1', 'ava', 'lopez', 2), entry('s1', 'wren', 'hart', 3),
  entry('s2', 'kai', 'reyes', 0));
}
const call = (docs, uid, sessionIds) => waitlistPositionsHandler(
    {sessionIds}, ctx(uid), {db: fakeDb(docs), now: NOW});

test('a parent sees its own athletes, in promotion order', async () => {
  const r = await call(world(), 'u-pat', ['s1', 's2', 's3', 'nope']);
  assert.deepEqual(r, {positions: {
    's1': {wren: 1, sam: 3},
    // Another family's entry, no entries, unknown session: all empty.
    's2': {},
    's3': {},
    'nope': {},
  }});
});

test('an athlete login sees only its own place', async () => {
  const r = await call(world(), 'u-ava', ['s1']);
  assert.deepEqual(r, {positions: {s1: {ava: 4}}});
});

test('staff and unknown accounts hold no place', async () => {
  assert.deepEqual(await call(world(), 'u-coach', ['s1']),
      {positions: {s1: {}}});
  assert.deepEqual(await call(world(), 'u-nobody', ['s1']),
      {positions: {s1: {}}});
});

test('the number is the order promotion uses', async () => {
  const docs = world();
  // Place 1 is Wren; open the seat and Wren is the one booked.
  const before = docs['sessions/s1'];
  docs['bookings/x1_s1'].status = 'cancelled';
  docs['sessions/s1'] = session({booked: 0});
  await promotion.handleSessionUpdate(before, docs['sessions/s1'], 's1',
      {db: fakeDb(docs), now: NOW});
  assert.equal(docs['bookings/wren_s1'].chargedFrom, 'grace');
  // Everyone left moves up one: Kai 1, Sam 2, Ava 3.
  assert.deepEqual((await call(docs, 'u-pat', ['s1'])).positions.s1,
      {sam: 2});
  assert.deepEqual((await call(docs, 'u-ava', ['s1'])).positions.s1,
      {ava: 3});
});

test('sign-in and a list of 1 to 50 session ids are required', async () => {
  const docs = world();
  const code = (data, context) => waitlistPositionsHandler(data, context,
      {db: fakeDb(docs), now: NOW}).then(() => 'ok', (e) => e.code);
  assert.equal(await code({sessionIds: ['s1']}, {}), 'unauthenticated');
  const bad = [undefined, {}, {sessionIds: []}, {sessionIds: 's1'},
    {sessionIds: [1]}, {sessionIds: ['']}, {sessionIds: ['a/b']},
    {sessionIds: Array.from({length: 51}, (_, i) => `s${i}`)}];
  for (const data of bad) {
    assert.equal(await code(data, ctx('u-pat')), 'invalid-argument',
        JSON.stringify(data));
  }
  assert.equal(await code({sessionIds: Array.from({length: 50},
      (_, i) => `s${i}`)}, ctx('u-pat')), 'ok');
});

test('the export is a callable that binds no secret', () => {
  const {waitlistPositions} = require('./waitlist-positions');
  const endpoint = waitlistPositions.__endpoint || {};
  assert.equal(Boolean(endpoint.callableTrigger), true);
  assert.deepEqual(endpoint.secretEnvironmentVariables || [], []);
});

run();
