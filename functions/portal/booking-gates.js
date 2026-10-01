/**
 * Two booking gates the app applies before a normal booking, copied for the
 * server-side writers (owner ruling 2026-10-01: a waitlist promotion may
 * never produce a booking a normal tap would refuse).
 *
 * CHANGE ONE, CHANGE BOTH. `eliteDailyCapHit` and `windowDaysFor` mirror
 * `frontend/src/portal/data/packages.js`; `openThrough` and its two
 * constants mirror `frontend/src/portal/data/calendar.js`. Those files are
 * ESM and CRA-only, so Cloud Functions cannot import them (see lib.js).
 */

'use strict';

const lib = require('./lib');

/** The window rolls at 07:00 America/Chicago, not midnight. */
const WINDOW_ROLL_HOUR = 7;
/** Until this date the window counts from it, not from today. */
const BOOKING_WINDOW_ANCHOR = '2026-11-01';
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
 * The booking window in days: the package's own, 30 without one.
 * @param {?Object} pkg A `packages/{id}` body.
 * @return {number} Days.
 */
function windowDaysFor(pkg) {
  return pkg && Number.isInteger(pkg.windowDays) ? pkg.windowDays : 30;
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
 * The last session date bookable right now for a window of this length.
 * @param {!Date} now Any instant.
 * @param {number} windowDays The window, in days.
 * @return {string} `'YYYY-MM-DD'`.
 */
function openThrough(now, windowDays) {
  const date = lib.chicagoDate(now);
  const part = chicagoHour.formatToParts(now).find((p) => p.type === 'hour');
  // Some engines print midnight as "24" under hour12: false.
  const hour = Number(part && part.value) % 24;
  const rolled = hour >= WINDOW_ROLL_HOUR ? date : addDays(date, -1);
  const anchor = rolled < BOOKING_WINDOW_ANCHOR ?
      BOOKING_WINDOW_ANCHOR : rolled;
  return addDays(anchor, windowDays);
}

module.exports = {
  BOOKING_WINDOW_ANCHOR,
  DAILY_CAP_TYPES,
  eliteDailyCapHit,
  openThrough,
  windowDaysFor,
};
