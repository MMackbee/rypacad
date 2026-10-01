import React, { act } from 'react';
import { renderScreen } from './testRender';
import SpecialistBooking from './SpecialistBooking';

// Repeat weekly after a Phil booking (owner 2026-09-30, "yes to phil repeat").
// Its own file: SpecialistBooking.test.js stays under the 500-line guideline.
let mockSlots;
let mockBooked = [];
let mockMembers = [];
// Live mode's repeat offer renders only when bookingFor is set.
let mockBookingFor = null;
let mockBookRecurring;
let mockBookResult = {};
let mockHouseholdAthletes = [];
// Live mode: a booking's own bump reloads useMembership, so it reads
// { data: null, loading: true } from the confirmation's first render on.
let mockMembershipReloads = false;
jest.mock('../hooks', () => ({
  seedSpecialistDays: () => [],
  useSpecialistSlots: () => mockSlots,
  useBooking: () => ({
    book: async (s) => { mockBooked.push(s); return mockBookResult; },
    bookRecurring: (...args) => mockBookRecurring(...args),
    bookingFor: mockBookingFor,
  }),
  useHouseholdAthletes: () => ({ data: mockHouseholdAthletes, loading: false }),
  useMembership: () =>
    mockMembershipReloads && mockBooked.length
      ? { data: null, loading: true }
      : { data: { household: { id: 'h1' }, members: mockMembers } },
}));
jest.mock('../data/calendly', () => ({
  calendlyUrlFor: () => null,
  calendlyLinkFor: () => null,
  CALENDLY_NOTE: '',
})); // not `virtual` (the file exists): see Registration.test.js

const ELITE = { id: 'elite', kind: 'elite', windowDays: 45 };
// Thursday Nov 5 at 4:00 PM: inside every package's window on Oct 1.
const thursday = (capacity) => ({
  date: '2026-11-05', dayLabel: 'Thu, Nov 5',
  slots: [{ sessionId: 's-1105', time: '4:00 PM', open: true, capacity, booked: 0, durationMinutes: capacity > 1 ? 45 : 30 }],
});
/** Tap the 4:00 PM slot through Reserve to the confirmation. */
async function reserve(specialistId, props = {}) {
  const r = await renderScreen(<SpecialistBooking bare initialSpecialist={specialistId} {...props} />);
  const noun = specialistId === 'phil' ? 'Performance' : 'Mental';
  const card = [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('4:00') && el.textContent.includes(noun));
  await act(async () => { card.click(); });
  await r.click('Reserve');
  await r.flush();
  return r;
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-10-01T17:00:00Z'));
  mockBooked = [];
  mockBookingFor = 'athlete';
  mockBookRecurring = jest.fn(async () => ({ booked: [], skipped: [], windowEnd: null, next: null }));
  mockBookResult = {};
  mockHouseholdAthletes = [];
  mockMembershipReloads = false;
  mockMembers = [{ athleteId: 'a1', package: ELITE }];
  mockSlots = { loading: false, error: null, data: {
    days: [thursday(6)], tokens: { left: null, unlimited: true, grace: [] }, capReached: false,
    bookingMode: 'in-app', calendlyUrl: null, billingStatus: 'active', bookingOpen: true,
    athlete: { id: 'a1', name: 'Jordan', loginEmail: null }, guardian: { name: 'Dana', email: 'dana@email.com' }, householdId: 'h1',
  } };
});
afterEach(() => { jest.useRealTimers(); });

test('a Phil confirmation offers the repeat through the window; the tap sends the booked slot; skipped weeks read for Phil', async () => {
  mockBookRecurring = jest.fn(async () => ({
    booked: [{ date: '2026-11-12', id: 'p-1112' }, { date: '2026-12-10', id: 'p-1210' }],
    skipped: [
      { date: '2026-11-19', reason: 'one per day' },
      { date: '2026-11-26', reason: 'no session' },
      { date: '2026-12-03', reason: 'full' },
    ],
    windowEnd: '2026-12-16',
    next: { date: '2026-12-17', opensOn: '2026-11-02' },
  }));
  const r = await reserve('phil');
  expect(mockBooked).toEqual([{ id: 's-1105', date: '2026-11-05', type: 'phil' }]);
  expect(r.text()).toContain('Reservation confirmed');
  expect(r.text()).toContain('Repeat weekly');
  expect(r.text()).toContain(
    'Hold Thursday at 4:00 PM every week through Wed, Dec 16, the furthest you can book today (45 days ahead). Weeks after that open from Nov 2, one day at a time at 7 AM; come back then to extend.'
  );
  expect(r.text()).not.toContain('spends a token');
  await r.click('Repeat every Thursday through Wed, Dec 16');
  await r.flush();
  expect(mockBookRecurring).toHaveBeenCalledTimes(1);
  expect(mockBookRecurring).toHaveBeenCalledWith(
    { date: '2026-11-05', time: '4:00 PM', type: 'phil' },
    { athleteId: undefined, untilISO: '2026-12-16' }
  );
  expect(r.text()).toContain('2 more weeks booked');
  expect(r.text()).toContain("Nov 19: there's already a session with Phil booked that day (Elite includes one a day).");
  expect(r.text()).toContain('Nov 26: no session with Phil at that time.');
  expect(r.text()).toContain('Dec 3: full.');
  expect(r.text()).toContain('Thu, Dec 17 opens 7 AM on Mon, Nov 2');
  await r.unmount();
});

