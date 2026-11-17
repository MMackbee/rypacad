'use strict';
// door-decide: who may open the facility door, and the first reason they
// may not (spec 5.1). Pure: every input is a plain object.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {todayISO} = require('./lib');
const {DEFAULTS, DOOR_TERMS_VERSION, OPEN_SECONDS_MAX, OPEN_SECONDS_MIN,
  REFUSALS, STAFF_DOOR_ROLES, decide, doorFacility, openSecondsOf} =
    require('./door-decide');

const TODAY = '2026-11-17';
const ACADEMY = {lat: 44.9, lng: -93.4};
const CONFIG = Object.assign({mode: 'all', radiusM: 200, openSeconds: 5},
    ACADEMY);
const M_PER_DEG = 6371008.8 * Math.PI / 180;
const north = (m, accuracy) =>
  ({lat: ACADEMY.lat + m / M_PER_DEG, lng: ACADEMY.lng, accuracy});

const PARENT = {role: 'parent', householdId: 'hh', athleteId: null,
  displayName: 'Dana Hart'};
const elite = (over) => Object.assign({id: 'ath-elite', householdId: 'hh',
  name: 'Remy Hart', packageId: 'elite', dob: '2012-03-04',
  billing: {status: 'active'}}, over);
const rules = (over) => Object.assign({uid: 'u-dana', householdId: 'hh',
  role: 'parent', termsVersion: DOOR_TERMS_VERSION}, over);

/**
 * A decide() call that passes every check, with `over` replacing inputs.
 * @param {!Object=} over Inputs to replace.
 * @return {!Object} decide's answer.
 */
function check(over) {
  return decide(Object.assign({
    user: PARENT, household: {name: 'Hart family'}, athletes: [elite()],
    config: CONFIG, paused: false, myRules: rules(), householdRules: [],
    today: TODAY, location: null, mode: 'check',
  }, over));
}
/**
 * An athlete login on its own athlete doc, aged by `dob`.
 * @param {?string} dob The athlete's date of birth.
 * @param {!Object=} over More inputs to replace.
 * @return {!Object} The inputs for check().
 */
const kid = (dob, over) => Object.assign({
  user: {role: 'athlete', householdId: 'hh', athleteId: 'ath-kid'},
  athletes: [elite({id: 'ath-kid', dob})],
  myRules: rules({uid: 'u-kid', role: 'athlete'}),
}, over);

test('the contract constants', () => {
  assert.equal(DOOR_TERMS_VERSION, 'door-2026-11-17');
  assert.deepEqual(STAFF_DOOR_ROLES, ['owner', 'ops']);
  assert.deepEqual(DEFAULTS, {radiusM: 200, openSeconds: 5});
  assert.equal(OPEN_SECONDS_MIN, 1);
  assert.equal(OPEN_SECONDS_MAX, 600);
});

test('the open time: a whole number of seconds 1..600, else 5', () => {
  // Alta's Entry open duration runs 1 s to 10 min (owner: "a few minutes").
  for (const [s, want] of [[1, 1], [5, 5], [45, 45], [180, 180], [600, 600],
    [601, 5], [0, 5], [-3, 5], [2.5, 5], ['30', 5], [NaN, 5], [null, 5],
    [undefined, 5]]) {
    assert.equal(openSecondsOf({openSeconds: s}), want, String(s));
  }
  assert.equal(openSecondsOf(null), 5);
  assert.equal(openSecondsOf({}), 5);
});

test('a paid Elite parent with signed rules passes the check', () => {
  assert.deepEqual(check(), {ok: true, reason: null, staff: false,
    test: false, distanceM: null, accuracyM: null});
});

// ---- 1. the switch --------------------------------------------------------

test('no doorConfig, or a mode that is not staff/all, is off', () => {
  for (const config of [null, undefined, {}, Object.assign({}, CONFIG,
      {mode: 'off'}), Object.assign({}, CONFIG, {mode: 'open'})]) {
    assert.equal(check({config}).reason, 'off', JSON.stringify(config));
  }
});

test('off wins even for the owner', () => {
  const r = check({user: {role: 'owner'}, config: Object.assign({}, CONFIG,
      {mode: 'off'})});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'off');
});

// ---- 2. staff -------------------------------------------------------------

