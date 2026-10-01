/**
 * Callable clients (Sprint 20, contract 1.1) - the browser side of the
 * functions lane's onCall handlers. New code stays out of the grandfathered
 * live.js (the grace.js/waitlist.js precedent). Each call unwraps
 * `result.data`; each rejection becomes a LiveDataError whose `reason` is
 * the function's stable `details.reason` and whose `message` is the
 * function's own plain-language copy, surfaced verbatim.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { ERR, LiveDataError } from './live';

// wrap()'s own map (live.js:89-96) plus the two HttpsError codes it lacks.
const CODE_MAP = {
  'permission-denied': ERR.PERMISSION,
  'not-found': ERR.NOT_FOUND,
  unavailable: ERR.UNAVAILABLE,
  'deadline-exceeded': ERR.UNAVAILABLE,
  unauthenticated: ERR.UNAUTHENTICATED,
  'invalid-argument': ERR.INVALID,
  'already-exists': ERR.INVALID,
  'failed-precondition': ERR.INVALID,
};

export function wrapCallable(err, context) {
  if (err instanceof LiveDataError) return err;
  const raw = String((err && err.code) || '').replace(/^functions\//, '');
  const code = CODE_MAP[raw] || ERR.UNKNOWN;
  const reason = err && err.details && typeof err.details.reason === 'string' ? err.details.reason : null;
  const message = err && err.message ? String(err.message) : `${context} failed.`;
  return new LiveDataError(code, message, err, reason);
}

function callable(name) {
  const fn = httpsCallable(functions, name);
  return async (payload = {}) => {
    try {
      const result = await fn(payload);
      return result.data;
    } catch (err) {
      throw wrapCallable(err, name);
    }
  };
}

/** `{ householdId, athleteIds }` (contract 1.2). */
export const callCreateFamily = callable('createFamily');
/** `{ householdId, athleteIds }` (contract 1.3). */
export const callAddAthletes = callable('addAthletes');
/** `{ url }` (contract 1.5). */
export const callCreateCheckoutSession = callable('createCheckoutSession');
/**
 * `{ sessionIds }` (1 to 50) -> `{ positions: { [sessionId]: { [athleteId]: number } } }`:
 * the caller's own athletes' 1-based places, in the order promotion uses.
 * Screens read it through hooks/waitlist.js#fetchWaitlistPositions, which
 * never throws - a place in line is simply not shown when this fails.
 */
export const callWaitlistPositions = callable('waitlistPositions');
const claimInvite = callable('claimInvite');
/** `{ state, householdId, athleteId }` - ids only on 'claimed' (D7); never throws for an expected state (contract 1.4). */
export const callClaimInvite = () => claimInvite({});
