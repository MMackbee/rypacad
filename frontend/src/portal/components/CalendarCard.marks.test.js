/**
 * Booking day marks on the shared calendar cards (owner ruling 2026-09-30):
 * tournament days yellow, closed days red, in Month and Week, with the legend;
 * plus the month-grid rules that came with the week view across months - only
 * in-month days are painted, and a blank out-of-month cell is never a focus
 * stop. Split out of CalendarCard.test.js to keep both under 500 lines.
 */
import React, { act, useState } from 'react';
import { renderScreen } from '../screens/testRender';
import { RangeCalendarCard, SessionsCalendarCard } from './CalendarCard';
import ContractCalendar from './ContractCalendar';
import { shiftMonth } from './MonthCalendar';

const KEY = 'ryp.calendarView';

const navLabel = (r) => r.container.querySelector('h1')?.textContent ?? null;
const td = (r, iso) => r.container.querySelector(`td[data-date="${iso}"]`);
const pill = (r, iso) => r.container.querySelector(`.ryp-week-view [data-date="${iso}"]`);
const tap = async (el) => { await act(async () => { el.click(); }); };
const cssText = (r) => [...r.container.querySelectorAll('style')].map((s) => s.textContent).join('\n');
const legend = (r) => r.container.querySelector('.ryp-day-mark-legend');

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
  jest.useFakeTimers('modern');
});
afterEach(() => {
  jest.useRealTimers();
});

/** A screen that owns monthISO and hands over the loaded grid's states and marks. */
function Harness({ initialMonth, statesByMonth = {}, marksByMonth = {}, spies = {}, initialSelected = null }) {
  const [monthISO, setMonthISO] = useState(initialMonth);
  const [selected, setSelected] = useState(initialSelected);
  return (
    <SessionsCalendarCard
      monthISO={monthISO}
      changeMonth={(d) => {
        if (spies.changeMonth) spies.changeMonth(d);
        setMonthISO((m) => shiftMonth(m, d));
      }}
      loading={false}
      dayStates={statesByMonth[monthISO] || {}}
      dayMarks={marksByMonth[monthISO] || {}}
      selected={selected}
      onSelectDay={(day) => setSelected(day.iso)}
      onNavigate={() => {
        if (spies.onNavigate) spies.onNavigate();
        setSelected(null);
      }}
      hint="HINT"
      emptyCopy={{ month: 'EMPTY MONTH', week: 'EMPTY WEEK' }}
    />
  );
}

// November's grid-wide load (Oct 26 - Dec 6): Sat Nov 7 a tournament, Sun Nov
// 8 closed, and the boundary week's Dec 2 / Dec 5 / Dec 6 in the same load.
const STATES = {
  '2026-11-01': { '2026-11-05': 'available', '2026-11-07': 'available', '2026-12-02': 'available', '2026-12-05': 'available' },
  '2026-12-01': { '2026-12-02': 'available', '2026-12-05': 'available' },
};
const MARKS = {
  '2026-11-01': { '2026-11-07': 'tournament', '2026-11-08': 'closed', '2026-12-05': 'tournament', '2026-12-06': 'closed' },
  '2026-12-01': { '2026-12-05': 'tournament', '2026-12-06': 'closed' },
};

