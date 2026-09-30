'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const notices = require('./notices');

test('paymentReceived: branched on bookingOpen (em dash, notices.js:268)',
    () => {
      assert.deepEqual(notices.paymentReceived({bookingOpen: false}), {
        title: 'Payment received',
        body: 'Payment received — booking opens Sat, Oct 10 at 7 AM.',
      });
      assert.deepEqual(notices.paymentReceived({bookingOpen: true}), {
        title: 'Payment received',
        body: 'Payment received — you\'re all set to book.',
      });
      // Named when the athlete is known (QA 2026-09-30: siblings' notices
      // read the same).
      assert.deepEqual(notices.paymentReceived(
          {bookingOpen: true, athleteName: 'Avery ZZSnine'}), {
        title: 'Payment received for Avery',
        body: 'Payment received for Avery — Avery is all set to book.',
      });
      assert.deepEqual(notices.paymentReceived(
          {bookingOpen: false, athleteName: 'Cody'}), {
        title: 'Payment received for Cody',
        body: 'Payment received for Cody — booking opens Sat, Oct 10 at 7 AM.',
      });
    });

run();