test('owner and ops pass in staff mode with no household, rules or place',
    () => {
      for (const role of ['owner', 'ops']) {
        const r = check({user: {role}, household: null, athletes: [],
          myRules: null, config: Object.assign({}, CONFIG, {mode: 'staff',
            lat: null, lng: null}), mode: 'unlock', location: null});
        assert.deepEqual(r, {ok: true, reason: null, staff: true,
          test: false, distanceM: null, accuracyM: null}, role);
      }
    });

test('staff pass in everyone mode too, from anywhere', () => {
  const r = check({user: {role: 'ops'}, mode: 'unlock',
    location: north(50000, 5)});
  assert.equal(r.ok, true);
  assert.equal(r.staff, true);
});

// ---- 3. who is a family login -----------------------------------------------

test('coach, mental, specialist and an unknown role are not eligible', () => {
  for (const role of ['coach', 'mental', 'specialist', undefined]) {
    assert.equal(check({user: {role, householdId: 'hh'}}).reason,
        'not-eligible', String(role));
  }
});

test('a family login with no householdId is not eligible', () => {
  assert.equal(check({user: Object.assign({}, PARENT, {householdId: null})})
      .reason, 'not-eligible');
});

test('staff-only mode turns families off', () => {
  assert.equal(check({config: Object.assign({}, CONFIG, {mode: 'staff'})})
      .reason, 'off');
});

// ---- 4. paid facility access ----------------------------------------------

test('a monthly token athlete with no add-on has no access', () => {
  assert.equal(check({athletes: [{id: 'a', packageId: 't-6',
    billing: {status: 'active'}}]}).reason, 'no-access');
});

test('no athletes at all is no access', () => {
  assert.equal(check({athletes: []}).reason, 'no-access');
});

test('Elite with no billing map does not count for the door', () => {
  const athletes = [elite({billing: undefined})];
  assert.equal(check({athletes}).reason, 'no-access');
  assert.equal(doorFacility(athletes).access, false);
});

test('Elite active, past_due and comped all count', () => {
  for (const billing of [{status: 'active'}, {status: 'past_due'},
    {status: 'active', comp: true, oneTime: false, subscriptionId: null}]) {
    assert.equal(check({athletes: [elite({billing})]}).ok, true,
        JSON.stringify(billing));
  }
});

test('Elite pending, lapsed or still on a one-time block does not', () => {
  for (const billing of [{status: 'pending'}, {status: 'lapsed'},
    {status: 'active', oneTime: true}]) {
    assert.equal(check({athletes: [elite({billing})]}).reason, 'no-access',
        JSON.stringify(billing));
  }
});

test('a live facility add-on counts, active or past_due', () => {
  for (const status of ['active', 'past_due']) {
    const athletes = [{id: 'a', packageId: 't-6', billing: {status: 'active'},
      facilityBilling: {status}}];
    assert.equal(check({athletes}).ok, true, status);
    assert.equal(doorFacility(athletes).source, 'add-on');
  }
});

test('an add-on that ended does not count', () => {
  assert.equal(check({athletes: [{id: 'a', packageId: 't-6',
    facilityBilling: {status: 'cancelled'}}]}).reason, 'no-access');
});

test('the staff facilityAccess switch is not paid access', () => {
  assert.equal(check({athletes: [{id: 'a', packageId: 't-6',
    billing: {status: 'active'}, facilityAccess: true}]}).reason,
  'no-access');
});

test('doorFacility keeps householdFacility\'s answer for the rest', () => {
  const athletes = [elite({billing: undefined}), {id: 'b', packageId: 't-6',
    facilityBilling: {status: 'active'}}];
  const f = doorFacility(athletes);
  assert.equal(f.access, true);
  assert.equal(f.source, 'add-on');
  assert.equal(f.holderId, 'b');
  assert.equal(f.eliteId, null);
});

test('doorFacility leaves the athlete docs as they were', () => {
  const athletes = [elite({billing: undefined})];
  doorFacility(athletes);
  assert.equal(athletes[0].packageId, 'elite');
});

// ---- 5. age (athlete logins) ----------------------------------------------

test('an athlete login under 16 is refused; a parent is never aged', () => {
  assert.equal(check(kid('2011-01-01')).reason, 'under-16');
  assert.equal(check({athletes: [elite({dob: '2020-01-01'})]}).ok, true);
});

test('an athlete login with no dob, or no own athlete doc, is under-16',
    () => {
      assert.equal(check(kid(null)).reason, 'under-16');
      assert.equal(check(kid('2008-01-01', {user: {role: 'athlete',
        householdId: 'hh', athleteId: 'someone-else'}})).reason, 'under-16');
    });