describe('SessionsCalendarCard marks', () => {
  test('Month: marked cells get ryp-mark-* classes, the star and screen-reader words; a closed day is never a button', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const r = await renderScreen(<Harness initialMonth="2026-11-01" statesByMonth={STATES} marksByMonth={MARKS} />);
    const t = td(r, '2026-11-07');
    expect(t.classList.contains('ryp-mark-tournament')).toBe(true);
    expect(t.getAttribute('role')).toBe('button');
    // The cell's accessible name is its day-number anchor: the date, then the words (the star is hidden).
    const name = document.getElementById(t.getAttribute('aria-labelledby'));
    expect(name.textContent).toBe('7★, tournament day');
    expect(name.querySelector('.ryp-mark-glyph').getAttribute('aria-hidden')).toBe('true');
    expect(name.querySelector('.ryp-sr').textContent).toBe(', tournament day');
    const c = td(r, '2026-11-08');
    expect(c.classList.contains('ryp-mark-closed')).toBe(true);
    expect(c.getAttribute('role')).toBeNull();
    expect(c.hasAttribute('tabindex')).toBe(false);
    expect(c.getAttribute('title')).toBe('Academy closed');
    expect(document.getElementById(c.getAttribute('aria-labelledby')).textContent).toBe('8, academy closed');
    // Unmarked days keep the plain number and no title.
    expect(td(r, '2026-11-05').textContent).toBe('5');
    expect(td(r, '2026-11-05').hasAttribute('title')).toBe(false);
    const css = cssText(r);
    expect(css).toContain('.ryp-contract-cal .ryp-mark-closed .fc-daygrid-day-number { text-decoration: line-through; }');
    expect(css).toContain('.ryp-contract-cal .ryp-mark-tournament .fc-daygrid-day-frame {\n  background: rgba(244,238,25,.10); border-color: #F4EE19;');
    await tap(c);
    expect(c.classList.contains('ryp-day-selected')).toBe(false);
    await r.unmount();
  });

  test('Month paints only the month: an out-of-month day in the data is never a button, marked, or titled', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const r = await renderScreen(<Harness initialMonth="2026-11-01" statesByMonth={STATES} marksByMonth={MARKS} />);
    const buttons = [...r.container.querySelectorAll('td[role="button"]')].map((el) => el.getAttribute('data-date'));
    expect(buttons).toEqual(['2026-11-05', '2026-11-07']);
    const blanks = [...r.container.querySelectorAll('td.fc-day-disabled')];
    expect(blanks.length).toBe(12); // Oct 26 - 31 and Dec 1 - 6
    for (const b of blanks) {
      expect([b.hasAttribute('role') && b.getAttribute('role') !== 'gridcell', b.hasAttribute('tabindex'), b.hasAttribute('title')]).toEqual([false, false, false]);
      expect(b.className).not.toContain('ryp-');
    }
    await r.unmount();
  });

  test('the legend shows under the grid in both views, and not without dayMarks', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const r = await renderScreen(<Harness initialMonth="2026-11-01" statesByMonth={STATES} marksByMonth={MARKS} />);
    expect(legend(r).textContent).toBe('★Tournament day7Academy closed');
    expect([...legend(r).querySelectorAll('[data-mark]')].every((chip) => chip.getAttribute('aria-hidden') === 'true')).toBe(true);
    await r.click('Week');
    expect(legend(r)).not.toBeNull();
    await r.unmount();
    // Even with no mark in view the legend stays, so the card never jumps.
    const empty = await renderScreen(<Harness initialMonth="2026-10-01" />);
    expect(legend(empty)).not.toBeNull();
    await empty.unmount();
    const none = await renderScreen(
      <SessionsCalendarCard monthISO="2026-11-01" changeMonth={() => {}} dayStates={STATES['2026-11-01']} onSelectDay={() => {}} hint="HINT" />
    );
    expect(legend(none)).toBeNull();
    expect(none.container.querySelector('[class*="ryp-mark-"]')).toBeNull();
    await none.unmount();
  });

  test('Week paints the boundary week from the one load: the tournament Dec 5 and the closed Dec 6', async () => {
    window.localStorage.setItem(KEY, 'week');
    jest.setSystemTime(new Date('2026-11-30T15:00:00'));
    const r = await renderScreen(<Harness initialMonth="2026-11-01" statesByMonth={STATES} marksByMonth={MARKS} />);
    expect(navLabel(r)).toBe('Nov 30 – Dec 6');
    expect(pill(r, '2026-12-05').getAttribute('aria-label')).toBe('Saturday, Dec 5, tournament day');
    expect(pill(r, '2026-12-06').tagName).toBe('DIV');
    expect(pill(r, '2026-12-06').getAttribute('title')).toBe('Academy closed');
    await r.unmount();
  });

  test('switching to Month with an out-of-month selection moves to that month and keeps the selection', async () => {
    window.localStorage.setItem(KEY, 'week');
    jest.setSystemTime(new Date('2026-11-30T15:00:00'));
    const spies = { changeMonth: jest.fn(), onNavigate: jest.fn() };
    const r = await renderScreen(<Harness initialMonth="2026-11-01" statesByMonth={STATES} marksByMonth={MARKS} spies={spies} />);
    await tap(pill(r, '2026-12-02'));
    expect(pill(r, '2026-12-02').getAttribute('aria-pressed')).toBe('true');
    await r.click('Month');
    expect(spies.changeMonth).toHaveBeenCalledWith(1);
    expect(spies.onNavigate).not.toHaveBeenCalled();
    expect(navLabel(r)).toBe('December 2026');
    expect(td(r, '2026-12-02').classList.contains('ryp-day-selected')).toBe(true);
    // Back to Week: the selected day's row; to Month again: already there.
    await r.click('Week');
    expect(navLabel(r)).toBe('Nov 30 – Dec 6');
    await r.click('Month');
    expect(spies.changeMonth).toHaveBeenCalledTimes(1);
    await r.unmount();
  });

  test('a selected tournament day keeps the green fill (the selected rule outranks the mark) and its star', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const r = await renderScreen(<Harness initialMonth="2026-11-01" statesByMonth={STATES} marksByMonth={MARKS} initialSelected="2026-11-07" />);
    const t = td(r, '2026-11-07');
    expect(['ryp-day-selected', 'ryp-day-available', 'ryp-mark-tournament'].every((c) => t.classList.contains(c))).toBe(true);
    // Four classes beat the mark's three, wherever the rules sit.
    expect(cssText(r)).toContain('.ryp-cal-month .ryp-day-selected.ryp-day-available .fc-daygrid-day-frame { background: #00AF51; color: #000; }');
    expect(t.textContent).toContain('★');
    await r.unmount();
  });
});

