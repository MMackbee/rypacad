/**
 * Two booking gates the app applies before a normal booking, copied for the
 * server-side writers (owner ruling 2026-10-01: a waitlist promotion may
 * never produce a booking a normal tap would refuse).
 *
 * CHANGE ONE, CHANGE BOTH. `eliteDailyCapHit` and `windowMonthsFor` mirror
 * `frontend/src/portal/data/packages.js`; `openThrough` mirrors
 * `frontend/src/portal/data/calendar.js` (owner ruling 2026-11-02: whole
 * calendar months, a further month opening at 07:00 America/Chicago on the
 * 1st). Those files are ESM and CRA-only, so Cloud Functions cannot import
 * them (see lib.js).
 */

'use strict';

const lib = require('./lib');

/** The window rolls at 07:00 America/Chicago, not midnight. */
const WINDOW_ROLL_HOUR = 7;
/** The session types Elite may hold one of per day. */
const DAILY_CAP_TYPES = ['training', 'tournament', 'phil'];

const chicagoHour = new Intl.DateTimeFormat('en-US', {
  timeZone: lib.TZ, hour12: false, hour: '2-digit',
});

/**
 * Elite's frequency cap: at most one training block, one Tour event and one
 * Phil session per date. Not a pool and never a charge.
 * @param {?Object} pkg A `packages/{id}` body.
 * @param {?string} type The session type being booked.
 * @param {?string} date The session date, `'YYYY-MM-DD'`.
 * @param {?Array<!Object>} bookings The athlete's bookings.
 * @return {boolean} True when the package is Elite and the athlete already
 *     holds a non-cancelled booking of that type on that date.
 */
function eliteDailyCapHit(pkg, type, date, bookings) {
  if (!pkg || pkg.kind !== 'elite' || !date) return false;
  if (!DAILY_CAP_TYPES.includes(type)) return false;
  return (bookings || []).some((b) => b && b.status !== 'cancelled' &&
      b.date === date && b.type === type);
}

/**
 * The booking window in whole calendar months (owner ruling 2026-11-02):
 * through the end of NEXT month for a token package or the single token,
 * the month after next for Elite. Read off the package kind, never the
 * retired `windowDays` field a production doc may still carry.
 * @param {?Object} pkg A `packages/{id}` body.
 * @return {number} Months: 1 or 2.
 */
function windowMonthsFor(pkg) {
  return pkg && (pkg.kind || pkg.id) === 'elite' ? 2 : 1;
}

/**
 * The last day of the month `monthsAhead` months after the one holding
 * `dateISO` (day 0 of the month after that is its last day).
 * @param {string} dateISO `'YYYY-MM-DD'`.
 * @param {number} monthsAhead Whole months forward.
 * @return {string} `'YYYY-MM-DD'`.
 */
function endOfMonth(dateISO, monthsAhead) {
  const [y, m] = String(dateISO).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + monthsAhead + 1, 0, 12))
      .toISOString().slice(0, 10);
}

/**
 * `'YYYY-MM-DD'` plus N days, UTC-noon arithmetic (no DST edge).
 * @param {string} dateISO `'YYYY-MM-DD'`.
 * @param {number} days Days to add; may be negative.
 * @return {string} `'YYYY-MM-DD'`.
 */
function addDays(dateISO, days) {
  const [y, m, d] = String(dateISO).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/**
 * The last session date bookable right now: the end of the month
 * `windowMonths` months past the month the window counts from (today in
 * Chicago from 7 AM, else yesterday). On Nov 2 a token family reaches
 * Dec 31 and Elite Jan 31; from 7 AM on Dec 1, Jan 31 and Feb 28.
 * @param {!Date} now Any instant.
 * @param {number} windowMonths The window, in whole months.
 * @return {string} `'YYYY-MM-DD'`.
 */
function openThrough(now, windowMonths) {
  const date = lib.chicagoDate(now);
  const part = chicagoHour.formatToParts(now).find((p) => p.type === 'hour');
  // Some engines print midnight as "24" under hour12: false.
  const hour = Number(part && part.value) % 24;
  const rolled = hour >= WINDOW_ROLL_HOUR ? date : addDays(date, -1);
  return endOfMonth(rolled, windowMonths);
}

module.exports = {
  DAILY_CAP_TYPES,
  eliteDailyCapHit,
  openThrough,
  windowMonthsFor,
};
