'use strict';
// signDoorRules (spec 5.3): a family login signs the door rules once.
// Firestore is fake-firestore's map; nothing here opens anything.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const {DOOR_TERMS_VERSION} = require('./door-decide');
const {signDoorRulesHandler} = require('./door-rules');

const NOW = new Date('2026-11-17T22:00:00Z');
const AUTH = {uid: 'u-dana'};
const SIGN = {name: 'Dana Hart', termsVersion: DOOR_TERMS_VERSION};

/**
 * A parent of one athlete; `over` replaces or (null) removes docs.
 * @param {!Object=} over `{'collection/id': body | null}`.
 * @return {!Object} The fake-firestore map.
 */
function docs(over) {
  const d = {
    'users/u-dana': {role: 'parent', householdId: 'hh', athleteId: null,
      displayName: 'Dana Hart'},
    'athletes/ath-remy': {householdId: 'hh', name: 'Remy Hart',
      dob: '2009-06-01', packageId: 'elite', billing: {status: 'active'}},
  };
  for (const [path, body] of Object.entries(over || {})) {
    if (body === null) delete d[path];
    else d[path] = body;
  }
  return d;
}

/**
 * One call through the handler.
 * @param {*} data The payload.
 * @param {!Object=} opts `{docs, auth, now}`.
 * @return {!Promise<{result: ?Object, error: ?Error, docs: !Object}>} The
 *     outcome and the map.
 */
async function sign(data, opts) {
  const o = opts || {};
  const map = o.docs || docs();
  let result = null;
  let error = null;
  try {
    result = await signDoorRulesHandler(data,
        {auth: 'auth' in o ? o.auth : AUTH},
        {db: fakeDb(map), now: o.now || NOW});
  } catch (err) {
    error = err;
  }
  return {result, error, docs: map};
}

const kid = {'users/u-dana': {role: 'athlete', householdId: 'hh',
  athleteId: 'ath-remy', displayName: 'Remy Hart'}};

test('signed out is refused', async () => {
  const r = await sign(SIGN, {auth: null});
  assert.equal(r.error.code, 'unauthenticated');
  assert.equal(r.error.details.reason, 'signed-out');
});

test('a parent signs: doorRules/{uid} written whole, adult', async () => {
  const r = await sign(SIGN);
  assert.equal(r.error, null);
  assert.deepEqual(r.result, {ok: true, termsVersion: DOOR_TERMS_VERSION});
  const doc = r.docs['doorRules/u-dana'];
  assert.equal(doc.signedAt.toMillis(), NOW.getTime());
  assert.deepEqual(Object.assign({}, doc, {signedAt: null}), {
    uid: 'u-dana', householdId: 'hh', athleteId: null, role: 'parent',
    adult: true, name: 'Dana Hart', termsVersion: DOOR_TERMS_VERSION,
    signedAt: null, signedAtMs: NOW.getTime()});
});

test('the typed name is trimmed and kept as typed, not the account name',
    async () => {
      const r = await sign({name: '  Dana M. Hart ', termsVersion:
        DOOR_TERMS_VERSION});
      assert.equal(r.docs['doorRules/u-dana'].name, 'Dana M. Hart');
    });

test('signing again replaces the doc whole', async () => {
  const r = await sign(SIGN, {docs: docs({'doorRules/u-dana': {
    uid: 'u-dana', termsVersion: 'door-2026-01-01', stray: true}})});
  assert.equal(r.docs['doorRules/u-dana'].stray, undefined);
  assert.equal(r.docs['doorRules/u-dana'].termsVersion, DOOR_TERMS_VERSION);
});

test('only doorRules/{uid} is written', async () => {
  const before = docs();
  const keys = Object.keys(before).sort();
  const r = await sign(SIGN, {docs: before});
  assert.deepEqual(Object.keys(r.docs).sort(),
      keys.concat(['doorRules/u-dana']).sort());
});

