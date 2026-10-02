/**
 * Handicap-reserved sessions (owner ruling 2026-10-02), against the REAL
 * createBooking/joinWaitlist: a session carrying maxHandicap takes a booking,
 * a re-book or a waitlist place only from an athlete whose handicap on file
 * is at or under it, and a session without one behaves as it always has.
 * Only the Firestore SDK is stood in for, by the in-memory store below.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
// Plain functions, not jest.fn(): CRA's resetMocks would clear them before every test.
jest.mock('firebase/firestore', () => {
  const snap = (ref) => {
    const data = (mockStore[ref.col] ?? {})[ref.id];
    return { id: ref.id, exists: () => Boolean(data), data: () => data };
  };
  const OPS = { '==': (a, b) => a === b, '>=': (a, b) => a >= b, '<=': (a, b) => a <= b };
  return {
    collection: (_db, col) => ({ col, clauses: [] }),
    doc: (_db, col, id) => ({ col, id }),
    where: (field, op, value) => ({ field, op, value }),
    orderBy: () => null,
    query: (ref, ...clauses) => ({ col: ref.col, clauses: clauses.filter(Boolean) }),
    getDocs: async (q) => {
      const docs = Object.keys(mockStore[q.col] ?? {})
        .map((id) => snap({ col: q.col, id }))
        .filter((d) => q.clauses.every((c) => OPS[c.op](d.data()[c.field], c.value)));
      return { docs, size: docs.length };
    },
    getDoc: async (ref) => snap(ref),
    setDoc: async (ref, data) => { mockStore[ref.col][ref.id] = data; },
    serverTimestamp: () => 'SERVER_TS',
    runTransaction: async (_db, fn) =>
      fn({
        get: async (ref) => snap(ref),
        set: (ref, data) => { mockStore[ref.col][ref.id] = data; },
        update: (ref, patch) => { Object.assign(mockStore[ref.col][ref.id], patch); },
      }),
  };
});
// The post-write reload, watched: CRA's resetMocks clears its calls before every test.
jest.mock('./invalidate', () => ({ ...jest.requireActual('./invalidate'), __esModule: true, bump: jest.fn() }));

import { auth } from '../../firebase';
import { bump } from './invalidate';
import { ERR, assertReservedEligible, createBooking, joinWaitlist } from './live';

let mockStore;

// Thu Nov 12 2026, 4:30 PM in Chicago: booking is open and the season is on.
const NOW = new Date('2026-11-12T22:30:00Z');
const OVER = 'Reserved for handicaps of 5 or better.';
const NONE = (first) => `${OVER} No handicap is on file for ${first}. Ask the academy to add it.`;

/** A Tuesday 3:00 PM training block; `over` carries maxHandicap, booked and so on. */
function session(id, over = {}) {
  mockStore.sessions[id] = { date: '2026-11-17', time: '3:00 PM', type: 'training', capacity: 14, booked: 0, status: 'scheduled', ...over };
  return { sessionId: id, date: '2026-11-17', type: 'training', householdId: 'h1' };
}
const caught = async (promise) => {
  try { await promise; } catch (e) { return e; }
  return null;
};

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(NOW);
  auth.currentUser = { uid: 'p1' };
  mockStore = {
    households: { h1: { name: 'Whitfield family', periodAnchorDay: 1 } },
    athletes: {
      jordan: { name: 'Jordan Whitfield', householdId: 'h1', packageId: 't-6', handicap: 4 },
      reese: { name: 'Reese Whitfield', householdId: 'h1', packageId: 't-6', handicap: 27 },
      nico: { name: 'Nico Whitfield', householdId: 'h1', packageId: 't-6', handicap: null },
      sage: { name: 'Sage Parker', householdId: 'h1', packageId: 'elite' },
    },
    packages: {
      elite: { name: 'Elite', kind: 'elite', tokens: null, windowDays: 45 },
      't-6': { name: '6 tokens', kind: 'tokens', tokens: 6, windowDays: 30 },
      single: { name: 'Single token', kind: 'single', tokens: 1, windowDays: 30 },
    },
    sessions: {},
    bookings: {},
    graceTokens: {},
    waitlist: {},
    tokenPeriods: {},
  };
});
afterEach(() => {
  jest.useRealTimers();
  auth.currentUser = null;
});

describe('assertReservedEligible', () => {
  test('passes an open session and an eligible athlete; throws the typed reason otherwise', () => {
    expect(() => assertReservedEligible({}, { handicap: 30 })).not.toThrow();
    expect(() => assertReservedEligible({ maxHandicap: null }, {})).not.toThrow();
    expect(() => assertReservedEligible({ maxHandicap: 5 }, { handicap: 5 })).not.toThrow();
    expect(() => assertReservedEligible({ maxHandicap: 5 }, { handicap: 0 })).not.toThrow();
    let err = null;
    try { assertReservedEligible({ maxHandicap: 5 }, { name: 'Reese Whitfield', handicap: 6 }); } catch (e) { err = e; }
    expect(err).toMatchObject({ name: 'LiveDataError', code: ERR.INVALID, reason: 'handicap-reserved', message: OVER });
  });
});

