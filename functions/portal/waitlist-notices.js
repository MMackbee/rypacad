/**
 * The four notices a waitlist sends (owner rulings 2026-10-01), each through
 * `notify.sendNotice` and so ledger-idempotent on `{kind}_{subjectKey}`:
 *
 *   promoted           a spot opened and the athlete was booked
 *   waitlist-removed   next in line, but a booking check refused it
 *   session-cancelled  the academy cancelled the session being waited on
 *   waitlist-expired   the session passed without a spot
 *
 * No waitlist notice mints or mentions a bonus token: when a waitlist
 * closes, the held token is simply free again. Elite holds no token, so an
 * Elite athlete's copy never has a token sentence.
 *
 * KEYS. A booking id and a waitlist id are both reused when a family comes
 * back to the same session, so a key built from them alone would swallow
 * the second notice. Each key therefore carries the entry's `joinedAt`,
 * which is new on every join: one notice per time on the list, and a
 * redelivered trigger still sends nothing twice.
 */

'use strict';

const lib = require('./lib');
const notices = require('./notices');
const notify = require('./notify');
const {joinedAtMillis} = require('./waitlist-order');

/** Promotion gates that are not news to the family. @const */
const SILENT_REASONS = ['already-booked', 'no-athlete'];

/**
 * The part of a ledger key that is new each time an athlete joins.
 * @param {*} joinedAt The entry's stored `joinedAt`, or its millis.
 * @return {string} `'_<millis>'`, or '' when the entry carries none.
 */
function joinKey(joinedAt) {
  const ms = typeof joinedAt === 'number' ? joinedAt : joinedAtMillis(joinedAt);
  return Number.isFinite(ms) ? `_${ms}` : '';
}

/**
 * A spot opened and the athlete is now booked.
 * @param {{athleteId: string, householdId: ?string, athleteName: ?string,
 *     attendee: ?string, chargedFrom: string, joinedAt: *, sessionId: string,
 *     session: !Object}} p The promotion.
 * @return {!Promise<!Object>} The `sendNotice` result.
 */
function promoted(p) {
  const copy = notices.promoted({
    athlete: p.athleteName ? {name: p.athleteName} : null,
    session: p.session,
    booking: {attendee: p.attendee || null},
    elite: p.chargedFrom === 'elite',
  });
  const bookingId = lib.bookingId(p.athleteId, p.sessionId);
  return notify.sendNotice({
    kind: 'promoted',
    category: 'schedule',
    householdId: p.householdId || null,
    athleteId: p.athleteId,
    sessionId: p.sessionId,
    bookingId,
    subjectKey: bookingId + joinKey(p.joinedAt),
    title: copy.title,
    body: copy.body,
  });
}

/**
 * The athlete was next in line but a booking check refused the promotion,
 * so the entry was removed. Nothing is sent for a reason that is not news
 * (already booked into the session, or no athlete to tell). A payment
 * reason is a billing notice, so it reaches the parents only: a child is
 * not told the card failed (portal/notify.js).
 * @param {{athleteId: ?string, householdId: ?string, athleteName: ?string,
 *     reason: string, joinedAt: *, sessionId: string, session: !Object}} d
 *     The dropped entry.
 * @return {!Promise<?Object>} The `sendNotice` result, or null when silent.
 */
async function removed(d) {
  if (!d.athleteId || SILENT_REASONS.includes(d.reason)) return null;
  const copy = notices.waitlistRemoved({
    athlete: d.athleteName ? {name: d.athleteName} : null,
    session: d.session,
    reason: d.reason,
  });
  return notify.sendNotice({
    kind: 'waitlist-removed',
    category: d.reason === 'membership-inactive' ? 'billing' : 'schedule',
    householdId: d.householdId || null,
    athleteId: d.athleteId,
    sessionId: d.sessionId,
    subjectKey: lib.waitlistId(d.sessionId, d.athleteId) + joinKey(d.joinedAt),
    title: copy.title,
    body: copy.body,
  });
}

/**
 * The waitlist closed without a spot. `cancelled` picks the copy: the
 * academy cancelled the session, or the session simply passed.
 * @param {{entry: !Object, athlete: ?Object, session: ?Object,
 *     elite: boolean, cancelled: boolean}} c The closed entry.
 * @return {!Promise<!Object>} The `sendNotice` result.
 */
function closed(c) {
  const {entry} = c;
  const args = {athlete: c.athlete, session: c.session, elite: c.elite};
  const copy = c.cancelled ?
      notices.waitlistCancelled(args) : notices.waitlistExpired(args);
  const key = `${entry.sessionId}_${entry.athleteId}_waitlist`;
  return notify.sendNotice({
    kind: c.cancelled ? 'session-cancelled' : 'waitlist-expired',
    category: 'schedule',
    householdId: entry.householdId ||
        (c.athlete && c.athlete.householdId) || null,
    athleteId: entry.athleteId,
    sessionId: entry.sessionId,
    // Both kinds carry the join part: a session moved on the calendar can
    // be swept, rejoined and closed again, and the second close is news.
    subjectKey: key + joinKey(entry.joinedAt),
    title: copy.title,
    body: copy.body,
  });
}

module.exports = {SILENT_REASONS, closed, joinKey, promoted, removed};
