/**
 * Callable clients (Sprint 20, contract 1.1): every rejection becomes a
 * LiveDataError with the function's own plain-language message and the
 * stable `details.reason`, so screens branch on `reason` like they do for
 * the booking gate.
 */
jest.mock('../../firebase', () => ({ functions: {} }));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/firestore', () => ({}));

import { ERR, LiveDataError } from './live';
import { wrapCallable } from './callables';

const httpsErr = (code, message, details) => Object.assign(new Error(message), { code, details });

describe('wrapCallable', () => {
  test('maps HttpsError codes incl. the two wrap() lacks', () => {
    expect(wrapCallable(httpsErr('functions/already-exists', 'Already set up', { reason: 'already-provisioned' }), 'createFamily'))
      .toMatchObject({ code: ERR.INVALID, reason: 'already-provisioned', message: 'Already set up' });
    expect(wrapCallable(httpsErr('functions/failed-precondition', 'Verify first', { reason: 'email-unverified' }), 'x').code).toBe(ERR.INVALID);
    expect(wrapCallable(httpsErr('functions/unauthenticated', 'Sign in', { reason: 'signed-out' }), 'x').code).toBe(ERR.UNAUTHENTICATED);
    expect(wrapCallable(httpsErr('functions/permission-denied', 'No', { reason: 'not-owner' }), 'x').code).toBe(ERR.PERMISSION);
    expect(wrapCallable(httpsErr('functions/not-found', 'Gone', { reason: 'athlete-not-found' }), 'x').code).toBe(ERR.NOT_FOUND);
    expect(wrapCallable(httpsErr('functions/unavailable', 'Checkout is unavailable right now. Try again in a minute.', { reason: 'stripe-error' }), 'x').code).toBe(ERR.UNAVAILABLE);
    expect(wrapCallable(httpsErr('functions/internal', 'Sign-up could not be saved. Try again.', { reason: 'write-failed' }), 'x').code).toBe(ERR.UNKNOWN);
    // D7 additions pass through as plain reasons - no client-side enum.
    expect(wrapCallable(httpsErr('functions/invalid-argument', 'Product must be tier or facility.', { reason: 'invalid-product' }), 'x').reason).toBe('invalid-product');
    expect(wrapCallable(httpsErr('functions/invalid-argument', 'Every athlete needs a name.', { reason: 'athlete-name-required' }), 'x').reason).toBe('athlete-name-required');
  });
  test('a bare code (no functions/ prefix) and a missing details map both work', () => {
    const e = wrapCallable(httpsErr('invalid-argument', 'Bad', undefined), 'x');
    expect(e).toBeInstanceOf(LiveDataError);
    expect(e).toMatchObject({ code: ERR.INVALID, reason: null, message: 'Bad' });
  });
  test('a LiveDataError passes through unchanged; a non-Error gets a context message', () => {
    const own = new LiveDataError(ERR.INVALID, 'mine', null, 'r');
    expect(wrapCallable(own, 'x')).toBe(own);
    expect(wrapCallable('boom', 'claimInvite').message).toBe('claimInvite failed.');
  });
});