test('16 on the Chicago day: the evening before is still 15', () => {
  // 2026-11-18T03:00Z is 9 PM on Nov 17 in Chicago.
  const before = todayISO(new Date('2026-11-18T03:00:00Z'));
  const on = todayISO(new Date('2026-11-18T06:00:00Z'));
  assert.equal(before, '2026-11-17');
  assert.equal(on, '2026-11-18');
  const parentSigned = [rules()];
  assert.equal(check(kid('2010-11-18', {today: before,
    householdRules: parentSigned})).reason, 'under-16');
  assert.equal(check(kid('2010-11-18', {today: on,
    householdRules: parentSigned})).ok, true);
});

// ---- 6. paused ------------------------------------------------------------

test('a paused household is refused', () => {
  assert.equal(check({paused: true}).reason, 'paused');
});

// ---- 7. the caller's own door rules ----------------------------------------

test('no rules, old rules, or rules from another household: sign-rules',
    () => {
      assert.equal(check({myRules: null}).reason, 'sign-rules');
      assert.equal(check({myRules: rules({termsVersion: 'door-2026-01-01'})})
          .reason, 'sign-rules');
      assert.equal(check({myRules: rules({householdId: 'hh-other'})}).reason,
          'sign-rules');
    });

// ---- 8. a parent's rules for a 16-17 athlete -------------------------------

test('a 16-17 athlete needs a parent in the household to have signed', () => {
  assert.equal(check(kid('2009-06-01')).reason, 'guardian-rules');
  assert.equal(check(kid('2009-06-01', {householdRules: [rules({
    termsVersion: 'door-2026-01-01'})]})).reason, 'guardian-rules');
  assert.equal(check(kid('2009-06-01', {householdRules: [rules({
    role: 'athlete', uid: 'u-sib'})]})).reason, 'guardian-rules');
  assert.equal(check(kid('2009-06-01', {householdRules: [rules({
    householdId: 'hh-other'})]})).reason, 'guardian-rules');
  assert.equal(check(kid('2009-06-01', {householdRules: [rules()]})).ok,
      true);
});

test('18 on the Chicago day ends the parent requirement', () => {
  const before = todayISO(new Date('2026-11-18T03:00:00Z'));
  const on = todayISO(new Date('2026-11-18T06:00:00Z'));
  assert.equal(check(kid('2008-11-18', {today: before})).reason,
      'guardian-rules');
  assert.equal(check(kid('2008-11-18', {today: on})).ok, true);
});

test('an adult athlete login (athlete mode) needs no parent', () => {
  assert.equal(check(kid('1990-05-05')).ok, true);
});

// ---- 9. the academy's place -------------------------------------------------

test('no academy location is not-set-up, even on a check', () => {
  for (const loc of [{lat: null, lng: null}, {lat: undefined},
    {lat: '44.9', lng: '-93.4'}, {lat: NaN, lng: -93.4},
    {lat: 44.9, lng: Infinity}]) {
    const config = Object.assign({}, CONFIG, loc);
    if (loc.lat === undefined) delete config.lat;
    assert.equal(check({config}).reason, 'not-set-up', JSON.stringify(loc));
  }
});

// ---- 10. the phone's place (unlock only) ------------------------------------

test('a check never asks for the location', () => {
  assert.equal(check({mode: 'check', location: null}).ok, true);
});

test('an unlock with no or a broken location is location-needed', () => {
  for (const location of [null, undefined, {lat: 91, lng: 0, accuracy: 5},
    {lat: 44.9, lng: -93.4}, {lat: 44.9, lng: -93.4, accuracy: -3}]) {
    assert.equal(check({mode: 'unlock', location}).reason,
        'location-needed', JSON.stringify(location));
  }
});

test('an unlock at the academy passes with the rounded distance', () => {
  const r = check({mode: 'unlock', location: north(64, 18.4)});
  assert.deepEqual(r, {ok: true, reason: null, staff: false, test: false,
    distanceM: 60, accuracyM: 18});
});

test('an unlock too far away is too-far, with the distance', () => {
  const r = check({mode: 'unlock', location: north(2400, 20)});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'too-far');
  assert.equal(r.distanceM, 2400);
  assert.equal(r.accuracyM, 20);
});

