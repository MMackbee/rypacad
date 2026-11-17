'use strict';
// unlockDoor (spec 5.2): the check, the press, replay by pressId, the
// rate limits and the coalesce. Alta is door-test-kit's stand-in and
// Firestore is fake-firestore's map; door-alta.test.js covers the Alta
// call itself (URL, timeout, emulator fake, secrecy).
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {DOOR_TERMS_VERSION} = require('./door-decide');
const {HERE, NOW, URL_OK, fakeAlta, familyDocs, later, press, unlock} =
    require('./door-test-kit');

const HOUR = 60 * 60 * 1000;
const FAR = {lat: 44.95, lng: -93.4, accuracy: 10};
const snapshot = (docs) => JSON.stringify(docs);
const EVENT = 'doorEvents/u-dana_press-0001';
const LIMITS = 'doorLimits/u-dana';

// ---- signed in, and the check -----------------------------------------------

test('signed out is refused, check or press, before any read', async () => {
  for (const data of [{check: true}, unlock()]) {
    const r = await press(data, {auth: null});
    assert.equal(r.error.code, 'unauthenticated');
    assert.equal(r.error.details.reason, 'signed-out');
    assert.equal(r.calls.length, 0);
  }
});

test('check: a family that may unlock hears so; nothing written, no Alta',
    async () => {
      const docs = familyDocs();
      const before = snapshot(docs);
      const r = await press({check: true}, {docs});
      assert.equal(r.error, null);
      assert.deepEqual(r.result, {canUnlock: true, reason: null,
        staff: false, openSeconds: 5});
      assert.equal(snapshot(docs), before);
      assert.equal(r.calls.length, 0);
    });

test('check: a refusal is an answer, never a throw, and writes nothing',
    async () => {
      const docs = familyDocs({'doorRules/u-dana': null});
      const before = snapshot(docs);
      const r = await press({check: true}, {docs});
      assert.equal(r.error, null);
      assert.deepEqual(r.result, {canUnlock: false, reason: 'sign-rules',
        staff: false, openSeconds: 5});
      assert.equal(snapshot(docs), before);
    });

test('check: an account with no users doc is not-provisioned, no throw',
    async () => {
      const r = await press({check: true},
          {docs: familyDocs({'users/u-dana': null})});
      assert.equal(r.error, null);
      assert.equal(r.result.canUnlock, false);
      assert.equal(r.result.reason, 'not-provisioned');
    });

test('check: never asks where the phone is, even far away', async () => {
  const r = await press({check: true, location: FAR});
  assert.equal(r.result.canUnlock, true);
});

test('check: staff hear staff, with the stored open time', async () => {
  const cfg = Object.assign({}, familyDocs()['doorConfig/main'],
      {mode: 'staff', openSeconds: 8});
  const r = await press({check: true}, {docs: familyDocs({
    'users/u-dana': {role: 'ops'}, 'doorConfig/main': cfg})});
  assert.deepEqual(r.result, {canUnlock: true, reason: null, staff: true,
    openSeconds: 8});
});

test('check: no doorConfig is off', async () => {
  const r = await press({check: true},
      {docs: familyDocs({'doorConfig/main': null})});
  assert.deepEqual(r.result, {canUnlock: false, reason: 'off', staff: false,
    openSeconds: 5});
});

// ---- the press --------------------------------------------------------------

test('a bad pressId is bad-request: nothing read into, nothing written',
    async () => {
      for (const pressId of [undefined, 42, 'short', 'has space-123',
        'under_score1', 'x'.repeat(65), 'naïve-12345']) {
        const docs = familyDocs();
        const before = snapshot(docs);
        const r = await press({pressId, location: HERE}, {docs});
        assert.equal(r.error.code, 'invalid-argument', String(pressId));
        assert.equal(r.error.details.reason, 'bad-request');
        assert.equal(snapshot(docs), before);
        assert.equal(r.calls.length, 0);
      }
    });

test('a UUID pressId is fine', async () => {
  const r = await press(unlock('3f2b8c1e-9a4d-4e7b-8f00-1c2d3e4f5a6b'));
  assert.equal(r.error, null);
  assert.equal(r.result.outcome, 'opened');
});

