import React, { act } from 'react';
import { renderScreen } from './testRender';
import Reservations from './Reservations';

const row = (over) => ({
  id: 's1', sessionId: 's1', bookingId: 'b1', date: '2026-11-10', dayLabel: 'Tue, Nov 10', isToday: false,
  time: '4:00', meridiem: 'PM', type: 'mental', name: 'Mental game session · Yannick', durationMinutes: 30,
  instructor: null, status: 'confirmed', cancellable: true, nextPeriod: false, source: 'portal', ...over,
});
let mockRows;
let mockSiblingRows = [];
// Whether the sibling (Nico) is Elite, and the Leave waitlist write.
let mockSiblingUnlimited = false;
let mockLeave = async () => {};
const mockCancels = [];
jest.mock('../hooks', () => ({
  useHouseholdReservations: () => ({
    data: {
      members: [
        { athleteId: 'a1', name: 'Jordan', unlimited: false, upcoming: mockRows, past: [] },
        ...(mockSiblingRows.length ? [{ athleteId: 'a2', name: 'Nico', unlimited: mockSiblingUnlimited, upcoming: mockSiblingRows, past: [] }] : []),
      ],
    },
    loading: false,
    error: null,
    cancel: async (...args) => { mockCancels.push(args); },
  }),
}));
jest.mock('../hooks/waitlist', () => ({ leaveWaitlist: (...args) => mockLeave(...args) }));

// Audit 2026-09-30: what a waitlisted row says, per child, and a refused leave.
describe('waitlisted rows', () => {
  const waiting = (athleteId, over) =>
    row({ id: `w-${athleteId}`, sessionId: `w-${athleteId}`, bookingId: null, athleteId, type: 'training', name: 'Training block', status: 'waitlisted', waitlistPosition: 2, cancellable: false, ...over });
  beforeEach(() => {
    mockLeave = async () => {};
    mockSiblingUnlimited = true;
    mockRows = [waiting('a1')];
    mockSiblingRows = [
      waiting('a2', { waitlistPosition: null }),
      row({ id: 'c1', sessionId: 'c1', bookingId: 'a2_c1', athleteId: 'a2', type: 'training', name: 'Training block', status: 'cancelled', cancelReason: 'session-cancelled', cancellable: false }),
    ];
  });
  afterEach(() => {
    mockSiblingRows = [];
    mockSiblingUnlimited = false;
  });

  test('each child by name; the token child is told a token is used, the Elite child reads no token wording', async () => {
    const r = await renderScreen(<Reservations bare />);
    expect(r.text()).toContain('On the waitlist - #2 in line');
    expect(r.text()).toContain('If a spot opens, Jordan is booked automatically and one token is used. You can cancel until the day before.');
    expect(r.text()).toContain('If a spot opens, Nico is booked automatically. You can cancel until the day before.');
    expect(r.text()).toContain('Cancelled by the academy.');
    expect(r.text()).not.toContain('a bonus token was added');
    expect(r.text()).not.toMatch(/notif/i);
    await r.unmount();
  });

  test('a leave refused because the child was just promoted names the child', async () => {
    const asked = [];
    mockLeave = async (args) => { asked.push(args); throw Object.assign(new Error('x'), { reason: 'promoted' }); };
    const r = await renderScreen(<Reservations bare />);
    const leaveButtons = [...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Leave waitlist');
    expect(leaveButtons).toHaveLength(2);
    await act(async () => { leaveButtons[1].click(); });
    expect(asked).toEqual([{ sessionId: 'w-a2', athleteId: 'a2' }]);
    expect(r.text()).toContain('Nico was just booked into this session.');
    await r.unmount();
  });

  // The academy's clock, not the phone's `isToday` (review 2026-10-01).
  test("a place still held after the session's day (not swept yet) no longer promises a booking", async () => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-11-11T09:00:00Z')); // 3 AM in Chicago, Nov 11; the rows are Nov 10
    try {
      const r = await renderScreen(<Reservations bare />);
      expect(r.text()).not.toContain('If a spot opens');
      expect(r.text()).toContain('Nobody is booked from a waitlist on the day of the session. This place will close and its token will be free again.');
      expect(r.text()).toContain('Nobody is booked from a waitlist on the day of the session. This place will close.');
      await r.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});

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
