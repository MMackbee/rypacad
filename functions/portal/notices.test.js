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
    });

// --- single token (owner rulings 2026-09-29/30) ----------------------------

const TEDDY = {name: 'Teddy Hart'};
const TRAINING = {date: '2026-11-04', time: '3:00 PM', type: 'training',
  label: null};
const SCRAMBLE = {date: '2026-11-07', time: '10:00 AM', type: 'tournament',
  label: 'Fall Scramble'};

test('bookingCancelled: the old body is byte-identical', () => {
  assert.deepEqual(notices.bookingCancelled({athlete: TEDDY,
    session: TRAINING}), {
    title: 'Booking cancelled',
    body: 'Teddy\'s booking for Training, Wed, Nov 4 at 3:00 PM was ' +
        'cancelled. The token is back in this period.',
  });
});

test('bookingCancelled: a single token is back until season end', () => {
  assert.deepEqual(notices.bookingCancelled({athlete: TEDDY,
    session: TRAINING, singleToken: true}), {
    title: 'Booking cancelled',
    body: 'Teddy\'s booking for Training, Wed, Nov 4 at 3:00 PM was ' +
        'cancelled. The session token is back - good through Sat, Feb 27.',
  });
});

test('sessionCancelled: old bodies byte-identical; tokenReturned appends',
    () => {
      assert.equal(notices.sessionCancelled({athlete: TEDDY,
        session: SCRAMBLE, graceExpiresAt: '2026-12-07'}).body,
      'Fall Scramble on Sat, Nov 7 was cancelled by the academy. A bonus ' +
          'token was added to Teddy\'s account (expires Mon, Dec 7).');
      assert.equal(notices.sessionCancelled({athlete: TEDDY,
        session: SCRAMBLE, graceExpiresAt: null}).body,
      'Fall Scramble on Sat, Nov 7 was cancelled by the academy.');
      assert.deepEqual(notices.sessionCancelled({athlete: TEDDY,
        session: SCRAMBLE, graceExpiresAt: null, tokenReturned: true}), {
        title: 'Session cancelled',
        body: 'Fall Scramble on Sat, Nov 7 was cancelled by the academy. ' +
            'Teddy\'s session token was returned - use it on another ' +
            'session.',
      });
    });

test('graceExpiring: bonus body unchanged; single-purchase variant', () => {
  assert.deepEqual(notices.graceExpiring({athlete: TEDDY,
    expiresAt: '2026-11-11'}), {
    title: 'Bonus token expiring',
    body: 'Teddy\'s bonus token expires Wed, Nov 11.',
  });
  assert.equal(notices.graceExpiring({athlete: TEDDY,
    expiresAt: '2026-11-11', reason: 'session-cancelled'}).title,
  'Bonus token expiring');
  assert.deepEqual(notices.graceExpiring({athlete: TEDDY,
    expiresAt: '2027-02-27', reason: 'single-purchase'}), {
    title: 'Session token expiring',
    body: 'Teddy\'s unused session token expires Sat, Feb 27, the last ' +
        'day of the season.',
  });
});

test('waitlistExpired: bonus body unchanged; tokenFree drops the bonus',
    () => {
      assert.deepEqual(notices.waitlistExpired({athlete: TEDDY,
        session: TRAINING, expiresAt: '2026-12-04'}), {
        title: 'Waitlist closed',
        body: 'The waitlist for Training, Wed, Nov 4 at 3:00 PM closed ' +
            'without a spot for Teddy. A bonus token was added to Teddy\'s ' +
            'account (expires Fri, Dec 4).',
      });
      assert.deepEqual(notices.waitlistExpired({athlete: TEDDY,
        session: TRAINING, tokenFree: true}), {
        title: 'Waitlist closed',
        body: 'The waitlist for Training, Wed, Nov 4 at 3:00 PM closed ' +
            'without a spot for Teddy. Teddy\'s session token is free again.',
      });
    });

test('bookingReleased: the double-spend guard\'s notice', () => {
  assert.deepEqual(notices.bookingReleased({athlete: TEDDY,
    session: SCRAMBLE}), {
    title: 'Booking released',
    body: 'Teddy\'s booking for Fall Scramble, Sat, Nov 7 at 10:00 AM was ' +
        'released because its session token was already used for another ' +
        'booking. Buy another token to book it again.',
  });
});

run();
