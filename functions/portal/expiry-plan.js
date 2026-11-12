/**
 * When a period's `tokens-expiring` notice goes out (portal/jobs.js), from
 * the academy's REAL session calendar (2026-11-04).
 *
 * The plan is read off the `sessions` docs the Google Calendar sync writes,
 * never off a list of closures: the academy runs sessions through most
 * holiday weeks (Nov 25, 27, 28, Dec 23, 26, 28-30, Jan 2 and Feb 15 all
 * have them) and is shut only on the days that have none - Sundays,
 * Thanksgiving, Christmas Eve and Day, New Year's Eve and Day. A provisional
 * closure list said Dec 23 - Jan 3 and would have told December families
 * their tokens were dead a week early.
 *
 * Pure: no Firestore, no clock. Dates are `'YYYY-MM-DD'` strings on the
 * UTC-noon arithmetic `lib` uses, so no DST edge can move a day.
 */

'use strict';

const {SEASON_END} = require('./single');

/**
 * How many days ahead an expiry is warned about. Owner ruling 2026-09-22:
 * SEVEN, so a family has a weekend in hand to use the sessions they paid for
 * (it was 3). Still exactly one notice per expiry - never a range, so nobody
 * is warned twice for the same expiry. A bonus token is warned this many
 * calendar days out; period tokens this many DAYS WITH SESSIONS before the
 * period's last one (expiryPlan, 2026-11-04).
 * @const {number}
 */
const EXPIRY_LEAD_DAYS = 7;

/**
 * The session types a period token is spent on in the app: training, Tour
 * events (type id 'tournament') and Phil's sessions. Yannick's 1:1s are
 * Calendly bookings (`cal-` docs, `bookable: false`) and never count.
 * @const {!Set<string>}
 */
const TOKEN_SESSION_TYPES = new Set(['training', 'tournament', 'phil']);

/**
 * `'YYYY-MM-DD'` plus N days (N may be negative), on the UTC-noon arithmetic
 * `lib` uses so no DST edge can move a calendar date.
 * @param {string} dateISO `'YYYY-MM-DD'`.
 * @param {number} days Days to add.
 * @return {string} `'YYYY-MM-DD'`.
 */
function addDays(dateISO, days) {
  const [y, m, d] = String(dateISO).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/**
 * The part of a period that can still hold a session: the period, cut at
 * the season's last day.
 * @param {?{periodKey: string, periodEnd: string}} period The period.
 * @return {?{from: string, to: string}} Both inclusive; null when the
 *     period starts after the season.
 */
function sessionSpan(period) {
  if (!period || !period.periodKey || !period.periodEnd) return null;
  const to = period.periodEnd < SEASON_END ? period.periodEnd : SEASON_END;
  return period.periodKey <= to ? {from: period.periodKey, to} : null;
}

/**
 * The days a period token can still be spent on: the distinct dates of the
 * sessions of a token type (TOKEN_SESSION_TYPES) that are not cancelled and
 * are bookable in the app (`bookable !== false`). A day whose only session
 * was cancelled is not one. Ascending.
 * @param {!Array<?Object>} sessions `sessions/{id}` bodies.
 * @return {!Array<string>} `'YYYY-MM-DD'` dates.
 */
function sessionDays(sessions) {
  const found = new Set();
  for (const s of sessions || []) {
    if (!s || typeof s.date !== 'string') continue;
    if (!TOKEN_SESSION_TYPES.has(s.type)) continue;
    if (s.status === 'cancelled' || s.bookable === false) continue;
    found.add(s.date);
  }
  return [...found].sort();
}

/**
 * When one period's notice goes out. `lastDay` is the period's last day
 * with a session; `sendOn` is the EXPIRY_LEAD_DAYS-th (7th) day with a
 * session counting back from it, `lastDay` included, so a family always has
 * seven session days in hand. A last week with only its Sunday off gives the
 * old spacing, seven calendar days before `lastDay`; a period with fewer
 * session days than that goes out on its first one. One send day per
 * period, never a range: a run day already gone is not caught up, and a
 * period with no session day gets no notice.
 * @param {?{periodKey: string, periodEnd: string}} period The period.
 * @param {!Array<string>} dates Days with a session (sessionDays). Repeats,
 *     and dates outside the period or after the season, are ignored.
 * @return {?{sendOn: string, lastDay: string}} The plan, or null.
 */
function expiryPlan(period, dates) {
  const span = sessionSpan(period);
  if (!span) return null;
  const days = [...new Set(dates || [])]
      .filter((d) => typeof d === 'string' && d >= span.from && d <= span.to)
      .sort();
  if (days.length === 0) return null;
  return {
    sendOn: days[Math.max(0, days.length - EXPIRY_LEAD_DAYS)],
    lastDay: days[days.length - 1],
  };
}

module.exports = {
  EXPIRY_LEAD_DAYS,
  TOKEN_SESSION_TYPES,
  addDays,
  expiryPlan,
  sessionDays,
  sessionSpan,
};
