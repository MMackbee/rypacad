import React, { act } from 'react';
import { renderScreen } from './testRender';
import BookSession from './BookSession';
import { BOOKING_CONFIRMATION } from '../data/seed';
import { TOUR_EVENT_EXPLAINER } from '../data/tour';

const BEFORE = new Date('2026-10-09T12:00:00Z'); // Fri Oct 9, 07:00 Chicago - the day before
const AT_OPEN = new Date('2026-10-10T12:00:00Z'); // BOOKING_OPENS_AT exactly
const session = { id: 's1', date: '2026-10-12', time: '4:00 PM', type: 'training', label: 'Training block', capacity: 6, booked: 2 };
let mockPackage;
let mockBooked;
let mockFirstSlot;
let mockMonths;
// Live mode's repeat offer renders only when bookingFor is set.
let mockBookingFor;
let mockBookRecurring;
let mockMarks;
// The booking athlete's token position and the hook's confirmation payload.
let mockTokens;
let mockConfirmation;
// Month-aware: each monthISO gets its own days (and day marks); October is the default.
const mockMonth = (m) => ({ data: { days: mockMonths[m] ?? [], dayMarks: mockMarks[m] ?? {} }, loading: false, error: null });
// Waitlist hardening: what book() answers (default: booked), the options each
// tap sent, a parent's children, and the Leave waitlist write.
let mockBook;
let mockBookCalls;
let mockHousehold;
let mockLeave;
// The booking athlete's paid state (the single token's Buy button reads it).
let mockBillingStatus;
// Their date of birth, as the member row carries it: on their own login the Buy button is an adult's.
let mockDob;
// Their handicap on file (null: none), and whether the member row has loaded at all.
let mockHandicap;
let mockMemberLoaded;
// Set when the membership read itself failed (the hook's error, not a row still loading).
let mockMemberError;
jest.mock('../hooks', () => ({
  useBooking: () => ({
    data: { slots: [{ date: mockFirstSlot }], tokens: mockTokens, confirmation: mockConfirmation, seasonNote: null },
    loading: false, error: null,
    book: async (s, opts) => { mockBooked.push(s.id); mockBookCalls.push([s.id, opts]); return mockBook ? mockBook(s, opts) : {}; },
    bookRecurring: (...args) => mockBookRecurring(...args),
    bookingFor: mockBookingFor,
  }),
  useHouseholdAthletes: () => ({ data: mockHousehold, loading: false }),
  useMembership: () => (mockMemberError
    ? { data: null, loading: false, error: mockMemberError }
    : { data: { members: mockMemberLoaded ? [{ athleteId: 'a1', name: 'Jordan', dob: mockDob, package: mockPackage, billingStatus: mockBillingStatus, handicap: mockHandicap }] : [] } }),
  useMonthSessions: (m) => mockMonth(m),
}));
jest.mock('../hooks/waitlist', () => ({ leaveWaitlist: (...args) => mockLeave(...args) }));
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label, variant }) => <button type="button">{label}|{athleteId}|{product}|{variant}</button> }));

