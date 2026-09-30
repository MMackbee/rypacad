import React, { act } from 'react';
import { renderScreen } from './testRender';
import BookSession from './BookSession';

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
// Month-aware: each monthISO gets its own days (and day marks); October is the default.
const mockMonth = (m) => ({ data: { days: mockMonths[m] ?? [], dayMarks: mockMarks[m] ?? {} }, loading: false, error: null });
jest.mock('../hooks', () => ({
  useBooking: () => ({
    data: { slots: [{ date: mockFirstSlot }], tokens: { left: 6, unlimited: false, grace: [] }, confirmation: { email: null, note: 'See you there.' }, seasonNote: null },
    loading: false, error: null,
    book: async (s) => { mockBooked.push(s.id); return {}; },
    bookRecurring: (...args) => mockBookRecurring(...args),
    bookingFor: mockBookingFor,
  }),
  useHouseholdAthletes: () => ({ data: [], loading: false }),
  useMembership: () => ({ data: { members: [{ athleteId: 'a1', package: mockPackage }] } }),
  useMonthSessions: (m) => mockMonth(m),
}));

/** The tapped day's session card: tappable cards carry cursor: pointer (SessionCard sets it from onClick). */
const sessionCard = (r) =>
  [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('4:00') && el.textContent.includes('Training block')) || null;

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
});
beforeEach(() => {
  mockBooked = [];
  mockPackage = { id: 't-12', kind: 'tokens', windowDays: 30 };
  mockFirstSlot = '2026-10-12';
  mockMonths = { '2026-10-01': [{ date: '2026-10-12', sessions: [session] }] };
  mockBookingFor = null;
  mockBookRecurring = jest.fn(async () => ({ booked: [], skipped: [], windowEnd: null, next: null }));
  mockMarks = {};
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
    expect(r.text()).toContain('Tue, Dec 22 opens 7 AM on Sat, Nov 7 — come back to add it.');
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
    expect(r.text()).toContain("Dec 1: didn't go through — Missing or insufficient permissions.");
    expect(r.text()).toContain('Tue, Dec 8 opens 7 AM on Sun, Nov 8 — come back to add it.');
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
    const tournament = { ...session, id: 't1', date: '2026-11-07', time: '10:30 AM', type: 'tournament', label: 'Tournament block' };
    mockMonths = { '2026-11-01': [{ date: '2026-11-05', sessions: [{ ...session, date: '2026-11-05' }] }, { date: '2026-11-07', sessions: [tournament] }] };
    mockMarks = { '2026-11-01': { '2026-11-07': 'tournament', '2026-11-08': 'closed' } };
    const r = await renderScreen(<BookSession bare />);
    expect(navLabel(r)).toBe('November 2026');
    expect(r.text()).toContain('Green and yellow days have bookable sessions — tap one to see times.');
    expect(r.container.querySelector('.ryp-day-mark-legend').textContent).toContain('Tournament day');
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
    await r.click('Saturday, Nov 7, tournament day');
    expect(r.text()).toContain('Tournament block');
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
