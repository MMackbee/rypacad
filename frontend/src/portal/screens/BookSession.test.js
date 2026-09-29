import React, { act } from 'react';
import { renderScreen } from './testRender';
import BookSession from './BookSession';

const BEFORE = new Date('2026-10-09T12:00:00Z'); // Fri Oct 9, 07:00 Chicago - the day before
const AT_OPEN = new Date('2026-10-10T12:00:00Z'); // BOOKING_OPENS_AT exactly
const session = { id: 's1', date: '2026-10-12', time: '4:00 PM', type: 'training', label: 'Training block', capacity: 6, booked: 2 };
let mockPackage;
let mockBooked;
jest.mock('../hooks', () => ({
  useBooking: () => ({
    data: { slots: [{ date: '2026-10-12' }], tokens: { left: 6, unlimited: false, grace: [] }, confirmation: { email: null, note: 'See you there.' }, seasonNote: null },
    loading: false, error: null,
    book: async (s) => { mockBooked.push(s.id); return {}; },
    bookRecurring: async () => ({}),
    bookingFor: null,
  }),
  useHouseholdAthletes: () => ({ data: [], loading: false }),
  useMembership: () => ({ data: { members: [{ athleteId: 'a1', package: mockPackage }] } }),
  useMonthSessions: () => ({ data: { days: [{ date: '2026-10-12', sessions: [session] }] }, loading: false, error: null }),
}));

/** The tapped day's session card: tappable cards carry cursor: pointer (SessionCard sets it from onClick). */
const sessionCard = (r) =>
  [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('4:00') && el.textContent.includes('Training block')) || null;

beforeEach(() => {
  mockBooked = [];
  mockPackage = { id: 't-12', kind: 'tokens', windowDays: 30 };
  jest.useFakeTimers('modern');
});
afterEach(() => { jest.useRealTimers(); });

test('before Oct 10 a token athlete sees the banner and cannot reserve', async () => {
  jest.setSystemTime(BEFORE);
  const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
  expect(r.text()).toContain('Booking opens Sat, Oct 10 at 7 AM');
  const card = sessionCard(r);
  expect(card).not.toBeNull();
  expect(card.style.cursor).toBe('default');
  await act(async () => { card.click(); });
  expect(mockBooked).toEqual([]);
  expect(r.text()).not.toContain('Slot reserved');
  await r.unmount();
});

test('at 07:00 Chicago on Oct 10 the banner is gone and a tap reserves', async () => {
  jest.setSystemTime(AT_OPEN);
  const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
  expect(r.text()).not.toContain('Booking opens Sat, Oct 10 at 7 AM');
  const card = sessionCard(r);
  expect(card.style.cursor).toBe('pointer');
  await act(async () => { card.click(); });
  expect(mockBooked).toEqual(['s1']);
  expect(r.text()).toContain('Slot reserved');
  await r.unmount();
});

test('Elite books before the gate (the paid package, spec 4.3)', async () => {
  jest.setSystemTime(BEFORE);
  mockPackage = { id: 'elite', kind: 'elite', windowDays: 45 };
  const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
  expect(r.text()).not.toContain('Booking opens Sat, Oct 10 at 7 AM');
  expect(sessionCard(r).style.cursor).toBe('pointer');
  await r.unmount();
});
