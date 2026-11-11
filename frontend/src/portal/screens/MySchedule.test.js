import React, { act } from 'react';
import { renderScreen } from './testRender';
import MySchedule from './MySchedule';
// Mental consent (plan Task 13): no consent rows unless a case sets them.
let mockConsents;
jest.mock('../hooks/mentalConsent', () => ({ useFamilyConsents: () => mockConsents }));
beforeEach(() => { mockConsents = { data: null, loading: false, error: null }; });

const row = (over) => ({ id: 's1', sessionId: 's1', date: '2026-11-10', dayLabel: 'Tue, Nov 10', isToday: false, time: '4:00', meridiem: 'PM', type: 'mental', name: 'Mental game session · Yannick', meta: '30 min', status: 'confirmed', bookingId: 'b1', cancellable: true, source: 'portal', ...over });
let mockRows;
let mockTokens = null;
let mockLeave = async () => {};
const mockCancels = [];
// Whether the account is on hold (no Move on an ordinary booking), and the moves made.
let mockOnHold = false;
const mockMoves = [];
jest.mock('../hooks/move', () => ({
  useMoveOptions: () => ({
    data: { days: [{ iso: '2026-11-12', label: 'Thu, Nov 12', sessions: [{ id: 's2', date: '2026-11-12', time: '4:00', meridiem: 'PM', fullTime: '4:00 PM', type: 'training', name: 'Training block', capacityLabel: '9 left' }] }] },
    loading: false,
    error: null,
  }),
  moveBooking: async (args) => { mockMoves.push(args); return { bookingId: `a1_${args.toSessionId}` }; },
}));
jest.mock('../hooks', () => ({ useSchedule: () => ({ data: { sessions: mockRows, past: [], cancelled: null, tokens: mockTokens, onHold: mockOnHold }, loading: false, error: null, cancel: async (...args) => { mockCancels.push(args); } }) }));
jest.mock('../hooks/waitlist', () => ({ leaveWaitlist: (...args) => mockLeave(...args) }));

beforeEach(() => {
  mockTokens = null;
  mockLeave = async () => {};
});
// Noon Mon Nov 9 in Chicago for every test (the rows are dated Nov 10-24);
// a describe that needs another time sets its own.
beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-11-09T18:00:00Z'));
});
afterEach(() => {
  jest.useRealTimers();
});

/** A button inside the open sheet (the row and the sheet both say "Cancel reservation"). */
async function sheetButton(r, label) {
  const b = [...r.container.querySelectorAll('[data-portal-overlay] button')].find((el) => el.textContent.trim() === label);
  if (!b) throw new Error(`no sheet button "${label}"`);
  await act(async () => { b.click(); });
}

