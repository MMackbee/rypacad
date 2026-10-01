import React from 'react';
import { renderScreen } from './testRender';
import Reservations from './Reservations';

const row = (over) => ({
  id: 's1', sessionId: 's1', bookingId: 'b1', date: '2026-11-10', dayLabel: 'Tue, Nov 10', isToday: false,
  time: '4:00', meridiem: 'PM', type: 'mental', name: 'Mental game session · Yannick', durationMinutes: 30,
  instructor: null, status: 'confirmed', cancellable: true, nextPeriod: false, source: 'portal', ...over,
});
let mockRows;
let mockSiblingRows = [];
const mockCancels = [];
jest.mock('../hooks', () => ({
  useHouseholdReservations: () => ({
    data: {
      members: [
        { athleteId: 'a1', name: 'Jordan', upcoming: mockRows, past: [] },
        ...(mockSiblingRows.length ? [{ athleteId: 'a2', name: 'Nico', upcoming: mockSiblingRows, past: [] }] : []),
      ],
    },
    loading: false,
    error: null,
    cancel: async (...args) => { mockCancels.push(args); },
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

// Tester Mike 2026-09-30: cancel just this one, or this and the later weeks.
describe('cancelling a booking that repeats on later weeks', () => {
  const weekly = (athleteId, bookingId, date, dayLabel) =>
    row({ id: `s-${date}`, sessionId: `s-${date}`, bookingId, athleteId, date, dayLabel, type: 'training', name: 'Training block' });
  beforeEach(() => {
    mockCancels.length = 0;
    mockRows = [
      weekly('a1', 'a1_1', '2026-11-10', 'Tue, Nov 10'),
      weekly('a1', 'a1_2', '2026-11-17', 'Tue, Nov 17'),
      weekly('a1', 'a1_3', '2026-11-24', 'Tue, Nov 24'),
    ];
    // The sibling holds the same Tuesdays, one week further: never part of Jordan's series.
    mockSiblingRows = [
      weekly('a2', 'a2_2', '2026-11-17', 'Tue, Nov 17'),
      weekly('a2', 'a2_4', '2026-12-01', 'Tue, Dec 1'),
    ];
  });
  afterEach(() => {
    mockSiblingRows = [];
  });

  test("the series is that athlete's later weeks only, cancelled one by one, with one summary", async () => {
    const r = await renderScreen(<Reservations bare />);
    await r.click('Cancel reservation'); // Jordan's first row: Tue, Nov 10
    expect(r.text()).toContain('Also booked at the same time on 2 later weeks, through Tue, Nov 24.');
    await r.click('Cancel this and 2 later weeks');
    expect(mockCancels).toEqual(['a1_1', 'a1_2', 'a1_3'].map((id) => [id, { cancelledVia: 'series', silent: true }]));
    expect(r.text()).toContain('3 reservations cancelled');
    expect(r.text()).toContain('Cancelled: Nov 10, Nov 17 and Nov 24.');
    await r.click('Done');
    expect(r.button('Done')).toBeNull();
    await r.unmount();
  });

  test('"Cancel just this one" is the single cancel', async () => {
    const r = await renderScreen(<Reservations bare />);
    await r.click('Cancel reservation');
    await r.click('Cancel just this one');
    expect(mockCancels).toEqual([['a1_1']]);
    await r.unmount();
  });

  test('the last week of a series has nothing later: the dialog is exactly as before', async () => {
    mockRows = [mockRows[2]];
    mockSiblingRows = [];
    const r = await renderScreen(<Reservations bare />);
    await r.click('Cancel reservation');
    expect(r.text()).toContain('Cancel this reservation?');
    expect(r.text()).not.toContain('later week');
    expect(r.button('Cancel just this one')).toBeNull();
    await r.unmount();
  });
});
