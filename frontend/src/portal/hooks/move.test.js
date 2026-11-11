/**
 * Move (spec 2026-11-11 §5), the client half: the picker lists the sessions
 * of the same kind the athlete could book right now with this booking given
 * back (data/bookability.js moveTargetOpen), day by day through the booking
 * window; the move itself is one call to the moveBooking callable. Seed mode
 * lists nothing and calls nothing. Plain functions, not jest.fn(): CRA's
 * resetMocks would clear them before every test.
 */
jest.mock('./live', () => ({
  isLive: () => mockLive,
  fetchCurrentUser: async () => mockCall('fetchCurrentUser', mockUser),
  fetchAthlete: async (...args) => mockCall('fetchAthlete', mockAthlete, args),
  fetchBookings: async (...args) => mockCall('fetchBookings', mockBookings, args),
  fetchPackage: async (...args) => mockCall('fetchPackage', mockPkg, args),
  fetchHousehold: async (...args) => mockCall('fetchHousehold', mockHousehold, args),
  fetchGraceTokensByAthlete: async (...args) => mockCall('fetchGraceTokensByAthlete', mockGrace, args),
  fetchSessionsInRange: async (...args) => mockCall('fetchSessionsInRange', mockSessions, args),
}));
jest.mock('./waitlist', () => ({
  fetchWaitlistByAthlete: async (...args) => mockCall('fetchWaitlistByAthlete', mockWaitlist, args),
}));
jest.mock('./index', () => ({
  liveTokens: async (...args) => mockCall('liveTokens', mockTokens, args),
}));
jest.mock('./callables', () => ({
  callMoveBooking: async (...args) => mockCall('callMoveBooking', { bookingId: 'jordan_s2', movedFrom: 'b1', sessionId: 's2' }, args),
}));
jest.mock('./invalidate', () => ({ bump: (name) => mockBumps.push(name) }));

let mockLive;
let mockUser;
let mockAthlete;
let mockBookings;
let mockPkg;
let mockHousehold;
let mockGrace;
let mockSessions;
let mockWaitlist;
let mockTokens;
const mockCalls = {};
const mockBumps = [];
function mockCall(name, value, args = []) {
  (mockCalls[name] = mockCalls[name] || []).push(args);
  return value;
}

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { loadMoveOptions, moveBooking, useMoveOptions } from './move';
import { openThrough } from '../data/calendar';

// 2 PM Thu Nov 12 in Chicago.
const NOW = new Date('2026-11-12T20:00:00Z');
const session = (id, date, time, over = {}) => ({ id, date, time, type: 'training', status: 'scheduled', capacity: 12, booked: 3, ...over });
const row = (over = {}) => ({
  id: 's1', bookingId: 'b1', athleteId: 'jordan', date: '2026-11-12', time: '4:00', meridiem: 'PM', type: 'training',
  status: 'confirmed', cancellable: true, periodKey: '2026-11-01', comp: false, graceTokenId: null, ...over,
});
const T6 = { id: 't-6', kind: 'tokens', tokens: 6 };
const ELITE = { id: 'elite', kind: 'elite', tokens: null };
const ids = (out) => out.days.flatMap((d) => d.sessions.map((s) => s.id));

beforeEach(() => {
  mockLive = true;
  mockUser = { uid: 'p1', role: 'parent', householdId: 'h1' };
  mockAthlete = { id: 'jordan', name: 'Jordan Whitfield', householdId: 'h1', packageId: 't-6', handicap: 10 };
  mockBookings = [
    { id: 'b1', athleteId: 'jordan', sessionId: 's1', date: '2026-11-12', type: 'training', status: 'confirmed', periodKey: '2026-11-01' },
    { id: 'jordan_s7', athleteId: 'jordan', sessionId: 's7', date: '2026-11-16', type: 'training', status: 'confirmed', periodKey: '2026-11-01' },
  ];
  mockPkg = T6;
  mockHousehold = { id: 'h1', periodAnchorDay: 1 };
  mockGrace = [];
  mockWaitlist = [{ id: 's8_jordan', sessionId: 's8', athleteId: 'jordan', householdId: 'h1' }];
  mockTokens = { left: 2, grace: [], unlimited: false };
  mockSessions = [];
  for (const k of Object.keys(mockCalls)) delete mockCalls[k];
  mockBumps.length = 0;
});

