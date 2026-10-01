import React, { act } from 'react';
import { renderScreen } from './testRender';
import SpecialistBooking from './SpecialistBooking';
import { addDaysISO, todayISO } from '../data/calendar';

let mockSlots;
let mockBooked = [];
let mockMembers = [];
// Waitlist hardening: what book() answers (default: booked), the options each
// tap sent, and the Leave waitlist write.
let mockBook = null;
let mockBookOpts = [];
let mockLeave = async () => ({});
jest.mock('../hooks', () => ({
  seedSpecialistDays: () => [],
  useSpecialistSlots: () => mockSlots,
  useBooking: () => ({ book: async (s, opts) => { mockBooked.push(s); mockBookOpts.push(opts); return mockBook ? mockBook(s, opts) : {}; } }),
  useHouseholdAthletes: () => ({ data: [], loading: false }),
  useMembership: () => ({ data: { household: { id: 'h1' }, members: mockMembers } }),
}));
jest.mock('../hooks/waitlist', () => ({ leaveWaitlist: (...args) => mockLeave(...args) }));
jest.mock('../data/calendly', () => ({
  calendlyUrlFor: () => 'https://calendly.com/ryp/mental',
  calendlyLinkFor: ({ url, athleteId, athleteName, householdId, name, email }) =>
    `${url}?${new URLSearchParams({ name, email, a1: athleteName, utm_content: athleteId, utm_campaign: householdId })}`,
  CALENDLY_NOTE: "Yannick's confirmation, reminders and cancellations come from Calendly. The session appears on My Schedule within a minute and spends one token.",
  CALENDLY_NOTE_UNLIMITED: "Yannick's confirmation, reminders and cancellations come from Calendly. The session appears on My Schedule within a minute.",
})); // not `virtual` (the file exists): see Registration.test.js

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
  mockBooked = [];
  mockBook = null;
  mockBookOpts = [];
  mockLeave = async () => ({});
  mockMembers = [];
  mockSlots = { loading: false, error: null, data: {
    days: [], tokens: { left: 3, unlimited: false, grace: [] }, capReached: false,
    bookingMode: 'calendly', calendlyUrl: 'https://calendly.com/ryp/mental', billingStatus: 'active', bookingOpen: true,
    athlete: { id: 'a1', name: 'Jordan', loginEmail: null }, guardian: { name: 'Dana', email: 'dana@email.com' }, householdId: 'h1',
  } };
});

test('Book with Yannick opens the prefilled link in a new tab, with the note', async () => {
  const opened = [];
  window.open = (url, target, features) => { opened.push([url, target, features]); return null; };
  const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  await r.click('Book with Yannick');
  expect(opened[0][1]).toBe('_blank');
  expect(opened[0][0]).toContain('utm_content=a1');
  expect(opened[0][0]).toContain('name=Jordan');
  await r.click('A parent');
  await r.click('Book with Yannick');
  expect(opened[1][0]).toContain('name=Dana');
  expect(r.text()).toContain('The session appears on My Schedule within a minute and spends one token.');
  await r.unmount();
});

test('gated copy replaces the button', async () => {
  mockSlots.data.billingStatus = 'pending';
  const p = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(p.button('Book with Yannick')).toBeNull();
  expect(p.text()).toContain('Payment pending - finish checkout to start booking');
  await p.unmount();
  mockSlots.data.billingStatus = 'active';
  mockSlots.data.bookingOpen = false;
  const g = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(g.text()).toContain('Booking opens Sat, Oct 10 at 7 AM');
  await g.unmount();
});

test('no Calendly url: the in-app slot list with real durations', async () => {
  // Two days out: inside the 30-day window whatever today is (a fixed date
  // past the window renders LockedDayNotice, not the slot list).
  mockSlots.data = { ...mockSlots.data, bookingMode: 'in-app', calendlyUrl: null,
    days: [{ date: addDaysISO(todayISO(), 2), dayLabel: 'Wed, Nov 4', slots: [{ sessionId: 's1', time: '4:00 PM', open: true, capacity: 1, booked: 0, durationMinutes: 30 }] }] };
  const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(r.button('Book with Yannick')).toBeNull();
  expect(r.text()).toContain('30 min');
  expect(r.text()).not.toContain('45 min');
  await r.unmount();
});

