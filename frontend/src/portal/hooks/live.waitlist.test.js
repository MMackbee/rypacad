/**
 * Waitlist hardening (audit 2026-09-30, owner rulings R2-R4), against the
 * REAL createBooking/joinWaitlist. Only the Firestore SDK is stood in for,
 * by the in-memory store below - which also plays the two rules that matter
 * here: the waitlist read is household-scoped (a parent's list must filter
 * on its own householdId) and a waitlist entry is never updated.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
// Plain functions, not jest.fn(): CRA's resetMocks would clear them before every test.
jest.mock('firebase/firestore', () => {
  const snap = (ref) => {
    const data = (mockStore[ref.col] ?? {})[ref.id];
    return { id: ref.id, exists: () => Boolean(data), data: () => data };
  };
  const OPS = { '==': (a, b) => a === b, '>=': (a, b) => a >= b, '<=': (a, b) => a <= b };
  const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  return {
    collection: (_db, col) => ({ col, clauses: [] }),
    doc: (_db, col, id) => ({ col, id }),
    where: (field, op, value) => ({ field, op, value }),
    orderBy: () => null,
    query: (ref, ...clauses) => ({ col: ref.col, clauses: clauses.filter(Boolean) }),
    getDocs: async (q) => {
      if (q.col === 'waitlist') {
        mockWaitlistQueries.push(q.clauses);
        const scoped = q.clauses.some((c) => c.op === '==' && c.field === 'householdId' && c.value === 'h1');
        if (!scoped) throw denied();
      }
      const docs = Object.keys(mockStore[q.col] ?? {})
        .map((id) => snap({ col: q.col, id }))
        .filter((d) => q.clauses.every((c) => OPS[c.op](d.data()[c.field], c.value)));
      return { docs, size: docs.length };
    },
    getDoc: async (ref) => snap(ref),
    setDoc: async (ref, data) => {
      if (ref.col === 'waitlist' && mockStore.waitlist[ref.id]) throw denied(); // no update, ever
      mockStore[ref.col][ref.id] = data;
    },
    serverTimestamp: () => 'SERVER_TS',
    runTransaction: async (_db, fn) =>
      fn({
        get: async (ref) => snap(ref),
        set: (ref, data) => { mockStore[ref.col][ref.id] = data; },
        update: (ref, patch) => { Object.assign(mockStore[ref.col][ref.id], patch); },
      }),
  };
});

import { auth } from '../../firebase';
import { ERR, createBooking, fetchAthleteWaitlist, joinWaitlist } from './live';

let mockStore;
let mockWaitlistQueries;

// Thu Nov 12 2026, 4:30 PM in Chicago: booking is open and the season is on.
const NOW = new Date('2026-11-12T22:30:00Z');

function session(id, type, date, time = '4:00 PM', over = {}) {
  mockStore.sessions[id] = { date, time, type, capacity: type === 'phil' ? 6 : 8, booked: 0, status: 'scheduled', ...over };
  return { sessionId: id, date, type, householdId: 'h1' };
}
function hold(athleteId, sessionId) {
  const s = mockStore.sessions[sessionId];
  mockStore.bookings[`${athleteId}_${sessionId}`] = {
    athleteId, sessionId, date: s.date, type: s.type, periodKey: `${s.date.slice(0, 7)}-01`, status: 'confirmed', householdId: 'h1',
  };
}
const caught = async (promise) => {
  try { await promise; } catch (e) { return e; }
  return null;
};

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(NOW);
  auth.currentUser = { uid: 'p1' };
  mockWaitlistQueries = [];
  mockStore = {
    households: { h1: { name: 'Whitfield family', periodAnchorDay: 1 } },
    athletes: {
      ava: { name: 'Ava', householdId: 'h1', packageId: 't-2' },
      eli: { name: 'Eli', householdId: 'h1', packageId: 'elite' },
    },
    packages: {
      elite: { name: 'Elite', kind: 'elite', tokens: null, windowDays: 45 },
      't-2': { name: '2 tokens', kind: 'tokens', tokens: 2, windowDays: 30 },
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

describe('a session that has started cannot be booked or waitlisted (R2)', () => {
  test('a past day: refused with the typed reason, nothing written, open or full', async () => {
    const open = session('t-1110', 'training', '2026-11-10');
    const full = session('t-1110-full', 'training', '2026-11-10', '5:00 PM', { booked: 8 });
    for (const slot of [open, full]) {
      const err = await caught(createBooking({ athleteId: 'ava', ...slot }, { waitlistIfFull: true }));
      expect(err).toMatchObject({ code: ERR.INVALID, reason: 'session-past', message: 'This session has already started.' });
    }
    expect(mockStore.bookings).toEqual({});
    expect(mockStore.waitlist).toEqual({});
    expect(mockStore.sessions['t-1110'].booked).toBe(0);
  });

  test('today: a block that started at 4:00 PM is refused at 4:30 PM; the 5:00 PM block books', async () => {
    const started = session('t-1112-4', 'training', '2026-11-12', '4:00 PM');
    const later = session('t-1112-5', 'training', '2026-11-12', '5:00 PM');
    const err = await caught(createBooking({ athleteId: 'ava', ...started }));
    expect(err).toMatchObject({ reason: 'session-past', message: 'This session has already started.' });
    expect(mockStore.bookings).toEqual({});

    const ok = await createBooking({ athleteId: 'ava', ...later });
    expect(ok.status).toBe('confirmed');
    expect(mockStore.sessions['t-1112-5'].booked).toBe(1);
  });

  test('joinWaitlist itself refuses a past session and a started one', async () => {
    const entry = { sessionId: 's', athleteId: 'ava', householdId: 'h1', periodKey: '2026-11-01' };
    expect(await caught(joinWaitlist({ ...entry, date: '2026-11-10', time: '4:00 PM' }))).toMatchObject({
      reason: 'session-past', message: 'This session has already started.',
    });
    expect(await caught(joinWaitlist({ ...entry, date: '2026-11-12', time: '4:00 PM' }))).toMatchObject({ reason: 'session-past' });
    expect(mockStore.waitlist).toEqual({});
  });

  test('no same-day promotion (R3): a session later today takes no new waitlist place', async () => {
    const tonight = session('t-1112-7', 'training', '2026-11-12', '7:00 PM', { booked: 8 });
    const err = await caught(createBooking({ athleteId: 'ava', ...tonight }, { waitlistIfFull: true }));
    expect(err).toMatchObject({ code: ERR.INVALID, reason: 'waitlist-closed' });
    expect(mockStore.waitlist).toEqual({});
  });
});

describe('no silent waitlist', () => {
  test('a session that filled since the screen loaded is refused as full, and nothing is written', async () => {
    const full = session('t-1117', 'training', '2026-11-17', '4:00 PM', { booked: 8 });
    const err = await caught(createBooking({ athleteId: 'ava', ...full }));
    expect(err).toMatchObject({ code: ERR.INVALID, reason: 'full', message: 'This session just filled.' });
    expect(mockStore.waitlist).toEqual({});
    expect(mockStore.bookings).toEqual({});
  });

  test('Join waitlist is its own request: the entry is written in the contract shape, one token held', async () => {
    const full = session('t-1117', 'training', '2026-11-17', '4:00 PM', { booked: 8 });
    const out = await createBooking({ athleteId: 'ava', ...full }, { waitlistIfFull: true });
    expect(out).toMatchObject({ id: 't-1117_ava', status: 'waitlisted', chargedFrom: null, position: null });
    expect(mockStore.waitlist['t-1117_ava']).toEqual({
      sessionId: 't-1117', athleteId: 'ava', householdId: 'h1', date: '2026-11-17', periodKey: '2026-11-01',
      joinedAt: 'SERVER_TS', createdBy: 'p1',
    });
    expect(mockStore.sessions['t-1117'].booked).toBe(8);
  });

  test('already waiting: a second join writes nothing and resolves as waitlisted', async () => {
    const full = session('t-1117', 'training', '2026-11-17', '4:00 PM', { booked: 8 });
    await createBooking({ athleteId: 'eli', ...full }, { waitlistIfFull: true });
    const first = { ...mockStore.waitlist['t-1117_eli'], joinedAt: 'FIRST' };
    mockStore.waitlist['t-1117_eli'] = first;
    const again = await createBooking({ athleteId: 'eli', ...full }, { waitlistIfFull: true });
    expect(again).toMatchObject({ id: 't-1117_eli', status: 'waitlisted' });
    expect(mockStore.waitlist['t-1117_eli']).toBe(first);
  });
});

describe("Yannick's sessions never take a waitlist", () => {
  test('a full mental session is refused even when a waitlist place is asked for', async () => {
    const full = session('cal-1', 'mental', '2026-11-17', '4:00 PM', { capacity: 1, booked: 1 });
    const err = await caught(createBooking({ athleteId: 'eli', ...full }, { waitlistIfFull: true }));
    expect(err).toMatchObject({ code: ERR.INVALID, reason: 'no-waitlist' });
    const direct = await caught(joinWaitlist({ sessionId: 'cal-1', athleteId: 'eli', householdId: 'h1', date: '2026-11-17', periodKey: '2026-11-01', type: 'mental' }));
    expect(direct).toMatchObject({ reason: 'no-waitlist' });
    expect(mockStore.waitlist).toEqual({});
  });
});

describe("Elite's one a day applies to a waitlist place exactly as to a booking", () => {
  const SAME = "Elite includes one training block a day, and there's already one booked that day.";
  test('a second training block that day: the same refusal whether it is open or full', async () => {
    session('t-1117-4', 'training', '2026-11-17', '4:00 PM');
    hold('eli', 't-1117-4');
    const open = session('t-1117-5', 'training', '2026-11-17', '5:00 PM');
    const full = session('t-1117-6', 'training', '2026-11-17', '6:00 PM', { booked: 8 });
    expect(await caught(createBooking({ athleteId: 'eli', ...open }))).toMatchObject({ reason: 'one-per-day', message: SAME });
    expect(await caught(createBooking({ athleteId: 'eli', ...full }, { waitlistIfFull: true }))).toMatchObject({ reason: 'one-per-day', message: SAME });
    expect(mockStore.waitlist).toEqual({});
  });

  test('joinWaitlist called directly runs the same check', async () => {
    session('p-1117-3', 'phil', '2026-11-17', '3:00 PM');
    hold('eli', 'p-1117-3');
    const err = await caught(joinWaitlist({
      sessionId: 'p-1117-345', athleteId: 'eli', householdId: 'h1', date: '2026-11-17', periodKey: '2026-11-01', time: '3:45 PM', type: 'phil',
    }));
    expect(err).toMatchObject({
      reason: 'one-per-day',
      message: "Elite includes one session with Phil a day, and there's already one booked that day.",
    });
    expect(mockStore.waitlist).toEqual({});
  });

  test('a Tour event the same day as a training block is still allowed onto its waitlist', async () => {
    session('t-1121', 'training', '2026-11-21', '9:00 AM');
    hold('eli', 't-1121');
    const tour = session('tour-1121', 'tournament', '2026-11-21', '1:00 PM', { booked: 8 });
    const out = await createBooking({ athleteId: 'eli', ...tour }, { waitlistIfFull: true });
    expect(out.status).toBe('waitlisted');
  });
});

describe('every waitlist read carries the filter the household-scoped rule needs', () => {
  test("the booking check reads the athlete's holds with the household filter", async () => {
    session('t-1117', 'training', '2026-11-17');
    const held = session('t-1118', 'training', '2026-11-18', '4:00 PM', { booked: 8 });
    await createBooking({ athleteId: 'ava', ...held }, { waitlistIfFull: true });
    hold('ava', 't-1117');
    // Two tokens: one booked, one held on the waitlist - a third session is refused.
    const third = session('t-1119', 'training', '2026-11-19');
    const err = await caught(createBooking({ athleteId: 'ava', ...third }));
    expect(err).toMatchObject({ reason: 'no-tokens-left' });
    expect(err.message).toContain('1 held on a waitlist');
    expect(mockWaitlistQueries.length).toBeGreaterThan(0);
    for (const clauses of mockWaitlistQueries) {
      expect(clauses).toEqual(expect.arrayContaining([{ field: 'householdId', op: '==', value: 'h1' }]));
    }
  });

  test('fetchAthleteWaitlist filters on the athlete, and on the household when given one', async () => {
    mockStore.waitlist.x_ava = { sessionId: 'x', athleteId: 'ava', householdId: 'h1', periodKey: '2026-11-01' };
    expect(await fetchAthleteWaitlist('ava', { householdId: 'h1' })).toEqual([{ id: 'x_ava', ...mockStore.waitlist.x_ava }]);
    expect(mockWaitlistQueries[0]).toEqual([
      { field: 'athleteId', op: '==', value: 'ava' },
      { field: 'householdId', op: '==', value: 'h1' },
    ]);
  });
});
