/**
 * Hidden sessions (owner 2026-11-05: the empty Mon/Wed 6 PM blocks "sort of
 * hidden for now") in the write paths: Repeat weekly steps over a hidden
 * week as a week with no session - never an error - and never names one as
 * the week to come back for; createBooking refuses a hidden session with a
 * typed reason before anything is written (a screen loaded before the block
 * was hidden), the way firestore.rules refuses its seat. repeatWeekly and
 * createBooking run for real against the small in-memory store below, as in
 * repeat.test.js.
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
      // What happened between the range read and this week's write.
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
import { createBooking } from './live';
import { HIDDEN_SESSION_LINE, SESSION_HIDDEN } from '../data/hiddenSessions';

let mockStore;
let mockBeforeTx;

const NOV_5 = new Date('2026-11-05T16:00:00Z'); // 10 AM Chicago: a token family books through Dec 31, Elite through Jan 31
const ATHLETE = { role: 'athlete', athleteId: 'a1', householdId: 'h1' };
const HIDDEN = { hidden: true, hiddenAt: 'SERVER_TS', hiddenBy: 'hide-sessions' };

/** Adds one Monday 6 PM training block; returns the slot the confirmation screen repeats from. */
function monday(id, date, over = {}) {
  mockStore.sessions[id] = { date, time: '6:00 PM', type: 'training', capacity: 12, booked: 0, status: 'scheduled', ...over };
  return { date, time: '6:00 PM', type: 'training' };
}
/** The booking the athlete holds for the slot it repeats from. */
function hold(sessionId) {
  const s = mockStore.sessions[sessionId];
  mockStore.bookings[`a1_${sessionId}`] = { athleteId: 'a1', sessionId, date: s.date, type: s.type, periodKey: `${s.date.slice(0, 7)}-01`,
    status: 'confirmed', householdId: 'h1', chargedFrom: 'elite' };
}
const written = () => Object.entries(mockStore.bookings).filter(([, b]) => b.createdVia === 'repeat').map(([id]) => id).sort();

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(NOV_5);
  auth.currentUser = { uid: 'u1' };
  mockBeforeTx = null;
  mockStore = {
    households: { h1: { name: 'Whitfield family', periodAnchorDay: 1 } },
    athletes: { a1: { name: 'Jordan', householdId: 'h1', packageId: 'elite' } },
    packages: { elite: { name: 'Elite', kind: 'elite', tokens: null } },
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

test('Repeat weekly skips a hidden week as "no session", books the weeks around it, and writes nothing on it', async () => {
  const slot = monday('m-1109', '2026-11-09');
  monday('m-1116', '2026-11-16');
  monday('m-1123', '2026-11-23', HIDDEN);
  monday('m-1130', '2026-11-30');
  monday('m-1207', '2026-12-07');
  hold('m-1109');

  const out = await repeatWeekly(ATHLETE, slot, { untilISO: '2026-12-07' });
  expect(out.booked).toEqual([
    { date: '2026-11-16', id: 'm-1116' },
    { date: '2026-11-30', id: 'm-1130' },
    { date: '2026-12-07', id: 'm-1207' },
  ]);
  expect(out.skipped).toEqual([{ date: '2026-11-23', reason: 'no session' }]);
  expect(written()).toEqual(['a1_m-1116', 'a1_m-1130', 'a1_m-1207']);
  expect(mockStore.sessions['m-1123'].booked).toBe(0);
});

test('a week hidden after the schedule was read is still "no session", never an error', async () => {
  const slot = monday('m-1109', '2026-11-09');
  monday('m-1116', '2026-11-16');
  monday('m-1123', '2026-11-23');
  hold('m-1109');
  // The owner hides Nov 23 while the family's repeat is running.
  mockBeforeTx = () => { Object.assign(mockStore.sessions['m-1123'], HIDDEN); };

  const out = await repeatWeekly(ATHLETE, slot, { untilISO: '2026-11-23' });
  expect(out.booked).toEqual([{ date: '2026-11-16', id: 'm-1116' }]);
  expect(out.skipped).toEqual([{ date: '2026-11-23', reason: 'no session' }]);
  expect(mockStore.bookings['a1_m-1123']).toBeUndefined();
  expect(mockStore.sessions['m-1123'].booked).toBe(0);
});

test('the week to come back for is never a hidden one: it steps to the next week that is not', async () => {
  // Elite books through Jan 31, so the first Monday past the window is Feb 1, which is hidden.
  const slot = monday('m-1109', '2026-11-09');
  hold('m-1109');
  monday('m-0201', '2027-02-01', HIDDEN);
  monday('m-0208', '2027-02-08');
  monday('m-0222', '2027-02-22');
  const out = await repeatWeekly(ATHLETE, slot, { untilISO: '2026-11-09' });
  expect(out.windowEnd).toBe('2027-01-31');
  expect(out.next).toEqual({ date: '2027-02-08', opensOn: expect.any(String) });

  // Nothing hidden: the first week past the window, as before.
  delete mockStore.sessions['m-0201'].hidden;
  expect((await repeatWeekly(ATHLETE, slot, { untilISO: '2026-11-09' })).next.date).toBe('2027-02-01');

  // Feb 1 and Feb 8 hidden: Feb 15 is Presidents' Day (a closure, stepped over as before), so Feb 22.
  for (const id of ['m-0201', 'm-0208']) Object.assign(mockStore.sessions[id], HIDDEN);
  expect((await repeatWeekly(ATHLETE, slot, { untilISO: '2026-11-09' })).next.date).toBe('2027-02-22');

  // Every later week hidden: nothing to come back for.
  Object.assign(mockStore.sessions['m-0222'], HIDDEN);
  expect((await repeatWeekly(ATHLETE, slot, { untilISO: '2026-11-09' })).next).toBeNull();
});

test('createBooking refuses a hidden session with a typed reason and writes nothing', async () => {
  monday('m-1123', '2026-11-23', HIDDEN);
  await expect(createBooking({ athleteId: 'a1', sessionId: 'm-1123', date: '2026-11-23', type: 'training', householdId: 'h1' }))
    .rejects.toMatchObject({ reason: SESSION_HIDDEN, message: HIDDEN_SESSION_LINE });
  expect(mockStore.bookings['a1_m-1123']).toBeUndefined();
  expect(mockStore.sessions['m-1123'].booked).toBe(0);
  // The same session without the flag books as always.
  delete mockStore.sessions['m-1123'].hidden;
  await expect(createBooking({ athleteId: 'a1', sessionId: 'm-1123', date: '2026-11-23', type: 'training', householdId: 'h1' }))
    .resolves.toMatchObject({ status: 'confirmed' });
  expect(mockStore.sessions['m-1123'].booked).toBe(1);
});
