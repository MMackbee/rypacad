/**
 * hooks/waitlist.js after the audit (2026-09-30): every read carries the
 * filter the household-scoped rule can prove, the place in line comes from
 * the waitlistPositions callable (and is simply absent when that fails), and
 * a refused "Leave waitlist" says why.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
// Plain functions, not jest.fn(): CRA's resetMocks would clear them before every test.
jest.mock('firebase/firestore', () => {
  const snap = (ref) => {
    const data = (mockStore[ref.col] ?? {})[ref.id];
    return { id: ref.id, exists: () => Boolean(data), data: () => data };
  };
  const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  return {
    collection: (_db, col) => ({ col, clauses: [] }),
    doc: (_db, col, id) => ({ col, id }),
    where: (field, op, value) => ({ field, op, value }),
    orderBy: () => null,
    query: (ref, ...clauses) => ({ col: ref.col, clauses: clauses.filter(Boolean) }),
    getDocs: async (q) => {
      mockQueries.push({ col: q.col, clauses: q.clauses });
      const docs = Object.keys(mockStore[q.col] ?? {})
        .map((id) => snap({ col: q.col, id }))
        .filter((d) => q.clauses.every((c) => d.data()[c.field] === c.value));
      return { docs, size: docs.length };
    },
    // A read of a doc that is not there is refused: the rule reads resource.data.
    getDoc: async (ref) => {
      if (!(mockStore[ref.col] ?? {})[ref.id]) throw denied();
      return snap(ref);
    },
    deleteDoc: async (ref) => {
      if (mockDeleteError) throw mockDeleteError;
      if (!(mockStore[ref.col] ?? {})[ref.id]) throw denied();
      delete mockStore[ref.col][ref.id];
    },
  };
});
jest.mock('./callables', () => ({ __esModule: true, callWaitlistPositions: jest.fn() }));
jest.mock('./invalidate', () => ({ __esModule: true, bump: jest.fn(), useInvalidation: () => 0 }));

import { auth } from '../../firebase';
import { ERR } from './live';
import { callWaitlistPositions } from './callables';
import { bump } from './invalidate';
import { fetchWaitlistByAthlete, fetchWaitlistByHousehold, fetchWaitlistPositions, leaveWaitlist, positionOf } from './waitlist';

let mockStore;
let mockQueries;
let mockDeleteError;

const caught = async (promise) => {
  try { await promise; } catch (e) { return e; }
  return null;
};

beforeEach(() => {
  auth.currentUser = { uid: 'p1' };
  mockQueries = [];
  mockDeleteError = null;
  mockStore = {
    waitlist: {
      s1_ava: { sessionId: 's1', athleteId: 'ava', householdId: 'h1', periodKey: '2026-11-01' },
      s2_eli: { sessionId: 's2', athleteId: 'eli', householdId: 'h1', periodKey: '2026-11-01' },
      s1_zed: { sessionId: 's1', athleteId: 'zed', householdId: 'h9', periodKey: '2026-11-01' },
    },
    bookings: {},
  };
});
afterEach(() => {
  auth.currentUser = null;
});

describe('scoped reads', () => {
  test("an athlete's own login filters on the athlete; a parent adds its household", async () => {
    expect((await fetchWaitlistByAthlete('ava')).map((w) => w.id)).toEqual(['s1_ava']);
    expect(mockQueries[0]).toEqual({ col: 'waitlist', clauses: [{ field: 'athleteId', op: '==', value: 'ava' }] });

    expect((await fetchWaitlistByAthlete('ava', { householdId: 'h1' })).map((w) => w.id)).toEqual(['s1_ava']);
    expect(mockQueries[1].clauses).toEqual([
      { field: 'athleteId', op: '==', value: 'ava' },
      { field: 'householdId', op: '==', value: 'h1' },
    ]);
  });

  test('the household read filters on the household alone', async () => {
    expect((await fetchWaitlistByHousehold('h1')).map((w) => w.id).sort()).toEqual(['s1_ava', 's2_eli']);
    expect(mockQueries[0].clauses).toEqual([{ field: 'householdId', op: '==', value: 'h1' }]);
  });
});

describe('fetchWaitlistPositions', () => {
  test('asks once for the distinct sessions and returns the map; positionOf reads one place', async () => {
    callWaitlistPositions.mockResolvedValue({ positions: { s1: { ava: 2 }, s2: {} } });
    const positions = await fetchWaitlistPositions(['s1', 's2', 's1', null]);
    expect(callWaitlistPositions).toHaveBeenCalledTimes(1);
    expect(callWaitlistPositions).toHaveBeenCalledWith({ sessionIds: ['s1', 's2'] });
    expect(positionOf(positions, 's1', 'ava')).toBe(2);
    expect(positionOf(positions, 's2', 'ava')).toBeNull();
    expect(positionOf(positions, 'nope', 'ava')).toBeNull();
  });

  test('more than 50 sessions go out 50 at a time', async () => {
    callWaitlistPositions.mockImplementation(async ({ sessionIds }) => ({
      positions: Object.fromEntries(sessionIds.map((id) => [id, { ava: 1 }])),
    }));
    const ids = Array.from({ length: 120 }, (_, i) => `s${i}`);
    const positions = await fetchWaitlistPositions(ids);
    expect(callWaitlistPositions.mock.calls.map(([p]) => p.sessionIds.length)).toEqual([50, 50, 20]);
    expect(Object.keys(positions)).toHaveLength(120);
  });

  test('not deployed yet, or failing: no positions, never an error', async () => {
    callWaitlistPositions.mockRejectedValue(Object.assign(new Error('not-found'), { code: 'functions/not-found' }));
    expect(await fetchWaitlistPositions(['s1'])).toEqual({});
    callWaitlistPositions.mockResolvedValue(undefined);
    expect(await fetchWaitlistPositions(['s1'])).toEqual({});
    callWaitlistPositions.mockResolvedValue({ positions: 'nonsense' });
    expect(positionOf(await fetchWaitlistPositions(['s1']), 's1', 'ava')).toBeNull();
  });

  test('nothing to ask for: no call at all', async () => {
    expect(await fetchWaitlistPositions([])).toEqual({});
    expect(callWaitlistPositions).not.toHaveBeenCalled();
  });
});

describe('leaveWaitlist', () => {
  // The write is live-only (the last test): everything else here is the live path.
  beforeEach(() => { process.env.REACT_APP_PORTAL_LIVE_DATA = 'true'; });
  afterEach(() => { delete process.env.REACT_APP_PORTAL_LIVE_DATA; });

  test("deletes the family's own entry and reloads the lists", async () => {
    await leaveWaitlist({ sessionId: 's1', athleteId: 'ava' });
    expect(mockStore.waitlist.s1_ava).toBeUndefined();
    expect(bump.mock.calls.map(([name]) => name).sort()).toEqual(['bookings', 'waitlist']);
  });

  test('promoted while the screen was open: the typed reason, and the lists reload', async () => {
    delete mockStore.waitlist.s1_ava; // the promotion removed the entry...
    mockStore.bookings.ava_s1 = { athleteId: 'ava', sessionId: 's1', status: 'confirmed' }; // ...and booked the athlete
    const err = await caught(leaveWaitlist({ sessionId: 's1', athleteId: 'ava' }));
    expect(err).toMatchObject({ code: ERR.INVALID, reason: 'promoted' });
    expect(bump.mock.calls.map(([name]) => name).sort()).toEqual(['bookings', 'waitlist']);
  });

  test('any other failure: a plain message, never the raw permissions text', async () => {
    delete mockStore.waitlist.s1_ava; // gone, and no booking either (closed by the sweep)
    const gone = await caught(leaveWaitlist({ sessionId: 's1', athleteId: 'ava' }));
    expect(gone).toMatchObject({ reason: 'leave-failed', message: 'That waitlist place could not be removed. Your list has been refreshed.' });

    mockDeleteError = Object.assign(new Error('offline'), { code: 'unavailable' });
    const offline = await caught(leaveWaitlist({ sessionId: 's2', athleteId: 'eli' }));
    expect(offline).toMatchObject({ code: ERR.UNAVAILABLE, reason: 'leave-failed' });
    expect(offline.message).not.toMatch(/permission|offline/i);
    expect(mockStore.waitlist.s2_eli).toBeDefined();
  });

  // Review 2026-10-01: the screens call this directly, so the demo's seeded
  // waitlisted row must not turn a tap on Leave into "could not be removed".
  test('demo (seed) mode: a no-op that resolves - nothing deleted, nothing reloaded, no error', async () => {
    delete process.env.REACT_APP_PORTAL_LIVE_DATA;
    auth.currentUser = null;
    await expect(leaveWaitlist({ sessionId: 's1', athleteId: 'ava' })).resolves.toEqual({ id: 's1_ava', simulated: true });
    expect(mockStore.waitlist.s1_ava).toBeDefined();
    expect(bump).not.toHaveBeenCalled();
  });
});
