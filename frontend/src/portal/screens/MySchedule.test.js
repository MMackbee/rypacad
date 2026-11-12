import React from 'react';
import { renderScreen } from './testRender';
import MySchedule from './MySchedule';

const row = (over) => ({ id: 's1', sessionId: 's1', date: '2026-11-10', dayLabel: 'Tue, Nov 10', isToday: false, time: '4:00', meridiem: 'PM', type: 'mental', name: 'Mental game session · Yannick', meta: '30 min', status: 'confirmed', bookingId: 'b1', cancellable: true, source: 'portal', ...over });
let mockRows;
let mockTokens = null;
let mockLeave = async () => {};
const mockCancels = [];
// What cancel() does after recording the call: resolve by default, or a test's own refusal.
let mockCancel = async () => {};
jest.mock('../hooks', () => ({ useSchedule: () => ({ data: { sessions: mockRows, past: [], cancelled: null, tokens: mockTokens }, loading: false, error: null, cancel: async (...args) => { mockCancels.push(args); return mockCancel(...args); } }) }));
jest.mock('../hooks/waitlist', () => ({ leaveWaitlist: (...args) => mockLeave(...args) }));

beforeEach(() => {
  mockTokens = null;
  mockLeave = async () => {};
  mockCancel = async () => {};
});

// Audit 2026-09-30: what the waitlisted row says, and a refused leave.
describe('a waitlisted row', () => {
  const waiting = (over) => row({ id: 's9', sessionId: 's9', bookingId: null, type: 'training', name: 'Training block', status: 'waitlisted', waitlistPosition: 2, athleteId: 'a1', cancellable: false, ...over });

  test('On the waitlist with the place, what happens when a spot opens, and Leave', async () => {
    const left = [];
    mockLeave = async (args) => { left.push(args); };
    mockRows = [waiting()];
    const r = await renderScreen(<MySchedule bare />);
    expect(r.text()).toContain('On the waitlist - #2 in line');
    expect(r.text()).toContain('If a spot opens, you are booked automatically and one token is used. You can cancel until the day before.');
    expect(r.text()).not.toMatch(/notif/i);
    await r.click('Leave waitlist');
    expect(left).toEqual([{ sessionId: 's9', athleteId: 'a1' }]);
    await r.unmount();
  });

  test('no place from the server: no number', async () => {
    mockRows = [waiting({ waitlistPosition: null })];
    const r = await renderScreen(<MySchedule bare />);
    expect(r.text()).toContain('On the waitlist');
    expect(r.text()).not.toContain('in line');
    await r.unmount();
  });

  test('a leave refused because they were just promoted says so; any other refusal is a plain line', async () => {
    mockRows = [waiting()];
    mockLeave = async () => { throw Object.assign(new Error('x'), { reason: 'promoted' }); };
    const r = await renderScreen(<MySchedule bare />);
    await r.click('Leave waitlist');
    expect(r.text()).toContain('You were just booked into this session.');
    mockLeave = async () => { throw new Error('leaveWaitlist: Missing or insufficient permissions.'); };
    await r.click('Leave waitlist');
    expect(r.text()).not.toContain('You were just booked into this session.');
    expect(r.text()).toContain('That waitlist place could not be removed. Try again.');
    expect(r.text()).not.toMatch(/permission/i);
    await r.unmount();
  });

  // The academy's clock (America/Chicago), not the phone's `isToday`
  // (review 2026-10-01): the row's own date against waitlistClosed.
  describe('from the day of the session', () => {
    beforeEach(() => { jest.useFakeTimers('modern'); });
    afterEach(() => { jest.useRealTimers(); });

    test('on the day the row no longer promises a booking', async () => {
      jest.setSystemTime(new Date('2026-11-10T18:00:00Z')); // noon in Chicago, Nov 10
      mockRows = [waiting({ isToday: true })];
      const r = await renderScreen(<MySchedule bare />);
      expect(r.text()).not.toContain('If a spot opens');
      expect(r.text()).toContain('Nobody is booked from a waitlist on the day of the session.');
      await r.unmount();
    });

    test("yesterday's place the 06:00 sweep has not closed yet does not promise one either", async () => {
      jest.setSystemTime(new Date('2026-11-11T09:00:00Z')); // 3 AM in Chicago, Nov 11
      mockRows = [waiting({ isToday: false })];
      const r = await renderScreen(<MySchedule bare />);
      expect(r.text()).not.toContain('If a spot opens');
      expect(r.text()).toContain('Nobody is booked from a waitlist on the day of the session.');
      await r.unmount();
    });

    test('the day before, it still does', async () => {
      jest.setSystemTime(new Date('2026-11-09T18:00:00Z'));
      mockRows = [waiting()];
      const r = await renderScreen(<MySchedule bare />);
      expect(r.text()).toContain('If a spot opens, you are booked automatically');
      await r.unmount();
    });
  });

  test('Elite reads no token wording: the card label, the waitlisted row, an academy cancellation', async () => {
    mockTokens = { unlimited: true, left: null, grace: [{ id: 'g1', expiresAt: '2026-12-01', reason: 'session-cancelled' }] };
    mockRows = [waiting(), row({ id: 's3', sessionId: 's3', bookingId: 'b3', type: 'training', name: 'Training block', status: 'cancelled', cancelReason: 'session-cancelled', cancellable: false })];
    const r = await renderScreen(<MySchedule bare />);
    expect(r.text()).toContain('Your package');
    expect(r.text()).toContain('Elite · unlimited');
    expect(r.text()).toContain('If a spot opens, you are booked automatically. You can cancel until the day before.');
    expect(r.text()).toContain('Cancelled by the academy.');
    expect(r.text()).not.toMatch(/token/i);
    await r.unmount();
  });

  test('a token athlete keeps the token wording', async () => {
    mockTokens = { unlimited: false, granted: 6, used: 5, reserved: 1, left: 0, grace: [] };
    mockRows = [waiting(), row({ id: 's3', sessionId: 's3', bookingId: 'b3', type: 'training', name: 'Training block', status: 'cancelled', cancelReason: 'session-cancelled', cancellable: false })];
    const r = await renderScreen(<MySchedule bare />);
    expect(r.text()).toContain('Tokens this period');
    expect(r.text()).toContain('5 of 6 used, 1 held on a waitlist');
    expect(r.text()).toContain('Cancelled by the academy - a bonus token was added.');
    await r.unmount();
  });

  // A session token is good all season: its card never says "this period".
  test('a single-token athlete: the card is labelled without a period', async () => {
    mockTokens = { unlimited: false, perPurchase: true, granted: 0, used: 0, reserved: 0, left: 0, held: 0, grace: [{ id: 'single_cs_1', expiresAt: '2027-02-27', reason: 'single-purchase', sourceSessionId: null }] };
    mockRows = [row()];
    const r = await renderScreen(<MySchedule bare />);
    expect(r.text()).toContain('Your session tokens');
    expect(r.text()).toContain('1 session token - good through Sat, Feb 27');
    expect(r.text()).not.toContain('Tokens this period');
    expect(r.text()).not.toContain('Your package');
    await r.unmount();
  });
});

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

