/**
 * The words a family reads when a cancel does not go through (2026-11-04: a
 * parent read "cancelBooking: Missing or insufficient permissions."). Own
 * refusals stay as written; raw ones become plain words.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({}));

import { ERR, LiveDataError, wrap } from '../hooks/live';
import { CANCEL_FAILURE_COPY, NOT_CONFIRMED_COPY, cancelFailureCopy, notConfirmedCopy, staffCancelSessionFailureCopy } from './cancelCopy';
import { SERIES_STOP_COPY } from '../hooks/cancelSeries';

const { one, many, week } = CANCEL_FAILURE_COPY;
// A Firestore SDK error as the SDK throws it.
const sdk = (code, message) => Object.assign(new Error(message), { name: 'FirebaseError', code });
const NO_TECH = /cancelBooking|permission|insufficient|firebase|firestore|internal|unavailable|:/i;

test('none of the plain lines carries a code, a function name or SDK words', () => {
  for (const words of [one, many, week, NOT_CONFIRMED_COPY]) {
    for (const line of Object.values(words)) expect(line).not.toMatch(NO_TECH);
  }
});

describe('the adapter code decides', () => {
  test('the Schmidt case: a rules denial through wrap() reads as plain words, not the permissions text', () => {
    const err = wrap(sdk('permission-denied', 'Missing or insufficient permissions.'), 'cancelBooking');
    expect(err.message).toBe('cancelBooking: Missing or insufficient permissions.');
    expect(cancelFailureCopy(err)).toBe(one.permission);
    expect(one.permission).toBe(
      "This reservation couldn't be cancelled from the app. Refresh the page and try again. If it still won't cancel, contact the academy and we'll sort it out."
    );
  });

  test('a lost connection, a deadline and a signed-out tab', () => {
    expect(cancelFailureCopy(wrap(sdk('unavailable', 'Failed to get document because the client is offline.'), 'cancelBooking'))).toBe(
      "We couldn't reach the academy's system. Check your connection and try again."
    );
    expect(cancelFailureCopy(wrap(sdk('deadline-exceeded', 'Deadline exceeded'), 'cancelBooking'))).toBe(one.unavailable);
    // requireUser()'s own throw: no prefix, but not words for a family either.
    const signedOut = new LiveDataError(ERR.UNAUTHENTICATED, 'No signed-in user - live portal data requires Firebase auth.');
    expect(cancelFailureCopy(signedOut)).toBe('You are signed out. Sign in again to cancel.');
  });

  test('anything unrecognised is the plain generic line', () => {
    expect(cancelFailureCopy(wrap(sdk('aborted', 'Transaction failed all retries.'), 'cancelBooking'))).toBe(one.other);
    expect(cancelFailureCopy(wrap(sdk('internal', 'internal'), 'cancelBooking'))).toBe(one.other);
    // An unwrapped SDK error, with or without the service prefix on its code.
    expect(cancelFailureCopy(sdk('permission-denied', 'Missing or insufficient permissions.'))).toBe(one.permission);
    expect(cancelFailureCopy(sdk('firestore/unavailable', 'Could not reach Cloud Firestore backend.'))).toBe(one.unavailable);
    expect(cancelFailureCopy(sdk('failed-precondition', 'The query requires an index.'))).toBe(one.other);
  });

  test('the codes here are the ones live.js throws', () => {
    const coded = (code) => cancelFailureCopy(new LiveDataError(code, 'x'));
    expect(coded(ERR.PERMISSION)).toBe(one.permission);
    expect(coded(ERR.UNAVAILABLE)).toBe(one.unavailable);
    expect(coded(ERR.UNAUTHENTICATED)).toBe(one.unauthenticated);
    expect(coded(ERR.UNKNOWN)).toBe(one.other);
  });
});

describe("live.js's own refusals are kept", () => {
  test.each([
    ['This booking no longer exists.', ERR.NOT_FOUND],
    ['That session no longer exists.', ERR.NOT_FOUND],
  ])('%s', (message, code) => {
    expect(cancelFailureCopy(wrap(new LiveDataError(code, message), 'cancelBooking'))).toBe(message);
  });

  // A stale tab (2026-11-04): "Only a confirmed booking can be cancelled (this one is noshow)." reached a parent.
  test("a booking that is no longer confirmed: the family's words by its status, kept as they are", () => {
    expect(notConfirmedCopy('cancelled')).toBe('This reservation was already cancelled. Refresh the page to see your schedule.');
    expect(notConfirmedCopy('attended')).toBe("This session has already happened, so it can't be cancelled.");
    expect(notConfirmedCopy('noshow')).toBe("This session has already happened, so it can't be cancelled.");
    expect(notConfirmedCopy('waitlisted')).toBe('This reservation can no longer be cancelled. Refresh the page to see your schedule.');
    expect(notConfirmedCopy(undefined)).toBe(NOT_CONFIRMED_COPY.other);
    for (const status of ['cancelled', 'attended', 'noshow', 'waitlisted']) {
      const err = wrap(new LiveDataError(ERR.INVALID, notConfirmedCopy(status), null, 'not-confirmed'), 'cancelBooking');
      expect(cancelFailureCopy(err)).toBe(notConfirmedCopy(status));
      expect(cancelFailureCopy({ message: err.message }, 'week')).toBe(notConfirmedCopy(status)); // a series summary row
    }
  });

  test("Calendly's line, labelled with a reason", () => {
    const err = new LiveDataError(ERR.INVALID, "Cancel or reschedule from Calendly's email", null, 'calendly-managed');
    expect(cancelFailureCopy(err)).toBe("Cancel or reschedule from Calendly's email");
  });

  test("but live.js's developer-only checks are not", () => {
    expect(cancelFailureCopy(new LiveDataError(ERR.INVALID, 'cancelBooking: bookingId is required.'))).toBe(one.other);
    expect(cancelFailureCopy(new LiveDataError(ERR.NOT_FOUND, 'cancelBooking: No document to update: bookings/x'))).toBe(one.other);
  });

  test('a plain Error a caller words itself (the scholarship delete) is kept', () => {
    const line = "That didn't delete. This application is still here. Try again.";
    expect(cancelFailureCopy(new Error(line))).toBe(line);
  });
});

describe('with no code, the text is the fallback', () => {
  test('the raw permissions text, with or without the prefix', () => {
    expect(cancelFailureCopy(new Error('cancelBooking: Missing or insufficient permissions.'))).toBe(one.permission);
    expect(cancelFailureCopy({ message: 'Missing or insufficient permissions.' })).toBe(one.permission);
    expect(cancelFailureCopy({ message: 'FirebaseError: [code=unknown]' })).toBe(one.other);
    expect(cancelFailureCopy({ message: 'cancelBooking: something odd' })).toBe(one.other);
  });

  test('nothing to show: the generic line', () => {
    expect(cancelFailureCopy(new Error(''))).toBe(one.other);
    expect(cancelFailureCopy(null)).toBe(one.other);
    expect(cancelFailureCopy('oops')).toBe(one.other);
  });
});

describe('staff: Roster\'s "Cancel session" (staffCancelSessionFailureCopy)', () => {
  test('the session wording, a safe re-run, and the underlying message', () => {
    const err = wrap(sdk('permission-denied', 'Missing or insufficient permissions.'), 'cancelSession');
    expect(staffCancelSessionFailureCopy(err)).toBe(
      'This session was not fully cancelled. Some of its bookings may already be. ' +
        'Tap "Cancel session" again to finish. It skips anything already done, so no booking is cancelled twice and no bonus token is given twice. ' +
        'What went wrong: cancelSession: Missing or insufficient permissions.'
    );
  });

  test('remaining bookings name their own button; no message, no "what went wrong"', () => {
    expect(staffCancelSessionFailureCopy(new Error('Cancelling this session is not available yet.'), { remainingOnly: true })).toBe(
      'The remaining bookings were not all cancelled. Some may already be. ' +
        'Tap "Cancel bookings" again to finish. It skips anything already done, so no booking is cancelled twice and no bonus token is given twice. ' +
        'What went wrong: Cancelling this session is not available yet.'
    );
    expect(staffCancelSessionFailureCopy(null)).not.toMatch(/What went wrong/);
    expect(staffCancelSessionFailureCopy({ message: '   ' })).not.toMatch(/What went wrong/);
  });
});

describe('a series', () => {
  test('failing as a whole speaks of the reservations', () => {
    expect(cancelFailureCopy(wrap(sdk('permission-denied', 'Missing or insufficient permissions.'), 'cancelBooking'), 'many')).toBe(many.permission);
    expect(cancelFailureCopy(new Error(''), 'many')).toBe("The reservations couldn't be cancelled. Refresh the page and try again, or contact the academy if it keeps happening.");
  });

  test("a summary row keeps cancelSeries' own words and replaces the raw ones", () => {
    const stop = SERIES_STOP_COPY['permission-denied'];
    expect(cancelFailureCopy({ message: stop }, 'week')).toBe(stop);
    expect(cancelFailureCopy({ message: 'This booking no longer exists.' }, 'week')).toBe('This booking no longer exists.');
    expect(cancelFailureCopy({ message: 'cancelBooking: Transaction failed all retries.' }, 'week')).toBe(
      "Refresh the page and try again, or contact the academy and we'll sort it out."
    );
  });
});