test('a press with no users doc is not-provisioned', async () => {
  const r = await press(unlock(),
      {docs: familyDocs({'users/u-dana': null})});
  assert.equal(r.error.code, 'permission-denied');
  assert.equal(r.error.details.reason, 'not-provisioned');
  assert.equal(r.calls.length, 0);
});

test('a family at the door: one POST, opened, the event and the limits',
    async () => {
      const r = await press(unlock());
      assert.equal(r.error, null);
      assert.deepEqual(r.result, {outcome: 'opened', openSeconds: 5});
      assert.equal(r.calls.length, 1);
      assert.equal(r.calls[0].url, URL_OK);
      assert.equal(r.calls[0].init.method, 'POST');
      assert.equal(r.calls[0].init.body, undefined);
      assert.ok(r.calls[0].init.signal);
      const ev = r.docs[EVENT];
      assert.equal(ev.at.toMillis(), NOW.getTime());
      assert.ok(Number.isInteger(ev.latencyMs) && ev.latencyMs >= 0);
      assert.deepEqual(Object.assign({}, ev, {at: null, latencyMs: null}), {
        uid: 'u-dana', role: 'parent', name: 'Dana Hart', householdId: 'hh',
        householdName: 'Hart family', athleteId: null, atMs: NOW.getTime(),
        at: null, outcome: 'opened', reason: null, altaStatus: 204,
        latencyMs: null, distanceM: 0, accuracyM: 15, test: false});
      assert.deepEqual(r.docs[LIMITS], {callsAtMs: [NOW.getTime()],
        opensAtMs: [NOW.getTime()], lastOpenedAtMs: NOW.getTime(),
        updatedAtMs: NOW.getTime()});
      assert.ok(r.logs.some((l) => /unlockDoor: opened/.test(l) &&
          /altaStatus=204/.test(l)), r.logs.join('\n'));
    });

test('the event never stores the coordinates', async () => {
  const r = await press(unlock('press-0001',
      {lat: 44.9003, lng: -93.4002, accuracy: 7}));
  const text = JSON.stringify(r.docs[EVENT]);
  assert.equal(text.includes('44.9003'), false);
  assert.equal(text.includes('93.4002'), false);
  // 33 m north and 16 m west: about 37 m, kept as 40.
  assert.equal(r.docs[EVENT].distanceM, 40);
});

// ---- replay by pressId ------------------------------------------------------

test('the same pressId again answers from the event: no second POST',
    async () => {
      const docs = familyDocs();
      const alta = fakeAlta();
      await press(unlock(), {docs, alta});
      const again = await press(unlock(), {docs, alta, now: later(2000)});
      assert.deepEqual(again.result, {outcome: 'opened', openSeconds: 5});
      assert.equal(alta.calls.length, 1);
      assert.deepEqual(docs[LIMITS].callsAtMs, [NOW.getTime()]);
    });

test('a denied press replays the same refusal', async () => {
  const docs = familyDocs();
  const first = await press(unlock('press-0001', FAR), {docs});
  assert.equal(first.error.details.reason, 'too-far');
  // Now at the door, but the same press id: still the first answer.
  const again = await press(unlock(), {docs});
  assert.equal(again.error.code, 'failed-precondition');
  assert.equal(again.error.details.reason, 'too-far');
  assert.equal(again.calls.length, 0);
  assert.equal(docs[LIMITS].callsAtMs.length, 1);
});

test('a pending event replays as in-progress (unavailable)', async () => {
  const docs = familyDocs({[EVENT]: {uid: 'u-dana', outcome: 'pending',
    reason: null}});
  const r = await press(unlock(), {docs});
  assert.equal(r.error.code, 'unavailable');
  assert.equal(r.error.details.reason, 'in-progress');
  assert.equal(r.calls.length, 0);
});

test('an error event replays its reason', async () => {
  const docs = familyDocs({[EVENT]: {uid: 'u-dana', outcome: 'error',
    reason: 'alta-timeout'}});
  const r = await press(unlock(), {docs});
  assert.equal(r.error.code, 'unavailable');
  assert.equal(r.error.details.reason, 'alta-timeout');
});

test('coalesced and test events replay as themselves', async () => {
  for (const outcome of ['coalesced', 'test']) {
    const docs = familyDocs({[EVENT]: {uid: 'u-dana', outcome,
      reason: null}});
    const r = await press(unlock(), {docs});
    assert.deepEqual(r.result, {outcome, openSeconds: 5});
  }
});