test('in-app branch before the gate: banner, inert cards, Reserve unreachable', async () => {
  mockSlots.data = { ...mockSlots.data, bookingMode: 'in-app', calendlyUrl: null, bookingOpen: false,
    days: [{ date: '2026-10-12', dayLabel: 'Mon, Oct 12', slots: [{ sessionId: 's1', time: '4:00 PM', open: true, capacity: 1, booked: 0, durationMinutes: 30 }] }] };
  const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(r.text()).toContain('Booking opens Sat, Oct 10 at 7 AM');
  const card = [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('4:00') && el.textContent.includes('Mental'));
  expect(card.style.cursor).toBe('default');
  expect(r.button('Reserve')).toBeNull();
  await r.unmount();
});

test('in-app branch after the gate: no banner, a tap opens the sheet with Reserve enabled', async () => {
  mockSlots.data = { ...mockSlots.data, bookingMode: 'in-app', calendlyUrl: null, bookingOpen: true,
    days: [{ date: '2026-10-12', dayLabel: 'Mon, Oct 12', slots: [{ sessionId: 's1', time: '4:00 PM', open: true, capacity: 1, booked: 0, durationMinutes: 30 }] }] };
  const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(r.text()).not.toContain('Booking opens Sat, Oct 10 at 7 AM');
  const card = [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('4:00') && el.textContent.includes('Mental'));
  expect(card.style.cursor).toBe('pointer');
  await act(async () => { card.click(); });
  expect(r.button('Reserve')).not.toBeNull();
  expect(r.button('Reserve').disabled).toBe(false);
  await r.unmount();
});

describe('the window counts from Nov 1 until then (owner ruling 2026-09-30; UX review #8)', () => {
  const slotOn = (date, dayLabel) => ({ date, dayLabel, slots: [{ sessionId: `s-${date}`, time: '4:00 PM', open: true, capacity: 1, booked: 0, durationMinutes: 30 }] });
  const slotCard = (r) => [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('4:00') && el.textContent.includes('Mental')) || null;
  beforeEach(() => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-10-01T17:00:00Z'));
  });
  afterEach(() => { jest.useRealTimers(); });

  test('a token package before the gate: Dec 2 is past Nov 1 + 30 and names Monday, Nov 2, not Oct 10', async () => {
    mockSlots.data = { ...mockSlots.data, bookingMode: 'in-app', calendlyUrl: null, bookingOpen: false,
      days: [slotOn('2026-12-02', 'Wed, Dec 2')] };
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    expect(r.text()).toContain('Not open for this day yet');
    expect(r.text()).toContain('Booking for Wednesday, Dec 2 opens 7 AM on Monday, Nov 2.');
    expect(r.text()).not.toContain('Booking for Wednesday, Dec 2 opens Sat, Oct 10');
    await r.unmount();
  });

  test('an Elite member books Dec 16 and sees Dec 17 locked', async () => {
    mockMembers = [{ athleteId: 'a1', package: { id: 'elite', kind: 'elite', windowDays: 45 } }];
    mockSlots.data = { ...mockSlots.data, bookingMode: 'in-app', calendlyUrl: null, bookingOpen: true,
      days: [slotOn('2026-12-16', 'Wed, Dec 16'), slotOn('2026-12-17', 'Thu, Dec 17')] };
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    expect(r.text()).not.toContain('Not open for this day yet');
    const card = slotCard(r);
    expect(card.style.cursor).toBe('pointer');
    await act(async () => { card.click(); });
    await r.click('Reserve');
    await r.flush();
    expect(mockBooked).toEqual([{ id: 's-2026-12-16', date: '2026-12-16', type: 'mental' }]);
    await r.unmount();

    const l = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    // Month is the default: tap the day's cell in the grid.
    await act(async () => { l.container.querySelector('td[data-date="2026-12-17"]').click(); });
    expect(l.text()).toContain('Booking for Thursday, Dec 17 opens 7 AM on Monday, Nov 2.');
    expect(slotCard(l)).toBeNull();
    await l.unmount();
  });
});

