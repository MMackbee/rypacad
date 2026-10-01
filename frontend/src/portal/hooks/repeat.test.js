/**
 * Repeat weekly for Phil's sessions (owner 2026-09-30, "yes to phil repeat").
 * repeatWeekly runs here against the REAL createBooking (hooks/live.js), so
 * each week answers to the checks a single Phil booking does - the window,
 * Elite's one a day, the tokens of the period the session falls in. Only the
 * Firestore SDK is stood in for, by the small in-memory store below.
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
    serverTimestamp: () => 'SERVER_TS',
    setDoc: async (ref, data) => { mockStore[ref.col][ref.id] = data; },
    runTransaction: async (_db, fn) => {
      // What another family did between the range read and this week's write.
      if (mockBeforeTx) mockBeforeTx();
      return fn({
        get: async (ref) => snap(ref),
        set: (ref, data) => { mockStore[ref.col][ref.id] = data; },
        update: (ref, patch) => { Object.assign(mockStore[ref.col][ref.id], patch); },
      });
    },
  };
});

import { auth } from '../../firebase';
import repeatWeekly from './repeat';
import { ERR } from './live';

let mockStore;
let mockBeforeTx;

const OCT_1 = new Date('2026-10-01T17:00:00Z'); // noon Chicago: every window counts from Nov 1
const ATHLETE = { role: 'athlete', athleteId: 'a1', householdId: 'h1' };
const PARENT = { role: 'parent', householdId: 'h1' };

/** Adds one session doc; returns the slot the confirmation screen repeats from. */
function session(id, type, date, time = '4:00 PM', over = {}) {
  mockStore.sessions[id] = { date, time, type, capacity: type === 'phil' ? 6 : 14, booked: 0, status: 'scheduled', ...over };
  return { date, time, type };
}
/** A booking the athlete already holds for a session in the store. */
function hold(athleteId, sessionId) {
  const s = mockStore.sessions[sessionId];
  mockStore.bookings[`${athleteId}_${sessionId}`] = {
    athleteId, sessionId, date: s.date, type: s.type, periodKey: `${s.date.slice(0, 7)}-01`,
    status: 'confirmed', householdId: 'h1', chargedFrom: athleteId === 'a1' ? 'elite' : 'period',
  };
}
const dates = (rows) => rows.map((r) => r.date);
/** The ids of the bookings the repeat wrote. */
const written = () =>
  Object.entries(mockStore.bookings).filter(([, b]) => b.createdVia === 'repeat').map(([id]) => id).sort();

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(OCT_1);
  auth.currentUser = { uid: 'u1' };
  mockBeforeTx = null;
  mockStore = {
    households: { h1: { name: 'Whitfield family', periodAnchorDay: 1 } },
    athletes: {
      a1: { name: 'Jordan', householdId: 'h1', packageId: 'elite' },
      a2: { name: 'Ava', householdId: 'h1', packageId: 't-2' },
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

test('a Phil repeat books only Phil sessions, and a training repeat only training blocks, at the same weekday and time', async () => {
  // Thursdays at 4:00 PM. Nov 26 is Thanksgiving (nothing runs); Dec 3 has a
  // training block and a Yannick session at 4:00 PM but no Phil session.
  const phil = session('p-1105', 'phil', '2026-11-05');
  const block = session('t-1105', 'training', '2026-11-05');
  for (const d of ['1112', '1119', '1210']) session(`p-${d}`, 'phil', `2026-${d.slice(0, 2)}-${d.slice(2)}`);
  for (const d of ['1112', '1119', '1203', '1210']) session(`t-${d}`, 'training', `2026-${d.slice(0, 2)}-${d.slice(2)}`);
  session('m-1203', 'mental', '2026-12-03', '4:00 PM', { capacity: 1 });
  hold('a1', 'p-1105');
  hold('a1', 't-1105');

  const out = await repeatWeekly(ATHLETE, phil, { untilISO: '2026-12-16' });
  expect(out.windowEnd).toBe('2026-12-16');
  expect(out.booked).toEqual([
    { date: '2026-11-12', id: 'p-1112' },
    { date: '2026-11-19', id: 'p-1119' },
    { date: '2026-12-10', id: 'p-1210' },
  ]);
  expect(out.skipped).toEqual([
    { date: '2026-11-26', reason: 'no session' },
    { date: '2026-12-03', reason: 'no session' },
  ]);
  expect(out.next).toEqual({ date: '2026-12-17', opensOn: '2026-11-02' });
  expect(written()).toEqual(['a1_p-1112', 'a1_p-1119', 'a1_p-1210']);
  // The written shape is the single booking's, marked as a repeat copy.
  expect(mockStore.bookings['a1_p-1112']).toMatchObject({
    athleteId: 'a1', sessionId: 'p-1112', date: '2026-11-12', type: 'phil', periodKey: '2026-11-01',
    status: 'confirmed', householdId: 'h1', createdBy: 'u1', chargedFrom: 'elite', createdVia: 'repeat',
  });
  expect(mockStore.sessions['p-1112'].booked).toBe(1);
  expect(mockStore.sessions['t-1112'].booked).toBe(0);

  // The reverse: the training block's repeat never lands on Phil's (or Yannick's) session.
  const back = await repeatWeekly(ATHLETE, block, { untilISO: '2026-12-16' });
  expect(dates(back.booked)).toEqual(['2026-11-12', '2026-11-19', '2026-12-03', '2026-12-10']);
  expect(back.booked.map((b) => b.id)).toEqual(['t-1112', 't-1119', 't-1203', 't-1210']);
  expect(back.skipped).toEqual([{ date: '2026-11-26', reason: 'no session' }]);
  expect(mockStore.sessions['m-1203'].booked).toBe(0);
  expect(mockStore.sessions['p-1112'].booked).toBe(1);
});

test('Elite with another Phil session already booked that date: that week is skipped as one per day; a full session as full', async () => {
  const phil = session('p-1105', 'phil', '2026-11-05');
  session('p-1112', 'phil', '2026-11-12');
  session('p-1119-early', 'phil', '2026-11-19', '3:00 PM');
  session('p-1119', 'phil', '2026-11-19');
  session('p-1203', 'phil', '2026-12-03', '4:00 PM', { booked: 6 });
  session('p-1210', 'phil', '2026-12-10');
  hold('a1', 'p-1105');
  hold('a1', 'p-1119-early');

  // A parent booking for their child - the same path, the child named.
  const out = await repeatWeekly(PARENT, phil, { athleteId: 'a1', untilISO: '2026-12-16' });
  expect(dates(out.booked)).toEqual(['2026-11-12', '2026-12-10']);
  expect(out.skipped).toEqual([
    { date: '2026-11-19', reason: 'one per day' },
    { date: '2026-11-26', reason: 'no session' },
    { date: '2026-12-03', reason: 'full' },
  ]);
  expect(written()).toEqual(['a1_p-1112', 'a1_p-1210']);
  // A full week is skipped, never queued: a repeat joins no waitlist.
  expect(mockStore.waitlist).toEqual({});
  expect(mockStore.sessions['p-1203'].booked).toBe(6);
});

// Audit 2026-09-30: a week that fills AFTER the repeat read the schedule used
// to become a real waitlist place the summary reported as "full".
test('a week that fills between the schedule read and its write is skipped as full, and no waitlist place is left behind', async () => {
  const phil = session('p-1105', 'phil', '2026-11-05');
  session('p-1112', 'phil', '2026-11-12');
  session('p-1119', 'phil', '2026-11-19', '4:00 PM', { booked: 5 });
  hold('a1', 'p-1105');
  // Another family takes Nov 19's last seat once the repeat is under way.
  mockBeforeTx = () => { mockStore.sessions['p-1119'].booked = 6; };

  const out = await repeatWeekly(PARENT, phil, { athleteId: 'a1', untilISO: '2026-11-19' });
  expect(out.skipped).toEqual([{ date: '2026-11-19', reason: 'full' }]);
  expect(dates(out.booked)).toEqual(['2026-11-12']);
  expect(mockStore.waitlist).toEqual({});
  expect(mockStore.bookings['a1_p-1119']).toBeUndefined();
  expect(mockStore.sessions['p-1119'].booked).toBe(6);
});

test("a token package: each week spends from the period its session falls in, and stops at that package's window", async () => {
  // Nov 10, noon Chicago: past Nov 1, so the 30-day window rolls - through Dec 10.
  jest.setSystemTime(new Date('2026-11-10T18:00:00Z'));
  session('t-1111', 'training', '2026-11-11');
  const phil = session('p-1112', 'phil', '2026-11-12');
  for (const d of ['1119', '1203', '1210', '1217']) session(`p-${d}`, 'phil', `2026-${d.slice(0, 2)}-${d.slice(2)}`);
  // November's two tokens are both spent; December's are untouched.
  hold('a2', 't-1111');
  hold('a2', 'p-1112');

  const out = await repeatWeekly({ role: 'athlete', athleteId: 'a2', householdId: 'h1' }, phil, { untilISO: '2027-02-27' });
  expect(out.windowEnd).toBe('2026-12-10');
  expect(dates(out.booked)).toEqual(['2026-12-03', '2026-12-10']);
  expect(out.skipped).toEqual([
    { date: '2026-11-19', reason: 'period limit' },
    { date: '2026-11-26', reason: 'no session' },
  ]);
  expect(mockStore.bookings['a2_p-1203']).toMatchObject({ type: 'phil', periodKey: '2026-12-01', chargedFrom: 'period', createdVia: 'repeat' });
  expect(mockStore.bookings['a2_p-1217']).toBeUndefined();
});

test("Yannick's sessions never repeat: a 'mental' slot is refused before anything is read or written", async () => {
  const yannick = session('m-1105', 'mental', '2026-11-05', '4:00 PM', { capacity: 1 });
  session('m-1112', 'mental', '2026-11-12', '4:00 PM', { capacity: 1 });
  hold('a1', 'm-1105');

  let caught = null;
  await repeatWeekly(ATHLETE, yannick, { untilISO: '2026-12-16' }).catch((e) => { caught = e; });
  expect(caught?.code).toBe(ERR.INVALID);
  expect(written()).toEqual([]);
  expect(mockStore.sessions['m-1112'].booked).toBe(0);
});
