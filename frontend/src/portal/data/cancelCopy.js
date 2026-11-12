/**
 * What a family reads when a cancel does not go through (2026-11-04: a
 * parent was shown "cancelBooking: Missing or insufficient permissions." in
 * the cancel sheet). PURE and Firebase-free, like hooks/cancelSeries.js,
 * because components/CancelSheet.js imports it.
 *
 * A refusal live.js words for families on purpose ("This booking no longer
 * exists.", "Cancel or reschedule from Calendly's email", a stale tab's
 * NOT_CONFIRMED_COPY line below) is shown as it is.
 * A raw failure is not: the adapter's codes for a rules denial (a session
 * counter already at 0, the rules' same-day cut-off, a stale tab), a lost
 * connection, a signed-out tab or anything unrecognised, and - where no code
 * survives (a series summary row keeps only the message) - text that reads
 * like the SDK or carries wrap()'s "functionName: " prefix.
 */

/** live.js ERR values, as strings so this module never loads Firebase; cancelCopy.test.js pins them to ERR. */
const CODE_KIND = {
  'permission-denied': 'permission',
  unavailable: 'unavailable',
  'deadline-exceeded': 'unavailable',
  unauthenticated: 'unauthenticated',
  unknown: 'other',
};

const OFFLINE = "We couldn't reach the academy's system. Check your connection and try again.";
const SIGNED_OUT = 'You are signed out. Sign in again to cancel.';
const RETRY_OR_ACADEMY = "Refresh the page and try again, or contact the academy and we'll sort it out.";

export const CANCEL_FAILURE_COPY = {
  // The single cancel.
  one: {
    permission:
      "This reservation couldn't be cancelled from the app. Refresh the page and try again. If it still won't cancel, contact the academy and we'll sort it out.",
    unavailable: OFFLINE,
    unauthenticated: SIGNED_OUT,
    other: "The reservation couldn't be cancelled. Refresh the page and try again, or contact the academy if it keeps happening.",
  },
  // A series cancel that failed as a whole.
  many: {
    permission:
      "These reservations couldn't be cancelled from the app. Refresh the page and try again. If they still won't cancel, contact the academy and we'll sort it out.",
    unavailable: OFFLINE,
    unauthenticated: SIGNED_OUT,
    other: "The reservations couldn't be cancelled. Refresh the page and try again, or contact the academy if it keeps happening.",
  },
  // One reason line of a series summary: "Nov 24 was not cancelled. <reason>".
  week: { permission: RETRY_OR_ACADEMY, unavailable: OFFLINE, unauthenticated: SIGNED_OUT, other: RETRY_OR_ACADEMY },
};

const PERMISSION_TEXT = /insufficient permissions|permission[-_ ]denied/i;
const OFFLINE_TEXT = /\boffline\b|could not reach|failed to fetch|network (error|request)|deadline[-_ ]exceeded/i;
const SIGNED_OUT_TEXT = /unauthenticated|no signed-in user/i;
const SDK_TEXT = /firebase|firestore|\binternal\b/i;

/** SDK words, or wrap()'s "cancelBooking: " prefix (a lowercase function name and a colon). */
function looksTechnical(message) {
  return (
    /^[a-z][A-Za-z0-9]*: /.test(message) ||
    [PERMISSION_TEXT, OFFLINE_TEXT, SIGNED_OUT_TEXT, SDK_TEXT].some((re) => re.test(message))
  );
}

function kindOfText(message) {
  if (PERMISSION_TEXT.test(message)) return 'permission';
  if (OFFLINE_TEXT.test(message)) return 'unavailable';
  if (SIGNED_OUT_TEXT.test(message)) return 'unauthenticated';
  return 'other';
}

/**
 * The words for a failed cancel: the refusal's own message when it was
 * written for families, otherwise plain words for what went wrong. The
 * error's `.code` decides first (live.js ERR, or a raw SDK code with or
 * without its "firestore/" prefix); the text is only the fallback.
 *
 * @param {*} err  What the cancel rejected with, or `{ message }` alone.
 * @param {'one'|'many'|'week'} [as]  A single cancel (the default), a series
 *   that failed as a whole, or one reason line of a series summary.
 * @returns {string}
 */
export function cancelFailureCopy(err, as = 'one') {
  const words = CANCEL_FAILURE_COPY[as] || CANCEL_FAILURE_COPY.one;
  const message = err && typeof err.message === 'string' ? err.message.trim() : '';
  if (!message) return words.other;
  const technical = looksTechnical(message) || err.name === 'FirebaseError';
  // A refusal labelled with a reason (live.js 'calendly-managed') was worded on purpose.
  if (err.reason && !technical) return message;
  const code = typeof err.code === 'string' ? err.code.replace(/^[a-z]+\//, '') : null;
  const kind = CODE_KIND[code] || (technical ? kindOfText(message) : null);
  return kind ? words[kind] : message;
}

/**
 * cancelBooking's refusal when the booking is no longer 'confirmed' - a tab
 * left open while it was cancelled elsewhere, or a session that has since
 * been marked (2026-11-04: it read "Only a confirmed booking can be
 * cancelled (this one is noshow)."). live.js throws it with reason
 * 'not-confirmed' and these words, so cancelFailureCopy keeps them and a
 * series summary line reads "Nov 24 was not cancelled. <line>".
 */
export const NOT_CONFIRMED_COPY = {
  cancelled: 'This reservation was already cancelled. Refresh the page to see your schedule.',
  happened: "This session has already happened, so it can't be cancelled.",
  other: 'This reservation can no longer be cancelled. Refresh the page to see your schedule.',
};

/**
 * The family line for a booking that is not 'confirmed', by its status.
 * @param {string} status  The booking's stored status.
 * @returns {string}
 */
export function notConfirmedCopy(status) {
  if (status === 'cancelled') return NOT_CONFIRMED_COPY.cancelled;
  if (status === 'attended' || status === 'noshow') return NOT_CONFIRMED_COPY.happened;
  return NOT_CONFIRMED_COPY.other;
}

/**
 * What STAFF read when Roster's "Cancel session" / "Cancel remaining
 * bookings" fails (CancelSheet's failureCopy). Not the family line: the
 * family's "This reservation couldn't be cancelled ... contact the academy"
 * is wrong for the academy itself and hides the cause. cancelSession
 * (hooks/grace.js) commits in chunks of 8 writes, so it can stop part-way -
 * some bookings already cancelled and given their token, the rest not - and
 * a re-run is safe: it re-reads which bookings are still confirmed and who
 * already holds this session's bonus token. The line says all of that, and
 * ends with the underlying message for whoever looks into it.
 *
 * @param {*} err  What cancelSession rejected with.
 * @param {{remainingOnly?: boolean}} [opts]  Roster's "Cancel remaining
 *   bookings" (the session itself already cancelled) rather than "Cancel
 *   session"; it also names the button to tap again, the sheet's confirm.
 * @returns {string}
 */
export function staffCancelSessionFailureCopy(err, { remainingOnly = false } = {}) {
  const message = err && typeof err.message === 'string' ? err.message.trim() : '';
  const lead = remainingOnly
    ? 'The remaining bookings were not all cancelled. Some may already be.'
    : 'This session was not fully cancelled. Some of its bookings may already be.';
  const again =
    `Tap "${remainingOnly ? 'Cancel bookings' : 'Cancel session'}" again to finish. It skips anything ` +
    'already done, so no booking is cancelled twice and no bonus token is given twice.';
  return [lead, again, message ? `What went wrong: ${message}` : null].filter(Boolean).join(' ');
}