/** The tapped day's session card: tappable cards carry cursor: pointer (SessionCard sets it from onClick). */
const sessionCard = (r) =>
  [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('4:00') && el.textContent.includes('Training block')) || null;

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
});
beforeEach(() => {
  mockBooked = [];
  mockBook = null;
  mockBookCalls = [];
  mockHousehold = [];
  mockLeave = async () => ({});
  mockPackage = { id: 't-12', kind: 'tokens', windowDays: 30 };
  mockFirstSlot = '2026-10-12';
  mockMonths = { '2026-10-01': [{ date: '2026-10-12', sessions: [session] }] };
  mockBookingFor = null;
  mockBookRecurring = jest.fn(async () => ({ booked: [], skipped: [], windowEnd: null, next: null }));
  mockMarks = {};
  mockTokens = { left: 6, unlimited: false, grace: [] };
  mockConfirmation = { email: null, note: 'See you there.' };
  mockBillingStatus = 'active';
  mockDob = null;
  mockHandicap = null;
  mockMemberLoaded = true;
  mockMemberError = null;
  jest.useFakeTimers('modern');
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

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

describe('the cancel line on the confirmation card (tester 2026-09-30: Elite has no tokens)', () => {
  /** Tap Oct 12's block through to Slot reserved, on the real confirmation copy both data paths carry. */
  async function reserve() {
    jest.setSystemTime(AT_OPEN);
    mockConfirmation = { ...BOOKING_CONFIRMATION, email: null };
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    await act(async () => { sessionCard(r).click(); });
    expect(r.text()).toContain('Slot reserved');
    return r;
  }
  test('a token athlete keeps the token sentence', async () => {
    const r = await reserve();
    expect(r.text()).toContain('1 token');
    expect(r.text()).toContain('Cancel until the day before the session to keep your token.');
    await r.unmount();
  });
  test('an Elite (unlimited) athlete is not told about a token', async () => {
    mockPackage = { id: 'elite', kind: 'elite', windowDays: 45 };
    mockTokens = { unlimited: true, grace: [] };
    const r = await reserve();
    expect(r.text()).toContain('Included with Elite');
    expect(r.text()).toContain('Cancel until the day before the session.');
    expect(r.text()).not.toContain('to keep your token');
    await r.unmount();
  });
  test('an older payload with no Elite line falls back to the one it has', async () => {
    mockTokens = { unlimited: true, grace: [] };
    jest.setSystemTime(AT_OPEN);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    await act(async () => { sessionCard(r).click(); });
    expect(r.text()).toContain('See you there.');
    await r.unmount();
  });
});

describe('the window counts from Nov 1 until then (owner ruling 2026-09-30; UX review #8)', () => {
  const EMAIL_DAY = new Date('2026-10-01T17:00:00Z');
  const on = (id, date) => ({ date, sessions: [{ ...session, id, date }] });
  beforeEach(() => {
    mockMonths = {
      '2026-11-01': [on('s-nov3', '2026-11-03')],
      '2026-12-01': [on('s-dec2', '2026-12-02'), on('s-dec16', '2026-12-16'), on('s-dec17', '2026-12-17')],
    };
    mockFirstSlot = '2026-11-03';
  });
  test('a token package before Oct 10: Nov 3 is inside the window, inert behind the gate banner', async () => {
    jest.setSystemTime(EMAIL_DAY);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-03" />);
    expect(r.text()).toContain('Booking opens Sat, Oct 10 at 7 AM');
    expect(r.text()).not.toContain('Not open for this day yet');
    const card = sessionCard(r);
    expect(card.style.cursor).toBe('default');
    await act(async () => { card.click(); });
    expect(mockBooked).toEqual([]);
    await r.unmount();
  });
  test('a token package: Dec 2 is past Nov 1 + 30 and names the day it opens, not Oct 10', async () => {
    jest.setSystemTime(EMAIL_DAY);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-12-02" />);
    expect(r.text()).toContain('Not open for this day yet');
    expect(r.text()).toContain('Booking for Wednesday, Dec 2 opens 7 AM on Monday, Nov 2.');
    await r.unmount();
  });
  test('Elite on Oct 1 reserves Dec 16 (Nov 1 + 45)', async () => {
    jest.setSystemTime(EMAIL_DAY);
    mockPackage = { id: 'elite', kind: 'elite', windowDays: 45 };
    mockFirstSlot = '2026-12-16';
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-12-16" />);
    expect(r.text()).not.toContain('Not open for this day yet');
    const card = sessionCard(r);
    expect(card.style.cursor).toBe('pointer');
    await act(async () => { card.click(); });
    expect(mockBooked).toEqual(['s-dec16']);
    expect(r.text()).toContain('Slot reserved');
    await r.unmount();
  });
  test('Elite on Oct 1: Dec 17 is locked until 7 AM on Monday, Nov 2', async () => {
    jest.setSystemTime(EMAIL_DAY);
    mockPackage = { id: 'elite', kind: 'elite', windowDays: 45 };
    mockFirstSlot = '2026-12-16';
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-12-17" />);
    expect(r.text()).toContain('Booking for Thursday, Dec 17 opens 7 AM on Monday, Nov 2.');
    expect(sessionCard(r)).toBeNull();
    await r.unmount();
  });
});

describe('Repeat weekly in live mode (repeat report 2026-09-30)', () => {
  const OCT_1 = new Date('2026-10-01T17:00:00Z');
  const GREEN = 'rgb(0, 175, 81)'; // color.primary as jsdom reports it
  const on = (id, date) => ({ date, sessions: [{ ...session, id, date }] });
  /** Tap the selected day's session through to Slot reserved. */
  async function reserve(date) {
    const r = await renderScreen(<BookSession bare demoSelectedDate={date} />);
    await act(async () => { sessionCard(r).click(); });
    expect(r.text()).toContain('Slot reserved');
    return r;
  }
  const heading = (r, text) => [...r.container.querySelectorAll('div')].find((el) => el.textContent === text) || null;
  beforeEach(() => {
    mockBookingFor = 'athlete';
    mockPackage = { id: 'elite', kind: 'elite', windowDays: 45 };
    mockMonths = {
      '2026-11-01': [on('s-nov3', '2026-11-03')],
      '2026-12-01': [on('s-dec15', '2026-12-15')],
    };
    mockFirstSlot = '2026-11-03';
  });

  test('Elite on Oct 1: one button through Dec 16; the tap sends the raw slot and the window end', async () => {
    jest.setSystemTime(OCT_1);
    mockBookRecurring = jest.fn(async () => ({
      booked: ['2026-11-10', '2026-11-17', '2026-12-01', '2026-12-08', '2026-12-15'].map((date) => ({ date, id: `t_${date}` })),
      skipped: [{ date: '2026-11-24', reason: 'no session' }],
      windowEnd: '2026-12-16',
      next: { date: '2026-12-22', opensOn: '2026-11-07' },
    }));
    const r = await reserve('2026-11-03');
    expect(r.text()).toContain('Repeat weekly');
    expect(r.text()).toContain(
      'Hold Tuesday at 4:00 PM every week through Wed, Dec 16, the furthest you can book today (45 days ahead). Weeks after that open from Nov 2, one day at a time at 7 AM; come back then to extend.'
    );
    expect(r.text()).not.toContain('spends a token');
    expect(r.button('Next 4 weeks')).toBeNull();
    await r.click('Repeat every Tuesday through Wed, Dec 16');
    await r.flush();
    expect(mockBookRecurring).toHaveBeenCalledTimes(1);
    expect(mockBookRecurring).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's-nov3', date: '2026-11-03', time: '4:00 PM', type: 'training' }),
      { athleteId: undefined, untilISO: '2026-12-16' }
    );
    expect(heading(r, '5 more weeks booked').style.color).toBe(GREEN);
    expect(r.text()).toContain('Nov 24: no session that day.');
    expect(r.text()).toContain('Tue, Dec 22 opens 7 AM on Sat, Nov 7 - come back to add it.');
    expect(r.text()).not.toContain('tokens reset');
    await r.unmount();
  });

  test('a token package: the token line, through Dec 1; nothing booked reads neutral, one line per reason', async () => {
    jest.setSystemTime(new Date('2026-10-12T17:00:00Z'));
    mockPackage = { id: 't-12', kind: 'tokens', windowDays: 30 };
    mockBookRecurring = jest.fn(async () => ({
      booked: [],
      skipped: [
        { date: '2026-11-10', reason: 'period limit' },
        { date: '2026-11-17', reason: 'period limit' },
        { date: '2026-11-24', reason: 'full' },
        { date: '2026-12-01', reason: 'error', message: 'Missing or insufficient permissions.' },
      ],
      windowEnd: '2026-12-01',
      next: { date: '2026-12-08', opensOn: '2026-11-08' },
    }));
    const r = await reserve('2026-11-03');
    expect(r.text()).toContain("Each week spends a token from that week's period.");
    await r.click('Repeat every Tuesday through Tue, Dec 1');
    await r.flush();
    expect(mockBookRecurring.mock.calls[0][1]).toEqual({ athleteId: undefined, untilISO: '2026-12-01' });
    const none = heading(r, 'No extra weeks booked');
    expect(none).not.toBeNull();
    expect(none.style.color).not.toBe(GREEN); // neutral, never the green of a win
    expect(r.text()).not.toContain('0 more weeks');
    expect(r.text()).toContain("Nov 10, Nov 17: no tokens left in that week's period.");
    expect(r.text()).toContain('Nov 24: full.');
    expect(r.text()).toContain("Dec 1: didn't go through - Missing or insufficient permissions.");
    expect(r.text()).toContain('Tue, Dec 8 opens 7 AM on Sun, Nov 8 - come back to add it.');
    expect(r.text()).not.toContain('tokens reset');
    await r.unmount();
  });

  test('Elite on Oct 1 booking Dec 15: no week left in the window - the opens line, no button', async () => {
    jest.setSystemTime(OCT_1);
    mockFirstSlot = '2026-12-15';
    const r = await reserve('2026-12-15');
    expect(r.text()).toContain('Next Tuesday (Tue, Dec 22) opens for booking at 7 AM on Sat, Nov 7.');
    expect([...r.container.querySelectorAll('button')].some((b) => b.textContent.startsWith('Repeat every'))).toBe(false);
    expect(mockBookRecurring).not.toHaveBeenCalled();
    await r.unmount();
  });

  test('Elite on Oct 1 booking Wed Dec 16: the opens line skips the Dec 23 and Dec 30 closures', async () => {
    jest.setSystemTime(OCT_1);
    mockMonths['2026-12-01'] = [on('s-dec16', '2026-12-16')];
    mockFirstSlot = '2026-12-16';
    const r = await reserve('2026-12-16');
    expect(r.text()).toContain('Next Wednesday (Wed, Jan 6) opens for booking at 7 AM on Sun, Nov 22.');
    expect(r.text()).not.toContain('Dec 23');
    expect(mockBookRecurring).not.toHaveBeenCalled();
    await r.unmount();
  });

  // Owner ruling 2026-10-02: a week whose block is reserved by handicap is its own line, never "didn't go through".
  test('a week reserved by handicap is skipped with the line that says why', async () => {
    jest.setSystemTime(OCT_1);
    const LINE = 'Reserved for handicaps of 5 or better.';
    mockBookRecurring = jest.fn(async () => ({
      booked: [{ date: '2026-11-24', id: 't_2026-11-24' }],
      skipped: [
        { date: '2026-11-10', reason: 'handicap-reserved', message: LINE },
        { date: '2026-11-17', reason: 'handicap-reserved', message: LINE },
      ],
      windowEnd: '2026-12-16',
      next: null,
    }));
    const r = await reserve('2026-11-03');
    await r.click('Repeat every Tuesday through Wed, Dec 16');
    await r.flush();
    expect(r.text()).toContain('1 more week booked');
    expect(r.text()).toContain(`Nov 10, Nov 17: ${LINE}`);
    expect(r.text()).not.toContain("didn't go through");
    await r.unmount();
    // A skip that carries no line of its own still names the reason.
    mockBookRecurring = jest.fn(async () => ({ booked: [], skipped: [{ date: '2026-11-10', reason: 'handicap-reserved' }], windowEnd: '2026-12-16', next: null }));
    const bare = await reserve('2026-11-03');
    await bare.click('Repeat every Tuesday through Wed, Dec 16');
    await bare.flush();
    expect(bare.text()).toContain('Nov 10: reserved for lower handicaps.');
    expect(bare.text()).not.toContain("didn't go through");
    await bare.unmount();
  });

  test('a rejected repeat shows its error text', async () => {
    jest.setSystemTime(OCT_1);
    mockBookRecurring = jest.fn(async () => {
      throw new Error("This household's membership is not active right now — new bookings are paused until it's resolved.");
    });
    const r = await reserve('2026-11-03');
    await r.click('Repeat every Tuesday through Wed, Dec 16');
    await r.flush();
    expect(r.text()).toContain("This household's membership is not active right now");
    expect(r.text()).not.toContain('more week');
    await r.unmount();
  });

  test('no repeat offer outside live mode (bookingFor null)', async () => {
    jest.setSystemTime(OCT_1);
    mockBookingFor = null;
    const r = await reserve('2026-11-03');
    expect(r.text()).not.toContain('Repeat weekly');
    await r.unmount();
  });
});

