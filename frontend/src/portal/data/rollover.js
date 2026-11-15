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
import { addDaysISO, longDayLabel } from './calendar';
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
