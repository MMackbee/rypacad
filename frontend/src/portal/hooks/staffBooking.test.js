/**
 * Staff booking hooks and calls (Task C3, spec 01-spec-admin-booking.md
 * 10.1, 10.7): practice mode calls nothing and echoes; live mode sends
 * exactly the payload, then reloads every list that shows bookings, seats
 * or waitlist places - after a refusal too. A refusal carries its reason,
 * the server's count for `full`, and staff words. The athlete is read
 * staff-wide (no household filter). Plain functions, not jest.fn(): CRA's
 * resetMocks would clear them before every test.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: () => () => null }));
jest.mock('firebase/messaging', () => ({ isSupported: async () => false }));
jest.mock('./live', () => ({
  ERR: { NOT_FOUND: 'not-found', INVALID: 'invalid-argument' },
  LiveDataError: class LiveDataError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
  isLive: () => mockLive,
  fetchAthlete: async (id) => {
    mockReads.push(['fetchAthlete', id]);
    if (!mockAthlete) throw Object.assign(new Error(`No athletes/${id} doc.`), { code: 'not-found' });
    return mockAthlete;
  },
  fetchHousehold: async (id) => {
    mockReads.push(['fetchHousehold', id]);
    return { id, name: 'Whitfield family', periodAnchorDay: 15 };
  },
  fetchPackage: async (id) => {
    mockReads.push(['fetchPackage', id]);
    return { id, name: '6 tokens', kind: 'tokens', tokens: 6 };
  },
  fetchBookings: async (...args) => {
    mockReads.push(['fetchBookings', ...args]);
    return mockBookings;
  },
  fetchGraceTokensByAthlete: async (...args) => {
    mockReads.push(['fetchGraceTokensByAthlete', ...args]);
    return [];
  },
  fetchSessionsByIds: async (ids) => {
    mockReads.push(['fetchSessionsByIds', ids]);
    return mockSessions.filter((s) => ids.includes(s.id));
  },
  fetchSessionsInRange: async (...args) => {
    mockReads.push(['fetchSessionsInRange', ...args]);
    return mockSessions;
  },
}));
jest.mock('./waitlist', () => ({
  fetchWaitlistByAthlete: async (...args) => {
    mockReads.push(['fetchWaitlistByAthlete', ...args]);
    return [];
  },
  fetchWaitlistBySession: async (...args) => {
    mockReads.push(['fetchWaitlistBySession', ...args]);
    return mockWaiting;
  },
}));
jest.mock('./index', () => ({
  liveTokens: async (...args) => {
    mockReads.push(['liveTokens', ...args]);
    return { granted: 6, used: 0, reserved: 0, grace: [], left: 6, unlimited: false, perPurchase: false, held: 0, nextPeriod: null };
  },
  coachingFor: () => null,
}));
jest.mock('./callables', () => ({
  callStaffBookSession: async (payload) => {
    mockSent.push(['staffBookSession', payload]);
    if (mockFail) throw mockFail;
    return { bookingId: 'jordan_s2', comp: Boolean(payload.free), chargedFrom: 'period', booked: 4, capacity: 12, overrides: [] };
  },
  callMoveBooking: async (payload) => {
    mockSent.push(['moveBooking', payload]);
    if (mockFail) throw mockFail;
    return { bookingId: `jordan_${payload.toSessionId}`, movedFrom: payload.bookingId, sessionId: payload.toSessionId, overrides: [] };
  },
}));
jest.mock('./invalidate', () => ({ bump: (name) => mockBumps.push(name), useInvalidation: () => 0 }));

import React from 'react';
import { renderScreen } from '../screens/testRender';
import {
  staffBookSession,
  staffMoveBooking,
  useSessionWaitlistCount,
  useStaffAthlete,
  useStaffDaySessions,
  useStaffSession,
} from './staffBooking';

let mockLive;
let mockSent;
let mockBumps;
let mockFail;
let mockReads;
let mockAthlete;
let mockBookings;
let mockSessions;
let mockWaiting;

beforeEach(() => {
  mockLive = true;
  mockSent = [];
  mockBumps = [];
  mockFail = null;
  mockReads = [];
  mockAthlete = { id: 'jordan', name: 'Jordan Whitfield', householdId: 'hh1', packageId: 't-6', handicap: 4 };
  mockBookings = [];
  mockSessions = [];
  mockWaiting = [];
});

/** Renders `useHook()` and hands back its latest state. */
async function probe(useHook) {
  const seen = { current: null };
  function Probe() {
    seen.current = useHook();
    return null;
  }
  const r = await renderScreen(<Probe />);
  await r.flush();
  await r.flush();
  return { seen, unmount: r.unmount };
}

