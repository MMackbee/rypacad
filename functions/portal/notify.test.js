'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {channelAllowed} = require('./notify');

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

run();
