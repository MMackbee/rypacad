'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {channelAllowed, LINKS, LOCKED_EMAIL_KINDS} = require('./notify');

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

run();
