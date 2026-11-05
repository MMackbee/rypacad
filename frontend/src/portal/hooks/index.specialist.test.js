/**
 * useSpecialistSessions in live mode (review 2026-11-04): a Calendly booking
 * the webhook could not match to a family is HELD as `sessions/cal-<uuid>`
 * with `unresolved: true` and no booking (functions/portal/calendly.js).
 * Yannick's row must count it as taken (1/1) and mark it unresolved; once a
 * real booking sits on it, it is an ordinary row. SpecialistDay.test.js
 * mocks this hook, so this is the only test of liveSpecialistSessions.
 * Kept beside index.test.js with its own mock list so the lanes merge cleanly.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));
// CRA's resetMocks clears these before every test; beforeEach sets them.
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchAthletesByIds: jest.fn(),
  fetchBookingsBySession: jest.fn(),
  fetchSessionsInRange: jest.fn(),
}));
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useSpecialistSessions } from './index';
import * as live from './live';
import * as calendar from '../data/calendar';

// Wed Nov 11 2026, 9 AM in Chicago.
const NOW = new Date('2026-11-11T15:00:00Z');
const TODAY = '2026-11-11';

// Fake timers freeze setTimeout; act() drains the promise chains instead.
const flush = async () => { for (let i = 0; i < 12; i += 1) await act(async () => {}); };

async function mountHook(useHook) {
  const result = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await flush();
  return { result, unmount: () => act(async () => root.unmount()) };
}

const cal = (id, date, over = {}) => ({
  id, date, time: '7:00 PM', type: 'mental', status: 'scheduled', capacity: 1, booked: 1, bookable: false, source: 'calendly', durationMinutes: 45, ...over,
});

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(NOW);
  calendar.todayISO.mockReturnValue(TODAY);
  live.isLive.mockReturnValue(true);
  live.fetchSessionsInRange.mockResolvedValue([
    cal('cal-held', '2026-11-12', { unresolved: true }),
    // Still flagged, but a real booking sits on it: an ordinary booked row.
    cal('cal-linked', '2026-11-13', { unresolved: true }),
    // Released by the family's cancel on Calendly: not on the list at all.
    cal('cal-gone', '2026-11-14', { unresolved: true, status: 'cancelled', booked: 0 }),
    cal('cal-open', '2026-11-16', { booked: 0 }),
  ]);
  live.fetchBookingsBySession.mockImplementation(async (sessionId) => (sessionId === 'cal-linked'
    ? [{ id: 'jordan_cal-linked', athleteId: 'jordan', sessionId, status: 'confirmed', attendee: 'athlete' }]
    : []));
  live.fetchAthletesByIds.mockImplementation(async (ids) => ids.map((id) => ({ id, name: 'Jordan Whitfield' })));
});
afterEach(() => {
  jest.useRealTimers();
});

test('a held Calendly session with no booking comes back booked 1/1 and unresolved; a booked one does not', async () => {
  const h = await mountHook(() => useSpecialistSessions('mental'));
  expect(h.result.current.error).toBeNull();
  const rows = h.result.current.data.sessions.map((s) => [s.sessionId, s.booked, s.capacity, s.unresolved, s.athletes.map((a) => a.athleteId)]);
  expect(rows).toEqual([
    ['cal-held', 1, 1, true, []],
    ['cal-linked', 1, 1, false, ['jordan']],
    ['cal-open', 0, 1, false, []],
  ]);
  await h.unmount();
});