describe('Month/Week toggle (owner request 2026-09-30)', () => {
  const KEY = 'ryp.calendarView';
  const pressed = (r, name) => r.button(name)?.getAttribute('aria-pressed');
  /** The nav title sits between the prev and next arrows, in either view. */
  const navLabel = (r) => (r.button('Previous week') || r.button('Previous month'))?.nextElementSibling?.textContent ?? null;
  const td = (r, iso) => r.container.querySelector(`td[data-date="${iso}"]`);
  const pill = (r, iso) => r.container.querySelector(`.ryp-week-view [data-date="${iso}"]`);
  const tap = async (el) => { await act(async () => { el.click(); }); };

  /** Opens Oct 12's session list the way a viewer would in each view. */
  async function openOct12(r, view) {
    if (view === 'week') {
      await r.click('Week');
      expect(navLabel(r)).toBe('Oct 5 – 11'); // today's row
      await r.click('Next week');
      expect(navLabel(r)).toBe('Oct 12 – 18');
      await r.click('Monday, Oct 12');
      expect(pill(r, '2026-10-12').getAttribute('aria-pressed')).toBe('true');
    } else {
      await tap(td(r, '2026-10-12'));
    }
  }

  test('Month is the default view', async () => {
    jest.setSystemTime(BEFORE);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(pressed(r, 'Month')).toBe('true');
    expect(pressed(r, 'Week')).toBe('false');
    expect(r.container.querySelector('.fc')).not.toBeNull();
    expect(r.container.querySelector('.ryp-week-view')).toBeNull();
    expect(navLabel(r)).toBe('October 2026');
    await r.unmount();
  });

  test('Week stores the choice and shows the selected day\'s row', async () => {
    jest.setSystemTime(BEFORE);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    await r.click('Week');
    expect(window.localStorage.getItem(KEY)).toBe('week');
    expect(pressed(r, 'Week')).toBe('true');
    expect(r.container.querySelector('.fc')).toBeNull();
    expect(navLabel(r)).toBe('Oct 12 – 18');
    expect(pill(r, '2026-10-12').getAttribute('aria-pressed')).toBe('true');
    // The selected day's sessions stay open below the grid.
    expect(sessionCard(r)).not.toBeNull();
    await r.unmount();
  });

  describe.each(['month', 'week'])('%s view: tapping Oct 12 opens the same session', (view) => {
    test('before the gate the card is inert and a click books nothing', async () => {
      jest.setSystemTime(BEFORE);
      const r = await renderScreen(<BookSession bare />);
      expect(sessionCard(r)).toBeNull();
      await openOct12(r, view);
      const card = sessionCard(r);
      expect(card).not.toBeNull();
      expect(card.style.cursor).toBe('default');
      await act(async () => { card.click(); });
      expect(mockBooked).toEqual([]);
      expect(r.text()).not.toContain('Slot reserved');
      await r.unmount();
    });

    test('at the gate a click reserves', async () => {
      jest.setSystemTime(AT_OPEN);
      const r = await renderScreen(<BookSession bare />);
      await openOct12(r, view);
      const card = sessionCard(r);
      expect(card.style.cursor).toBe('pointer');
      await act(async () => { card.click(); });
      expect(mockBooked).toEqual(['s1']);
      expect(r.text()).toContain('Slot reserved');
      await r.unmount();
    });
  });

  test('a stored Week preference opens the screen in Week', async () => {
    window.localStorage.setItem(KEY, 'week');
    jest.setSystemTime(BEFORE);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(pressed(r, 'Week')).toBe('true');
    expect(r.container.querySelector('.ryp-week-view')).not.toBeNull();
    expect(r.container.querySelector('.fc')).toBeNull();
    expect(navLabel(r)).toBe('Oct 12 – 18');
    await r.unmount();
  });

  test('storage that throws on read opens Month without crashing', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    jest.setSystemTime(BEFORE);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(pressed(r, 'Month')).toBe('true');
    expect(r.container.querySelector('.fc')).not.toBeNull();
    expect(sessionCard(r)).not.toBeNull();
    await r.unmount();
  });

  test('Next week clears the selected day, as the month arrows do', async () => {
    window.localStorage.setItem(KEY, 'week');
    jest.setSystemTime(BEFORE);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(sessionCard(r)).not.toBeNull();
    await r.click('Next week');
    expect(navLabel(r)).toBe('Oct 19 – 25');
    expect(sessionCard(r)).toBeNull();
    await r.click('Previous week');
    expect(navLabel(r)).toBe('Oct 12 – 18');
    expect(pill(r, '2026-10-12').getAttribute('aria-pressed')).toBe('false');
    expect(sessionCard(r)).toBeNull();
    await r.unmount();
  });

  test('a tournament Saturday and a closed Sunday paint in both views, with the legend and the new caption', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00Z'));
    mockFirstSlot = '2026-11-05';
    // No label of its own: the generic name is the Tour's (owner naming rule 2026-09-30).
    const tournament = { ...session, id: 't1', date: '2026-11-07', time: '10:30 AM', type: 'tournament', label: null };
    mockMonths = { '2026-11-01': [{ date: '2026-11-05', sessions: [{ ...session, date: '2026-11-05' }] }, { date: '2026-11-07', sessions: [tournament] }] };
    mockMarks = { '2026-11-01': { '2026-11-07': 'tournament', '2026-11-08': 'closed' } };
    const r = await renderScreen(<BookSession bare />);
    expect(navLabel(r)).toBe('November 2026');
    expect(r.text()).toContain('Green and yellow days have bookable sessions — tap one to see times.');
    expect(r.container.querySelector('.ryp-day-mark-legend').textContent).toContain('Tour day');
    expect(r.text()).not.toContain('★');
    expect(r.container.querySelector('.ryp-day-mark-legend').textContent).toContain('Academy closed');
    expect(td(r, '2026-11-07').classList.contains('ryp-mark-tournament')).toBe(true);
    expect(td(r, '2026-11-07').getAttribute('role')).toBe('button');
    expect(td(r, '2026-11-08').classList.contains('ryp-mark-closed')).toBe(true);
    expect(td(r, '2026-11-08').getAttribute('role')).toBeNull();
    await r.click('Week');
    expect(navLabel(r)).toBe('Nov 2 – 8');
    expect(pill(r, '2026-11-08').tagName).toBe('DIV');
    expect(pill(r, '2026-11-08').getAttribute('title')).toBe('Academy closed');
    expect(r.container.querySelector('.ryp-day-mark-legend')).not.toBeNull();
    // A training-only day: no Tour explainer.
    await r.click('Thursday, Nov 5');
    expect(sessionCard(r)).not.toBeNull();
    expect(r.text()).not.toContain(TOUR_EVENT_EXPLAINER);
    // The Tour day: the chip says Tour, the card Tour event, and the explainer sits with the list.
    await r.click('Saturday, Nov 7, Tour day');
    const card = [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('10:30AMTourTour event'));
    expect(card).toBeDefined();
    expect(r.text()).toContain(TOUR_EVENT_EXPLAINER);
    expect(r.text()).not.toMatch(/Tournament block|Tournament day/);
    await r.unmount();
  });

  test('a calendar label on a Tour event stays exactly as typed', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00Z'));
    mockFirstSlot = '2026-11-07';
    mockMonths = { '2026-11-01': [{ date: '2026-11-07', sessions: [{ ...session, id: 't1', date: '2026-11-07', time: '10:30 AM', type: 'tournament', label: 'Fall Tournament' }] }] };
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-07" />);
    expect(r.text()).toContain('Fall Tournament');
    expect(r.text()).toContain(TOUR_EVENT_EXPLAINER);
    await r.unmount();
  });

  test('pre-season (onboarding practice): Week opens on the first bookable week', async () => {
    window.localStorage.setItem(KEY, 'week');
    jest.setSystemTime(new Date('2026-09-30T17:00:00Z'));
    // A window that reaches Nov 3 from Sep 30, so the tap lands on the list.
    mockPackage = { id: 't-12', kind: 'tokens', windowDays: 45 };
    mockFirstSlot = '2026-11-03';
    mockMonths = { '2026-11-01': [{ date: '2026-11-03', sessions: [{ ...session, id: 's3', date: '2026-11-03' }] }] };
    const onConfirmed = jest.fn();
    const r = await renderScreen(<BookSession bare practice onConfirmed={onConfirmed} />);
    expect(pressed(r, 'Week')).toBe('true');
    expect(navLabel(r)).toBe('Nov 2 – 8');
    expect(pill(r, '2026-11-03').tagName).toBe('BUTTON');
    await r.click('Tuesday, Nov 3');
    const card = sessionCard(r);
    expect(card.style.cursor).toBe('pointer');
    await act(async () => { card.click(); });
    expect(mockBooked).toEqual(['s3']);
    expect(r.text()).toContain('Slot reserved');
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    await r.unmount();
  });
});

