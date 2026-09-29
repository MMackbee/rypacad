/**
 * The child-login state derivation (Sprint 20, spec 3.2) - pure, pinned
 * without Firestore. Task 13 appends the sign-ups report's row-builder tests.
 */
import { loginStateFor } from './signups';

const now = new Date('2026-10-05T15:00:00');

describe('loginStateFor', () => {
  test('no loginEmail is none, whatever invite is passed (the parent runs the child)', () => {
    expect(loginStateFor(null, { status: 'open', createdAt: now }, now)).toEqual({ state: 'none', claimedAt: null });
    expect(loginStateFor(undefined, null, now)).toEqual({ state: 'none', claimedAt: null });
  });
  test('open invites are invited, or invited-stale once open for more than 7 days', () => {
    expect(loginStateFor('kid@x.com', { status: 'open', createdAt: new Date('2026-10-01T00:00:00') }, now)).toEqual({ state: 'invited', claimedAt: null });
    expect(loginStateFor('kid@x.com', { status: 'open', createdAt: new Date('2026-09-28T15:00:00') }, now)).toEqual({ state: 'invited', claimedAt: null }); // exactly 7 days: not yet stale
    expect(loginStateFor('kid@x.com', { status: 'open', createdAt: new Date('2026-09-28T14:59:00') }, now)).toEqual({ state: 'invited-stale', claimedAt: null });
    // A Firestore Timestamp (toDate) works too.
    expect(loginStateFor('kid@x.com', { status: 'open', createdAt: { toDate: () => new Date('2026-09-20T00:00:00') } }, now).state).toBe('invited-stale');
  });
  test('claimed carries the stamp; orphaned reads none; a missing/unreadable invite reads invited', () => {
    expect(loginStateFor('kid@x.com', { status: 'claimed', claimedAt: new Date('2026-10-02T10:00:00') }, now)).toEqual({ state: 'claimed', claimedAt: '2026-10-02T10:00' });
    expect(loginStateFor('kid@x.com', { status: 'orphaned', createdAt: now }, now)).toEqual({ state: 'none', claimedAt: null });
    expect(loginStateFor('kid@x.com', null, now)).toEqual({ state: 'invited', claimedAt: null });
  });
});
