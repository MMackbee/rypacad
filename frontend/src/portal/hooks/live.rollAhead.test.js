/**
 * createBooking and a leftover token used early (owner 2026-11-16, the
 * Schmidt case): next month's tokens are all booked, this month has one
 * left, and the family books a next-month session now. The server rolls the
 * token (rollTokenAhead, mocked here); the booking spends it as a grace
 * token. Firebase is mocked out as in live.test.js.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('./invalidate', () => ({ bump: jest.fn() }));
jest.mock('./rollAhead', () => ({
  ...jest.requireActual('./rollAhead'),
  __esModule: true,
  requestRollAhead: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ path: name }),
  doc: (_db, col, id) => ({ path: `${col}/${id}` }),
  where: () => null,
  query: (ref) => ref,
  getDocs: async (ref) => mockQuery(ref.path),
  getDoc: async (ref) => mockSnap(ref.path),
  serverTimestamp: () => 'SERVER_TS',
  deleteField: () => 'DELETE_FIELD',
  runTransaction: async (_db, fn) =>
    fn({
      get: async (ref) => mockSnap(ref.path),
      set: (ref, data) => mockWrites.push({ path: ref.path, data }),
      update: (ref, data) => mockUpdates.push({ path: ref.path, data }),
    }),
}));

const mockDocs = {};
const mockWrites = [];
const mockUpdates = [];
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
import { assertPeriodTokensLeft, createBooking } from './live';
import { requestRollAhead, rollAheadApplies } from './rollAhead';

const TOKEN = 'rollover_a1_2026-11-01_1';
const T6 = { name: '6 tokens', kind: 'tokens', tokens: 6 };
const row = (date, over = {}) => ({
  id: `a1_${date}`, athleteId: 'a1', householdId: 'h1', sessionId: date, date, periodKey: `${date.slice(0, 7)}-01`, status: 'confirmed', chargedFrom: 'period', ...over,
});
const NOV = ['2026-11-03', '2026-11-11', '2026-11-17', '2026-11-18', '2026-11-24'].map((d) => row(d));
const DEC = ['2026-12-08', '2026-12-09', '2026-12-15', '2026-12-16', '2026-12-22', '2026-12-29'].map((d) => row(d));
const december = { athleteId: 'a1', sessionId: 's-dec', date: '2026-12-10', type: 'training', householdId: 'h1' };

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-11-16T18:00:00Z')); // noon Mon Nov 16 in Chicago
  auth.currentUser = { uid: 'p1' };
  mockWrites.length = 0;
  mockUpdates.length = 0;
  Object.assign(mockDocs, {
    'households/h1': { name: 'Schmidt family', periodAnchorDay: 1 },
    'athletes/a1': { name: 'Britta', householdId: 'h1', packageId: 't-6', billing: { status: 'active' } },
    'packages/t-6': T6,
    'sessions/s-dec': { date: '2026-12-10', time: '4:00 PM', type: 'training', capacity: 8, booked: 2, status: 'scheduled' },
    'sessions/s-nov': { date: '2026-11-20', time: '4:00 PM', type: 'training', capacity: 8, booked: 2, status: 'scheduled' },
    'tokenPeriods/a1_2026-11-01': { granted: 6 },
  });
  mockRows.bookings = [...NOV, ...DEC];
  mockRows.graceTokens = [];
  mockRows.waitlist = [];
});
afterEach(() => {
  jest.useRealTimers();
  auth.currentUser = null;
  for (const k of Object.keys(mockDocs)) delete mockDocs[k];
  for (const k of Object.keys(mockRows)) delete mockRows[k];
});

describe('createBooking: next month full, this month has a leftover token', () => {
  test('the server rolls the token and the booking spends it', async () => {
    requestRollAhead.mockResolvedValue({ graceTokenId: TOKEN, expiresAt: '2026-12-31', sourcePeriodKey: '2026-11-01' });
    const out = await createBooking(december);
    expect(requestRollAhead).toHaveBeenCalledTimes(1);
    expect(requestRollAhead).toHaveBeenCalledWith({ athleteId: 'a1', date: '2026-12-10' });
    expect(mockWrites).toEqual([{ path: 'bookings/a1_s-dec', data: expect.objectContaining({ status: 'confirmed', chargedFrom: 'grace', graceTokenId: TOKEN, periodKey: '2026-12-01' }) }]);
    expect(out).toMatchObject({ status: 'confirmed', chargedFrom: 'grace', graceTokenId: TOKEN });
  });

  test('the server says no (or fails): the booking is refused as out of tokens, nothing written', async () => {
    requestRollAhead.mockResolvedValue(null);
    await expect(createBooking(december)).rejects.toMatchObject({ reason: 'no-tokens-left', message: "Next period's tokens are already fully booked (6 of 6)." });
    expect(mockWrites).toEqual([]);
  });

  test('never asked while December still has a token, or a token in hand covers the date', async () => {
    mockRows.bookings = [...NOV, ...DEC.slice(1)];
    await createBooking(december);
    expect(requestRollAhead).not.toHaveBeenCalled();
    expect(mockWrites[0].data).toMatchObject({ chargedFrom: 'period', periodKey: '2026-12-01' });

    mockWrites.length = 0;
    mockRows.bookings = [...NOV, ...DEC];
    mockRows.graceTokens = [{ id: TOKEN, athleteId: 'a1', reason: 'rollover', sourcePeriodKey: '2026-11-01', expiresAt: '2026-12-31' }];
    await createBooking(december);
    expect(requestRollAhead).not.toHaveBeenCalled();
    expect(mockWrites[0].data).toMatchObject({ chargedFrom: 'grace', graceTokenId: TOKEN });
  });

  test('never asked for a session of the month that is out of tokens itself, nor for a waitlist place', async () => {
    requestRollAhead.mockResolvedValue({ graceTokenId: TOKEN });
    mockRows.bookings = [...NOV, row('2026-11-25'), ...DEC];
    await expect(createBooking({ ...december, sessionId: 's-nov', date: '2026-11-20' })).rejects.toMatchObject({ reason: 'no-tokens-left' });
    await expect(createBooking(december, { waitlistIfFull: true })).rejects.toMatchObject({ reason: 'no-tokens-left' });
    expect(requestRollAhead).not.toHaveBeenCalled();
  });

  test('a token already rolled out of November is not November\'s to spend again', async () => {
    // Rolled early and spent on a December session: November reads 5 used + 1 carried over.
    mockRows.graceTokens = [{ id: TOKEN, athleteId: 'a1', reason: 'rollover', sourcePeriodKey: '2026-11-01', expiresAt: '2026-12-31' }];
    mockRows.bookings = [...NOV, ...DEC, row('2026-12-10', { chargedFrom: 'grace', graceTokenId: TOKEN })];
    await expect(createBooking({ ...december, sessionId: 's-nov', date: '2026-11-20' })).rejects.toMatchObject({
      reason: 'no-tokens-left',
      message: "This period's tokens are already fully booked (5 of 6, 1 carried over).",
    });
  });
});

describe('the pure pieces', () => {
  const noTokens = { reason: 'no-tokens-left' };
  const next = { pkg: T6, periodKey: '2026-12-01', currentPeriodKey: '2026-11-01', waitlistIfFull: false };

  test('rollAheadApplies: only a next-period, no-tokens refusal of a monthly token package', () => {
    expect(rollAheadApplies(noTokens, next)).toBe(true);
    expect(rollAheadApplies(noTokens, { ...next, periodKey: '2026-11-01' })).toBe(false);
    expect(rollAheadApplies(noTokens, { ...next, waitlistIfFull: true })).toBe(false);
    expect(rollAheadApplies({ reason: 'no-session-token' }, next)).toBe(false);
    expect(rollAheadApplies(noTokens, { ...next, pkg: { kind: 'single', tokens: 1 } })).toBe(false);
    expect(rollAheadApplies(noTokens, { ...next, pkg: { kind: 'elite', tokens: null } })).toBe(false);
    expect(rollAheadApplies(noTokens, { ...next, pkg: null })).toBe(false);
    expect(rollAheadApplies(null, next)).toBe(false);
  });

  test('assertPeriodTokensLeft counts the tokens rolled out early', () => {
    expect(() => assertPeriodTokensLeft(T6, NOV, '2026-11-01', 6, [], '2026-11-01', 0)).not.toThrow();
    expect(() => assertPeriodTokensLeft(T6, NOV, '2026-11-01', 6, [], '2026-11-01', 1)).toThrow('5 of 6, 1 carried over');
    expect(() => assertPeriodTokensLeft(T6, NOV, '2026-11-01', 6, [], '2026-11-01')).not.toThrow();
  });
});