// Audit 2026-09-30, owner rulings R2-R4. Thu Nov 12 2026, 4:30 PM in Chicago.
describe('waitlist hardening', () => {
  const NOV_12 = new Date('2026-11-12T22:30:00Z');
  const td = (r, iso) => r.container.querySelector(`td[data-date="${iso}"]`);
  const tap = async (el) => { await act(async () => { el.click(); }); };
  const block = (id, date, time, over = {}) => ({ ...session, id, date, time, ...over });
  /** The card for one start time ("4:00", "6:00") on the open day. */
  const cardAt = (r, time) =>
    [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith(time) && el.textContent.includes('Training block')) || null;
  const refusal = (reason, message) => Object.assign(new Error(message), { reason });

  beforeEach(() => {
    jest.setSystemTime(NOV_12);
    mockFirstSlot = '2026-11-10';
    mockMonths = { '2026-11-01': [
      { date: '2026-11-10', sessions: [block('past', '2026-11-10', '4:00 PM')] },
      { date: '2026-11-12', sessions: [
        block('started', '2026-11-12', '4:00 PM'),
        block('later', '2026-11-12', '6:00 PM'),
        block('tonight-full', '2026-11-12', '7:00 PM', { booked: 6 }),
      ] },
      { date: '2026-11-17', sessions: [block('s17', '2026-11-17', '4:00 PM')] },
    ] };
  });

  test('a past day opens nothing; a later day does', async () => {
    const r = await renderScreen(<BookSession bare />);
    expect(td(r, '2026-11-10').getAttribute('role')).toBeNull();
    expect(td(r, '2026-11-17').getAttribute('role')).toBe('button');
    await tap(td(r, '2026-11-10'));
    expect(cardAt(r, '4:00')).toBeNull();
    await tap(td(r, '2026-11-17'));
    expect(cardAt(r, '4:00').style.cursor).toBe('pointer');
    await r.unmount();
  });

  test("today: a block that has started is shown without Book or Join; tonight's full block takes no new waitlist place", async () => {
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-12" />);
    const started = cardAt(r, '4:00');
    expect(started.textContent).toContain('Started');
    expect(started.style.cursor).toBe('default');
    await tap(started);
    expect(mockBooked).toEqual([]);
    expect(cardAt(r, '6:00').style.cursor).toBe('pointer');
    // No same-day promotion, so no Join waitlist on the day.
    expect(cardAt(r, '7:00').textContent).toContain('Full');
    expect(r.text()).not.toContain('Join waitlist');
    await r.unmount();
  });

  test('a past day reached anyway (a screen left open overnight) offers nothing', async () => {
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-10" />);
    expect(cardAt(r, '4:00').textContent).toContain('Started');
    expect(cardAt(r, '4:00').style.cursor).toBe('default');
    await r.unmount();
  });

  test('a session that filled since the screen loaded: told so, nothing joined, and Join waitlist is its own tap', async () => {
    mockBook = async (s, opts) => {
      if (!opts?.joinWaitlist) throw refusal('full', 'This session just filled.');
      return { status: 'waitlisted', position: 2 };
    };
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
    await tap(cardAt(r, '4:00'));
    // The plain tap asked for no waitlist place.
    expect(mockBookCalls).toEqual([['s17', undefined]]);
    expect(r.text()).toContain('This session just filled. Nothing was reserved.');
    expect(r.text()).not.toContain('tap the session to try again');
    expect(r.text()).not.toContain("You're on the waitlist");
    expect(cardAt(r, '4:00').textContent).toContain('Full');
    await r.click('Join waitlist · reserves one token');
    expect(mockBookCalls[1]).toEqual(['s17', { joinWaitlist: true }]);
    expect(r.text()).toContain("You're on the waitlist");
    expect(r.text()).toContain('On the waitlist - #2 in line');
    expect(r.text()).toContain('If a spot opens, Jordan is booked automatically and one token is used. You can cancel until the day before.');
    expect(r.text()).not.toMatch(/notif/i);
    await r.unmount();
  });

  test('a started session refused by the write says so, with no "try again"', async () => {
    mockBook = async () => { throw refusal('session-past', 'This session has already started.'); };
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
    await tap(cardAt(r, '4:00'));
    expect(r.text()).toContain('This session has already started. Nothing was reserved.');
    expect(r.text()).not.toContain('tap the session to try again');
    await r.unmount();
  });

  test('a refusal a second tap can change keeps "try again", with a hyphen', async () => {
    mockBook = async () => { throw new Error('The network dropped.'); };
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
    await tap(cardAt(r, '4:00'));
    expect(r.text()).toContain('The network dropped. Nothing was reserved - tap the session to try again.');
    await r.unmount();
  });

  describe('already waiting', () => {
    beforeEach(() => {
      mockMonths['2026-11-01'][2].sessions = [block('s17', '2026-11-17', '4:00 PM', { booked: 6, waitlisted: true, waitlistPosition: 2, waitlistBy: { a1: 2 } })];
    });

    test('the card says On the waitlist with the place and offers Leave, never Join again', async () => {
      const left = [];
      mockLeave = async (args) => { left.push(args); };
      const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
      expect(r.text()).toContain('On the waitlist - #2 in line');
      expect(r.text()).toContain('If a spot opens, Jordan is booked automatically and one token is used.');
      expect(r.text()).not.toContain('Join waitlist');
      await tap(cardAt(r, '4:00'));
      expect(mockBooked).toEqual([]);
      await r.click('Leave waitlist');
      expect(left).toEqual([{ sessionId: 's17', athleteId: 'a1' }]);
      await r.unmount();
    });

    test('no place from the server: On the waitlist without a number', async () => {
      mockMonths['2026-11-01'][2].sessions[0].waitlistBy = { a1: null };
      const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
      expect(r.text()).toContain('On the waitlist');
      expect(r.text()).not.toContain('in line');
      await r.unmount();
    });

    test('a leave refused because the athlete was just promoted says so by name', async () => {
      mockLeave = async () => { throw refusal('promoted', 'This athlete was just booked into this session.'); };
      const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
      await r.click('Leave waitlist');
      expect(r.text()).toContain('Jordan was just booked into this session.');
      await r.unmount();
    });

    test('any other refused leave shows a plain line, never the raw permissions text', async () => {
      mockLeave = async () => { throw new Error('leaveWaitlist: Missing or insufficient permissions.'); };
      const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
      await r.click('Leave waitlist');
      expect(r.text()).toContain('That waitlist place could not be removed. Try again.');
      expect(r.text()).not.toMatch(/permission/i);
      await r.unmount();
    });

    // Review 2026-10-01: a refused leave reloads the month, and the row comes
    // back without its waitlist place - the card that carried the line is
    // gone. The banner above the list is what still says why.
    test('a refused leave still says why once the month reloads without the waitlisted row', async () => {
      mockLeave = async () => {
        mockMonths['2026-11-01'][2].sessions = [block('s17', '2026-11-17', '4:00 PM', { booked: 6 })];
        throw refusal('promoted', 'This athlete was just booked into this session.');
      };
      const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
      await r.click('Leave waitlist');
      expect(r.text()).not.toContain('On the waitlist');
      expect(r.text()).toContain('Jordan was just booked into this session.');
      // It is about that day's card: another day clears it.
      await tap(td(r, '2026-11-12'));
      expect(r.text()).not.toContain('Jordan was just booked into this session.');
      await r.unmount();
    });

    test('a parent: only the child who waits sees it; a sibling is still offered Join', async () => {
      mockHousehold = [
        { id: 'k1', name: 'Ava', tokens: { left: 3, unlimited: false, grace: [] } },
        { id: 'k2', name: 'Nico', tokens: { left: 3, unlimited: false, grace: [] } },
      ];
      mockMonths['2026-11-01'][2].sessions[0].waitlistBy = { k2: 1 };
      const r = await renderScreen(<BookSession bare role="parent" demoSelectedDate="2026-11-17" />);
      // Ava (the first child) is not on it.
      expect(r.button('Join waitlist · reserves one token')).not.toBeNull();
      expect(r.text()).not.toContain('On the waitlist');
      await r.click('Nico');
      expect(r.text()).toContain('On the waitlist - #1 in line');
      expect(r.button('Join waitlist · reserves one token')).toBeNull();
      await r.unmount();
    });
  });

  describe('Elite reads no token wording on the waitlist', () => {
    beforeEach(() => {
      mockPackage = { id: 'elite', kind: 'elite', windowDays: 45 };
      mockTokens = { unlimited: true, grace: [] };
      mockMonths['2026-11-01'][2].sessions = [block('s17', '2026-11-17', '4:00 PM', { booked: 6 })];
    });

    test('the join button, the confirmation and the Tour explainer', async () => {
      mockBook = async () => ({ status: 'waitlisted', position: null });
      mockMonths['2026-11-01'][2].sessions.push(block('tour', '2026-11-17', '10:30 AM', { type: 'tournament', label: null }));
      const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
      expect(r.text()).toContain("A Tour event is the academy's Saturday tournament.");
      expect(r.text()).not.toMatch(/token/i);
      await r.click('Join waitlist');
      expect(r.text()).toContain('If a spot opens, Jordan is booked automatically. You can cancel until the day before.');
      expect(r.text()).not.toMatch(/token/i);
      await r.unmount();
    });
  });

  test('the confirmation says what the booking was actually charged to', async () => {
    // A bonus token was spent: after the write the screen's own tokens no longer list it.
    mockBook = async () => ({ status: 'confirmed', chargedFrom: 'grace' });
    mockTokens = { left: 3, unlimited: false, grace: [] };
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
    await tap(cardAt(r, '4:00'));
    expect(r.text()).toContain('Slot reserved');
    expect(r.text()).toContain('a bonus token');
    await r.unmount();
  });

  describe('a bonus token when the period reads zero', () => {
    test('a session on or before its expiry can be booked with it; a later one cannot', async () => {
      mockTokens = { left: 0, used: 6, granted: 6, unlimited: false, grace: [{ id: 'g1', expiresAt: '2026-12-01', reason: 'session-cancelled' }] };
      const ok = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
      expect(cardAt(ok, '4:00').style.cursor).toBe('pointer');
      expect(cardAt(ok, '4:00').textContent).toContain('Uses a bonus token');
      await ok.unmount();

      mockTokens = { ...mockTokens, grace: [{ id: 'g1', expiresAt: '2026-11-15', reason: 'session-cancelled' }] };
      const late = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
      expect(cardAt(late, '4:00').style.cursor).toBe('default');
      expect(cardAt(late, '4:00').textContent).toContain('No tokens');
      expect(cardAt(late, '4:00').textContent).not.toContain('Uses a bonus token');
      await late.unmount();

      // With a period token left, that later session spends the period token.
      mockTokens = { ...mockTokens, left: 2, used: 4 };
      const period = await renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
      expect(cardAt(period, '4:00').textContent).toContain('Spends 1 token · 2 left');
      await period.unmount();
    });
  });
});