// Review 2026-09-30: the single booking's own bump reloads useMembership, so
// the confirmation renders with no membership in hand. The card keeps the
// window the family tapped Reserve with, not the 30-day token fallback.
test('membership reloading behind the confirmation: an Elite card keeps its 45-day window and sends it', async () => {
  mockMembershipReloads = true;
  const r = await reserve('phil');
  expect(mockBooked).toHaveLength(1);
  expect(r.text()).toContain('Reservation confirmed');
  expect(r.text()).toContain('Hold Thursday at 4:00 PM every week through Wed, Dec 16, the furthest you can book today (45 days ahead).');
  expect(r.text()).not.toContain('30 days ahead');
  expect(r.text()).not.toContain('spends a token');
  expect(r.button('Repeat every Thursday through Tue, Dec 1')).toBeNull();
  await r.click('Repeat every Thursday through Wed, Dec 16');
  await r.flush();
  expect(mockBookRecurring).toHaveBeenCalledWith(
    { date: '2026-11-05', time: '4:00 PM', type: 'phil' },
    { athleteId: undefined, untilISO: '2026-12-16' }
  );
  await r.unmount();
});

test('a parent booking for a token child: the child is named, the window is 30 days, the token line shows', async () => {
  mockBookingFor = 'parent';
  mockHouseholdAthletes = [{ id: 'a1', name: 'Jordan' }, { id: 'a2', name: 'Ava' }];
  mockMembers = [{ athleteId: 'a1', package: ELITE }, { athleteId: 'a2', package: { id: 't-12', kind: 'tokens', windowDays: 30 } }];
  mockSlots.data.tokens = { left: 5, unlimited: false, grace: [] };
  const r = await reserve('phil', { role: 'parent', initialAthleteId: 'a2' });
  expect(r.text()).toContain('Hold Thursday at 4:00 PM every week through Tue, Dec 1, the furthest you can book today (30 days ahead).');
  expect(r.text()).toContain("Each week spends a token from that week's period.");
  await r.click('Repeat every Thursday through Tue, Dec 1');
  await r.flush();
  expect(mockBookRecurring).toHaveBeenCalledWith(
    { date: '2026-11-05', time: '4:00 PM', type: 'phil' },
    { athleteId: 'a2', untilISO: '2026-12-01' }
  );
  await r.unmount();
});

test('no offer on a Yannick confirmation', async () => {
  mockSlots.data.days = [thursday(1)];
  const r = await reserve('mental');
  expect(mockBooked).toEqual([{ id: 's-1105', date: '2026-11-05', type: 'mental' }]);
  expect(r.text()).toContain('Reservation confirmed');
  expect(r.text()).not.toContain('Repeat weekly');
  expect([...r.container.querySelectorAll('button')].some((b) => b.textContent.startsWith('Repeat every'))).toBe(false);
  await r.unmount();
});

test('no offer for a waitlist place, or outside live mode (bookingFor null)', async () => {
  mockBookResult = { status: 'waitlisted', position: 2 };
  const w = await reserve('phil');
  expect(mockBooked).toHaveLength(1);
  expect(w.text()).not.toContain('Reservation confirmed');
  expect(w.text()).not.toContain('Repeat weekly');
  await w.unmount();

  mockBookResult = {};
  mockBookingFor = null;
  const s = await reserve('phil');
  expect(s.text()).toContain('Reservation confirmed');
  expect(s.text()).not.toContain('Repeat weekly');
  expect(mockBookRecurring).not.toHaveBeenCalled();
  await s.unmount();
});