// ---- denied presses are logged ----------------------------------------------

test('a denied press: event denied with the reason, the call counted, ' +
    'no Alta', async () => {
  const r = await press(unlock('press-0001', FAR));
  assert.equal(r.error.code, 'failed-precondition');
  assert.equal(r.error.details.reason, 'too-far');
  assert.equal(r.error.message,
      'You need to be at the academy to unlock the door.');
  assert.equal(r.calls.length, 0);
  const ev = r.docs[EVENT];
  assert.equal(ev.outcome, 'denied');
  assert.equal(ev.reason, 'too-far');
  assert.equal(ev.distanceM, 5560);
  assert.equal(ev.altaStatus, null);
  assert.deepEqual(r.docs[LIMITS].callsAtMs, [NOW.getTime()]);
  assert.deepEqual(r.docs[LIMITS].opensAtMs, []);
  assert.equal(r.docs[LIMITS].lastOpenedAtMs, null);
  assert.ok(r.logs.some((l) => /unlockDoor: denied/.test(l) &&
      /reason=too-far/.test(l)), r.logs.join('\n'));
});

test('every decide refusal is denied the same way', async () => {
  const cases = [
    [{'doorConfig/main': null}, 'off'],
    [{'athletes/ath-remy': {householdId: 'hh', packageId: 't-6',
      billing: {status: 'active'}}}, 'no-access'],
    [{'doorPauses/hh': {householdId: 'hh', pausedByUid: 'u-ops'}}, 'paused'],
    [{'doorRules/u-dana': null}, 'sign-rules'],
    [{'users/u-dana': {role: 'coach'}}, 'not-eligible'],
  ];
  for (const [over, reason] of cases) {
    const r = await press(unlock(), {docs: familyDocs(over)});
    assert.equal(r.error.details.reason, reason);
    assert.equal(r.docs[EVENT].outcome, 'denied');
    assert.equal(r.docs[EVENT].reason, reason);
    assert.equal(r.calls.length, 0);
  }
});

test('no location on a press is location-needed', async () => {
  const r = await press(unlock('press-0001', null));
  assert.equal(r.error.details.reason, 'location-needed');
  assert.equal(r.docs[EVENT].distanceM, null);
});

// ---- rate limits ------------------------------------------------------------

test('40 calls in the last hour: the next is rate-limited, nothing written',
    async () => {
      const calls = Array.from({length: 40}, (_, i) =>
        NOW.getTime() - HOUR + 60000 + i * 1000);
      const limits = {callsAtMs: calls, opensAtMs: [], lastOpenedAtMs: null,
        updatedAtMs: calls[39]};
      const docs = familyDocs({[LIMITS]: limits});
      const before = snapshot(docs);
      const r = await press(unlock(), {docs});
      assert.equal(r.error.code, 'resource-exhausted');
      assert.equal(r.error.details.reason, 'rate-limited');
      assert.equal(snapshot(docs), before);
      assert.equal(r.calls.length, 0);
    });

test('39 calls in the hour, or 40 older than an hour, still open', async () => {
  const recent = Array.from({length: 39}, (_, i) => NOW.getTime() - i * 1000);
  const old = Array.from({length: 40}, (_, i) =>
    NOW.getTime() - HOUR - 1 - i);
  for (const callsAtMs of [recent, old]) {
    const r = await press(unlock(), {docs: familyDocs({[LIMITS]: {callsAtMs,
      opensAtMs: [], lastOpenedAtMs: null, updatedAtMs: 0}})});
    assert.equal(r.result.outcome, 'opened');
  }
});

test('denied calls count toward the 40', async () => {
  const docs = familyDocs();
  for (let i = 0; i < 40; i++) {
    const r = await press(unlock(`press-${1000 + i}`, FAR),
        {docs, now: later(i * 1000)});
    assert.equal(r.error.details.reason, 'too-far');
  }
  const r = await press(unlock('press-9999'), {docs, now: later(41000)});
  assert.equal(r.error.details.reason, 'rate-limited');
});