describe('the single token (owner rulings 2026-09-29/30)', () => {
  const SINGLE = { id: 'single', kind: 'single', windowDays: 30 };
  const bought = { id: 'single_cs_1', expiresAt: '2027-02-27', reason: 'single-purchase', sourceSessionId: null };
  const singleTokens = (grace) => ({ granted: 0, used: 0, reserved: 0, left: 0, unlimited: false, perPurchase: true, held: 0, grace });
  const ASK = 'Ask a parent or guardian to buy a session token.';
  // Live mode, so the confirmation offers Repeat weekly whenever it may. The
  // athlete booking is an adult on their own login unless a test says otherwise.
  beforeEach(() => { mockBookingFor = 'athlete'; mockDob = '2000-01-01'; });

  test('one token: a tappable card, a session-token spend, and no Repeat weekly', async () => {
    jest.setSystemTime(AT_OPEN);
    mockPackage = SINGLE;
    mockTokens = singleTokens([bought]);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(r.text()).toContain('Your session tokens');
    expect(r.text()).toContain('1 session token - good through Sat, Feb 27');
    expect(r.button('Buy a session token - $65|a1|tier|outline')).not.toBeNull();
    const card = sessionCard(r);
    expect(card.style.cursor).toBe('pointer');
    expect(card.textContent).toContain('Uses a session token');
    await act(async () => { card.click(); });
    expect(mockBooked).toEqual(['s1']);
    expect(r.text()).toContain('Slot reserved');
    expect(r.text()).toContain('a session token');
    expect(r.text()).not.toContain('Repeat weekly');
    await r.unmount();
  });

  test('none left: a red No session token and the primary Buy button', async () => {
    jest.setSystemTime(AT_OPEN);
    mockPackage = SINGLE;
    mockTokens = singleTokens([]);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(r.text()).toContain('No session token');
    expect(r.button('Buy a session token - $65|a1|tier|primary')).not.toBeNull();
    expect(sessionCard(r).style.cursor).toBe('default');
    await r.unmount();
  });

  test('no Buy button while the athlete is not paid up', async () => {
    jest.setSystemTime(AT_OPEN);
    mockPackage = SINGLE;
    mockTokens = singleTokens([]);
    mockBillingStatus = 'pending';
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(r.text()).not.toContain('Buy a session token');
    await r.unmount();
  });

  // A calendar of dead "No tokens" blocks said nothing about why: the banner now does, with no button (Pay now is on the home and Billing).
  test('payment pending or ended: the banner says so, with no purchase button here', async () => {
    jest.setSystemTime(AT_OPEN);
    mockPackage = SINGLE;
    mockTokens = singleTokens([]);
    const PENDING = 'Payment pending - finish checkout to start booking';
    const purchaseButtons = (r) => [...r.container.querySelectorAll('button')].map((b) => b.textContent).filter((t) => t.includes('|a1|tier'));
    for (const status of ['pending', 'lapsed']) {
      mockBillingStatus = status;
      // An adult on their own login.
      const own = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
      expect(own.text()).toContain('No session token');
      expect(own.text().split(PENDING)).toHaveLength(2);
      expect(own.text()).not.toContain(ASK);
      expect(purchaseButtons(own)).toEqual([]);
      await own.unmount();
      // An under-18 athlete on their own login reads who buys it.
      mockDob = '2012-06-17';
      const child = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
      expect(child.text().split(ASK)).toHaveLength(2);
      expect(child.text()).not.toContain(PENDING);
      expect(purchaseButtons(child)).toEqual([]);
      await child.unmount();
      // A parent booking for that child reads the pending line, never the guardian one.
      mockHousehold = [{ id: 'a1', name: 'Jordan', billingStatus: status, tokens: singleTokens([]) }];
      const parent = await renderScreen(<BookSession bare role="parent" demoSelectedDate="2026-10-12" />);
      expect(parent.text().split(PENDING)).toHaveLength(2);
      expect(parent.text()).not.toContain(ASK);
      expect(purchaseButtons(parent)).toEqual([]);
      await parent.unmount();
      mockHousehold = [];
      mockDob = '2000-01-01';
    }
    // A failing card is fixed in Stripe: no line and no button for past_due.
    mockBillingStatus = 'past_due';
    const frozen = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(frozen.text()).not.toContain(PENDING);
    expect(frozen.text()).not.toContain(ASK);
    expect(purchaseButtons(frozen)).toEqual([]);
    await frozen.unmount();
    // Before the gate a pending athlete reads neither line, as before.
    jest.setSystemTime(BEFORE);
    mockBillingStatus = 'pending';
    const early = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(early.text()).not.toContain(PENDING);
    expect(early.text()).not.toContain(ASK);
    expect(purchaseButtons(early)).toEqual([]);
    await early.unmount();
  });

  // Owner ruling 2026-10-01 ("not unless the child is 18+").
  test('an under-18 athlete on their own login reads who buys it, never the Buy button', async () => {
    jest.setSystemTime(AT_OPEN);
    mockPackage = SINGLE;
    mockTokens = singleTokens([]);
    // 14, and no date of birth on file: both read the line.
    for (const dob of ['2012-06-17', null]) {
      mockDob = dob;
      const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
      expect(r.text()).toContain('No session token');
      expect(r.text().split(ASK)).toHaveLength(2);
      expect(r.text()).not.toContain('Buy a session token');
      await r.unmount();
    }
    // With a token in hand they still book with it; only the purchase is the adult's.
    mockDob = '2012-06-17';
    mockTokens = singleTokens([bought]);
    const one = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(one.text().split(ASK)).toHaveLength(2);
    expect(one.text()).not.toContain('Buy a session token');
    expect(sessionCard(one).style.cursor).toBe('pointer');
    await one.unmount();
  });

  test('a parent booking for that child gets the Buy button, and never the line', async () => {
    jest.setSystemTime(AT_OPEN);
    mockPackage = SINGLE;
    mockDob = '2012-06-17';
    mockHousehold = [{ id: 'a1', name: 'Jordan', billingStatus: 'active', tokens: singleTokens([]) }];
    const r = await renderScreen(<BookSession bare role="parent" demoSelectedDate="2026-10-12" />);
    expect(r.button('Buy a session token - $65|a1|tier|primary')).not.toBeNull();
    expect(r.text()).not.toContain(ASK);
    await r.unmount();
  });

  test('an under-18 athlete on a monthly package or Elite reads nothing about buying', async () => {
    jest.setSystemTime(AT_OPEN);
    mockDob = '2012-06-17';
    const monthly = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(monthly.text()).toContain('Your tokens this period');
    expect(monthly.text()).not.toContain(ASK);
    await monthly.unmount();
    mockPackage = { id: 'elite', kind: 'elite', windowDays: 45 };
    mockTokens = { unlimited: true, grace: [] };
    const elite = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(elite.text()).not.toContain(ASK);
    expect(elite.text()).not.toMatch(/token/i);
    await elite.unmount();
  });

  test('a monthly athlete still gets Repeat weekly and the monthly banner', async () => {
    jest.setSystemTime(AT_OPEN);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(r.text()).toContain('Your tokens this period');
    expect(r.text()).not.toContain('Buy a session token');
    await act(async () => { sessionCard(r).click(); });
    expect(r.text()).toContain('Repeat weekly');
    await r.unmount();
  });

  test('the confirmation names the session token the write spent, never a bonus token', async () => {
    jest.setSystemTime(AT_OPEN);
    mockPackage = SINGLE;
    // After the write the screen's own tokens no longer list the spent token.
    mockTokens = singleTokens([]);
    mockTokens.left = 1; // an ops comp keeps the card tappable for the tap itself
    mockBook = async () => ({ status: 'confirmed', chargedFrom: 'grace', graceTokenId: 'single_cs_1' });
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    await act(async () => { sessionCard(r).click(); });
    expect(r.text()).toContain('Slot reserved');
    expect(r.text()).toContain('a session token');
    expect(r.text()).not.toContain('a bonus token');
    await r.unmount();
  });

  // Owner ruling 2026-10-01: single tokens go on sale when booking opens.
  test('before the gate there is no Buy button, only the line saying when', async () => {
    jest.setSystemTime(BEFORE);
    mockPackage = SINGLE;
    mockTokens = singleTokens([]);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(r.text()).toContain('No session token');
    expect(r.text()).not.toContain('Buy a session token');
    expect(r.text()).toContain('Single tokens are available from Sat, Oct 10 at 7 AM.');
    expect(r.text()).toContain('Booking opens Sat, Oct 10 at 7 AM');
    expect(sessionCard(r).style.cursor).toBe('default');
    await r.unmount();
    // An under-18 athlete reads the same sentence until then, once.
    mockDob = '2012-06-17';
    const child = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(child.text().split('Single tokens are available from Sat, Oct 10 at 7 AM.')).toHaveLength(2);
    expect(child.text()).not.toContain(ASK);
    await child.unmount();
  });
});

