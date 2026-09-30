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
// Month-aware: each monthISO gets its own days; October is the default.
const mockMonth = (m) => ({ data: { days: mockMonths[m] ?? [] }, loading: false, error: null });
jest.mock('../hooks', () => ({
  useBooking: () => ({
    data: { slots: [{ date: mockFirstSlot }], tokens: { left: 6, unlimited: false, grace: [] }, confirmation: { email: null, note: 'See you there.' }, seasonNote: null },
    loading: false, error: null,
    book: async (s) => { mockBooked.push(s.id); return {}; },
    bookRecurring: async () => ({}),
    bookingFor: null,
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
