/**
 * A leftover token used early (owner 2026-11-16, the Schmidt case): when the
 * session is in the NEXT period and that period's own tokens are all booked,
 * createBooking (hooks/live.js) asks the server to turn one of this period's
 * leftover tokens into a rolled-over token now, instead of on the 1st
 * (functions/portal/roll-ahead.js `rollTokenAhead`), and spends it as the
 * grace token it is.
 *
 * The callable lives here rather than in hooks/callables.js because that
 * file imports live.js, and live.js is the caller.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

/**
 * Whether a refused period charge is one the early roll could pay: the
 * period's tokens are all booked ('no-tokens-left'), the session is in a
 * LATER period than today's, the package is a monthly token package, and
 * this is a booking, not a waitlist place (a place holds a period token).
 * The server decides the rest.
 */
export function rollAheadApplies(err, { pkg, periodKey, currentPeriodKey, waitlistIfFull } = {}) {
  if (!err || err.reason !== 'no-tokens-left' || waitlistIfFull) return false;
  if (!pkg || !Number.isFinite(pkg.tokens) || pkg.kind === 'single') return false;
  return Boolean(periodKey && currentPeriodKey && periodKey > currentPeriodKey);
}

/**
 * `{ athleteId, date }` -> `{ graceTokenId, expiresAt, sourcePeriodKey }`, or
 * null when the server refuses (nothing left over, the month is not on
 * record, not needed) or the call fails. Never throws: the caller then
 * reports its own "tokens are fully booked".
 */
export async function requestRollAhead({ athleteId, date }) {
  try {
    const result = await httpsCallable(functions, 'rollTokenAhead')({ athleteId, date });
    const data = result && result.data;
    return data && typeof data.graceTokenId === 'string' && data.graceTokenId ? data : null;
  } catch (err) {
    return null;
  }
}
