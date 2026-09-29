/**
 * The child-login state derivation (Sprint 20, spec 3.2) - pure, pinned
 * without Firestore. Task 13 appends the sign-ups report's row-builder tests.
 */
import { buildSignupRows, loginStateFor } from './signups';

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

const households = [
  { id: 'h1', name: 'Kim family', signup: { at: new Date('2026-10-01T09:30:00'), mode: 'parent' }, guardian: { name: 'Dana', email: 'dana@x.com', phone: '555' } },
  { id: 'legacy', name: 'Whitfield family', guardian: { name: 'W' } },
  { id: 'h2', name: 'Solo', signup: { at: new Date('2026-10-03T08:00:00'), mode: 'athlete' }, guardian: { name: 'Sam', email: 's@x.com', phone: '1' } },
];
const athletes = [
  { id: 'a1', householdId: 'h1', name: 'Ava', dob: '2012-06-17', packageId: 't-6', handicap: 20, loginEmail: 'ava@x.com', billing: { status: 'pending' } },
  { id: 'a2', householdId: 'h1', name: 'Ben', dob: null, packageId: 'elite', handicap: null, loginEmail: 'ben@x.com', billing: { status: 'active' }, facilityBilling: { status: 'active' } },
  { id: 'a3', householdId: 'h2', name: 'Sam', dob: '2005-01-01', packageId: 'single', loginEmail: null },
  { id: 'w', householdId: 'legacy', name: 'Jordan', packageId: 't-12' },
];
const invites = [
  { id: 'ava@x.com', athleteId: 'a1', householdId: 'h1', status: 'open', createdAt: new Date('2026-09-20T00:00:00') },
  { id: 'ben@x.com', athleteId: 'a2', householdId: 'h1', status: 'claimed', claimedAt: new Date('2026-10-02T10:00:00') },
];
const flaggedBookings = [{ id: 'a3_cal-1', athleteId: 'a3', flag: 'before-open', date: '2026-10-08' }];
const calendlyEvents = [{ id: 'ev-1', outcome: 'unresolved', receivedAt: new Date('2026-10-04T12:00:00'), householdId: null }];

test('rows, columns and counts', () => {
  const { rows, counts, unresolved } = buildSignupRows({ households, athletes, invites, flaggedBookings, calendlyEvents, now });
  expect(rows.map((r) => r.householdId)).toEqual(['h1', 'h2']); // legacy (no signup) excluded, input order kept
  const h1 = rows[0];
  expect(h1).toMatchObject({ name: 'Kim family', signedUpAt: '2026-10-01T09:30', mode: 'parent', parent: { name: 'Dana', email: 'dana@x.com', phone: '555' }, unpaid: true, flagged: false });
  expect(h1.athletes[0]).toEqual({ athleteId: 'a1', name: 'Ava', age: 14, packageId: 't-6', packageName: '6 tokens', handicap: 20, billing: 'pending', facility: null, login: 'invited-stale', loginEmail: 'ava@x.com', loginClaimedAt: null });
  expect(h1.athletes[1]).toMatchObject({ age: null, packageName: 'Elite', handicap: null, billing: 'active', facility: 'active', login: 'claimed', loginClaimedAt: '2026-10-02T10:00' });
  const h2 = rows[1];
  expect(h2.athletes[0]).toMatchObject({ billing: 'active', login: 'none', loginEmail: null });
  expect(h2.flags).toEqual([{ kind: 'booking', id: 'a3_cal-1', flag: 'before-open', date: '2026-10-08' }]);
  expect(h2).toMatchObject({ unpaid: false, flagged: true });
  expect(counts).toEqual({ all: 2, unpaid: 1, flagged: 1, unresolved: 1 });
  expect(unresolved).toEqual([{ id: 'ev-1', outcome: 'unresolved', receivedAt: '2026-10-04T12:00' }]);
});

test('an open invite younger than 7 days is invited; orphaned reads none; a loginEmail with no invite reads invited', () => {
  const fresh = [{ id: 'ava@x.com', athleteId: 'a1', status: 'open', createdAt: new Date('2026-10-01T00:00:00') }];
  expect(buildSignupRows({ households, athletes, invites: fresh, now }).rows[0].athletes[0].login).toBe('invited');
  const orphan = [{ id: 'ava@x.com', athleteId: 'a1', status: 'orphaned', createdAt: new Date('2026-10-01T00:00:00') }];
  expect(buildSignupRows({ households, athletes, invites: orphan, now }).rows[0].athletes[0].login).toBe('none');
  expect(buildSignupRows({ households, athletes, invites: [], now }).rows[0].athletes[0].login).toBe('invited');
});
