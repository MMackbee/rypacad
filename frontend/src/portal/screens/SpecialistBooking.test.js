import React, { act } from 'react';
import { renderScreen } from './testRender';
import SpecialistBooking from './SpecialistBooking';
import { addDaysISO, todayISO } from '../data/calendar';

let mockSlots;
let mockBooked = [];
jest.mock('../hooks', () => ({
  seedSpecialistDays: () => [],
  useSpecialistSlots: () => mockSlots,
  useBooking: () => ({ book: async (s) => { mockBooked.push(s); return {}; } }),
  useHouseholdAthletes: () => ({ data: [], loading: false }),
  useMembership: () => ({ data: { household: { id: 'h1' }, members: [] } }),
}));
jest.mock('../data/calendly', () => ({
  calendlyUrlFor: () => 'https://calendly.com/ryp/mental',
  calendlyLinkFor: ({ url, athleteId, athleteName, householdId, name, email }) =>
    `${url}?${new URLSearchParams({ name, email, a1: athleteName, utm_content: athleteId, utm_campaign: householdId })}`,
  CALENDLY_NOTE: "Yannick's confirmation, reminders and cancellations come from Calendly. The session appears on My Schedule within a minute and spends one token.",
}), { virtual: true });

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
  mockBooked = [];
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

test('a locked day before the gate names Oct 10, not "session date minus 30 days" (UX review #8)', async () => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-10-01T17:00:00Z'));
  try {
    mockSlots.data = { ...mockSlots.data, bookingMode: 'in-app', calendlyUrl: null, bookingOpen: false,
      days: [{ date: '2026-11-03', dayLabel: 'Tue, Nov 3', slots: [{ sessionId: 's1', time: '4:00 PM', open: true, capacity: 1, booked: 0, durationMinutes: 30 }] }] };
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    expect(r.text()).toContain('Not open for this day yet');
    expect(r.text()).toContain('Booking for Tuesday, Nov 3 opens Sat, Oct 10 at 7 AM.');
    expect(r.text()).not.toContain('Sunday, Oct 4');
    await r.unmount();
  } finally {
    jest.useRealTimers();
  }
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

  beforeEach(() => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(NOW);
    inApp();
  });
  afterEach(() => { jest.useRealTimers(); });

  test('Week is the default, on the first slot day, which is selected; a zero-slot day is not a button', async () => {
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

  test('the card carries the Book-style hint; a fully booked day is dashed, still tappable, and shows its waitlist slot (toggle review)', async () => {
    inApp({ days: [
      { date: TODAY, dayLabel: 'Today', slots: [] },
      { date: DAY_A, dayLabel: 'Fri, Oct 16', slots: [slot('s1', '4:00 PM')] },
      { date: DAY_B, dayLabel: 'Fri, Oct 23', slots: [{ ...slot('s2', '5:30 PM'), open: false, booked: 1 }] },
    ] });
    const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
    expect(r.text()).toContain('Days marked green have open times — tap one to see them. Dashed days are full — tap one for the waitlist.');
    await r.click('Next week');
    const full = pill(r, DAY_B);
    expect(full.tagName).toBe('BUTTON');
    expect(full.getAttribute('data-state')).toBe('full');
    expect(full.style.borderStyle).toBe('dashed');
    await r.click('Friday, Oct 23, full - waitlist only');
    expect(pill(r, DAY_B).getAttribute('aria-pressed')).toBe('true');
    expect(slotCard(r, '5:30')).not.toBeNull();
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
