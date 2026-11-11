/**
 * Has a session started, on the academy's clock (America/Chicago) - the
 * server's half of the booking-changes rule (spec 2026-11-11 sections 4
 * and 5): a family may cancel or move a booking until its session starts.
 *
 * CHANGE ONE, CHANGE BOTH. `parseTimeToMinutes` mirrors
 * `frontend/src/portal/data/calendar.js#parseTimeToMinutes` and
 * `sessionStarted` mirrors `frontend/src/portal/data/sessionStart.js#
 * sessionStarted`. Those files are ESM and CRA-only, so Cloud Functions
 * cannot import them (see lib.js).
 *
 * A session time that does not read as `h:mm AM/PM` ('TBA', '4 PM', blank)
 * is never "started" on its own day; its date still closes it at midnight.
 */

'use strict';

const lib = require('./lib');

/**
 * Minutes after midnight of a `'4:00 PM'` session time, case-insensitive.
 * @param {*} text The session's `time` text.
 * @return {?number} 0..1439, or null when the text does not parse.
 */
function parseTimeToMinutes(text) {
  const m = String(text || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  const pm = m[3].toUpperCase() === 'PM';
  return ((Number(m[1]) % 12) + (pm ? 12 : 0)) * 60 + Number(m[2]);
}

/**
 * True when the session's date is before today in Chicago, or it is today
 * and its start time has passed. No session or no date is never started;
 * an unreadable time is judged by its date alone.
 * @param {?{date: ?string, time: ?string}} session A `sessions/{id}` body.
 * @param {!Date} now The instant to judge at.
 * @return {boolean} True once the session has started.
 */
function sessionStarted(session, now) {
  if (!session || !session.date) return false;
  const today = lib.chicagoDate(now);
  if (session.date !== today) return session.date < today;
  const start = parseTimeToMinutes(session.time);
  return start !== null && start <= parseTimeToMinutes(lib.chicagoTime(now));
}

module.exports = {parseTimeToMinutes, sessionStarted};