// Owner ruling 2026-10-02: the Tuesday 3 PM training block is reserved for
// handicaps of 5 or better (sessions.maxHandicap; data/reserved.js decides).
describe('a handicap-reserved block', () => {
  const NOV_12 = new Date('2026-11-12T22:30:00Z');
  const TAG = 'Handicap 5 or better';
  const LINE = 'Reserved for handicaps of 5 or better.';
  const noneOnFile = (first) => `${LINE} No handicap is on file for ${first}. Ask the academy to add it.`;
  const reserved = (over = {}) => ({ ...session, id: 'tue3', date: '2026-11-17', time: '3:00 PM', maxHandicap: 5, ...over });
  const open = { ...session, id: 'tue4', date: '2026-11-17', time: '4:00 PM' };
  const cardAt = (r, time) =>
    [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith(time) && el.textContent.includes('Training block')) || null;
  const tap = async (el) => { await act(async () => { el.click(); }); };
  const show = () => renderScreen(<BookSession bare demoSelectedDate="2026-11-17" />);
  const tokens = { left: 3, unlimited: false, grace: [] };

  beforeEach(() => {
    jest.setSystemTime(NOV_12);
    mockFirstSlot = '2026-11-17';
    mockMonths = { '2026-11-01': [{ date: '2026-11-17', sessions: [reserved(), open] }] };
  });

  test('the tag reads for everyone; an athlete at the limit, or on 0 for a plus handicap, books as today', async () => {
    for (const handicap of [5, 0]) {
      mockHandicap = handicap;
      mockBooked = [];
      const r = await show();
      const card = cardAt(r, '3:00');
      expect(card.textContent).toContain(TAG);
      expect(card.textContent).toContain('Spends 1 token');
      expect(card.textContent).not.toContain('Reserved');
      // The open block beside it carries no tag.
      expect(cardAt(r, '4:00').textContent).not.toContain('Handicap');
      expect(card.style.cursor).toBe('pointer');
      await tap(card);
      expect(mockBooked).toEqual(['tue3']);
      expect(r.text()).toContain('Slot reserved');
      await r.unmount();
    }
  });

  test('a handicap over the limit: the tag and the line, and the block cannot be booked', async () => {
    mockHandicap = 14;
    const r = await show();
    const card = cardAt(r, '3:00');
    // Time, type chip, the tag, name, a Reserved pill for the spots, then the one line - no spend note.
    expect(card.textContent).toBe(`3:00PMTraining${TAG}Training blockReserved${LINE}`);
    expect(card.style.cursor).toBe('default');
    await tap(card);
    expect(mockBooked).toEqual([]);
    expect(r.text()).not.toContain('Slot reserved');
    // Every other block that day is theirs to book, as before.
    expect(cardAt(r, '4:00').style.cursor).toBe('pointer');
    await r.unmount();
  });

  test('no handicap on file: the same line, naming the athlete and who adds it', async () => {
    mockHandicap = null;
    const r = await show();
    const card = cardAt(r, '3:00');
    expect(card.textContent).toContain(noneOnFile('Jordan'));
    expect(card.style.cursor).toBe('default');
    await tap(card);
    expect(mockBooked).toEqual([]);
    await r.unmount();
  });

  test('a full reserved block: its waitlist is offered to an eligible athlete only', async () => {
    mockMonths['2026-11-01'][0].sessions = [reserved({ booked: 6 })];
    mockHandicap = 3;
    const eligible = await show();
    expect(cardAt(eligible, '3:00').textContent).toContain('Full');
    expect(eligible.button('Join waitlist · reserves one token')).not.toBeNull();
    await eligible.unmount();
    for (const handicap of [14, null]) {
      mockHandicap = handicap;
      const r = await show();
      expect(r.text()).not.toContain('Join waitlist');
      expect(cardAt(r, '3:00').textContent).toContain(LINE);
      await tap(cardAt(r, '3:00'));
      expect(mockBookCalls).toEqual([]);
      await r.unmount();
    }
  });

  test('a parent: each child is judged on their own handicap', async () => {
    mockHousehold = [
      { id: 'k1', name: 'Ava Lund', handicap: 2, tokens },
      { id: 'k2', name: 'Nico Lund', handicap: 18, tokens },
      { id: 'k3', name: 'Mia Lund', handicap: null, tokens },
    ];
    const r = await renderScreen(<BookSession bare role="parent" demoSelectedDate="2026-11-17" />);
    // Ava (the first child) is eligible.
    expect(cardAt(r, '3:00').textContent).toContain(TAG);
    expect(cardAt(r, '3:00').style.cursor).toBe('pointer');
    expect(r.text()).not.toContain(LINE);
    await r.click('Nico Lund');
    expect(cardAt(r, '3:00').style.cursor).toBe('default');
    expect(cardAt(r, '3:00').textContent).toContain(LINE);
    expect(r.text()).not.toContain('No handicap is on file');
    await tap(cardAt(r, '3:00'));
    await r.click('Mia Lund');
    expect(cardAt(r, '3:00').textContent).toContain(noneOnFile('Mia'));
    await tap(cardAt(r, '3:00'));
    expect(mockBookCalls).toEqual([]);
    // The open block is still every child's to book.
    expect(cardAt(r, '4:00').style.cursor).toBe('pointer');
    await r.click('Ava Lund');
    await tap(cardAt(r, '3:00'));
    expect(mockBookCalls).toEqual([['tue3', { athleteId: 'k1' }]]);
    expect(r.text()).toContain('Slot reserved');
    await r.unmount();
  });

  test('an athlete already waiting when the block was reserved keeps the place and Leave', async () => {
    mockMonths['2026-11-01'][0].sessions = [reserved({ booked: 6, waitlisted: true, waitlistPosition: 1, waitlistBy: { a1: 1 } })];
    mockHandicap = 14;
    const r = await show();
    expect(r.text()).toContain('On the waitlist - #1 in line');
    expect(r.button('Leave waitlist')).not.toBeNull();
    expect(r.text()).not.toContain('Join waitlist');
    await r.unmount();
  });

  test('Elite reads the line with no token wording', async () => {
    mockPackage = { id: 'elite', kind: 'elite', windowDays: 45 };
    mockTokens = { unlimited: true, grace: [] };
    mockHandicap = null;
    const r = await show();
    expect(cardAt(r, '3:00').textContent).toContain(noneOnFile('Jordan'));
    expect(cardAt(r, '3:00').style.cursor).toBe('default');
    expect(r.text()).not.toMatch(/token/i);
    await r.unmount();
  });

  test('until the athlete row has loaded the reserved block is inert and says nothing yet', async () => {
    mockMemberLoaded = false;
    const r = await show();
    const card = cardAt(r, '3:00');
    expect(card.textContent).toContain(TAG);
    expect(card.textContent).not.toContain(LINE);
    expect(card.style.cursor).toBe('default');
    await tap(card);
    expect(mockBooked).toEqual([]);
    expect(cardAt(r, '4:00').style.cursor).toBe('pointer');
    await r.unmount();
  });

  // The membership read rejected: the row is not on its way. Holding the card back would leave an eligible athlete
  // looking at "Reserved" with no reason until a reload, so the tap goes through and the write decides.
  test('the athlete row failed to load: the reserved block is not held back, and the write decides', async () => {
    mockMemberError = new Error('The network dropped.');
    const r = await show();
    const card = cardAt(r, '3:00');
    expect(card.textContent).toContain(TAG);
    expect(card.textContent).not.toContain('Reserved');
    expect(card.style.cursor).toBe('pointer');
    await tap(card);
    expect(mockBooked).toEqual(['tue3']);
    expect(r.text()).toContain('Slot reserved');
    await r.unmount();
    // An athlete it is not for: createBooking reads the athlete itself and refuses with the card's line.
    mockBook = async () => { throw Object.assign(new Error(LINE), { reason: 'handicap-reserved' }); };
    const refused = await show();
    await tap(cardAt(refused, '3:00'));
    expect(refused.text()).toContain(`${LINE} Nothing was reserved.`);
    expect(refused.text()).not.toContain('Slot reserved');
    await refused.unmount();
  });

  test('a block with no handicap limit renders exactly as today, whatever is on file', async () => {
    const drawn = [];
    for (const row of [open, { ...open, maxHandicap: null }]) {
      for (const handicap of [null, 3, 40]) {
        mockMonths = { '2026-11-01': [{ date: '2026-11-17', sessions: [row] }] };
        mockHandicap = handicap;
        const r = await show();
        const card = cardAt(r, '4:00');
        expect(card.style.cursor).toBe('pointer');
        drawn.push(card.outerHTML);
        expect(r.text()).not.toContain('Handicap');
        expect(r.text()).not.toContain('Reserved');
        await r.unmount();
      }
    }
    expect(new Set(drawn).size).toBe(1);
    // The card as it read before the field existed: time, type chip, name, spend note, spots left.
    const r = await show();
    expect(cardAt(r, '4:00').textContent).toBe('4:00PMTrainingTraining blockSpends 1 token · 6 left4 left');
    await tap(cardAt(r, '4:00'));
    expect(mockBooked).toEqual(['tue4']);
    expect(r.text()).toContain('Slot reserved');
    await r.unmount();
  });

  test('a block reserved since the screen loaded: the write refuses with its own line, and no "try again"', async () => {
    mockMonths = { '2026-11-01': [{ date: '2026-11-17', sessions: [open] }] };
    mockHandicap = 14;
    mockBook = async () => { throw Object.assign(new Error(LINE), { reason: 'handicap-reserved' }); };
    const r = await show();
    await tap(cardAt(r, '4:00'));
    expect(r.text()).toContain(`${LINE} Nothing was reserved.`);
    expect(r.text()).not.toContain('tap the session to try again');
    expect(r.text()).not.toContain('Slot reserved');
    await r.unmount();
    // A refusal that carries no line of its own still reads plainly.
    mockBook = async () => { throw Object.assign(new Error(''), { reason: 'handicap-reserved' }); };
    const bare = await show();
    await tap(cardAt(bare, '4:00'));
    expect(bare.text()).toContain('This session is reserved for lower handicaps. Nothing was reserved.');
    await bare.unmount();
  });
});
