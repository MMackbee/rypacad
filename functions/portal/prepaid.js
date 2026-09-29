/**
 * The prepaid month (spec 4.2, rulings 0.11 and 0.13): before Nov 1 every
 * checkout prepays November 2026 in full; from Nov 1 it prepays the rest of
 * the current Chicago month, prorated by days remaining (tokens rounded up,
 * never 0), and the subscription first bills at 00:00 Chicago on the next
 * 1st. Pure; `now` is injectable.
 */
'use strict';

const lib = require('./lib');

/** Ruling 0.13, not a default. @const {boolean} */
const PRORATE_JOINERS = true;
/** The season's first billable period. @const {string} */
const SEASON_FIRST_PERIOD = '2026-11-01';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const clock = new Intl.DateTimeFormat('en-US', {
  timeZone: lib.TZ, hour: '2-digit', hour12: false,
});

/**
 * Unix seconds of 00:00 America/Chicago on a calendar date. Tries each UTC
 * offset the zone can have (CDT -5, CST -6) and keeps the one that formats
 * back to hour 0 on that date, so no DST edge can be off by an hour.
 * @param {string} iso `'YYYY-MM-DD'`.
 * @return {number} Unix seconds.
 */
function chicagoMidnightUnix(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  for (const h of [5, 6]) {
    const t = new Date(Date.UTC(y, m - 1, d, h));
    const hour = Number(clock.formatToParts(t)
        .find((p) => p.type === 'hour').value) % 24;
    if (lib.chicagoDate(t) === iso && hour === 0) return t.getTime() / 1000;
  }
  throw new Error(`no Chicago midnight for ${iso}`);
}

/**
 * @param {string} periodKey `'YYYY-MM-01'`.
 * @return {string} `'November 2026'`.
 */
function labelFor(periodKey) {
  const [y, m] = periodKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/**
 * Which month a checkout prepays, and for how much.
 * @param {Date|number} now The instant of checkout.
 * @param {{priceCents: number, tokens: ?number, prorate: (boolean|undefined)}}
 *     args The package's monthly price and token count (null == Elite).
 * @return {{periodKey: string, periodEnd: string, trialEnd: number,
 *     amountCents: number, tokens: ?number, prorated: boolean,
 *     label: string}} The prepaid period.
 */
function prepaidPeriodFor(now, args) {
  const prorate = args.prorate === undefined ? PRORATE_JOINERS : args.prorate;
  const today = lib.chicagoDate(now instanceof Date ? now : new Date(now));
  const base = today < SEASON_FIRST_PERIOD ?
      lib.periodFor(SEASON_FIRST_PERIOD, 1) : lib.periodFor(today, 1);
  const next = lib.nextPeriod(base.periodKey, 1).periodKey;
  const out = {
    periodKey: base.periodKey,
    periodEnd: base.periodEnd,
    trialEnd: chicagoMidnightUnix(next),
    amountCents: args.priceCents,
    tokens: args.tokens === undefined ? null : args.tokens,
    prorated: false,
    label: labelFor(base.periodKey),
  };
  if (today < SEASON_FIRST_PERIOD || !prorate) return out;
  const daysInMonth = Number(base.periodEnd.slice(8, 10));
  const daysRemaining = daysInMonth - Number(today.slice(8, 10)) + 1;
  if (daysRemaining >= daysInMonth) return out;
  out.amountCents = Math.round(args.priceCents * daysRemaining / daysInMonth);
  out.tokens = out.tokens === null ? null :
      Math.max(1, Math.ceil(out.tokens * daysRemaining / daysInMonth));
  out.prorated = true;
  return out;
}

module.exports = {
  PRORATE_JOINERS, SEASON_FIRST_PERIOD, chicagoMidnightUnix, prepaidPeriodFor,
};