describe('the calls', () => {
  test('seed: add and move call nothing and echo', async () => {
    mockLive = false;
    expect(await staffBookSession({ athleteId: 'jordan', sessionId: 's2', free: true, allowFull: false }, { first: 'Jordan' })).toEqual({
      simulated: true, bookingId: 'jordan_s2', athleteId: 'jordan', sessionId: 's2', comp: true, chargedFrom: null, booked: null, capacity: null, overrides: [],
    });
    expect(await staffMoveBooking({ bookingId: 'jordan_s1', toSessionId: 's2' }, { first: 'Jordan' })).toEqual({
      simulated: true, bookingId: null, movedFrom: 'jordan_s1', sessionId: 's2', overrides: [],
    });
    expect(mockSent).toEqual([]);
    expect(mockBumps).toEqual([]);
  });

  test('live add: the payload, then the lists reload', async () => {
    await staffBookSession({ athleteId: 'jordan', sessionId: 's2', free: false, allowFull: false });
    await staffBookSession({ athleteId: 'jordan', sessionId: 's2', free: true, allowFull: true });
    expect(mockSent).toEqual([
      ['staffBookSession', { athleteId: 'jordan', sessionId: 's2' }],
      ['staffBookSession', { athleteId: 'jordan', sessionId: 's2', free: true, allowFull: true }],
    ]);
    expect(mockBumps).toEqual(expect.arrayContaining(['bookings', 'sessions', 'waitlist']));
  });

  test('live move goes through moveBooking', async () => {
    const out = await staffMoveBooking({ bookingId: 'jordan_s1', toSessionId: 's2', allowFull: false });
    await staffMoveBooking({ bookingId: 'jordan_s1', toSessionId: 's4', allowFull: true });
    expect(mockSent).toEqual([
      ['moveBooking', { bookingId: 'jordan_s1', toSessionId: 's2' }],
      ['moveBooking', { bookingId: 'jordan_s1', toSessionId: 's4', allowFull: true }],
    ]);
    expect(out).toMatchObject({ movedFrom: 'jordan_s1', sessionId: 's2' });
    expect(mockBumps).toEqual(expect.arrayContaining(['bookings', 'sessions', 'waitlist']));
  });

  test('a refusal: reason, details, staff words; the lists still reload', async () => {
    mockFail = Object.assign(new Error('raw'), { reason: 'full', cause: { details: { reason: 'full', taken: 12, capacity: 12 } } });
    const full = await staffBookSession({ athleteId: 'jordan', sessionId: 's2' }, { first: 'Jordan' }).catch((e) => e);
    expect(full.reason).toBe('full');
    expect(full.details).toEqual({ taken: 12, capacity: 12 });
    expect(full.cause).toBe(mockFail);
    expect(mockBumps).toEqual(expect.arrayContaining(['bookings', 'sessions', 'waitlist']));

    mockFail = Object.assign(new Error('raw'), { reason: 'session-hidden', cause: { details: { reason: 'session-hidden' } } });
    const hidden = await staffBookSession({ athleteId: 'jordan', sessionId: 's2' }, { first: 'Jordan' }).catch((e) => e);
    expect(hidden.message).toBe('That session is hidden from the schedule. Show it first, then add.');

    mockFail = new Error('network');
    const none = await staffMoveBooking({ bookingId: 'jordan_s1', toSessionId: 's2' }, { first: 'Jordan' }).catch((e) => e);
    expect(none.reason).toBeNull();
    expect(none.details).toBeNull();
    expect(none.message).toBe("We couldn't confirm the change. Check the list before trying again.");

    mockFail = Object.assign(new Error('raw'), { reason: 'membership-inactive' });
    const move = await staffMoveBooking({ bookingId: 'jordan_s1', toSessionId: 's2' }, { first: 'Jordan' }).catch((e) => e);
    expect(move.message).toBe("Jordan's membership isn't active, so a paid booking can't move. Cancel it and add Free instead.");
  });
});

