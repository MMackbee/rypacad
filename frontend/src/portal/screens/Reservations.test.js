import React, { act } from 'react';
import { renderScreen } from './testRender';
import Reservations from './Reservations';
// Mental consent (plan Task 13): no consent rows unless a case sets them.
let mockConsents;
jest.mock('../hooks/mentalConsent', () => ({ useFamilyConsents: () => mockConsents }));
beforeEach(() => { mockConsents = { data: null, loading: false, error: null }; });
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
// Whether Jordan's account is on hold (no Move on an ordinary booking), and the moves made.
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
jest.mock('../hooks', () => ({
  useHouseholdReservations: () => ({
    data: {
      members: [
        { athleteId: 'a1', name: 'Jordan', unlimited: false, onHold: mockOnHold, upcoming: mockRows, past: [] },
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
    expect(r.text()).toContain('If a spot opens, Jordan is booked automatically and one token is used. You can cancel or move it any time before it starts.');
    expect(r.text()).toContain('If a spot opens, Nico is booked automatically. You can cancel or move it any time before it starts.');
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

// Spec 2026-11-11 §4: cancel right up to the start, with a reason.
test('a same-day row before its start offers Cancel; one that has started says so', async () => {
  mockRows = [
    row({ id: 's0', sessionId: 's0', bookingId: 'b0', date: '2026-11-09', dayLabel: 'Today', isToday: true, time: '4:00', type: 'training', name: 'Training block' }),
    row({ id: 's00', sessionId: 's00', bookingId: 'b00', date: '2026-11-09', dayLabel: 'Today', isToday: true, time: '9:00', meridiem: 'AM', type: 'training', name: 'Training block' }),
  ];
  const r = await renderScreen(<Reservations bare />);
  expect([...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Cancel reservation')).toHaveLength(1);
  expect(r.text()).toContain('This session has already started.');
  expect(r.text()).not.toContain('Same-day');
  await r.unmount();
});

test('the cancel asks why and sends the reason', async () => {
  mockCancels.length = 0;
  mockRows = [row({ type: 'training', name: 'Training block' })];
  const r = await renderScreen(<Reservations bare />);
  await r.click('Cancel reservation');
  expect(r.text()).toContain("Why can't Jordan make it?");
  await sheetButton(r, 'Cancel reservation');
  expect(mockCancels).toEqual([]);
  await r.click('Sick');
  await sheetButton(r, 'Cancel reservation');
  expect(mockCancels).toEqual([['b1', { reason: { category: 'sick', note: null } }]]);
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
    await r.click('Sick');
    await r.click('Cancel this and 2 later weeks');
    expect(mockCancels).toEqual(['a1_1', 'a1_2', 'a1_3'].map((id) => [id, { cancelledVia: 'series', silent: true, reason: { category: 'sick', note: null } }]));
    expect(r.text()).toContain('3 reservations cancelled');
    expect(r.text()).toContain('Cancelled: Nov 10, Nov 17 and Nov 24.');
    await r.click('Done');
    expect(r.button('Done')).toBeNull();
    await r.unmount();
  });

  test('"Cancel just this one" is the single cancel', async () => {
    const r = await renderScreen(<Reservations bare />);
    await r.click('Cancel reservation');
    await r.click('Sick');
    await r.click('Cancel just this one');
    expect(mockCancels).toEqual([['a1_1', { reason: { category: 'sick', note: null } }]]);
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
    const open = await renderScreen(<Reservations bare />);
    expect(moveButtons(open)).toHaveLength(1);
    await open.unmount();
    for (const over of [{ source: 'calendly', cancellable: false }, { type: 'mental' }, { date: '2026-11-09', dayLabel: 'Today', isToday: true, time: '9:00', meridiem: 'AM' }]) {
      mockRows = [training(over)];
      const r = await renderScreen(<Reservations bare />);
      expect(moveButtons(r)).toHaveLength(0);
      await r.unmount();
    }
    mockOnHold = true;
    mockRows = [training(), training({ id: 's3', sessionId: 's3', bookingId: 'b3', date: '2026-11-12', dayLabel: 'Thu, Nov 12', comp: true })];
    const held = await renderScreen(<Reservations bare />);
    // Cancel on both; Move only on the free comp.
    expect([...held.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Cancel reservation')).toHaveLength(2);
    expect(moveButtons(held)).toHaveLength(1);
    await held.unmount();
  });

  test('Move opens the sheet; choosing and moving sends the booking and the session, then closes it', async () => {
    mockRows = [training()];
    const r = await renderScreen(<Reservations bare />);
    await r.click('Move');
    expect(r.text()).toContain('Move to another Training block');
    await r.click('Thu, Nov 12 4:00 PM');
    expect(r.text()).toContain('Move Jordan from Tue Nov 10, 4:00 PM to Thu Nov 12, 4:00 PM?');
    await sheetButton(r, 'Move');
    expect(mockMoves).toEqual([{ bookingId: 'b1', toSessionId: 's2' }]);
    expect(r.text()).not.toContain('Move to another Training block');
    await r.unmount();
  });
});

/** A consent FamilyRow (plan Task 8) for the mocked hook. */
const consentRow = (athleteId, over = {}) => ({ athleteId, name: 'Reese Whitfield', firstName: 'Reese', viewer: 'parent', status: 'unsigned', record: null, adultToday: false,
  claimedLogin: false, drivingUnanswered: false, nextMental: null, draft: null, ...over });

test("mental consent: an unsigned athlete's 1:1 says Consent needed; a golf row does not", async () => {
  mockConsents = { data: { viewer: 'parent', rows: [], byId: { a1: consentRow('a1') } }, loading: false, error: null };
  mockRows = [row()];
  const r = await renderScreen(<Reservations bare />);
  expect(r.text()).toContain('Consent needed · Sign');
  await r.unmount();
  mockRows = [row({ type: 'training', name: 'Training block' })];
  const golf = await renderScreen(<Reservations bare />);
  expect(golf.text()).not.toContain('Consent needed');
  await golf.unmount();
});
