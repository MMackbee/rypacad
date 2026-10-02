/**
 * Handicap-reserved blocks (owner ruling 2026-10-02), the two halves together:
 * the REAL hooks (hooks/index.js, over a mocked Firestore adapter) feed the
 * REAL Book a Session screen, so the rows one lane writes are the rows the
 * other reads. Each describe is a state production passes through as the
 * change rolls out with families booking:
 *   - the new frontend with no session stamped: the app it was;
 *   - the sessions stamped by the calendar sync: each child judged on their own;
 *   - a screen loaded before the stamp, tapped after it: a clean refusal.
 * The rules half of the same states is scripts/verify-rules.mjs taskReserved.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));
// CRA's resetMocks clears these before every test; beforeEach sets them again.
jest.mock('../hooks/live', () => ({
  ...jest.requireActual('../hooks/live'),
  __esModule: true,
  isLive: jest.fn(),
  createBooking: jest.fn(),
  fetchAthlete: jest.fn(),
  fetchBookings: jest.fn(),
  fetchCurrentUser: jest.fn(),
  fetchGraceTokensByAthlete: jest.fn(),
  fetchHousehold: jest.fn(),
  fetchHouseholdAthletes: jest.fn(),
  fetchPackage: jest.fn(),
  fetchSessions: jest.fn(),
  fetchSessionsByIds: jest.fn(),
  fetchSessionsInRange: jest.fn(),
}));
jest.mock('../hooks/waitlist', () => ({
  ...jest.requireActual('../hooks/waitlist'),
  __esModule: true,
  fetchWaitlistByAthlete: jest.fn(),
  fetchWaitlistByHousehold: jest.fn(),
  fetchWaitlistPositions: jest.fn(),
}));
jest.mock('../hooks/grace', () => ({ ...jest.requireActual('../hooks/grace'), __esModule: true, fetchTokenPeriod: jest.fn() }));
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});
jest.mock('../components/PayButton', () => ({ __esModule: true, default: () => null }));

import React, { act } from 'react';
import { renderScreen } from './testRender';
import BookSession from './BookSession';
import * as live from '../hooks/live';
import * as waitlist from '../hooks/waitlist';
import * as grace from '../hooks/grace';
import * as calendar from '../data/calendar';
import { bump } from '../hooks/invalidate';

const { assertReservedEligible, wrap } = jest.requireActual('../hooks/live');

// Thu Nov 12 2026, 4:30 PM in Chicago - past the Oct 10 gate, five days before the Tuesday below.
const NOW = new Date('2026-11-12T22:30:00Z');
const TODAY = '2026-11-12';
const TAG = 'Handicap 5 or better';
const LINE = 'Reserved for handicaps of 5 or better.';

const T6 = { id: 't-6', name: '6 tokens', kind: 'tokens', tokens: 6, windowDays: 30 };
const session = (id, time, over = {}) => ({ id, date: '2026-11-17', time, type: 'training', status: 'scheduled', capacity: 14, booked: 3, ...over });
// Tuesday Nov 17 as production holds it today: no session carries maxHandicap.
const UNSTAMPED = [
  session('2026-11-17-0', '3:00 PM'),
  session('2026-11-17-1', '3:00 PM', { type: 'phil', capacity: 6, label: 'Fitness with Phil' }),
  session('2026-11-17-2', '4:00 PM'),
];
// The same Tuesday after the calendar sync: the 3 PM training block alone carries the limit.
const STAMPED = UNSTAMPED.map((s) => (s.id === '2026-11-17-0' ? { ...s, maxHandicap: 5 } : s));
// One at or under the limit, one over it, one with no handicap on file.
const FAMILY = [
  { id: 'jordan', name: 'Jordan Whitfield', householdId: 'h1', packageId: 't-6', handicap: 4 },
  { id: 'reese', name: 'Reese Whitfield', householdId: 'h1', packageId: 't-6', handicap: 27 },
  { id: 'nico', name: 'Nico Whitfield', householdId: 'h1', packageId: 't-6' },
];

const flush = async () => { for (let i = 0; i < 12; i += 1) await act(async () => {}); };
const cardAt = (r, time) =>
  [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith(time) && el.textContent.includes('Training block')) || null;
const tap = async (el) => { await act(async () => { el.click(); }); await flush(); };

async function showParent(sessions) {
  live.fetchCurrentUser.mockResolvedValue({ uid: 'p1', role: 'parent', householdId: 'h1', email: 'dana@email.com' });
  live.fetchHouseholdAthletes.mockResolvedValue(FAMILY);
  live.fetchSessionsInRange.mockResolvedValue(sessions);
  const r = await renderScreen(<BookSession bare role="parent" demoSelectedDate="2026-11-17" />);
  await flush();
  return r;
}
async function showAthlete(athlete, sessions) {
  live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', role: 'athlete', athleteId: athlete.id, householdId: 'h1', email: 'kid@email.com' });
  live.fetchAthlete.mockResolvedValue(athlete);
  live.fetchSessionsInRange.mockResolvedValue(sessions);
  const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
  await flush();
  return r;
}
const pick = async (r, name) => { await r.click(name); await flush(); };

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
  jest.useFakeTimers('modern');
  jest.setSystemTime(NOW);
  calendar.todayISO.mockReturnValue(TODAY);
  live.isLive.mockReturnValue(true);
  live.createBooking.mockImplementation(async (booking) => ({ id: `${booking.athleteId}_${booking.sessionId}`, ...booking, status: 'confirmed', chargedFrom: 'period' }));
  live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1 });
  live.fetchPackage.mockResolvedValue(T6);
  live.fetchBookings.mockResolvedValue([]);
  live.fetchGraceTokensByAthlete.mockResolvedValue([]);
  live.fetchSessions.mockResolvedValue([]);
  live.fetchSessionsByIds.mockResolvedValue([]);
  waitlist.fetchWaitlistByAthlete.mockResolvedValue([]);
  waitlist.fetchWaitlistByHousehold.mockResolvedValue([]);
  waitlist.fetchWaitlistPositions.mockResolvedValue({});
  grace.fetchTokenPeriod.mockResolvedValue(null);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('the new frontend with no session stamped: everything as today', () => {
  test('a parent: the Tuesday 3 PM block is every child\'s to book, whatever handicap is on file, and nothing mentions one', async () => {
    const r = await showParent(UNSTAMPED);
    const drawn = [];
    for (const child of FAMILY) {
      await pick(r, child.name);
      const card = cardAt(r, '3:00');
      // The card as it read before the field existed: time, type chip, name, spend note, spots left.
      expect(card.textContent).toBe('3:00PMTrainingTraining blockSpends 1 token · 6 left11 left');
      expect(card.style.cursor).toBe('pointer');
      expect(cardAt(r, '4:00').style.cursor).toBe('pointer');
      expect(r.text()).not.toMatch(/handicap/i);
      expect(r.text()).not.toContain('Reserved');
      drawn.push(card.outerHTML);
    }
    // One card, drawn the same for the child at 4, the child at 27 and the child with none on file.
    expect(new Set(drawn).size).toBe(1);
    // Phil's 3 PM session is not a group block: this list never showed it and still does not.
    expect(r.text()).not.toContain('Fitness with Phil');

    // The child over the limit books it, through the same write with the same arguments as before.
    await pick(r, 'Reese Whitfield');
    await tap(cardAt(r, '3:00'));
    expect(live.createBooking).toHaveBeenCalledTimes(1);
    expect(live.createBooking.mock.calls[0]).toEqual([
      { athleteId: 'reese', sessionId: '2026-11-17-0', date: '2026-11-17', type: 'training', householdId: 'h1', attendee: undefined },
    ]);
    expect(r.text()).toContain('Slot reserved');
    await r.unmount();
  });

  test('an explicit null on the session is the same thing as no field', async () => {
    const r = await showParent(UNSTAMPED.map((s) => ({ ...s, maxHandicap: null })));
    await pick(r, 'Nico Whitfield');
    expect(cardAt(r, '3:00').textContent).toBe('3:00PMTrainingTraining blockSpends 1 token · 6 left11 left');
    expect(cardAt(r, '3:00').style.cursor).toBe('pointer');
    expect(r.text()).not.toMatch(/handicap/i);
    await r.unmount();
  });

  test("an athlete's own login with no handicap on file books it as today", async () => {
    const r = await showAthlete(FAMILY[2], UNSTAMPED);
    expect(cardAt(r, '3:00').style.cursor).toBe('pointer');
    expect(r.text()).not.toMatch(/handicap/i);
    await tap(cardAt(r, '3:00'));
    expect(live.createBooking.mock.calls[0][0]).toMatchObject({ athleteId: 'nico', sessionId: '2026-11-17-0' });
    expect(r.text()).toContain('Slot reserved');
    await r.unmount();
  });
});

describe('the sessions stamped: the reserved block is tagged for everyone and judged per athlete', () => {
  test('a parent with three children: one books it, one is over the limit, one has no handicap on file', async () => {
    const before = await showParent(UNSTAMPED);
    const openBefore = cardAt(before, '4:00').outerHTML;
    await before.unmount();

    const r = await showParent(STAMPED);
    // Jordan (4) is first: the tag, and the block is hers to book.
    expect(cardAt(r, '3:00').textContent).toBe(`3:00PMTraining${TAG}Training blockSpends 1 token · 6 left11 left`);
    expect(cardAt(r, '3:00').style.cursor).toBe('pointer');

    await pick(r, 'Reese Whitfield');
    expect(cardAt(r, '3:00').textContent).toBe(`3:00PMTraining${TAG}Training blockReserved${LINE}`);
    expect(cardAt(r, '3:00').style.cursor).toBe('default');
    await tap(cardAt(r, '3:00'));

    await pick(r, 'Nico Whitfield');
    expect(cardAt(r, '3:00').textContent).toBe(`3:00PMTraining${TAG}Training blockReserved${LINE} No handicap is on file for Nico. Ask the academy to add it.`);
    await tap(cardAt(r, '3:00'));
    expect(live.createBooking).not.toHaveBeenCalled();

    // The open 4 PM block beside it is untouched for every child: its own age-group chip, no tag, no line.
    const open = [];
    for (const child of FAMILY) {
      await pick(r, child.name);
      expect(cardAt(r, '4:00').textContent).toBe('4:00PMTraining13+Training blockSpends 1 token · 6 left11 left');
      expect(cardAt(r, '4:00').style.cursor).toBe('pointer');
      open.push(cardAt(r, '4:00').outerHTML);
    }
    expect(new Set(open).size).toBe(1);
    // And it is the card it was before any session was stamped.
    expect(open[0]).toBe(openBefore);

    await pick(r, 'Jordan Whitfield');
    await tap(cardAt(r, '3:00'));
    expect(live.createBooking.mock.calls).toEqual([
      [{ athleteId: 'jordan', sessionId: '2026-11-17-0', date: '2026-11-17', type: 'training', householdId: 'h1', attendee: undefined }],
    ]);
    expect(r.text()).toContain('Slot reserved');
    await r.unmount();
  });

  test("an athlete's own login: 0 (a plus handicap) books it; none on file reads the line with their first name", async () => {
    const plus = await showAthlete({ ...FAMILY[0], handicap: 0 }, STAMPED);
    expect(cardAt(plus, '3:00').textContent).toContain(TAG);
    expect(cardAt(plus, '3:00').style.cursor).toBe('pointer');
    await plus.unmount();

    const none = await showAthlete(FAMILY[2], STAMPED);
    expect(cardAt(none, '3:00').textContent).toContain(`${LINE} No handicap is on file for Nico. Ask the academy to add it.`);
    expect(cardAt(none, '3:00').style.cursor).toBe('default');
    await tap(cardAt(none, '3:00'));
    expect(live.createBooking).not.toHaveBeenCalled();
    await none.unmount();
  });
});

describe('a screen loaded before the stamp, tapped after it', () => {
  test("the write's own refusal reaches the screen as the card's line: nothing reads as booked, and no \"try again\"", async () => {
    const r = await showParent(UNSTAMPED);
    await pick(r, 'Reese Whitfield');
    // What createBooking throws inside its transaction once the session doc carries the limit (hooks/live.js).
    live.createBooking.mockImplementation(async () => assertReservedEligible({ maxHandicap: 5 }, FAMILY[1]));
    await tap(cardAt(r, '3:00'));
    expect(r.text()).toContain(`${LINE} Nothing was reserved.`);
    expect(r.text()).not.toContain('try again');
    expect(r.text()).not.toContain('Slot reserved');
    await r.unmount();
  });

  test('the refusal reloads the list: the card comes back tagged and inert, so the tap cannot be repeated', async () => {
    const r = await showParent(UNSTAMPED);
    await pick(r, 'Reese Whitfield');
    expect(cardAt(r, '3:00').style.cursor).toBe('pointer');
    // The sync has stamped the block since this screen loaded: the next read of the month carries the limit.
    live.fetchSessionsInRange.mockResolvedValue(STAMPED);
    // The real createBooking bumps on this refusal (hooks/live.js; pinned in live.reserved.test.js).
    live.createBooking.mockImplementation(async () => {
      try {
        assertReservedEligible({ maxHandicap: 5 }, FAMILY[1]);
      } catch (err) {
        bump('sessions');
        bump('athletes');
        throw err;
      }
    });
    await tap(cardAt(r, '3:00'));
    expect(r.text()).toContain(`${LINE} Nothing was reserved.`);
    expect(cardAt(r, '3:00').textContent).toBe(`3:00PMTraining${TAG}Training blockReserved${LINE}`);
    expect(cardAt(r, '3:00').style.cursor).toBe('default');
    await tap(cardAt(r, '3:00'));
    expect(live.createBooking).toHaveBeenCalledTimes(1);
    // Reese is still the child chosen, and the open block beside it is still hers to book.
    expect(cardAt(r, '4:00').style.cursor).toBe('pointer');
    expect(r.text()).not.toContain('Slot reserved');
    await r.unmount();
  });

  test('a refusal from the rules alone (no typed reason) takes the generic path: nothing reads as booked', async () => {
    const r = await showParent(UNSTAMPED);
    await pick(r, 'Reese Whitfield');
    live.createBooking.mockImplementation(async () => {
      throw wrap(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }), 'createBooking');
    });
    await tap(cardAt(r, '3:00'));
    expect(r.text()).toContain("Booking didn't go through");
    expect(r.text()).toContain('Nothing was reserved - tap the session to try again.');
    expect(r.text()).not.toContain('Slot reserved');
    await r.unmount();
  });
});