test('12 opens in the hour: the next is rate-limited and logged', async () => {
  const opensAtMs = Array.from({length: 12}, (_, i) =>
    NOW.getTime() - 20 * 60000 - i * 60000);
  const docs = familyDocs({[LIMITS]: {callsAtMs: opensAtMs.slice(),
    opensAtMs, lastOpenedAtMs: opensAtMs[0], updatedAtMs: opensAtMs[0]}});
  const r = await press(unlock(), {docs});
  assert.equal(r.error.code, 'resource-exhausted');
  assert.equal(r.error.details.reason, 'rate-limited');
  assert.equal(r.calls.length, 0);
  assert.equal(docs[EVENT].outcome, 'denied');
  assert.equal(docs[EVENT].reason, 'rate-limited');
  assert.equal(docs[LIMITS].opensAtMs.length, 12);
});

test('11 opens in the hour: the twelfth goes through', async () => {
  const opensAtMs = Array.from({length: 11}, (_, i) =>
    NOW.getTime() - 20 * 60000 - i * 60000);
  const r = await press(unlock(), {docs: familyDocs({[LIMITS]: {
    callsAtMs: [], opensAtMs, lastOpenedAtMs: opensAtMs[0],
    updatedAtMs: 0}})});
  assert.equal(r.result.outcome, 'opened');
  assert.equal(r.docs[LIMITS].opensAtMs.length, 12);
});

// ---- the 10 s coalesce ------------------------------------------------------

test('a second press within 10 s is coalesced: no second POST', async () => {
  const docs = familyDocs();
  const alta = fakeAlta();
  await press(unlock('press-0001'), {docs, alta});
  const second = await press(unlock('press-0002'),
      {docs, alta, now: later(9999)});
  assert.deepEqual(second.result, {outcome: 'coalesced', openSeconds: 5});
  assert.equal(alta.calls.length, 1);
  assert.equal(docs['doorEvents/u-dana_press-0002'].outcome, 'coalesced');
  assert.deepEqual(docs[LIMITS].opensAtMs, [NOW.getTime()]);
  const third = await press(unlock('press-0003'),
      {docs, alta, now: later(10000)});
  assert.equal(third.result.outcome, 'opened');
  assert.equal(alta.calls.length, 2);
});

test('a refusal is never coalesced', async () => {
  const docs = familyDocs();
  await press(unlock('press-0001'), {docs});
  const r = await press(unlock('press-0002', FAR), {docs, now: later(3000)});
  assert.equal(r.error.details.reason, 'too-far');
});

// ---- an Alta failure gives the open slot back -------------------------------

test('Alta answers 500: alta-error, the event says so, the slot comes back',
    async () => {
      const docs = familyDocs();
      const r = await press(unlock(), {docs,
        alta: fakeAlta({status: 500})});
      assert.equal(r.error.code, 'unavailable');
      assert.equal(r.error.details.reason, 'alta-error');
      assert.equal(docs[EVENT].outcome, 'error');
      assert.equal(docs[EVENT].reason, 'alta-error');
      assert.equal(docs[EVENT].altaStatus, 500);
      assert.deepEqual(docs[LIMITS].opensAtMs, []);
      assert.equal(docs[LIMITS].lastOpenedAtMs, null);
      assert.deepEqual(docs[LIMITS].callsAtMs, [NOW.getTime()]);
      // Hold again two seconds later: a real open, not "already unlocked".
      const again = await press(unlock('press-0002'),
          {docs, now: later(2000)});
      assert.equal(again.result.outcome, 'opened');
    });

test('giving the slot back keeps an earlier open\'s coalesce', async () => {
  const docs = familyDocs();
  await press(unlock('press-0001'), {docs});
  // 11 s later the next open fails; the first open stays the last one.
  await press(unlock('press-0002'), {docs, now: later(11000),
    alta: fakeAlta({status: 503})});
  assert.deepEqual(docs[LIMITS].opensAtMs, [NOW.getTime()]);
  assert.equal(docs[LIMITS].lastOpenedAtMs, NOW.getTime());
});

// ---- test households and staff ----------------------------------------------

