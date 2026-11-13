'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {channelAllowed, householdAudience, LINKS, LOCKED_EMAIL_KINDS} =
    require('./notify');
const {fakeDb} = require('./fake-firestore');

// K31 regression guard: only billing EMAIL is forced on; billing push
// follows the parent's saved choice, as the Settings screen now lets them
// set it.
test('channelAllowed: billing push follows the saved value, default on',
    () => {
      assert.equal(
          channelAllowed({billing: {email: true, push: false}}, 'billing',
              'push'), false);
      assert.equal(channelAllowed({billing: {email: true}}, 'billing', 'push'),
          true);
      assert.equal(channelAllowed(null, 'billing', 'push'), true);
    });

test('channelAllowed: billing email is sent even when saved off', () => {
  assert.equal(channelAllowed({billing: {email: false}}, 'billing', 'email'),
      true);
  assert.equal(channelAllowed({schedule: {email: false}}, 'schedule', 'email'),
      false);
});

// Mental consent (2026-11-05): the lock is per kind, not per category, so
// every other session email still follows the saved Sessions choice.
test('channelAllowed: the two consent asks always email; push and every ' +
    'other kind follow the saved value', () => {
  const off = {schedule: {email: false, push: false}};
  assert.equal(channelAllowed(off, 'schedule', 'email', 'consent-needed'),
      true);
  assert.equal(channelAllowed(off, 'schedule', 'email', 'consent-reminder'),
      true);
  assert.equal(channelAllowed(off, 'schedule', 'email', 'consent-signed'),
      false);
  assert.equal(channelAllowed(off, 'schedule', 'email', 'reminder-24h'),
      false);
  assert.equal(channelAllowed(off, 'schedule', 'push', 'consent-needed'),
      false);
  assert.equal(channelAllowed(off, 'schedule', 'email'), false);
  assert.deepEqual(LOCKED_EMAIL_KINDS, ['consent-needed', 'consent-reminder']);
});

test('LINKS: the three consent kinds open the consent list', () => {
  for (const k of ['consent-needed', 'consent-reminder', 'consent-signed']) {
    assert.equal(LINKS[k], '/portal/consent/mental');
  }
});

// Owner 2026-11-13: an adult who signed up for themselves (createFamily mode
// 'athlete': their login is the household's createdBy, role 'athlete') heard
// about no billing at all - every billing notice went to role 'parent' only.
const uids = (rs) => rs.map((r) => r.uid).sort();

test('householdAudience: the self-managed adult hears billing; another ' +
    'athlete login on the same household does not', async () => {
  const store = fakeDb({
    'households/hh': {name: 'Adult', createdBy: 'self'},
    'users/self': {role: 'athlete', householdId: 'hh', athleteId: 'a1',
      email: 'adult@example.test'},
    // Reachable on purpose (email and a device), so only the createdBy test
    // keeps it out (review wf_2d266ef0-171).
    'users/other': {role: 'athlete', householdId: 'hh', athleteId: 'a1',
      email: 'other@example.test', pushTokens: ['device-1']},
  });
  const got = await householdAudience(store, 'hh');
  assert.deepEqual(uids(got), ['self']);
  assert.equal(got[0].email, 'adult@example.test');
});

test('householdAudience: a parent household is unchanged - parents only, ' +
    'never a child login', async () => {
  const store = fakeDb({
    'households/hh': {name: 'Family', createdBy: 'mom'},
    'users/mom': {role: 'parent', householdId: 'hh', email: 'm@example.test'},
    'users/dad': {role: 'parent', householdId: 'hh', email: 'd@example.test'},
    'users/kid': {role: 'athlete', householdId: 'hh', athleteId: 'k1',
      email: 'k@example.test'},
  });
  assert.deepEqual(uids(await householdAudience(store, 'hh')),
      ['dad', 'mom']);
});

test('householdAudience: a createdBy login that is not an athlete of this ' +
    'household is not added', async () => {
  const store = fakeDb({
    'households/hh': {createdBy: 'elsewhere'},
    'households/hh2': {createdBy: 'staff'},
    'users/elsewhere': {role: 'athlete', householdId: 'other', athleteId: 'x',
      email: 'x@example.test'},
    'users/staff': {role: 'owner', email: 'o@example.test'},
  });
  assert.deepEqual(await householdAudience(store, 'hh'), []);
  assert.deepEqual(await householdAudience(store, 'hh2'), []);
});

test('householdAudience: no household, no createdBy, a missing user or no ' +
    'way to reach them -> parents only', async () => {
  const store = fakeDb({
    'households/plain': {name: 'No creator'},
    'households/ghost': {createdBy: 'gone'},
    'households/mute': {createdBy: 'mute'},
    'users/mute': {role: 'athlete', householdId: 'mute', athleteId: 'm1'},
    'users/p': {role: 'parent', householdId: 'plain', email: 'p@example.test'},
  });
  assert.deepEqual(await householdAudience(store, null), []);
  assert.deepEqual(uids(await householdAudience(store, 'plain')), ['p']);
  assert.deepEqual(await householdAudience(store, 'ghost'), []);
  assert.deepEqual(await householdAudience(store, 'mute'), []);
  assert.deepEqual(await householdAudience(store, 'missing'), []);
});

run();
