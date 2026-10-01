/**
 * The client-side booking gates (Sprint 20, spec 4.4 + 5): pure asserts
 * exported from the adapter so the order and copy are pinned without a
 * Firestore round trip. Firebase is mocked out entirely; the SDK stand-in
 * below is just enough of it for createBooking's written shape.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
// Plain functions, not jest.fn(): CRA's resetMocks would clear them before every test.
jest.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ path: name }),
  doc: (_db, col, id) => ({ path: `${col}/${id}` }),
  where: () => null,
  query: (ref) => ref,
  getDocs: async (ref) => mockQuery(ref.path),
  getDoc: async (ref) => mockSnap(ref.path),
  serverTimestamp: () => 'SERVER_TS',
  runTransaction: async (_db, fn) =>
    fn({
      get: async (ref) => mockSnap(ref.path),
      set: (ref, data) => mockWrites.push({ path: ref.path, data }),
      update: (ref, data) => mockUpdates.push({ path: ref.path, data }),
    }),
}));

const mockDocs = {
  'households/h1': { name: 'Whitfield family', periodAnchorDay: 1 },
  'athletes/a1': { name: 'Jordan', householdId: 'h1', packageId: 'elite' },
  'packages/elite': { name: 'Elite', kind: 'elite', tokens: null, windowDays: 45 },
  'sessions/s1': { date: '2026-11-10', time: '4:00 PM', type: 'training', capacity: 8, booked: 0, status: 'scheduled' },
};
const mockWrites = [];
const mockUpdates = [];
// Collection name -> the rows a query on it returns (none unless a test sets them).
const mockRows = {};
function mockSnap(path) {
  const data = mockDocs[path];
  return { id: path.split('/')[1], exists: () => Boolean(data), data: () => data };
}
function mockQuery(name) {
  const rows = mockRows[name] || [];
  return { docs: rows.map((r) => ({ id: r.id, data: () => r })), size: rows.length };
}

import { auth } from '../../firebase';
import { ERR, assertAthleteBillingActive, assertBookingOpen, assertPeriodTokensLeft, createBooking, rebookPatch } from './live';
import { BOOKING_OPENS_AT } from '../data/calendar';
import { assertWithinBookingWindow } from './live';
import { ELITE, TOKEN_PACKAGES } from '../data/packages';

const reasonOf = (fn) => {
  try { fn(); } catch (e) { return [e.code, e.reason, e.message]; }
  return null;
};

describe('assertAthleteBillingActive', () => {
  test('absent and active pass; pending/past_due/lapsed throw billing-pending', () => {
    expect(reasonOf(() => assertAthleteBillingActive({}))).toBeNull();
    expect(reasonOf(() => assertAthleteBillingActive({ billing: { status: 'active' } }))).toBeNull();
    for (const status of ['pending', 'past_due', 'lapsed']) {
      expect(reasonOf(() => assertAthleteBillingActive({ billing: { status } })))
        .toEqual([ERR.INVALID, 'billing-pending', 'Payment pending - finish checkout to start booking']);
    }
  });
  test('a single-token buyer moved to another package is pending until it is paid (ruling 2026-09-29/30)', () => {
    expect(reasonOf(() => assertAthleteBillingActive({ packageId: 't-6', billing: { status: 'active', oneTime: true } })))
      .toEqual([ERR.INVALID, 'billing-pending', 'Payment pending - finish checkout to start booking']);
    expect(reasonOf(() => assertAthleteBillingActive({ packageId: 'single', billing: { status: 'active', oneTime: true } }))).toBeNull();
    expect(reasonOf(() => assertAthleteBillingActive({ packageId: 't-6', billing: { status: 'active', oneTime: false } }))).toBeNull();
  });
});

describe('rebookPatch', () => {
  test('writes the fresh charge and the rebookedAt stamp; graceTokenId is null when none', () => {
    const stamp = { sentinel: 'serverTimestamp' };
    expect(rebookPatch('grace', 'single_cs_1', stamp)).toEqual({ status: 'confirmed', chargedFrom: 'grace', graceTokenId: 'single_cs_1', rebookedAt: stamp });
    expect(rebookPatch('period', null, stamp)).toEqual({ status: 'confirmed', chargedFrom: 'period', graceTokenId: null, rebookedAt: stamp });
    expect(rebookPatch('elite', undefined, stamp)).toEqual({ status: 'confirmed', chargedFrom: 'elite', graceTokenId: null, rebookedAt: stamp });
    expect(Object.keys(rebookPatch('period', null, stamp)).sort()).toEqual(['chargedFrom', 'graceTokenId', 'rebookedAt', 'status']);
  });
});

describe('assertBookingOpen', () => {
  test('token package before the gate throws booking-not-open with the label', () => {
    expect(reasonOf(() => assertBookingOpen({ kind: 'tokens' }, BOOKING_OPENS_AT - 1)))
      .toEqual([ERR.INVALID, 'booking-not-open', 'Booking opens Sat, Oct 10 at 7 AM']);
    expect(reasonOf(() => assertBookingOpen({ kind: 'tokens' }, BOOKING_OPENS_AT))).toBeNull();
    expect(reasonOf(() => assertBookingOpen({ kind: 'elite' }, 0))).toBeNull();
  });
});

describe('assertPeriodTokensLeft names the period it means', () => {
  const t6 = { id: 't-6', tokens: 6 };
  const spent = (key) => Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, status: 'confirmed', periodKey: key }));
  test('this period', () => {
    expect(reasonOf(() => assertPeriodTokensLeft(t6, spent('2026-11-01'), '2026-11-01', undefined, [], '2026-11-01')))
      .toEqual([ERR.INVALID, 'no-tokens-left', "This period's tokens are already fully booked (6 of 6)."]);
  });
  test('next period (borrowed tokens, spec 5)', () => {
    expect(reasonOf(() => assertPeriodTokensLeft(t6, spent('2026-12-01'), '2026-12-01', undefined, [], '2026-11-01')))
      .toEqual([ERR.INVALID, 'no-tokens-left', "Next period's tokens are already fully booked (6 of 6)."]);
  });
  test('a waitlist hold is named; Elite never throws', () => {
    expect(reasonOf(() => assertPeriodTokensLeft(t6, spent('2026-11-01').slice(0, 5), '2026-11-01', undefined, [{ periodKey: '2026-11-01' }], '2026-11-01'))[2])
      .toBe("This period's tokens are already fully booked (5 of 6, 1 held on a waitlist).");
    expect(reasonOf(() => assertPeriodTokensLeft({ id: 'elite', tokens: null }, spent('2026-11-01'), '2026-11-01', undefined, [], '2026-11-01'))).toBeNull();
  });
});

describe('createBooking stamps createdVia only when asked (owner report 2026-09-30: six notices for one repeat)', () => {
  const args = { athleteId: 'a1', sessionId: 's1', date: '2026-11-10', type: 'training', householdId: 'h1' };
  beforeEach(() => {
    // Pinned before the Nov 10 session: a started session is refused (R2).
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-10-01T17:00:00Z'));
    auth.currentUser = { uid: 'p1' };
    mockWrites.length = 0;
  });
  afterEach(() => {
    jest.useRealTimers();
    auth.currentUser = null;
  });

  test("a Repeat weekly copy is written with createdVia 'repeat'", async () => {
    const out = await createBooking(args, { silent: true, createdVia: 'repeat' });
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0].path).toBe('bookings/a1_s1');
    expect(mockWrites[0].data).toMatchObject({ athleteId: 'a1', status: 'confirmed', chargedFrom: 'elite', createdBy: 'p1', createdVia: 'repeat' });
    expect(out).toMatchObject({ id: 'a1_s1', status: 'confirmed', createdVia: 'repeat' });
  });

  test('a single booking carries no createdVia at all', async () => {
    const out = await createBooking(args);
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0].data).toMatchObject({ athleteId: 'a1', status: 'confirmed', chargedFrom: 'elite' });
    expect(mockWrites[0].data).not.toHaveProperty('createdVia');
    expect(out).not.toHaveProperty('createdVia');
  });
});

describe('assertWithinBookingWindow counts from Nov 1 until then (owner ruling 2026-09-30)', () => {
  const OCT_1 = new Date('2026-10-01T17:00:00Z');
  test('Elite on Oct 1 books through Dec 16; Dec 17 is outside-window and names Nov 2', () => {
    expect(reasonOf(() => assertWithinBookingWindow(ELITE, '2026-12-16', OCT_1))).toBeNull();
    expect(reasonOf(() => assertWithinBookingWindow(ELITE, '2026-12-17', OCT_1)))
      .toEqual([ERR.INVALID, 'outside-window', 'That date opens for booking at 7 AM on 2026-11-02.']);
  });
  test('a token package reaches Dec 1', () => {
    const t12 = TOKEN_PACKAGES.find((p) => p.id === 't-12');
    expect(reasonOf(() => assertWithinBookingWindow(t12, '2026-12-01', OCT_1))).toBeNull();
    expect(reasonOf(() => assertWithinBookingWindow(t12, '2026-12-02', OCT_1))[1]).toBe('outside-window');
  });
});

// Owner rulings 2026-09-29/30: the single token grants no period token
// (periodFallback 0), so reaching the period cap means "buy a token".
describe('assertPeriodTokensLeft for the single token', () => {
  const single = { id: 'single', kind: 'single', tokens: 1 };
  test('no purchased token left: no-session-token with the buy copy', () => {
    expect(reasonOf(() => assertPeriodTokensLeft(single, [], '2026-11-01', undefined, [], '2026-11-01')))
      .toEqual([ERR.INVALID, 'no-session-token', 'No session token left - buy one to book.']);
  });
  test('a waitlist spot holds the token: the held copy', () => {
    expect(reasonOf(() => assertPeriodTokensLeft(single, [], '2026-11-01', undefined, [{ sessionId: 's2', periodKey: '2026-12-01' }], '2026-11-01')))
      .toEqual([ERR.INVALID, 'no-session-token', 'Your session token is held by a waitlist spot - leave the waitlist or buy another token.']);
  });
  test('an ops comp (issued tokenPeriods doc) still books as the period', () => {
    expect(reasonOf(() => assertPeriodTokensLeft(single, [], '2026-11-01', 1, [], '2026-11-01'))).toBeNull();
  });
});

// The single token on top of the waitlist hardening: a booking and a re-book
// each spend one purchased token and move sessions.booked by exactly one in
// the same commit (firestore.rules seatTakenInCommit); a token another
// waitlist spot holds is never spent; nothing books before the Oct 10 gate.
describe('createBooking for a single-token athlete', () => {
  const args = { athleteId: 'a2', sessionId: 's1', date: '2026-11-10', type: 'training', householdId: 'h1' };
  const token = (id) => ({ id, athleteId: 'a2', expiresAt: '2027-02-27', reason: 'single-purchase' });
  beforeEach(() => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-10-12T17:00:00Z')); // after the gate, before the session
    auth.currentUser = { uid: 'p1' };
    mockWrites.length = 0;
    mockUpdates.length = 0;
    mockDocs['athletes/a2'] = { name: 'Ava', householdId: 'h1', packageId: 'single', billing: { status: 'active', oneTime: true } };
    mockDocs['packages/single'] = { name: 'Single token', kind: 'single', tokens: 1, windowDays: 30 };
    mockRows.graceTokens = [token('single_cs_1')];
  });
  afterEach(() => {
    jest.useRealTimers();
    auth.currentUser = null;
    delete mockDocs['athletes/a2'];
    delete mockDocs['packages/single'];
    delete mockDocs['bookings/a2_s1'];
    for (const name of Object.keys(mockRows)) delete mockRows[name];
  });

  test('a booking spends the purchased token and takes the seat in the same commit', async () => {
    const out = await createBooking(args, { silent: true });
    expect(mockWrites).toEqual([{ path: 'bookings/a2_s1', data: expect.objectContaining({ status: 'confirmed', chargedFrom: 'grace', graceTokenId: 'single_cs_1', periodKey: '2026-11-01' }) }]);
    expect(mockWrites[0].data).not.toHaveProperty('rebookedAt');
    expect(mockUpdates).toEqual([{ path: 'sessions/s1', data: { booked: 1 } }]);
    expect(out).toMatchObject({ id: 'a2_s1', status: 'confirmed', chargedFrom: 'grace', graceTokenId: 'single_cs_1' });
  });

  test('a re-book decides the charge again, stamps rebookedAt and takes the seat in the same commit', async () => {
    // Cancelled earlier; the token it held then was spent on another session since.
    mockDocs['bookings/a2_s1'] = { athleteId: 'a2', sessionId: 's1', status: 'cancelled', chargedFrom: 'grace', graceTokenId: 'single_cs_1' };
    mockRows.graceTokens = [token('single_cs_1'), token('single_cs_2')];
    mockRows.bookings = [
      { id: 'a2_s1', athleteId: 'a2', sessionId: 's1', status: 'cancelled', graceTokenId: 'single_cs_1', periodKey: '2026-11-01', date: '2026-11-10' },
      { id: 'a2_s9', athleteId: 'a2', sessionId: 's9', status: 'confirmed', graceTokenId: 'single_cs_1', periodKey: '2026-11-01', date: '2026-11-12' },
    ];
    await createBooking(args, { silent: true });
    expect(mockWrites).toEqual([]);
    expect(mockUpdates).toEqual([
      { path: 'bookings/a2_s1', data: { status: 'confirmed', chargedFrom: 'grace', graceTokenId: 'single_cs_2', rebookedAt: 'SERVER_TS' } },
      { path: 'sessions/s1', data: { booked: 1 } },
    ]);
  });

  test('a token held by another waitlist spot is not spent, and nothing is written', async () => {
    mockRows.waitlist = [{ id: 's7_a2', sessionId: 's7', athleteId: 'a2', householdId: 'h1', periodKey: '2026-11-01' }];
    await expect(createBooking(args, { silent: true })).rejects.toMatchObject({
      reason: 'no-session-token',
      message: 'Your session token is held by a waitlist spot - leave the waitlist or buy another token.',
    });
    // This session's own waitlist entry holds nothing back: booking it releases the hold.
    mockRows.waitlist = [{ id: 's1_a2', sessionId: 's1', athleteId: 'a2', householdId: 'h1', periodKey: '2026-11-01' }];
    await createBooking(args, { silent: true });
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0].data).toMatchObject({ chargedFrom: 'grace', graceTokenId: 'single_cs_1' });
  });

  test('no token: refused with the buy copy; before the Oct 10 gate: refused as booking-not-open', async () => {
    mockRows.graceTokens = [];
    await expect(createBooking(args, { silent: true })).rejects.toMatchObject({ reason: 'no-session-token', message: 'No session token left - buy one to book.' });
    mockRows.graceTokens = [token('single_cs_1')];
    jest.setSystemTime(new Date('2026-10-09T17:00:00Z'));
    await expect(createBooking(args, { silent: true })).rejects.toMatchObject({ reason: 'booking-not-open' });
    expect(mockWrites).toEqual([]);
    expect(mockUpdates).toEqual([]);
  });
});