test('a 16-17 athlete login signs, not adult, with its athleteId', async () => {
  const r = await sign({name: 'Remy Hart', termsVersion: DOOR_TERMS_VERSION},
      {docs: docs(kid)});
  const doc = r.docs['doorRules/u-dana'];
  assert.equal(doc.role, 'athlete');
  assert.equal(doc.athleteId, 'ath-remy');
  assert.equal(doc.householdId, 'hh');
  assert.equal(doc.adult, false);
});

test('adult from the Chicago day of the 18th birthday', async () => {
  const born = docs(Object.assign({}, kid, {'athletes/ath-remy': {
    householdId: 'hh', name: 'Remy Hart', dob: '2008-11-18'}}));
  // 9 PM Nov 17 in Chicago: 17. Midnight Nov 18: 18.
  const eve = await sign(SIGN, {docs: born,
    now: new Date('2026-11-18T03:00:00Z')});
  assert.equal(eve.docs['doorRules/u-dana'].adult, false);
  const day = await sign(SIGN, {docs: born,
    now: new Date('2026-11-18T06:00:00Z')});
  assert.equal(day.docs['doorRules/u-dana'].adult, true);
});

test('an athlete with no athlete doc or no dob is not adult', async () => {
  for (const over of [{'athletes/ath-remy': null},
    {'athletes/ath-remy': {householdId: 'hh', dob: null}}]) {
    const r = await sign(SIGN, {docs: docs(Object.assign({}, kid, over))});
    assert.equal(r.error, null);
    assert.equal(r.docs['doorRules/u-dana'].adult, false);
  }
});

test('no users doc, staff, coaches, or no household: not-eligible',
    async () => {
      for (const user of [null, {role: 'owner'}, {role: 'ops'},
        {role: 'coach', householdId: 'hh'}, {role: 'mental'},
        {role: 'parent', householdId: null},
        {role: 'athlete', athleteId: 'ath-remy'}]) {
        const r = await sign(SIGN, {docs: docs({'users/u-dana': user})});
        assert.equal(r.error.code, 'failed-precondition',
            JSON.stringify(user));
        assert.equal(r.error.details.reason, 'not-eligible');
        assert.equal(r.docs['doorRules/u-dana'], undefined);
      }
    });

test('not-eligible comes before a bad name', async () => {
  const r = await sign({name: '', termsVersion: DOOR_TERMS_VERSION},
      {docs: docs({'users/u-dana': {role: 'coach'}})});
  assert.equal(r.error.details.reason, 'not-eligible');
});

test('a name under 2 or over 120 characters, or not text, is bad-request',
    async () => {
      for (const name of [undefined, null, 42, '', ' ', 'D', '  D  ',
        'x'.repeat(121)]) {
        const r = await sign({name, termsVersion: DOOR_TERMS_VERSION});
        assert.equal(r.error.code, 'invalid-argument', String(name));
        assert.equal(r.error.details.reason, 'bad-request');
        assert.ok(/name/i.test(r.error.message));
        assert.equal(r.docs['doorRules/u-dana'], undefined);
      }
    });

test('2 and 120 characters are fine', async () => {
  for (const name of ['Jo', 'x'.repeat(120)]) {
    const r = await sign({name, termsVersion: DOOR_TERMS_VERSION});
    assert.equal(r.error, null, name);
  }
});

test('other rules than the current ones: stale-terms', async () => {
  for (const termsVersion of [undefined, 'door-2026-01-01', '', 7]) {
    const r = await sign({name: 'Dana Hart', termsVersion});
    assert.equal(r.error.code, 'failed-precondition', String(termsVersion));
    assert.equal(r.error.details.reason, 'stale-terms');
    assert.equal(r.error.message, 'Reload the app to see the latest rules.');
    assert.equal(r.docs['doorRules/u-dana'], undefined);
  }
});

test('a missing payload is a bad name, not a crash', async () => {
  const r = await sign(undefined);
  assert.equal(r.error.details.reason, 'bad-request');
});

run();
