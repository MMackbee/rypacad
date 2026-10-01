import React from 'react';
import { renderScreen } from './testRender';
import MySchedule from './MySchedule';

const row = (over) => ({ id: 's1', sessionId: 's1', date: '2026-11-10', dayLabel: 'Tue, Nov 10', isToday: false, time: '4:00', meridiem: 'PM', type: 'mental', name: 'Mental game session · Yannick', meta: '30 min', status: 'confirmed', bookingId: 'b1', cancellable: true, source: 'portal', ...over });
let mockRows;
const mockCancels = [];
jest.mock('../hooks', () => ({ useSchedule: () => ({ data: { sessions: mockRows, past: [], cancelled: null, tokens: null }, loading: false, error: null, cancel: async (...args) => { mockCancels.push(args); } }) }));
jest.mock('../hooks/waitlist', () => ({ leaveWaitlist: async () => {} }));

test('a Calendly row says to cancel from the email; a portal row keeps Cancel', async () => {
  mockRows = [row({ source: 'calendly', cancellable: false }), row({ id: 's2', sessionId: 's2', bookingId: 'b2', date: '2026-11-12', dayLabel: 'Thu, Nov 12' })];
  const r = await renderScreen(<MySchedule bare />);
  expect(r.text()).toContain("Cancel or reschedule from Calendly's email");
  expect([...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Cancel reservation')).toHaveLength(1);
  await r.unmount();
});

// Tester Mike 2026-09-30: cancel just this one, or this and the later weeks.
describe('cancelling a booking that repeats on later weeks', () => {
  const weekly = (bookingId, date, dayLabel, over) => row({ id: `s-${bookingId}`, sessionId: `s-${bookingId}`, bookingId, date, dayLabel, type: 'training', name: 'Training block', ...over });
  beforeEach(() => {
    mockCancels.length = 0;
    mockRows = [
      weekly('b1', '2026-11-10', 'Tue, Nov 10'),
      weekly('b9', '2026-11-12', 'Thu, Nov 12'),
      weekly('b2', '2026-11-17', 'Tue, Nov 17'),
      weekly('b3', '2026-11-24', 'Tue, Nov 24'),
    ];
  });

  test('the sheet offers the series, runs it through cancel one by one and ends in one summary', async () => {
    const r = await renderScreen(<MySchedule bare />);
    await r.click('Cancel reservation'); // the first row: Tue, Nov 10
    expect(r.text()).toContain('Also booked at the same time on 2 later weeks, through Tue, Nov 24.');
    expect(r.button('Cancel just this one')).not.toBeNull();
    await r.click('Cancel this and 2 later weeks');
    expect(mockCancels).toEqual(['b1', 'b2', 'b3'].map((id) => [id, { cancelledVia: 'series', silent: true }]));
    expect(r.text()).toContain('3 reservations cancelled');
    await r.click('Done');
    expect(r.button('Done')).toBeNull();
    await r.unmount();
  });

  test('"Cancel just this one" cancels that booking alone, as a single cancel', async () => {
    const r = await renderScreen(<MySchedule bare />);
    await r.click('Cancel reservation');
    await r.click('Cancel just this one');
    expect(mockCancels).toEqual([['b1']]);
    expect(r.button('Cancel just this one')).toBeNull();
    await r.unmount();
  });

  test('a booking with no later weeks gets the dialog exactly as before', async () => {
    mockRows = [mockRows[1], mockRows[0]]; // Thu, Nov 12 has no later Thursday
    const r = await renderScreen(<MySchedule bare />);
    await r.click('Cancel reservation');
    expect(r.text()).toContain('Cancel this reservation?');
    expect(r.text()).not.toContain('later week');
    expect(r.button('Cancel just this one')).toBeNull();
    expect(r.button('Keep it')).not.toBeNull();
    await r.unmount();
  });
});