describe('loadMoveOptions', () => {
  test("a parent's load: household-scoped reads, through the athlete's window, only what could be booked", async () => {
    mockSessions = [
      session('s2', '2026-11-13', '4:00 PM'),
      session('s3', '2026-11-13', '5:00 PM', { type: 'phil' }),
      session('s4', '2026-11-14', '4:00 PM', { status: 'cancelled' }),
      session('s5', '2026-11-14', '6:00 PM', { hidden: true }),
      session('s6', '2026-11-15', '10:30 AM', { booked: 12 }),
      session('s0', '2026-11-12', '1:00 PM'),
      session('s7', '2026-11-16', '4:00 PM'),
      session('s8', '2026-11-17', '4:00 PM'),
      session('s9', '2026-11-18', '3:00 PM', { maxHandicap: 5 }),
      session('s1', '2026-11-12', '4:00 PM'),
    ];
    const out = await loadMoveOptions(row(), NOW);
    expect(mockCalls.fetchBookings).toEqual([['jordan', { householdId: 'h1' }]]);
    expect(mockCalls.fetchWaitlistByAthlete).toEqual([['jordan', { householdId: 'h1' }]]);
    expect(mockCalls.fetchSessionsInRange).toEqual([['2026-11-12', openThrough(NOW, 1)]]);
    expect(out).toEqual({
      days: [
        {
          iso: '2026-11-13',
          label: 'Friday, Nov 13',
          sessions: [{ id: 's2', date: '2026-11-13', time: '4:00', meridiem: 'PM', fullTime: '4:00 PM', type: 'training', name: 'Training block', capacityLabel: '9 left' }],
        },
      ],
    });
  });

  test('day by day, and by start time within a day', async () => {
    mockSessions = [
      session('s22', '2026-11-20', '9:00 AM'),
      session('s21', '2026-11-19', '6:00 PM', { label: 'Holiday clinic' }),
      session('s20', '2026-11-19', '10:00 AM'),
    ];
    const out = await loadMoveOptions(row(), NOW);
    expect(out.days.map((d) => [d.iso, d.sessions.map((s) => [s.id, s.name])])).toEqual([
      ['2026-11-19', [['s20', 'Training block'], ['s21', 'Holiday clinic']]],
      ['2026-11-20', [['s22', 'Training block']]],
    ]);
  });

  test('Elite moves 4 PM to 6 PM on the same day', async () => {
    mockPkg = ELITE;
    mockAthlete = { ...mockAthlete, packageId: 'elite' };
    mockTokens = { unlimited: true, left: null, grace: [] };
    mockSessions = [session('s3', '2026-11-12', '6:00 PM')];
    const out = await loadMoveOptions(row(), NOW);
    expect(ids(out)).toEqual(['s3']);
    expect(mockCalls.fetchSessionsInRange).toEqual([['2026-11-12', openThrough(NOW, 2)]]);
  });

  test("a December session is offered when December has a token, not when it is spent", async () => {
    const dec = (left) => ({ left: 2, grace: [], unlimited: false, nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', granted: 6, used: 6 - left, reserved: 0, left } });
    mockSessions = [session('d1', '2026-12-01', '4:00 PM')];
    mockTokens = dec(1);
    expect(ids(await loadMoveOptions(row(), NOW))).toEqual(['d1']);
    mockTokens = dec(0);
    expect(ids(await loadMoveOptions(row(), NOW))).toEqual([]);
  });

  test('a comp never reads tokens, and moves into a spent December anyway', async () => {
    mockSessions = [session('d1', '2026-12-01', '4:00 PM')];
    mockTokens = { left: 0, grace: [], unlimited: false, nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', granted: 6, used: 6, reserved: 0, left: 0 } };
    const out = await loadMoveOptions(row({ comp: true }), NOW);
    expect(mockCalls.liveTokens).toBeUndefined();
    expect(ids(out)).toEqual(['d1']);
  });

  test('a bonus token the booking holds comes back only up to its expiry', async () => {
    mockTokens = { left: 0, grace: [], unlimited: false };
    mockGrace = [{ id: 'g1', expiresAt: '2026-11-20' }];
    mockSessions = [session('s19', '2026-11-19', '4:00 PM'), session('s21', '2026-11-21', '4:00 PM')];
    const out = await loadMoveOptions(row({ graceTokenId: 'g1' }), NOW);
    expect(ids(out)).toEqual(['s19']);
  });

  test("an athlete's own login reads its own athlete", async () => {
    mockUser = { uid: 'u1', role: 'athlete', athleteId: 'jordan', householdId: 'h1' };
    mockSessions = [session('s2', '2026-11-13', '4:00 PM')];
    const out = await loadMoveOptions(row({ athleteId: undefined }), NOW);
    expect(mockCalls.fetchAthlete).toEqual([['jordan']]);
    expect(mockCalls.fetchBookings).toEqual([['jordan']]);
    expect(mockCalls.fetchWaitlistByAthlete).toEqual([['jordan']]);
    expect(ids(out)).toEqual(['s2']);
  });
});

describe('moveBooking', () => {
  test('one call to the callable, then the lists refresh (the waitlist too: a move drops a place held on the new session)', async () => {
    const out = await moveBooking({ bookingId: 'b1', toSessionId: 's2' });
    expect(mockCalls.callMoveBooking).toEqual([[{ bookingId: 'b1', toSessionId: 's2' }]]);
    expect(mockBumps).toEqual(['bookings', 'sessions', 'waitlist']);
    expect(out).toMatchObject({ bookingId: 'jordan_s2', movedFrom: 'b1' });
  });

  test('seed mode echoes and calls nothing (Review Focus 10)', async () => {
    mockLive = false;
    await expect(moveBooking({ bookingId: 'b1', toSessionId: 's2' })).resolves.toEqual({ bookingId: 'b1', toSessionId: 's2', simulated: true });
    expect(mockCalls.callMoveBooking).toBeUndefined();
    expect(mockBumps).toEqual([]);
  });
});

describe('useMoveOptions', () => {
  async function mountHook(useHook) {
    const result = { current: null };
    function Probe() {
      result.current = useHook();
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<Probe />); });
    for (let i = 0; i < 12; i += 1) await act(async () => {});
    return { result, unmount: () => act(async () => root.unmount()) };
  }

  test('seed mode: nothing to move to, nothing read', async () => {
    mockLive = false;
    const h = await mountHook(() => useMoveOptions(row()));
    expect(h.result.current).toMatchObject({ data: { days: [] }, loading: false, error: null });
    expect(mockCalls.fetchCurrentUser).toBeUndefined();
    await h.unmount();
  });

  test('live: loads the options for the row once', async () => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(NOW);
    try {
      mockSessions = [session('s2', '2026-11-13', '4:00 PM')];
      const h = await mountHook(() => useMoveOptions(row()));
      expect(h.result.current.error).toBeNull();
      expect(ids(h.result.current.data)).toEqual(['s2']);
      expect(mockCalls.fetchCurrentUser).toHaveLength(1);
      await h.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