describe('the hooks', () => {
  test('useStaffAthlete reads staff-wide', async () => {
    mockBookings = [{ id: 'jordan_s2', athleteId: 'jordan', sessionId: 's2', status: 'confirmed', date: '2099-01-05', periodKey: '2098-12-15', type: 'training' }];
    mockSessions = [{ id: 's2', date: '2099-01-05', time: '4:00 PM', type: 'training' }];
    const { seen, unmount } = await probe(() => useStaffAthlete('jordan'));
    expect(seen.current.error).toBeNull();
    expect(mockReads).toContainEqual(['fetchBookings', 'jordan']);
    expect(mockReads).toContainEqual(['fetchWaitlistByAthlete', 'jordan']);
    expect(mockReads).toContainEqual(['fetchGraceTokensByAthlete', 'jordan']);
    expect(mockReads).toContainEqual(['fetchSessionsByIds', ['s2']]);
    const tokensCall = mockReads.find((r) => r[0] === 'liveTokens');
    expect(tokensCall[1]).toBe(mockAthlete);
    expect(tokensCall[4]).toBe(15);
    expect(seen.current.data.groups).toBeDefined();
    expect(seen.current.data.anchorDay).toBe(15);
    expect(seen.current.data.name).toBe('Jordan Whitfield');
    await unmount();
  });

  test('a missing athlete is not-found', async () => {
    mockAthlete = null;
    const { seen, unmount } = await probe(() => useStaffAthlete('ghost'));
    expect(seen.current.data).toBeNull();
    expect(seen.current.error.code).toBe('not-found');
    await unmount();
  });

  test('practice mode builds the athlete from the billing seed member', async () => {
    mockLive = false;
    const { seen, unmount } = await probe(() => useStaffAthlete('jordan'));
    expect(seen.current.data).toMatchObject({ athleteId: 'jordan', householdName: 'Whitfield family', packageName: '12 tokens', payState: 'paid' });
    expect(seen.current.data.tokens.granted).toBe(12);
    expect(mockReads).toEqual([]);
    const ghost = await probe(() => useStaffAthlete('ghost'));
    expect(ghost.seen.current.error.code).toBe('not-found');
    await ghost.unmount();
    await unmount();
  });

  test('useStaffDaySessions drops hidden, cancelled, display-only and mental sessions', async () => {
    const good = { id: 's2', date: '2026-11-17', time: '4:00 PM', type: 'training', capacity: 12, booked: 3 };
    mockSessions = [
      { ...good, id: 'hidden', hidden: true },
      { ...good, id: 'cancelled', status: 'cancelled' },
      { ...good, id: 'display', bookable: false },
      { ...good, id: 'mental', type: 'mental' },
      good,
    ];
    const { seen, unmount } = await probe(() => useStaffDaySessions('2026-11-17'));
    expect(seen.current.data).toEqual([good]);
    expect(mockReads).toContainEqual(['fetchSessionsInRange', '2026-11-17', '2026-11-17']);
    await unmount();
  });

  test('useStaffSession reads one session by id', async () => {
    mockSessions = [{ id: 's2', date: '2026-11-17', time: '4:00 PM', type: 'training' }];
    const { seen, unmount } = await probe(() => useStaffSession('s2'));
    expect(seen.current.data).toEqual(mockSessions[0]);
    expect(mockReads).toContainEqual(['fetchSessionsByIds', ['s2']]);
    await unmount();
  });

  test('useSessionWaitlistCount leaves out the athlete', async () => {
    mockWaiting = [
      { id: 's2_jordan', sessionId: 's2', athleteId: 'jordan' },
      { id: 's2_riley', sessionId: 's2', athleteId: 'riley' },
      { id: 's2_casey', sessionId: 's2', athleteId: 'casey' },
    ];
    const { seen, unmount } = await probe(() => useSessionWaitlistCount('s2', { athleteId: 'jordan', enabled: true }));
    expect(seen.current.data).toBe(2);
    await unmount();
    mockReads = [];
    const off = await probe(() => useSessionWaitlistCount('s2', { athleteId: 'jordan', enabled: false }));
    expect(off.seen.current.data).toBeNull();
    expect(mockReads).toEqual([]);
    await off.unmount();
  });
});