describe('Month/Week calendar card (owner request 2026-09-30)', () => {
  // Wed Oct 14 2026. The window holds today (no slots), Fri Oct 16 (+2) and
  // Fri Oct 23 (+9) - one Mon-Sun week apart.
  const NOW = new Date('2026-10-14T15:00:00');
  const TODAY = '2026-10-14';
  const DAY_A = addDaysISO(TODAY, 2);
  const DAY_B = addDaysISO(TODAY, 9);
  const slot = (sessionId, time) => ({ sessionId, time, open: true, capacity: 1, booked: 0, durationMinutes: 30 });
  const inApp = (over = {}) => {
    mockSlots.data = { ...mockSlots.data, bookingMode: 'in-app', calendlyUrl: null, bookingOpen: true,
      days: [
        { date: TODAY, dayLabel: 'Today', slots: [] },
        { date: DAY_A, dayLabel: 'Fri, Oct 16', slots: [slot('s1', '4:00 PM')] },
        { date: DAY_B, dayLabel: 'Fri, Oct 23', slots: [slot('s2', '5:30 PM')] },
      ], ...over };
  };
  const pill = (r, iso) => r.container.querySelector(`.ryp-week-view [data-date="${iso}"]`);
  const td = (r, iso) => r.container.querySelector(`td[data-date="${iso}"]`);
  const slotCard = (r, start) =>
    [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith(start) && el.textContent.includes('Mental')) || null;
  const tap = async (el) => { await act(async () => { el.click(); }); };
  // The family's own stored Week choice (Month is the default).
  const chooseWeek = () => window.localStorage.setItem('ryp.calendarView', 'week');

  beforeEach(() => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(NOW);
    inApp();
  });
  afterEach(() => { jest.useRealTimers(); });

  // Tester report 2026-09-30: Phil's calendar opened on a week strip while
  // golf opened on a month grid. Month is the default for both now.
  test('Month is the default, on the first slot day, which is selected; nothing is stored until the family picks', async () => {
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
    expect(r.button('Month').getAttribute('aria-pressed')).toBe('true');
    expect(r.button('Week').getAttribute('aria-pressed')).toBe('false');
    expect(r.container.querySelector('.fc')).not.toBeNull();
    expect(r.container.querySelector('.ryp-week-view')).toBeNull();
    expect(td(r, DAY_A).classList.contains('ryp-day-selected')).toBe(true);
    expect(td(r, DAY_A).getAttribute('role')).toBe('button');
    expect(td(r, TODAY).getAttribute('role')).toBeNull();
    expect(window.localStorage.getItem('ryp.calendarView')).toBeNull();
    await r.unmount();
  });

  test('a window across two months: month arrows and labels; Week from there steps and labels by week', async () => {
    const oct30 = '2026-10-30';
    const nov4 = '2026-11-04';
    inApp({ days: [
      { date: TODAY, dayLabel: 'Today', slots: [] },
      { date: oct30, dayLabel: 'Fri, Oct 30', slots: [slot('s1', '4:00 PM')] },
      { date: nov4, dayLabel: 'Wed, Nov 4', slots: [slot('s2', '5:30 PM')] },
    ] });
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
    expect(r.text()).toContain('October 2026');
    expect(r.button('Previous month').disabled).toBe(true);
    await r.click('Next month');
    expect(r.text()).toContain('November 2026');
    expect(r.button('Next month').disabled).toBe(true);
    expect(td(r, nov4).getAttribute('role')).toBe('button');
    await r.click('Week');
    expect(window.localStorage.getItem('ryp.calendarView')).toBe('week');
    // Week opens on the selected day's week, drawn whole across the month end.
    expect(r.text()).toContain('Oct 26 – Nov 1');
    await r.click('Next week');
    expect(r.text()).toContain('Nov 2 – 8');
    await r.click('Wednesday, Nov 4');
    expect(pill(r, nov4).getAttribute('aria-pressed')).toBe('true');
    expect(r.text()).toContain('5:30');
    await r.unmount();
  });

  test('a stored Week choice opens Week, on the first slot day, which is selected; a zero-slot day is not a button', async () => {
    chooseWeek();
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    expect(r.button('Week').getAttribute('aria-pressed')).toBe('true');
    expect(r.button('Month').getAttribute('aria-pressed')).toBe('false');
    expect(r.container.querySelector('.fc')).toBeNull();
    expect(r.text()).toContain('Oct 12 – 18');
    expect(pill(r, DAY_A).tagName).toBe('BUTTON');
    expect(pill(r, DAY_A).getAttribute('aria-pressed')).toBe('true');
    expect(pill(r, DAY_A).getAttribute('data-state')).toBe('available');
    expect(pill(r, TODAY).tagName).toBe('DIV');
    expect(pill(r, TODAY).getAttribute('data-state')).toBe('open');
    expect(slotCard(r, '4:00')).not.toBeNull();
    await r.unmount();
  });

  test("Next week, then the +9 day's pill: its slots show and a slot tap reserves through book()", async () => {
    chooseWeek();
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    await r.click('Next week');
    expect(r.text()).toContain('Oct 19 – 25');
    // Navigating never changes the selection.
    expect(slotCard(r, '4:00')).not.toBeNull();
    await r.click('Friday, Oct 23');
    expect(pill(r, DAY_B).getAttribute('aria-pressed')).toBe('true');
    expect(slotCard(r, '4:00')).toBeNull();
    const card = slotCard(r, '5:30');
    expect(card.style.cursor).toBe('pointer');
    await tap(card);
    expect(r.button('Reserve')).not.toBeNull();
    expect(r.button('Reserve').disabled).toBe(false);
    await r.click('Reserve');
    await r.flush();
    expect(mockBooked).toEqual([{ id: 's2', date: DAY_B, type: 'mental' }]);
    await r.unmount();
  });

  test('Month: the stored choice, and a tapped day selects the same slots; before the gate Reserve stays unreachable', async () => {
    chooseWeek();
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    await r.click('Month');
    expect(window.localStorage.getItem('ryp.calendarView')).toBe('month');
    expect(r.container.querySelector('.fc')).not.toBeNull();
    expect(r.container.querySelector('.ryp-week-view')).toBeNull();
    // One month in the window: no arrows.
    expect(r.button('Previous month')).toBeNull();
    expect(td(r, TODAY).getAttribute('role')).toBeNull();
    const cell = td(r, DAY_B);
    expect(cell.getAttribute('role')).toBe('button');
    await tap(cell);
    expect(slotCard(r, '5:30')).not.toBeNull();
    expect(slotCard(r, '4:00')).toBeNull();
    await r.unmount();

    inApp({ bookingOpen: false });
    const g = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    expect(g.button('Month').getAttribute('aria-pressed')).toBe('true');
    expect(g.text()).toContain('Booking opens Sat, Oct 10 at 7 AM');
    await tap(td(g, DAY_B));
    const card = slotCard(g, '5:30');
    expect(card.style.cursor).toBe('default');
    await tap(card);
    expect(g.button('Reserve')).toBeNull();
    expect(mockBooked).toEqual([]);
    await g.unmount();
  });

  // Phil's sessions: Yannick's take no waitlist (the next test).
  test('the card carries the Book-style hint; a fully booked day is dashed, still tappable, and shows its waitlist slot (toggle review)', async () => {
    inApp({ days: [
      { date: TODAY, dayLabel: 'Today', slots: [] },
      { date: DAY_A, dayLabel: 'Fri, Oct 16', slots: [slot('s1', '4:00 PM')] },
      { date: DAY_B, dayLabel: 'Fri, Oct 23', slots: [{ ...slot('s2', '5:30 PM'), open: false, booked: 1 }] },
    ] });
    chooseWeek();
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
    expect(r.text()).toContain('Days marked green have open times — tap one to see them. Dashed days are full — tap one for the waitlist.');
    await r.click('Next week');
    const full = pill(r, DAY_B);
    expect(full.tagName).toBe('BUTTON');
    expect(full.getAttribute('data-state')).toBe('full');
    expect(full.style.borderStyle).toBe('dashed');
    await r.click('Friday, Oct 23, full - waitlist only');
    expect(pill(r, DAY_B).getAttribute('aria-pressed')).toBe('true');
    expect([...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('5:30'))).toBeDefined();
    await r.unmount();
  });

  test("Yannick's sessions never offer a waitlist: a fully booked day opens nothing and a booked time is inert", async () => {
    inApp({ days: [
      { date: TODAY, dayLabel: 'Today', slots: [] },
      { date: DAY_A, dayLabel: 'Fri, Oct 16', slots: [{ ...slot('s1', '4:00 PM'), open: false, booked: 1 }, slot('s1b', '4:30 PM')] },
      { date: DAY_B, dayLabel: 'Fri, Oct 23', slots: [{ ...slot('s2', '5:30 PM'), open: false, booked: 1 }] },
    ] });
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    expect(r.text()).not.toContain('waitlist');
    // The fully booked Friday is not a day to tap.
    expect(td(r, DAY_B).getAttribute('role')).toBeNull();
    // Oct 16 has one open time: its booked time is shown, and opens nothing.
    const booked = slotCard(r, '4:00');
    expect(booked.textContent).toContain('Booked');
    expect(booked.style.cursor).toBe('default');
    await tap(booked);
    expect(r.button('Reserve')).toBeNull();
    expect(r.text()).not.toMatch(/Join waitlist/);
    await tap(slotCard(r, '4:30'));
    expect(r.button('Reserve')).not.toBeNull();
    await r.unmount();
  });

  test('an empty day no longer points at a dot that is gone; no full day, no dashed sentence', async () => {
    inApp({ days: [{ date: TODAY, dayLabel: 'Today', slots: [] }] });
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    expect(r.text()).toContain('No open times this day — pick another day.');
    expect(r.text()).not.toContain('next dot');
    expect(r.text()).toContain('Days marked green have open times — tap one to see them.');
    expect(r.text()).not.toContain('Dashed days');
    await r.unmount();
  });

  test('tournament and closed days (marked by the hook) paint in both views, with the legend', async () => {
    inApp({ days: [
      { date: TODAY, dayLabel: 'Today', slots: [], mark: 'closed' },
      { date: DAY_A, dayLabel: 'Fri, Oct 16', slots: [slot('s1', '4:00 PM')], mark: 'tournament' },
      { date: DAY_B, dayLabel: 'Fri, Oct 23', slots: [slot('s2', '5:30 PM')], mark: null },
    ] });
    chooseWeek();
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    // Every yellow day has times here, so the caption says so.
    expect(r.text()).toContain('Days marked green or yellow have open times — tap one to see them.');
    expect(r.container.querySelector('.ryp-day-mark-legend')).not.toBeNull();
    const t = pill(r, DAY_A);
    expect(t.getAttribute('aria-label')).toBe('Friday, Oct 16, Tour day');
    expect(t.getAttribute('aria-pressed')).toBe('true');
    const closed = pill(r, TODAY);
    expect(closed.tagName).toBe('DIV');
    expect(closed.getAttribute('title')).toBe('Academy closed');
    expect(closed.textContent).toContain(', academy closed');
    await r.click('Month');
    expect(td(r, DAY_A).classList.contains('ryp-mark-tournament')).toBe(true);
    expect(td(r, DAY_A).getAttribute('role')).toBe('button');
    expect(td(r, TODAY).classList.contains('ryp-mark-closed')).toBe(true);
    expect(td(r, TODAY).getAttribute('role')).toBeNull();
    expect(r.container.querySelector('.ryp-day-mark-legend')).not.toBeNull();
    await r.unmount();

    // A tournament day with no times with this specialist: yellow, but the caption keeps to green.
    inApp({ days: [
      { date: TODAY, dayLabel: 'Today', slots: [], mark: 'tournament' },
      { date: DAY_A, dayLabel: 'Fri, Oct 16', slots: [slot('s1', '4:00 PM')], mark: null },
    ] });
    window.localStorage.setItem('ryp.calendarView', 'week');
    const g = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    expect(g.text()).toContain('Days marked green have open times — tap one to see them.');
    expect(pill(g, TODAY).tagName).toBe('DIV');
    expect(pill(g, TODAY).getAttribute('data-mark')).toBe('tournament');
    expect(pill(g, TODAY).textContent).toContain(', Tour day');
    await g.unmount();
  });

  test('no toggle in the Calendly branch or at the specialist picker', async () => {
    mockSlots.data = { ...mockSlots.data, bookingMode: 'calendly', calendlyUrl: 'https://calendly.com/ryp/mental' };
    const c = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    expect(c.button('Book with Yannick')).not.toBeNull();
    expect(c.button('Week')).toBeNull();
    expect(c.button('Month')).toBeNull();
    await c.unmount();
    const p = await renderScreen(<SpecialistBooking bare />);
    expect(p.button('Week')).toBeNull();
    expect(p.button('Month')).toBeNull();
    await p.unmount();
  });

  test('week arrows stop at the ends of the window', async () => {
    chooseWeek();
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    expect(r.button('Previous week').disabled).toBe(true);
    expect(r.button('Next week').disabled).toBe(false);
    await r.click('Next week');
    expect(r.button('Next week').disabled).toBe(true);
    expect(r.button('Previous week').disabled).toBe(false);
    await r.unmount();
  });

  // Owner bug 2026-09-30: "the week view cant be scrolled when using a
  // desktop, only on mobile". The old 14-day strip was an overflowX:auto row
  // with its scrollbar hidden (scrollbarWidth:none): a finger could swipe it,
  // a mouse could not. The week view now fits with no horizontal scroller and
  // pages with buttons, so every day in the window is reachable by clicking.
  test('desktop: no hidden horizontal scroller; every slot day of a 14-day window is reachable by clicking', async () => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const date = addDaysISO(TODAY, i);
      return { date, dayLabel: date, slots: [slot(`w${i}`, i === 13 ? '6:15 PM' : '4:00 PM')] };
    });
    inApp({ days });
    chooseWeek();
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    const sideScrollers = [...r.container.querySelectorAll('*')].filter(
      (el) =>
        ['auto', 'scroll'].includes(el.style.overflowX) ||
        ['auto', 'scroll'].includes(el.style.overflow) ||
        el.style.scrollbarWidth === 'none'
    );
    expect(sideScrollers).toEqual([]);
    const row = r.container.querySelector('.ryp-week-view');
    expect(row.style.display).toBe('grid');
    expect(row.style.gridTemplateColumns.replace(/\s/g, '')).toBe('repeat(7,minmax(0,1fr))');

    const reached = new Set();
    const collect = () =>
      r.container
        .querySelectorAll('.ryp-week-view button[data-date]')
        .forEach((b) => reached.add(b.getAttribute('data-date')));
    collect();
    for (let i = 0; i < 6 && !r.button('Next week').disabled; i += 1) {
      await r.click('Next week');
      collect();
    }
    expect(r.button('Next week').disabled).toBe(true);
    expect([...reached].sort()).toEqual(days.map((d) => d.date));

    const last = days[13].date;
    await tap(pill(r, last));
    expect(pill(r, last).getAttribute('aria-pressed')).toBe('true');
    expect(slotCard(r, '6:15')).not.toBeNull();
    await r.unmount();
  });
});

