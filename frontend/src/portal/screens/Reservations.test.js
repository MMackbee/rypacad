import React from 'react';
import { renderScreen } from './testRender';
import Reservations from './Reservations';

const row = (over) => ({
  id: 's1', sessionId: 's1', bookingId: 'b1', date: '2026-11-10', dayLabel: 'Tue, Nov 10', isToday: false,
  time: '4:00', meridiem: 'PM', type: 'mental', name: 'Mental game session · Yannick', durationMinutes: 30,
  instructor: null, status: 'confirmed', cancellable: true, nextPeriod: false, source: 'portal', ...over,
});
let mockRows;
jest.mock('../hooks', () => ({
  useHouseholdReservations: () => ({
    data: { members: [{ athleteId: 'a1', name: 'Jordan', upcoming: mockRows, past: [] }] },
    loading: false,
    error: null,
    cancel: async () => {},
  }),
}));
jest.mock('../hooks/waitlist', () => ({ leaveWaitlist: async () => {} }));

test('a Calendly row says to cancel from the email; a portal row keeps Cancel', async () => {
  mockRows = [
    row({ source: 'calendly', cancellable: false }),
    row({ id: 's2', sessionId: 's2', bookingId: 'b2', date: '2026-11-12', dayLabel: 'Thu, Nov 12' }),
  ];
  const r = await renderScreen(<Reservations bare />);
  expect(r.text()).toContain("Cancel or reschedule from Calendly's email");
  expect([...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Cancel reservation')).toHaveLength(1);
  expect(r.text()).toContain('30 min');
  await r.unmount();
});

test('a row without source (routing Task 11 not merged) behaves as a portal row', async () => {
  mockRows = [row({ source: undefined })];
  const r = await renderScreen(<Reservations bare />);
  expect(r.text()).not.toContain("Cancel or reschedule from Calendly's email");
  expect(r.button('Cancel reservation')).not.toBeNull();
  await r.unmount();
});