// 2026-11-04 (the Schmidt email): a refused cancel reached a parent as
// "cancelBooking: Missing or insufficient permissions.".
describe('a cancel that does not go through', () => {
  // live.js wrap()'s shape: the adapter code, the function name before the SDK text.
  const refusal = (code, message) => Object.assign(new Error(message), { name: 'LiveDataError', code });
  const RAW = /cancelBooking|permission|insufficient|firebase/i;
  // The sheet's own "Cancel reservation" sits after the row's button of the same name.
  const confirm = (r) => r.act(() => {
    const named = [...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Cancel reservation');
    named[named.length - 1].click();
  });

  test('a rules denial reads as plain words, and the booking stays with its Cancel button', async () => {
    mockRows = [row({ type: 'training', name: 'Training block' })];
    mockCancel = async () => { throw refusal('permission-denied', 'cancelBooking: Missing or insufficient permissions.'); };
    const r = await renderScreen(<MySchedule bare />);
    await r.click('Cancel reservation'); // the row's button opens the sheet
    await confirm(r);
    expect(r.text()).toContain(
      "This reservation couldn't be cancelled from the app. Refresh the page and try again. If it still won't cancel, contact the academy and we'll sort it out."
    );
    expect(r.text()).not.toMatch(RAW);
    expect(r.button('Keep it')).not.toBeNull();
    await r.unmount();
  });

  test('a lost connection says to check it; a refusal live.js words itself is kept', async () => {
    mockRows = [row({ type: 'training', name: 'Training block' })];
    mockCancel = async () => { throw refusal('unavailable', 'cancelBooking: Failed to get document because the client is offline.'); };
    const r = await renderScreen(<MySchedule bare />);
    await r.click('Cancel reservation');
    await confirm(r);
    expect(r.text()).toContain("We couldn't reach the academy's system. Check your connection and try again.");
    expect(r.text()).not.toMatch(RAW);
    mockCancel = async () => { throw refusal('not-found', 'This booking no longer exists.'); };
    await confirm(r);
    expect(r.text()).toContain('This booking no longer exists.');
    expect(r.text()).not.toContain("We couldn't reach");
    await r.unmount();
  });

  test('a series week refused with raw text gets a plain reason in the summary', async () => {
    const weekly = (bookingId, date, dayLabel) => row({ id: `s-${bookingId}`, sessionId: `s-${bookingId}`, bookingId, date, dayLabel, type: 'training', name: 'Training block' });
    mockRows = [weekly('b1', '2026-11-10', 'Tue, Nov 10'), weekly('b2', '2026-11-17', 'Tue, Nov 17'), weekly('b3', '2026-11-24', 'Tue, Nov 24')];
    mockCancel = async (id) => {
      if (id === 'b2') throw refusal('unknown', 'cancelBooking: Transaction failed all retries.');
    };
    const r = await renderScreen(<MySchedule bare />);
    await r.click('Cancel reservation');
    await r.click('Cancel this and 2 later weeks');
    expect(r.text()).toContain('2 of 3 reservations cancelled');
    expect(r.text()).toContain("Nov 17 was not cancelled. Refresh the page and try again, or contact the academy and we'll sort it out.");
    expect(r.text()).not.toMatch(RAW);
    await r.unmount();
  });
});