// Audit 2026-09-30, owner rulings R2-R4: Phil's sessions (Yannick's take no waitlist).
describe('waitlist hardening on the Phil screen', () => {
  // Wed Oct 14 2026, 3:00 PM. The list opens on Fri Oct 16.
  const NOW = new Date('2026-10-14T15:00:00');
  const TODAY = '2026-10-14';
  const DAY = '2026-10-16';
  const phil = (sessionId, time, over = {}) => ({ sessionId, time, open: true, capacity: 6, booked: 2, durationMinutes: 45, ...over });
  const card = (r, start) => [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith(start)) || null;
  const tap = async (el) => { await act(async () => { el.click(); }); };
  const refusal = (reason, message) => Object.assign(new Error(message), { reason });
  const days = (slots, date = DAY) => [{ date: TODAY, dayLabel: 'Today', slots: date === TODAY ? slots : [] }, ...(date === TODAY ? [] : [{ date, dayLabel: 'Fri, Oct 16', slots }])];

  beforeEach(() => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(NOW);
    mockSlots.data = { ...mockSlots.data, bookingMode: 'in-app', calendlyUrl: null, bookingOpen: true,
      days: days([
        phil('p-full', '3:00 PM', { open: false, booked: 6 }),
        phil('p-open', '3:45 PM'),
        phil('p-wait', '4:30 PM', { open: false, booked: 6, waitlisted: true, waitlistPosition: 2 }),
      ]) };
  });
  afterEach(() => { jest.useRealTimers(); });

  test('a full time says what joining means, and Join waitlist asks for a waitlist place', async () => {
    mockBook = async () => ({ status: 'waitlisted', position: 1 });
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
    await tap(card(r, '3:00'));
    expect(r.text()).toContain('This time is full. If a spot opens, Jordan is booked automatically and one token is used. You can cancel until the day before.');
    expect(r.text()).not.toMatch(/notif/i);
    await r.click('Join waitlist · reserves one token');
    await r.flush();
    expect(mockBookOpts).toEqual([{ joinWaitlist: true }]);
    expect(r.text()).toContain("You're on the waitlist");
    expect(r.text()).toContain('On the waitlist - #1 in line');
    await r.unmount();
  });

  test('Reserve on a time that just filled: told so, nothing joined, and Join waitlist becomes its own tap', async () => {
    mockBook = async (s, opts) => {
      if (!opts?.joinWaitlist) throw refusal('full', 'This session just filled.');
      return { status: 'waitlisted', position: null };
    };
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
    await tap(card(r, '3:45'));
    await r.click('Reserve');
    await r.flush();
    expect(mockBookOpts).toEqual([{}]);
    expect(r.text()).toContain('This session just filled. Nothing was reserved.');
    expect(r.text()).not.toContain("You're on the waitlist");
    expect(r.button('Reserve')).toBeNull();
    await r.click('Join waitlist · reserves one token');
    await r.flush();
    expect(mockBookOpts[1]).toEqual({ joinWaitlist: true });
    expect(r.text()).toContain("You're on the waitlist");
    // No place from the server: no number.
    expect(r.text()).toContain('On the waitlist');
    expect(r.text()).not.toContain('in line');
    await r.unmount();
  });

  test('already waiting: the card and the sheet say so and offer Leave, never Join again', async () => {
    const left = [];
    mockLeave = async (args) => { left.push(args); };
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
    expect(card(r, '4:30').textContent).toContain('Waitlisted');
    await tap(card(r, '4:30'));
    expect(r.text()).toContain('On the waitlist - #2 in line');
    expect(r.text()).toContain('If a spot opens, Jordan is booked automatically and one token is used.');
    expect(r.button('Join waitlist · reserves one token')).toBeNull();
    expect(r.button('Reserve')).toBeNull();
    await r.click('Leave waitlist');
    await r.flush();
    expect(left).toEqual([{ sessionId: 'p-wait', athleteId: 'a1' }]);
    // The sheet closed.
    expect(r.button('Leave waitlist')).toBeNull();
    await r.unmount();
  });

  test('a leave refused because the athlete was just promoted says so by name', async () => {
    mockLeave = async () => { throw refusal('promoted', 'This athlete was just booked into this session.'); };
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
    await tap(card(r, '4:30'));
    await r.click('Leave waitlist');
    await r.flush();
    expect(r.text()).toContain('Jordan was just booked into this session.');
    await r.unmount();
  });

  test('a waitlisted time still opens when the last token is the one held', async () => {
    mockSlots.data.tokens = { left: 0, used: 5, granted: 6, reserved: 1, unlimited: false, grace: [] };
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
    expect(card(r, '3:45').style.cursor).toBe('default');
    // The screen says where the last token went, as Book a Session's banner does.
    expect(r.text()).toContain('No tokens left');
    expect(r.text()).toContain('1 held on a waitlist');
    await tap(card(r, '4:30'));
    expect(r.button('Leave waitlist')).not.toBeNull();
    await r.unmount();
  });

  // Review 2026-10-01: the booking check spends a bonus token only on a
  // session dated on or before its expiry (live.js selectGraceToken), so the
  // sheet judges it per time, as Book a Session's cards do.
  describe('a bonus token is judged per time', () => {
    const bonus = (expiresAt) => [{ id: 'g1', expiresAt, reason: 'session-cancelled' }];

    test('period at zero and the bonus token expires before the time: no Reserve, no Join waitlist', async () => {
      mockSlots.data.tokens = { left: 0, used: 6, granted: 6, unlimited: false, grace: bonus('2026-10-15') };
      const open = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
      await tap(card(open, '3:45'));
      expect(open.text()).toContain('No tokens left');
      expect(open.button('Reserve')).toBeNull();
      await open.unmount();

      const full = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
      await tap(card(full, '3:00'));
      expect(full.text()).toContain('This time is full.');
      expect(full.text()).not.toContain('If a spot opens');
      expect(full.text()).not.toContain('Join waitlist');
      await full.unmount();
    });

    test('a bonus token that covers the time is spent on it', async () => {
      mockSlots.data.tokens = { left: 0, used: 6, granted: 6, unlimited: false, grace: bonus('2026-10-16') };
      const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
      await tap(card(r, '3:45'));
      expect(r.text()).not.toContain('No tokens left');
      expect(r.button('Reserve')).not.toBeNull();
      await r.unmount();
    });

    test('with period tokens left, a time past the bonus token spends a period token', async () => {
      mockSlots.data.tokens = { left: 2, used: 4, granted: 6, unlimited: false, grace: bonus('2026-10-15') };
      const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
      await tap(card(r, '3:45'));
      expect(r.text()).toContain('Spends 1 token · 2 left');
      expect(r.button('Reserve')).not.toBeNull();
      await r.unmount();
    });
  });

  test('the confirmation says what the booking was actually charged to', async () => {
    mockBook = async () => ({ status: 'confirmed', chargedFrom: 'grace' });
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
    await tap(card(r, '3:45'));
    await r.click('Reserve');
    await r.flush();
    expect(r.text()).toContain('Reservation confirmed');
    expect(r.text()).toContain('Spends a bonus token.');
    await r.unmount();
  });

  test('a refusal a second tap can change keeps "try again", with a hyphen', async () => {
    mockBook = async () => { throw new Error('The network dropped.'); };
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
    await tap(card(r, '3:45'));
    await r.click('Reserve');
    await r.flush();
    expect(r.text()).toContain('The network dropped. Nothing was reserved - try again.');
    await r.unmount();
  });

  test('no same-day promotion: a full time today takes no new waitlist place', async () => {
    mockSlots.data.days = days([phil('p-today', '6:00 PM', { open: false, booked: 6 })], TODAY);
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
    await tap(card(r, '6:00'));
    expect(r.text()).toContain('This time is full.');
    expect(r.text()).not.toContain('If a spot opens');
    expect(r.text()).not.toContain('Join waitlist');
    await r.unmount();
  });

  describe('Elite reads no token wording', () => {
    beforeEach(() => {
      mockMembers = [{ athleteId: 'a1', name: 'Jordan', package: { id: 'elite', kind: 'elite', windowDays: 45 } }];
      mockSlots.data.tokens = { unlimited: true, left: null, grace: [] };
    });

    test('the full sheet, the join button and the waitlisted confirmation', async () => {
      mockBook = async () => ({ status: 'waitlisted', position: 3 });
      const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
      await tap(card(r, '3:00'));
      expect(r.text()).toContain('This time is full. If a spot opens, Jordan is booked automatically. You can cancel until the day before.');
      expect(r.text()).not.toMatch(/token/i);
      await r.click('Join waitlist');
      await r.flush();
      expect(r.text()).toContain('On the waitlist - #3 in line');
      expect(r.text()).not.toMatch(/token/i);
      await r.unmount();
    });

    test('the confirmation says the session is included, with a hyphen', async () => {
      mockBook = async () => ({ status: 'confirmed', chargedFrom: 'elite' });
      const r = await renderScreen(<SpecialistBooking bare initialSpecialist="phil" />);
      await tap(card(r, '3:45'));
      await r.click('Reserve');
      await r.flush();
      expect(r.text()).toContain('Spends nothing - included with Elite.');
      await r.unmount();
    });

    test('the specialist picker drops its token line; a token member keeps it', async () => {
      const elite = await renderScreen(<SpecialistBooking bare />);
      expect(elite.text()).toContain('Phil');
      expect(elite.text()).not.toMatch(/token/i);
      await elite.unmount();

      mockMembers = [{ athleteId: 'a1', name: 'Jordan', package: { id: 't-12', kind: 'tokens', windowDays: 30 } }];
      const member = await renderScreen(<SpecialistBooking bare />);
      expect(member.text()).toContain('Sessions with Phil and Yannick use a token, same as any other session.');
      await member.unmount();
    });

    test("Yannick's in-app sheet and Calendly note say nothing of tokens", async () => {
      mockSlots.data.days = days([{ sessionId: 'm1', time: '4:00 PM', open: true, capacity: 1, booked: 0, durationMinutes: 30 }]);
      const sheet = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
      await tap(card(sheet, '4:00'));
      expect(sheet.text()).toContain('Either way this books the session for the athlete. Yannick sees who to expect.');
      expect(sheet.text()).not.toMatch(/token/i);
      await sheet.unmount();

      mockSlots.data = { ...mockSlots.data, bookingMode: 'calendly', calendlyUrl: 'https://calendly.com/ryp/mental' };
      const panel = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
      expect(panel.text()).toContain('The session appears on My Schedule within a minute.');
      expect(panel.text()).not.toMatch(/token/i);
      await panel.unmount();
    });
  });
});