// Audit 2026-09-30: what the waitlisted row says, and a refused leave.
describe('a waitlisted row', () => {
  const waiting = (over) => row({ id: 's9', sessionId: 's9', bookingId: null, type: 'training', name: 'Training block', status: 'waitlisted', waitlistPosition: 2, athleteId: 'a1', cancellable: false, ...over });

  test('On the waitlist with the place, what happens when a spot opens, and Leave', async () => {
    const left = [];
    mockLeave = async (args) => { left.push(args); };
    mockRows = [waiting()];
    const r = await renderScreen(<MySchedule bare />);
    expect(r.text()).toContain('On the waitlist - #2 in line');
    expect(r.text()).toContain('If a spot opens, you are booked automatically and one token is used. You can cancel or move it any time before it starts.');
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
    expect(r.text()).toContain('If a spot opens, you are booked automatically. You can cancel or move it any time before it starts.');
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

// Spec 2026-11-11 §4: cancel right up to the start, with a reason.
test('a same-day row before its start offers Cancel; one that has started says so', async () => {
  mockRows = [
    row({ id: 's0', sessionId: 's0', bookingId: 'b0', date: '2026-11-09', dayLabel: 'Today', isToday: true, time: '9:00', meridiem: 'AM', type: 'training', name: 'Training block' }),
    row({ id: 's1', sessionId: 's1', bookingId: 'b1', date: '2026-11-09', dayLabel: 'Today', isToday: true, time: '4:00', type: 'training', name: 'Training block' }),
  ];
  const r = await renderScreen(<MySchedule bare />);
  expect([...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Cancel reservation')).toHaveLength(1);
  expect(r.text()).toContain('This session has already started.');
  expect(r.text()).not.toContain('Same-day');
  await r.unmount();
});

test("the cancel asks why (an athlete's own login: you) and sends the reason", async () => {
  mockCancels.length = 0;
  mockRows = [row({ type: 'training', name: 'Training block' })];
  const r = await renderScreen(<MySchedule bare />);
  await r.click('Cancel reservation');
  expect(r.text()).toContain("Why can't you make it?");
  await sheetButton(r, 'Cancel reservation');
  expect(mockCancels).toEqual([]);
  await r.click('Sick');
  await sheetButton(r, 'Cancel reservation');
  expect(mockCancels).toEqual([['b1', { reason: { category: 'sick', note: null } }]]);
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
    await r.click('Sick');
    await r.click('Cancel this and 2 later weeks');
    expect(mockCancels).toEqual(['b1', 'b2', 'b3'].map((id) => [id, { cancelledVia: 'series', silent: true, reason: { category: 'sick', note: null } }]));
    expect(r.text()).toContain('3 reservations cancelled');
    await r.click('Done');
    expect(r.button('Done')).toBeNull();
    await r.unmount();
  });

  test('"Cancel just this one" cancels that booking alone, as a single cancel', async () => {
    const r = await renderScreen(<MySchedule bare />);
    await r.click('Cancel reservation');
    await r.click('Sick');
    await r.click('Cancel just this one');
    expect(mockCancels).toEqual([['b1', { reason: { category: 'sick', note: null } }]]);
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

// Spec 2026-11-11 §5: Move next to Cancel, until the start.
describe('Move', () => {
  const training = (over) => row({ type: 'training', name: 'Training block', ...over });
  const moveButtons = (r) => [...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Move');
  beforeEach(() => {
    mockOnHold = false;
    mockMoves.length = 0;
  });

  test('a confirmed training row to come offers Move; Calendly, a 1:1, a started one and an account on hold do not', async () => {
    mockRows = [training()];
    const open = await renderScreen(<MySchedule bare />);
    expect(moveButtons(open)).toHaveLength(1);
    await open.unmount();
    for (const over of [{ source: 'calendly', cancellable: false }, { type: 'mental' }, { date: '2026-11-09', dayLabel: 'Today', isToday: true, time: '9:00', meridiem: 'AM' }]) {
      mockRows = [training(over)];
      const r = await renderScreen(<MySchedule bare />);
      expect(moveButtons(r)).toHaveLength(0);
      await r.unmount();
    }
    mockOnHold = true;
    mockRows = [training(), training({ id: 's3', sessionId: 's3', bookingId: 'b3', date: '2026-11-12', dayLabel: 'Thu, Nov 12', comp: true })];
    const held = await renderScreen(<MySchedule bare />);
    expect([...held.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Cancel reservation')).toHaveLength(2);
    expect(moveButtons(held)).toHaveLength(1);
    await held.unmount();
  });

  test('Move opens the sheet; choosing and moving sends the booking and the session, then closes it', async () => {
    mockRows = [training()];
    const r = await renderScreen(<MySchedule bare />);
    await r.click('Move');
    expect(r.text()).toContain('Move to another Training block');
    await r.click('Thu, Nov 12 4:00 PM');
    expect(r.text()).toContain('Move from Tue Nov 10, 4:00 PM to Thu Nov 12, 4:00 PM?');
    await sheetButton(r, 'Move');
    expect(mockMoves).toEqual([{ bookingId: 'b1', toSessionId: 's2' }]);
    expect(r.text()).not.toContain('Move to another Training block');
    await r.unmount();
  });
});

/** A consent FamilyRow (plan Task 8) for the mocked hook. */
const consentRow = (athleteId, over = {}) => ({ athleteId, name: 'Reese Whitfield', firstName: 'Reese', viewer: 'parent', status: 'unsigned', record: null, adultToday: false,
  claimedLogin: false, drivingUnanswered: false, nextMental: null, draft: null, ...over });

test("mental consent: a minor login's 1:1 says its parent signs; a signed athlete's says nothing", async () => {
  mockRows = [row()];
  mockConsents = { data: { viewer: 'athlete', rows: [consentRow('a1', { viewer: 'athlete' })], byId: {} }, loading: false, error: null };
  const r = await renderScreen(<MySchedule bare />);
  expect(r.text()).toContain('Consent needed · Your parent signs this');
  await r.unmount();
  const signedAt = new Date('2026-10-30T17:00:00Z');
  const record = { adult: false, adultSignature: null, signedAt, signer: { role: 'parent', name: 'Dana Whitfield' }, assent: { audio: true }, choices: { audio: true } };
  mockConsents = { data: { viewer: 'athlete', rows: [consentRow('a1', { viewer: 'athlete', status: 'signed', record })], byId: {} }, loading: false, error: null };
  const signed = await renderScreen(<MySchedule bare />);
  expect(signed.text()).not.toContain('Consent needed');
  await signed.unmount();
});
