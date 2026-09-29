'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const notices = require('./notices');

test('paymentReceived: branched on bookingOpen (em dash, notices.js:268)',
    () => {
      assert.deepEqual(notices.paymentReceived({bookingOpen: false}), {
        title: 'Payment received',
        body: 'Payment received — booking opens Fri, Oct 10 at 7 AM.',
      });
      assert.deepEqual(notices.paymentReceived({bookingOpen: true}), {
        title: 'Payment received',
        body: 'Payment received — you\'re all set to book.',
      });
    });

run();
