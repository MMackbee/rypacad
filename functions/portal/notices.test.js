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

test('Tour naming (2026-09-30): the fallback label, never a typed one',
    () => {
      const tour = {type: 'tournament', date: '2026-11-07', time: '9:00 AM'};
      assert.equal(notices.TYPE_LABELS.tournament, 'Tour event');
      assert.equal(notices.sessionLabel(tour), 'Tour event');
      // A label typed into the calendar stays exactly as typed.
      assert.equal(notices.sessionLabel(Object.assign({}, tour,
          {label: 'Fall Tournament'})), 'Fall Tournament');
      const athlete = {name: 'Teddy Hart'};
      assert.equal(notices.bookingConfirmed({athlete, session: tour}).body,
          'Teddy is booked: Tour event, Sat, Nov 7 at 9:00 AM.');
      assert.equal(notices.reminder24h({athlete, session: tour}).body,
          'Reminder: Teddy has Tour event tomorrow at 9:00 AM.');
      assert.equal(notices.sessionCancelled({athlete, session: tour}).body,
          'Tour event on Sat, Nov 7 was cancelled by the academy.');
      assert.equal(notices.waitlistExpired({athlete, session: tour,
        expiresAt: '2026-12-07'}).body, 'The waitlist for Tour event, Sat, ' +
          'Nov 7 at 9:00 AM closed without a spot for Teddy. A bonus token ' +
          'was added to Teddy\'s account (expires Mon, Dec 7).');
    });

run();
