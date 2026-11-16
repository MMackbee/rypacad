/**
 * One-month rollover of unused monthly tokens (owner ruling 2026-11-15): a
 * token left unused when its period ends is good for the period after, then
 * gone. November's leftovers are usable through Dec 31, not in January.
 *
 * The server does the rolling (functions/portal/rollover.js): once a period
 * has ended it mints one graceTokens doc `rollover_{athleteId}_{periodKey}_{n}`
 * per unused token (reason 'rollover'), expiring on the next period's last
 * day. To the booking code that is a grace token like any other - spent
 * before a period token, soonest expiry first - so nothing in tokensFor or
 * createBooking changes. This file is only how the screens NAME one: which
 * grace tokens are rolled over, the meter's line for them, and what a
 * period's last week says about the tokens still unused.
 */

import { format, parseISO } from 'date-fns';
import { academyDateISO, addDaysISO, longDayLabel } from './calendar';
import { periodFor } from './packages';
import { SEASON_BOUNDS } from './season';

/** `graceTokens.reason` of a rolled-over token. */
export const ROLLOVER_REASON = 'rollover';
const TOKEN_PREFIX = 'rollover_';
const ID_PERIOD = /_(\d{4}-\d{2}-\d{2})_\d+$/;

/**
 * The first period end that rolls: November 2026 (the ruling starts with
 * November's leftovers on Dec 1). CHANGE ONE, CHANGE BOTH:
 * functions/portal/rollover.js FIRST_ROLLING_END.
 */
export const FIRST_ROLLING_END = '2026-11-30';

/** True for a rolled-over token's id (or a booking's graceTokenId). */
export function isRolloverTokenId(id) {
  return typeof id === 'string' && id.length > TOKEN_PREFIX.length && id.startsWith(TOKEN_PREFIX);
}

/** A grace entry that is a rolled-over token: by its id, or by its reason when the hook joined one on. */
export function isRolled(grace) {
  return Boolean(grace) && (isRolloverTokenId(grace.id) || grace.reason === ROLLOVER_REASON);
}

/** The period a rolled-over token was left unused in ('2026-11-01'), or null. */
export function rolledFrom(grace) {
  if (!isRolled(grace)) return null;
  if (grace.sourcePeriodKey) return grace.sourcePeriodKey;
  const m = ID_PERIOD.exec(grace.id || '');
  return m ? m[1] : null;
}

/** How many of these grace entries are rolled-over tokens. */
export function rolledCount(grace) {
  return (grace || []).filter(isRolled).length;
}

/**
 * The last day a token left unused in `period` can still be spent: the end
 * of the period after it, capped at the season end. Null when the period
 * does not roll - it ended before the ruling's first month, or the season is
 * over by the time it ends (February).
 * CHANGE ONE, CHANGE BOTH: functions/portal/rollover.js rollsUntil.
 * @param {{periodKey: string, periodEnd: string}|null} period
 * @param {number} [anchorDay] households.periodAnchorDay.
 */
export function rollsUntil(period, anchorDay = 1) {
  if (!period || !period.periodKey || !period.periodEnd) return null;
  if (period.periodEnd < FIRST_ROLLING_END) return null;
  const next = periodFor(addDaysISO(period.periodEnd, 1), anchorDay).periodEnd;
  const until = next < SEASON_BOUNDS.end ? next : SEASON_BOUNDS.end;
  return until > period.periodEnd ? until : null;
}

/**
 * A leftover token used early (owner 2026-11-16, the Schmidt case): whether
 * this period's unused tokens can book a NEXT-period session right now,
 * rather than from the 1st. The server's conditions
 * (functions/portal/roll-ahead.js), as far as a screen can know them: a
 * monthly token package, a token left, and a period that rolls at all. A
 * period with no tokenPeriods doc counts at the package's own number, as the
 * meter shows it (owner 2026-11-16: "she clearly has the tokens"), when
 * packageCountStands: third day on, and billing active since before the
 * period began (`billing` is the athlete's `billing` map).
 * @return {{count: number, until: string, fromPeriodKey: string}|null}
 */
export function rollAheadOffer({ pkg, left, period, anchorDay, tokenPeriod, today, billing } = {}) {
  if (!pkg || !Number.isFinite(pkg.tokens) || pkg.kind === 'single') return null;
  if (!Number.isInteger(tokenPeriod?.granted) && !packageCountStands({ period, today, billing })) return null;
  if (!(left > 0)) return null;
  const until = rollsUntil(period, anchorDay);
  return until ? { count: left, until, fromPeriodKey: period.periodKey } : null;
}

/**
 * Whether a RUNNING period with no tokenPeriods doc is counted at the
 * package's own number for the early roll: from its third day, once the
 * 1st's payment has either written the record or frozen the membership.
 * CHANGE ONE, CHANGE BOTH: functions/portal/rollover.js fallbackStands.
 */