/** Lets a test change the card's props after mount. */
function RangeHarness({ api, ...props }) {
  const [over, setOver] = useState({});
  api.set = setOver;
  return <RangeCalendarCard {...props} {...over} />;
}

describe('RangeCalendarCard marks (Phil)', () => {
  test('a full tournament day stays yellow and turns dashed, in both views', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const states = { '2026-11-06': 'available', '2026-11-07': 'full', '2026-11-08': 'open' };
    const r = await renderScreen(
      <RangeCalendarCard rangeStart="2026-11-04" rangeEnd="2026-11-17" dayStates={states} dayMarks={{ '2026-11-07': 'tournament', '2026-11-08': 'closed' }} variant="booking" onSelectDay={() => {}} />
    );
    const css = cssText(r);
    expect(css).toContain('.ryp-cal-month td[data-date="2026-11-07"]:not(.ryp-day-selected) .fc-daygrid-day-frame { border-style: dashed; }');
    expect(css).not.toContain('td[data-date="2026-11-07"]:not(.ryp-day-selected) .fc-daygrid-day-frame { background: transparent');
    expect(td(r, '2026-11-07').getAttribute('role')).toBe('button');
    expect(td(r, '2026-11-08').getAttribute('role')).toBeNull();
    expect(legend(r)).not.toBeNull();
    await r.click('Week');
    const full = pill(r, '2026-11-07');
    expect(full.style.borderStyle).toBe('dashed');
    expect(full.style.background).toBe('rgba(244, 238, 25, 0.1)');
    expect(legend(r)).not.toBeNull();
    await r.unmount();
  });

  test('a changed mark remounts the month grid; unchanged marks keep it', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const api = {};
    const marks = { '2026-11-07': 'tournament' };
    const r = await renderScreen(
      <RangeHarness api={api} rangeStart="2026-11-04" rangeEnd="2026-11-17" dayStates={{}} dayMarks={marks} variant="booking" />
    );
    const before = r.container.querySelector('.ryp-contract-cal');
    await act(async () => { api.set({ dayMarks: { ...marks } }); });
    expect(r.container.querySelector('.ryp-contract-cal')).toBe(before);
    await act(async () => { api.set({ dayMarks: { ...marks, '2026-11-08': 'closed' } }); });
    expect(r.container.querySelector('.ryp-contract-cal')).not.toBe(before);
    expect(td(r, '2026-11-08').classList.contains('ryp-mark-closed')).toBe(true);
    await r.unmount();
  });

  test('across months, a blank out-of-month cell never becomes a focus stop', async () => {
    jest.setSystemTime(new Date('2026-10-20T15:00:00'));
    // October's grid runs Sep 28 - Nov 1 with both ends drawn blank - but Nov 1
    // is bookable in the window, and a (stray) mark sits on Sep 30.
    const r = await renderScreen(
      <RangeCalendarCard rangeStart="2026-10-20" rangeEnd="2026-11-14" dayStates={{ '2026-10-22': 'available', '2026-11-01': 'available' }} dayMarks={{ '2026-09-30': 'closed' }} variant="booking" onSelectDay={() => {}} />
    );
    expect(navLabel(r)).toBe('October 2026');
    const blanks = [...r.container.querySelectorAll('td.fc-day-disabled')];
    expect(blanks.length).toBeGreaterThan(0);
    expect(blanks.some((b) => b.getAttribute('role') === 'button' || b.hasAttribute('tabindex') || b.hasAttribute('title'))).toBe(false);
    expect(td(r, '2026-10-22').getAttribute('role')).toBe('button');
    await r.unmount();
  });
});

describe('ContractCalendar', () => {
  test("'inactive' paints as a weekend and is never tappable; the contract variant ignores marks", async () => {
    const onSelectDay = jest.fn();
    const r = await renderScreen(
      <ContractCalendar
        start="2026-10-01"
        dayStates={{ '2026-10-05': 'inactive', '2026-10-06': 'logged' }}
        dayMarks={{ '2026-10-06': 'closed', '2026-10-05': 'tournament' }}
        onSelectDay={onSelectDay}
      />
    );
    const off = td(r, '2026-10-05');
    expect(off.classList.contains('ryp-day-inactive')).toBe(true);
    expect(off.getAttribute('role')).toBeNull();
    expect(cssText(r)).toContain('.ryp-contract-cal .ryp-day-inactive .fc-daygrid-day-frame {\n  background: transparent; border-color: #1c1c1c; color: #3a3a3a;');
    await tap(off);
    expect(onSelectDay).not.toHaveBeenCalled();
    expect(td(r, '2026-10-06').getAttribute('role')).toBe('button');
    expect(r.container.querySelector('[class*="ryp-mark-"]')).toBeNull();
    expect(td(r, '2026-10-06').textContent).toBe('6');
    await tap(td(r, '2026-10-06'));
    expect(onSelectDay).toHaveBeenCalledWith({ iso: '2026-10-06', day: 6, state: 'logged' });
    await r.unmount();
  });
});