describe('an open session behaves as it always has', () => {
  test('no maxHandicap, or null: everyone books, whatever is on file, and the booking carries no new field', async () => {
    const absent = session('open');
    const nulled = session('nulled', { time: '4:00 PM', maxHandicap: null });
    for (const [athleteId, slot] of [['reese', absent], ['nico', absent], ['sage', absent], ['reese', nulled], ['nico', nulled]]) {
      const out = await createBooking({ athleteId, ...slot });
      expect(out.status).toBe('confirmed');
    }
    expect(mockStore.sessions.open.booked).toBe(3);
    expect(mockStore.sessions.nulled.booked).toBe(2);
    expect(Object.keys(mockStore.bookings.reese_open).sort()).toEqual(
      ['athleteId', 'chargedFrom', 'createdAt', 'createdBy', 'date', 'householdId', 'periodKey', 'sessionId', 'status', 'type']
    );
  });
});

describe('a reserved session (maxHandicap 5)', () => {
  test('a parent booking for several children sees each judged on their own handicap', async () => {
    const slot = session('tue3', { maxHandicap: 5 });
    expect((await createBooking({ athleteId: 'jordan', ...slot })).status).toBe('confirmed');
    expect(await caught(createBooking({ athleteId: 'reese', ...slot }))).toMatchObject({
      code: ERR.INVALID, reason: 'handicap-reserved', message: OVER,
    });
    expect(await caught(createBooking({ athleteId: 'nico', ...slot }))).toMatchObject({
      code: ERR.INVALID, reason: 'handicap-reserved', message: NONE('Nico'),
    });
    expect(Object.keys(mockStore.bookings)).toEqual(['jordan_tue3']);
    expect(mockStore.sessions.tue3.booked).toBe(1);
  });

  test('5 and 0 book; 6, a string and no handicap field at all do not - on every package', async () => {
    const slot = session('tue3', { maxHandicap: 5 });
    mockStore.athletes.jordan.handicap = 5;
    mockStore.athletes.reese.handicap = 0;
    expect((await createBooking({ athleteId: 'jordan', ...slot })).status).toBe('confirmed');
    expect((await createBooking({ athleteId: 'reese', ...slot })).status).toBe('confirmed');
    // Elite, no handicap field on the doc; then Elite above the limit; then Elite on it.
    expect(await caught(createBooking({ athleteId: 'sage', ...slot }))).toMatchObject({ reason: 'handicap-reserved', message: NONE('Sage') });
    mockStore.athletes.sage.handicap = 6;
    expect(await caught(createBooking({ athleteId: 'sage', ...slot }))).toMatchObject({ reason: 'handicap-reserved', message: OVER });
    mockStore.athletes.sage.handicap = '3';
    expect(await caught(createBooking({ athleteId: 'sage', ...slot }))).toMatchObject({ reason: 'handicap-reserved', message: NONE('Sage') });
    mockStore.athletes.sage.handicap = 3;
    expect(await createBooking({ athleteId: 'sage', ...slot })).toMatchObject({ status: 'confirmed', chargedFrom: 'elite' });
    // The single session token: a bought token does not open a reserved block.
    mockStore.athletes.nico = { name: 'Nico Whitfield', householdId: 'h1', packageId: 'single', handicap: 18, billing: { status: 'active', oneTime: true } };
    mockStore.graceTokens.single_cs_1 = { athleteId: 'nico', expiresAt: '2027-02-27', reason: 'single-purchase' };
    expect(await caught(createBooking({ athleteId: 'nico', ...slot }))).toMatchObject({ reason: 'handicap-reserved', message: OVER });
    expect(Object.keys(mockStore.bookings).sort()).toEqual(['jordan_tue3', 'reese_tue3', 'sage_tue3']);
    expect(mockStore.sessions.tue3.booked).toBe(3);
  });

  test('full: an athlete it is not for gets no waitlist place; an eligible one is waitlisted', async () => {
    const slot = session('tue3', { maxHandicap: 5, capacity: 2, booked: 2 });
    for (const [athleteId, message] of [['reese', OVER], ['nico', NONE('Nico')]]) {
      expect(await caught(createBooking({ athleteId, ...slot }, { waitlistIfFull: true }))).toMatchObject({ reason: 'handicap-reserved', message });
      // A plain Reserve tap too: the reason is the reserved one, never 'full'.
      expect(await caught(createBooking({ athleteId, ...slot }))).toMatchObject({ reason: 'handicap-reserved' });
    }
    expect(mockStore.waitlist).toEqual({});
    const out = await createBooking({ athleteId: 'jordan', ...slot }, { waitlistIfFull: true });
    expect(out.status).toBe('waitlisted');
    expect(Object.keys(mockStore.waitlist)).toEqual(['tue3_jordan']);
    expect(mockStore.bookings).toEqual({});
    expect(mockStore.sessions.tue3.booked).toBe(2);
  });

  test('joinWaitlist called directly runs the same check, and an open session joins as before', async () => {
    const entry = { sessionId: 'tue3', householdId: 'h1', date: '2026-11-17', periodKey: '2026-11-01', time: '3:00 PM', type: 'training' };
    expect(await caught(joinWaitlist({ ...entry, athleteId: 'reese', maxHandicap: 5 }))).toMatchObject({ code: ERR.INVALID, reason: 'handicap-reserved', message: OVER });
    expect(await caught(joinWaitlist({ ...entry, athleteId: 'nico', maxHandicap: 5 }))).toMatchObject({ reason: 'handicap-reserved', message: NONE('Nico') });
    expect(mockStore.waitlist).toEqual({});
    expect(await joinWaitlist({ ...entry, athleteId: 'jordan', maxHandicap: 5 })).toMatchObject({ id: 'tue3_jordan' });
    // No limit passed (an open session): the handicap on file is not read at all.
    expect(await joinWaitlist({ ...entry, athleteId: 'reese' })).toMatchObject({ id: 'tue3_reese' });
    expect(await joinWaitlist({ ...entry, sessionId: 'tue4', athleteId: 'nico', maxHandicap: null })).toMatchObject({ id: 'tue4_nico' });
    expect(Object.keys(mockStore.waitlist[`tue3_reese`]).sort()).toEqual(
      ['athleteId', 'createdBy', 'date', 'householdId', 'joinedAt', 'periodKey', 'sessionId']
    );
  });

  test('a re-book of a cancelled booking is refused once the handicap is above the limit', async () => {
    const slot = session('tue3', { maxHandicap: 5 });
    mockStore.bookings.jordan_tue3 = {
      athleteId: 'jordan', sessionId: 'tue3', date: '2026-11-17', type: 'training', periodKey: '2026-11-01',
      status: 'cancelled', householdId: 'h1', chargedFrom: 'period', cancelledBy: 'p1', cancelReason: 'member',
    };
    mockStore.athletes.jordan.handicap = 8;
    expect(await caught(createBooking({ athleteId: 'jordan', ...slot }))).toMatchObject({ reason: 'handicap-reserved', message: OVER });
    expect(mockStore.bookings.jordan_tue3.status).toBe('cancelled');
    expect(mockStore.sessions.tue3.booked).toBe(0);
    // Back at the limit: the same cancelled row is re-booked, seat and all.
    mockStore.athletes.jordan.handicap = 5;
    expect((await createBooking({ athleteId: 'jordan', ...slot })).status).toBe('confirmed');
    expect(mockStore.bookings.jordan_tue3).toMatchObject({ status: 'confirmed', chargedFrom: 'period', rebookedAt: 'SERVER_TS' });
    expect(mockStore.sessions.tue3.booked).toBe(1);
  });

  // A screen loaded before the block was reserved (or before the handicap changed) still offers the card: the refusal
  // reloads the sessions and the athletes it drew from, as a 'full' refusal reloads the sessions.
  test('a refused booking reloads the stale screen; a silent (repeat) call and any other refusal reload nothing', async () => {
    const slot = session('tue3', { maxHandicap: 5 });
    expect(await caught(createBooking({ athleteId: 'reese', ...slot }))).toMatchObject({ reason: 'handicap-reserved' });
    expect(bump.mock.calls).toEqual([['sessions'], ['athletes']]);
    bump.mockClear();
    expect(await caught(createBooking({ athleteId: 'reese', ...slot }, { waitlistIfFull: true }))).toMatchObject({ reason: 'handicap-reserved' });
    expect(bump.mock.calls).toEqual([['sessions'], ['athletes']]);
    bump.mockClear();
    expect(await caught(createBooking({ athleteId: 'reese', ...slot }, { silent: true }))).toMatchObject({ reason: 'handicap-reserved' });
    expect(bump).not.toHaveBeenCalled();
    mockStore.athletes.reese.billing = { status: 'pending' };
    expect(await caught(createBooking({ athleteId: 'reese', ...slot }))).toMatchObject({ reason: 'billing-pending' });
    expect(bump).not.toHaveBeenCalled();
    expect(mockStore.bookings).toEqual({});
    expect(mockStore.sessions.tue3.booked).toBe(0);
  });

  test('the family-wide gates still speak first: an unpaid athlete reads payment pending', async () => {
    const slot = session('tue3', { maxHandicap: 5 });
    mockStore.athletes.reese.billing = { status: 'pending' };
    expect(await caught(createBooking({ athleteId: 'reese', ...slot }))).toMatchObject({ reason: 'billing-pending' });
    expect(mockStore.bookings).toEqual({});
  });

  test('the limit is read off the session, not a fixed 5', async () => {
    const slot = session('tue3', { maxHandicap: 30 });
    expect((await createBooking({ athleteId: 'reese', ...slot })).status).toBe('confirmed');
    mockStore.sessions.tue3.maxHandicap = 20;
    expect(await caught(createBooking({ athleteId: 'nico', ...slot }))).toMatchObject({
      reason: 'handicap-reserved',
      message: 'Reserved for handicaps of 20 or better. No handicap is on file for Nico. Ask the academy to add it.',
    });
  });
});
