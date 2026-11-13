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
/**
 * `{ note, page, viewport, userAgent, appVersion, image? }` -> `{ ok }`: the
 * Feedback button (2026-10-15) posts a note and a screenshot to the RYP
 * team's Slack. Built by hooks/feedback.js#feedbackPayload.
 */
export const callSubmitFeedback = callable('submitFeedback');
/**
 * `{ athleteId }` -> `{ status: 'sent' | 'duplicate' }`: Yannick's "Send a
 * reminder" to sign the mental consent (functions/portal/mental-consent-request.js).
 * A refusal's `reason`: 'not-mental', 'no-athlete', 'disabled', 'no-household',
 * 'test-household', 'already-signed', 'no-dob' or 'send-failed'.
 */
export const callRequestMentalConsent = callable('requestMentalConsent');
/**
 * `{ bookingId, toSessionId }` -> `{ bookingId, movedFrom, sessionId, periodKey,
 * chargedFrom, graceTokenId, comp, rebooked }`: a family's Move (spec
 * 2026-11-11 §5, plan C2), one server transaction. A refusal's `reason` is one
 * of C2's (components/MoveSheet.js moveRefusalCopy). Through hooks/move.js.
 */
export const callMoveBooking = callable('moveBooking');
/**
 * `{ bookingIds, category, note? }` -> `{ sessionId, cancelled: [{ bookingId,
 * athleteId, cancelledFrom, tokenBack }] }`: the owner's or ops' cancel on the
 * Billing staff view (owner approved 2026-11-12), one server transaction for
 * one athlete's booking and any brothers and sisters on the same session. A
 * refusal's `reason` is data/staffCancel.js's. Through hooks/staffCancel.js.
 */
export const callStaffCancelBooking = callable('staffCancelBooking');
/**
 * `{ athleteId, sessionId, free?, allowFull? }` -> `{ bookingId, athleteId,
 * sessionId, periodKey, chargedFrom, graceTokenId, comp, rebooked, booked,
 * capacity, overrides }`: the owner's or ops' add of one athlete to one
 * session (owner 2026-11-13), one server transaction. A refusal's `reason`
 * is data/staffBookingCopy.js's; `full` carries `{ taken, capacity }` in
 * its details. Through hooks/staffBooking.js.
 */
export const callStaffBookSession = callable('staffBookSession');
const claimInvite = callable('claimInvite');
/** `{ state, householdId, athleteId }` - ids only on 'claimed' (D7); never throws for an expected state (contract 1.4). */
export const callClaimInvite = () => claimInvite({});