export function fallbackStands(period, today) {
  return Boolean(period && period.periodKey && today) && today >= addDaysISO(period.periodKey, 2);
}

/**
 * Whether the athlete was already a paying member when the period began:
 * billing active and last changed BEFORE the period's first day (academy
 * time). A sign-up or a payment inside the period moves it into the period -
 * and a payment writes the record itself.
 * CHANGE ONE, CHANGE BOTH: functions/portal/rollover.js memberBefore.
 */
export function memberBefore(billing, period) {
  if (!billing || billing.status !== 'active' || !billing.updatedAt || !period || !period.periodKey) return false;
  const at = billing.updatedAt;
  const when = typeof at.toDate === 'function' ? at.toDate() : new Date(at);
  if (Number.isNaN(when.getTime())) return false;
  return academyDateISO(when) < period.periodKey;
}

/**
 * Whether a running period with no record is counted at the package's own
 * number for the early roll. The server also needs a household on file and
 * no test mark (functions/portal/rollover.js packageCountStands).
 */
export function packageCountStands({ period, today, billing } = {}) {
  return fallbackStands(period, today) && memberBefore(billing, period);
}

/**
 * The offer for one session date, or null: the date is in the next period,
 * on or before the offer's last day, and the next period has no token of
 * its own left (otherwise that token pays). `tokens` is the position with
 * `rollAhead` and `nextPeriod` (hooks/index.js tokensWithNextPeriod).
 */
export function rollAheadFor(tokens, dateISO) {
  const offer = tokens?.rollAhead;
  const np = tokens?.nextPeriod;
  if (!offer || !np || !dateISO || np.left !== 0 || !np.periodKey) return null;
  if (dateISO < np.periodKey || (np.periodEnd && dateISO > np.periodEnd) || dateISO > offer.until) return null;
  return offer;
}

const monthOfPeriod = (periodKey) => (periodKey && periodKey.endsWith('-01') ? format(parseISO(periodKey), 'MMMM') : null);

/** A session card's note: 'Uses your leftover November token'. */
export function rollAheadNote(offer) {
  if (!offer) return null;
  const month = monthOfPeriod(offer.fromPeriodKey);
  return month ? `Uses your leftover ${month} token` : 'Uses a leftover token from this period';
}

/**
 * The meter's line under a next period at zero: 'Your leftover November
 * token can book a December session now.' Null without an offer, or while
 * the next period still has tokens of its own.
 */
export function rollAheadLine(tokens) {
  const offer = tokens?.rollAhead;
  const np = tokens?.nextPeriod;
  if (!offer || !np || np.left !== 0) return null;
  const from = monthOfPeriod(offer.fromPeriodKey);
  const to = monthOfPeriod(np.periodKey);
  const one = offer.count === 1;
  const have = one ? `Your leftover ${from ? `${from} ` : ''}token` : `Your ${offer.count} leftover ${from ? `${from} ` : ''}tokens`;
  const book = to ? (one ? `a ${to} session` : `${to} sessions`) : one ? 'a session next period' : 'sessions next period';
  return `${have} can book ${book} now.`;
}

/**
 * The meter's line for the rolled-over tokens in hand: '2 tokens rolled over
 * from November - use by Thu, Dec 31'. The month is named for a
 * 1st-of-month period only. Null without one.
 */
export function rolledLine(grace) {
  const rolled = (grace || []).filter(isRolled);
  if (rolled.length === 0) return null;
  const n = rolled.length;
  const from = rolledFrom(rolled[0]);
  const month = from && from.endsWith('-01') ? ` from ${format(parseISO(from), 'MMMM')}` : '';
  const by = rolled[0].expiresAt ? ` - use by ${format(parseISO(rolled[0].expiresAt), 'EEE, MMM d')}` : '';
  return `${n} ${n === 1 ? 'token' : 'tokens'} rolled over${month}${by}`;
}

/**
 * A period's last week, for the tokens still unused (billingHub.js
 * expiryNudge): '2 unused tokens roll over on Tuesday, Dec 1 - use them by
 * Thu, Dec 31.' Null when the period does not roll (the nudge then keeps its
 * "expire" wording).
 * @param {{left: number, on: string, rollsUntil?: string|null}|null} nudge
 */
export function rollNudgeLine(nudge) {
  if (!nudge || !nudge.rollsUntil) return null;
  const one = nudge.left === 1;
  const rollsOn = longDayLabel(addDaysISO(nudge.on, 1));
  const by = format(parseISO(nudge.rollsUntil), 'EEE, MMM d');
  return `${nudge.left} unused ${one ? 'token rolls' : 'tokens roll'} over on ${rollsOn} - use ${one ? 'it' : 'them'} by ${by}.`;
}
