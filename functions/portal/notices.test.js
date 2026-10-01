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
      assert.equal(notices.waitlistExpired({athlete, session: tour}).body,
          'The waitlist for Tour event, Sat, Nov 7 at 9:00 AM closed ' +
          'without a spot for Teddy. The token held for it is free to use ' +
          'again.');
    });

// Owner ruling 2026-10-01: a waitlist never mints a bonus token, and an
// Elite athlete (no tokens) is never shown a token sentence.
const block = {type: 'training', date: '2026-11-12', time: '4:00 PM'};
const BLOCK = 'Training, Thu, Nov 12 at 4:00 PM';
const sam = {name: 'Sam Hart'};

test('waitlistExpired: the held token is free again, nothing is minted',
    () => {
      assert.deepEqual(notices.waitlistExpired({athlete: sam,
        session: block}), {
        title: 'Waitlist closed',
        body: `The waitlist for ${BLOCK} closed without a spot for Sam. ` +
            'The token held for it is free to use again.',
      });
      assert.equal(notices.waitlistExpired({athlete: sam, session: block,
        elite: true}).body,
      `The waitlist for ${BLOCK} closed without a spot for Sam.`);
    });

test('promoted: says the athlete is booked, a token was used, how to cancel',
    () => {
      assert.deepEqual(notices.promoted({athlete: sam, session: block}), {
        title: 'A spot opened up',
        body: `A spot opened - Sam is now booked for ${BLOCK}. One token ` +
            'was used. You can cancel in the app until the day before.',
      });
      assert.equal(notices.promoted({athlete: sam, session: block,
        elite: true}).body, `A spot opened - Sam is now booked for ${BLOCK}. ` +
          'You can cancel in the app until the day before.');
    });

test('waitlistCancelled: the academy cancelled the session', () => {
  assert.deepEqual(notices.waitlistCancelled({athlete: sam,
    session: block}), {
    title: 'Session cancelled',
    body: `${BLOCK} was cancelled by the academy. Sam was on its ` +
        'waitlist; the token held for it is free to use again.',
  });
  assert.equal(notices.waitlistCancelled({athlete: sam, session: block,
    elite: true}).body, `${BLOCK} was cancelled by the academy. Sam was ` +
      'on its waitlist.');
});

test('waitlistRemoved: next in line but could not be booked, and why',
    () => {
      const body = (reason, session) => notices.waitlistRemoved({
        athlete: sam, session: session || block, reason}).body;
      const lead = `Sam was next on the waitlist for ${BLOCK} but could ` +
          'not be booked: ';
      assert.equal(notices.waitlistRemoved({athlete: sam, session: block,
        reason: 'no-tokens-left'}).title, 'Removed from waitlist');
      assert.equal(body('no-tokens-left'),
          `${lead}no tokens are left for that period.`);
      assert.equal(body('membership-inactive'),
          `${lead}the membership payment is not up to date.`);
      assert.equal(body('no-package'),
          `${lead}no membership package is set.`);
      assert.equal(body('outside-window'),
          `${lead}that date is not open for booking yet.`);
      assert.equal(body('one-per-day'), `${lead}Elite includes one ` +
          'training block a day and one is already booked that day.');
      assert.equal(body('one-per-day', {type: 'tournament',
        date: '2026-11-07', time: '9:00 AM'}), 'Sam was next on the ' +
          'waitlist for Tour event, Sat, Nov 7 at 9:00 AM but could not be ' +
          'booked: Elite includes one Tour event a day and one is already ' +
          'booked that day.');
      assert.equal(body('one-per-day', Object.assign({}, block,
          {type: 'phil'})).endsWith('Elite includes one session with Phil ' +
          'a day and one is already booked that day.'), true);
      assert.equal(body('something-new'),
          `${lead}the booking did not go through.`);
    });

test('waitlist and promotion copy: no em dash, no exclamation mark', () => {
  const all = [
    notices.waitlistExpired({athlete: sam, session: block}),
    notices.promoted({athlete: sam, session: block}),
    notices.waitlistCancelled({athlete: sam, session: block}),
    notices.waitlistRemoved({athlete: sam, session: block,
      reason: 'one-per-day'}),
  ];
  for (const n of all) {
    assert.equal(/[—!]/.test(n.title + n.body), false, n.body);
  }
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

test('waitlistExpired: a single athlete reads the same no-mint body', () => {
  // Ruling 2026-10-01: a closed waitlist mints nothing for anyone, so the
  // single token needs no variant - the token it held is free again.
  assert.deepEqual(notices.waitlistExpired({athlete: TEDDY,
    session: TRAINING}), {
    title: 'Waitlist closed',
    body: 'The waitlist for Training, Wed, Nov 4 at 3:00 PM closed ' +
        'without a spot for Teddy. The token held for it is free to use ' +
        'again.',
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