test('a test household goes through every check and never reaches Alta',
    async () => {
      const r = await press(unlock(), {docs: familyDocs({
        'households/hh': {name: 'Hart family', test: true}})});
      assert.deepEqual(r.result, {outcome: 'test', openSeconds: 5});
      assert.equal(r.calls.length, 0);
      assert.equal(r.docs[EVENT].outcome, 'test');
      assert.equal(r.docs[EVENT].test, true);
      const refused = await press(unlock(), {docs: familyDocs({
        'households/hh': {test: true}, 'doorRules/u-dana': null})});
      assert.equal(refused.error.details.reason, 'sign-rules');
      assert.equal(refused.calls.length, 0);
    });

test('ops in staff-only mode opens from anywhere, with no location',
    async () => {
      const cfg = Object.assign({}, familyDocs()['doorConfig/main'],
          {mode: 'staff', lat: null, lng: null});
      const r = await press(unlock('press-0001', null), {docs: familyDocs({
        'users/u-dana': {role: 'ops', displayName: 'Ollie Ops'},
        'doorConfig/main': cfg})});
      assert.equal(r.result.outcome, 'opened');
      const ev = r.docs[EVENT];
      assert.equal(ev.role, 'ops');
      assert.equal(ev.householdId, null);
      assert.equal(ev.householdName, null);
      assert.equal(ev.distanceM, null);
    });

test('a staff login with no displayName is named by its email, else its role',
    async () => {
      // Found in the emulator pass: the owner's users doc has no
      // displayName, and Recent activity said "Unknown".
      const cfg = Object.assign({}, familyDocs()['doorConfig/main'],
          {mode: 'staff'});
      const byEmail = await press(unlock('press-0001', null), {
        docs: familyDocs({'users/u-dana': {role: 'owner', displayName: null},
          'doorConfig/main': cfg}),
        auth: {uid: 'u-dana', token: {email: 'boss@example.com'}}});
      assert.equal(byEmail.docs[EVENT].name, 'boss@example.com');
      const byRole = await press(unlock('press-0001', null), {
        docs: familyDocs({'users/u-dana': {role: 'ops', displayName: ''},
          'doorConfig/main': cfg}),
        auth: {uid: 'u-dana', token: {}}});
      assert.equal(byRole.docs[EVENT].name, 'Ops');
    });

// ---- athlete logins: 16 on the Chicago day, a parent's signature ------------

/**
 * An athlete login, born `dob`, on the Hart household.
 * @param {string} dob 'YYYY-MM-DD'.
 * @param {!Object=} over More docs.
 * @return {!Object} The docs.
 */
function kidDocs(dob, over) {
  return familyDocs(Object.assign({
    'users/u-dana': {role: 'athlete', householdId: 'hh',
      athleteId: 'ath-remy', displayName: 'Remy Hart'},
    'athletes/ath-remy': {householdId: 'hh', name: 'Remy Hart',
      packageId: 'elite', dob, billing: {status: 'active'}},
    'doorRules/u-dana': {uid: 'u-dana', householdId: 'hh',
      role: 'athlete', termsVersion: DOOR_TERMS_VERSION},
    'doorRules/u-parent': {uid: 'u-parent', householdId: 'hh',
      role: 'parent', termsVersion: DOOR_TERMS_VERSION},
  }, over));
}

test('a 16-year-old opens on the Chicago day of the birthday', async () => {
  // 9 PM Nov 17 in Chicago is still 15; midnight Nov 18 is 16.
  const eve = await press(unlock(), {docs: kidDocs('2010-11-18'),
    now: new Date('2026-11-18T03:00:00Z')});
  assert.equal(eve.error.details.reason, 'under-16');
  const day = await press(unlock(), {docs: kidDocs('2010-11-18'),
    now: new Date('2026-11-18T06:00:00Z')});
  assert.equal(day.result.outcome, 'opened');
  assert.equal(day.docs[EVENT].athleteId, 'ath-remy');
  assert.equal(day.docs[EVENT].name, 'Remy Hart');
});

test('a 16-17 athlete with no parent signature is guardian-rules', async () => {
  const r = await press(unlock(),
      {docs: kidDocs('2009-06-01', {'doorRules/u-parent': null})});
  assert.equal(r.error.details.reason, 'guardian-rules');
});

test('an 18-year-old needs no parent signature', async () => {
  const r = await press(unlock(),
      {docs: kidDocs('2008-06-01', {'doorRules/u-parent': null})});
  assert.equal(r.result.outcome, 'opened');
});

run();