test('reach allows the reported accuracy, up to 150 m', () => {
  assert.equal(check({mode: 'unlock', location: north(300, 120)}).ok, true);
  assert.equal(check({mode: 'unlock', location: north(360, 400)}).reason,
      'too-far');
  assert.equal(check({mode: 'unlock', location: north(340, 400)}).ok, true);
});

test('the stored radius applies; none means 200 m', () => {
  const wide = Object.assign({}, CONFIG, {radiusM: 500});
  assert.equal(check({mode: 'unlock', config: wide,
    location: north(480, 0)}).ok, true);
  const plain = Object.assign({}, CONFIG);
  delete plain.radiusM;
  assert.equal(check({mode: 'unlock', config: plain,
    location: north(210, 0)}).reason, 'too-far');
});

// ---- the order: the first failing check wins ---------------------------

test('no-access beats under-16, paused, sign-rules and the place', () => {
  assert.equal(check(kid('2015-01-01', {athletes: [{id: 'ath-kid',
    dob: '2015-01-01', packageId: 't-6'}], paused: true, myRules: null,
  mode: 'unlock'})).reason, 'no-access');
});

test('under-16 beats paused', () => {
  assert.equal(check(kid('2015-01-01', {paused: true})).reason, 'under-16');
});

test('paused beats sign-rules', () => {
  assert.equal(check({paused: true, myRules: null}).reason, 'paused');
});

test('sign-rules beats guardian-rules', () => {
  assert.equal(check(kid('2009-06-01', {myRules: null})).reason,
      'sign-rules');
});

test('guardian-rules beats not-set-up', () => {
  assert.equal(check(kid('2009-06-01', {config: Object.assign({}, CONFIG,
      {lat: null, lng: null})})).reason, 'guardian-rules');
});

test('not-set-up beats location-needed', () => {
  assert.equal(check({mode: 'unlock', location: null,
    config: Object.assign({}, CONFIG, {lat: null})}).reason, 'not-set-up');
});

// ---- test households ---------------------------------------------------

test('a test household is flagged test and still checked', () => {
  const r = check({household: {test: true}, mode: 'unlock',
    location: north(10, 5)});
  assert.equal(r.ok, true);
  assert.equal(r.test, true);
  const refused = check({household: {test: true}, myRules: null});
  assert.equal(refused.reason, 'sign-rules');
  assert.equal(refused.test, true);
});

test('an athlete login on a test athlete doc is test', () => {
  const r = check(kid('1990-05-05', {athletes: [elite({id: 'ath-kid',
    dob: '1990-05-05', test: true})]}));
  assert.equal(r.ok, true);
  assert.equal(r.test, true);
});

test('a parent is not test because one athlete doc is', () => {
  assert.equal(check({athletes: [elite({test: true})]}).test, false);
});

test('every refusal reason decide gives has copy and a code', () => {
  for (const reason of ['off', 'not-eligible', 'no-access', 'under-16',
    'paused', 'sign-rules', 'guardian-rules', 'not-set-up',
    'location-needed', 'too-far']) {
    assert.equal(REFUSALS[reason].code, 'failed-precondition', reason);
    assert.ok(REFUSALS[reason].message.length > 10, reason);
  }
});

test('the copy names the academy number where the spec says so', () => {
  assert.equal(REFUSALS.paused.message, 'Door unlocking is paused for your ' +
      'family. Call or text the academy at (612) 234-1644.');
  assert.equal(REFUSALS['rate-limited'].message, 'Too many unlocks for ' +
      'now. Call or text the academy at (612) 234-1644.');
  assert.equal(REFUSALS['rate-limited'].code, 'resource-exhausted');
  for (const reason of ['alta-error', 'alta-timeout', 'in-progress']) {
    assert.equal(REFUSALS[reason].code, 'unavailable', reason);
    assert.equal(REFUSALS[reason].message, 'The door didn\'t answer. If ' +
        'you heard the lock click, go in. Otherwise try once more, or call ' +
        'or text (612) 234-1644.');
  }
  assert.equal(REFUSALS.misconfigured.code, 'failed-precondition');
  assert.equal(REFUSALS['bad-request'].code, 'invalid-argument');
  assert.equal(REFUSALS['signed-out'].code, 'unauthenticated');
  assert.equal(REFUSALS['not-provisioned'].code, 'permission-denied');
  assert.equal(REFUSALS['stale-terms'].message,
      'Reload the app to see the latest rules.');
});

run();
