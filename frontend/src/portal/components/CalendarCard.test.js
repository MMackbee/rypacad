import React, { act, useState } from 'react';
import { renderScreen } from '../screens/testRender';
import { RangeCalendarCard, SessionsCalendarCard } from './CalendarCard';
import CalendarViewToggle from './CalendarViewToggle';
import { MonthNav, shiftMonth } from './MonthCalendar';

const KEY = 'ryp.calendarView';

const navLabel = (r) => r.container.querySelector('h1')?.textContent ?? null;
const weekCells = (r) => [...(r.container.querySelector('.ryp-week-view')?.children ?? [])];
const pressed = (r, name) => r.button(name)?.getAttribute('aria-pressed');
const td = (r, iso) => r.container.querySelector(`td[data-date="${iso}"]`);
const pill = (r, iso) => r.container.querySelector(`.ryp-week-view [data-date="${iso}"]`);
const tap = async (el) => { await act(async () => { el.click(); }); };

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
  jest.useFakeTimers('modern');
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('MonthNav', () => {
  test('default arrow labels are unchanged', async () => {
    const r = await renderScreen(<MonthNav label="October 2026" onPrev={() => {}} onNext={() => {}} />);
    expect(r.button('Previous month')).not.toBeNull();
    expect(r.button('Next month')).not.toBeNull();
    expect(r.button('Previous month').disabled).toBe(false);
    expect(r.button('Previous month').style.opacity).toBe('');
    expect(navLabel(r)).toBe('October 2026');
    await r.unmount();
  });

  test('custom labels render and a disabled arrow does not fire', async () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();
    const r = await renderScreen(
      <MonthNav label="Oct 12 – 18" onPrev={onPrev} onNext={onNext} prevLabel="Previous week" nextLabel="Next week" prevDisabled />
    );
    const prev = r.button('Previous week');
    expect(prev).not.toBeNull();
    expect(r.button('Previous month')).toBeNull();
    expect(prev.disabled).toBe(true);
    expect(prev.style.opacity).toBe('0.35');
    await tap(prev);
    expect(onPrev).not.toHaveBeenCalled();
    await r.click('Next week');
    expect(onNext).toHaveBeenCalledTimes(1);
    await r.unmount();
  });
});

describe('CalendarViewToggle', () => {
  test('renders Month and Week as a labelled group of pressed-state buttons', async () => {
    const onChange = jest.fn();
    const r = await renderScreen(<CalendarViewToggle value="month" onChange={onChange} />);
    const group = r.container.querySelector('[role="group"]');
    expect(group.getAttribute('aria-label')).toBe('Calendar view');
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Month', 'Week']);
    expect(pressed(r, 'Month')).toBe('true');
    expect(pressed(r, 'Week')).toBe('false');
    await r.click('Month'); // the active option does nothing
    expect(onChange).not.toHaveBeenCalled();
    await r.click('Week');
    expect(onChange).toHaveBeenCalledWith('week');
    await r.unmount();
  });

  test('keyboard: native, focusable buttons with the focus outline left alone', async () => {
    const r = await renderScreen(<CalendarViewToggle value="week" onChange={() => {}} />);
    for (const name of ['Month', 'Week']) {
      const b = r.button(name);
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('type')).toBe('button');
      expect(b.hasAttribute('tabindex')).toBe(false);
      expect(b.style.outline).toBe('');
      b.focus();
      expect(document.activeElement).toBe(b);
    }
    await r.unmount();
  });
});

/** A screen that owns monthISO, like BookSession/Coach with useMonthNavState. */
function SessionsHarness({ initialMonth, statesByMonth = {}, loading = false, spies = {}, initialSelected = null }) {
  const [monthISO, setMonthISO] = useState(initialMonth);
  const [selected, setSelected] = useState(initialSelected);
  return (
    <SessionsCalendarCard
      monthISO={monthISO}
      changeMonth={(d) => {
        if (spies.changeMonth) spies.changeMonth(d);
        setMonthISO((m) => shiftMonth(m, d));
      }}
      loading={loading}
      dayStates={statesByMonth[monthISO] || {}}
      selected={selected}
      onSelectDay={(day) => {
        if (spies.onSelectDay) spies.onSelectDay(day);
        setSelected(day.iso);
      }}
      onNavigate={() => {
        if (spies.onNavigate) spies.onNavigate();
        setSelected(null);
      }}
      hint="HINT"
      emptyCopy={{ month: 'EMPTY MONTH', week: 'EMPTY WEEK' }}
    />
  );
}

const NOV = {
  '2026-11-01': {
    '2026-11-03': 'available',
    '2026-11-05': 'available',
    '2026-11-18': 'available',
    '2026-11-19': 'open',
  },
  '2026-12-01': { '2026-12-02': 'available' },
};

describe('SessionsCalendarCard', () => {
  test('Month is the default: the FullCalendar grid and month arrows', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const r = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={NOV} />);
    expect(pressed(r, 'Month')).toBe('true');
    expect(r.container.querySelector('.fc')).not.toBeNull();
    expect(r.button('Previous month')).not.toBeNull();
    expect(navLabel(r)).toBe('November 2026');
    expect(r.text()).toContain('HINT');
    await r.unmount();
  });

  test('Week stores the choice and shows 7 cells with week arrows', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const r = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={NOV} />);
    await r.click('Week');
    expect(window.localStorage.getItem(KEY)).toBe('week');
    expect(pressed(r, 'Week')).toBe('true');
    expect(r.container.querySelector('.fc')).toBeNull();
    expect(weekCells(r)).toHaveLength(7);
    expect(r.button('Previous week')).not.toBeNull();
    expect(r.button('Next week')).not.toBeNull();
    expect(navLabel(r)).toBe('Nov 2 – 8');
    await r.unmount();
  });

  test('the default row: selected day, else today, else first available, else the first row', async () => {
    window.localStorage.setItem(KEY, 'week');
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const a = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={NOV} initialSelected="2026-11-18" />);
    expect(navLabel(a)).toBe('Nov 16 – 22');
    expect(pill(a, '2026-11-18').getAttribute('aria-pressed')).toBe('true');
    await a.unmount();
    const b = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={NOV} />);
    expect(navLabel(b)).toBe('Nov 2 – 8');
    await b.unmount();
    // Pre-season: today (Sep 30) is outside November -> the first bookable week.
    jest.setSystemTime(new Date('2026-09-30T15:00:00'));
    const c = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={NOV} />);
    expect(navLabel(c)).toBe('Nov 2 – 8');
    expect(pill(c, '2026-11-03').tagName).toBe('BUTTON');
    await c.unmount();
    const d = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={{}} />);
    expect(navLabel(d)).toBe('Nov 1');
    await d.unmount();
  });

  test('stepping inside a month calls onNavigate, not changeMonth, and clears the selection', async () => {
    window.localStorage.setItem(KEY, 'week');
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const spies = { changeMonth: jest.fn(), onNavigate: jest.fn() };
    const r = await renderScreen(
      <SessionsHarness initialMonth="2026-11-01" statesByMonth={NOV} spies={spies} initialSelected="2026-11-05" />
    );
    expect(navLabel(r)).toBe('Nov 2 – 8');
    await r.click('Next week');
    expect(navLabel(r)).toBe('Nov 9 – 15');
    expect(spies.onNavigate).toHaveBeenCalledTimes(1);
    expect(spies.changeMonth).not.toHaveBeenCalled();
    await r.click('Previous week');
    expect(navLabel(r)).toBe('Nov 2 – 8');
    expect(pill(r, '2026-11-05').getAttribute('aria-pressed')).toBe('false');
    await r.unmount();
  });

  test('stepping off the last row changes month and lands on its first row; back again', async () => {
    window.localStorage.setItem(KEY, 'week');
    jest.setSystemTime(new Date('2026-11-30T15:00:00'));
    const spies = { changeMonth: jest.fn() };
    const r = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={NOV} spies={spies} />);
    expect(navLabel(r)).toBe('Nov 30');
    // Out-of-month days are blank: only Nov 30 is drawn on this row.
    expect(weekCells(r).filter((c) => c.hasAttribute('data-date')).map((c) => c.getAttribute('data-date'))).toEqual([
      '2026-11-30',
    ]);
    expect(weekCells(r).filter((c) => c.getAttribute('aria-hidden') === 'true')).toHaveLength(6);
    await r.click('Next week');
    expect(spies.changeMonth).toHaveBeenLastCalledWith(1);
    expect(navLabel(r)).toBe('Dec 1 – 6');
    expect(pill(r, '2026-12-02').tagName).toBe('BUTTON');
    await r.click('Previous week');
    expect(spies.changeMonth).toHaveBeenLastCalledWith(-1);
    expect(navLabel(r)).toBe('Nov 30');
    await r.unmount();
  });

  test('empty copy follows the view', async () => {
    jest.setSystemTime(new Date('2026-11-25T15:00:00'));
    const none = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={{}} />);
    expect(none.text()).toContain('EMPTY MONTH');
    await none.unmount();
    const r = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={NOV} />);
    expect(r.text()).toContain('HINT');
    await r.click('Week');
    expect(navLabel(r)).toBe('Nov 23 – 29');
    expect(r.text()).toContain('EMPTY WEEK');
    expect(r.text()).not.toContain('HINT');
    await r.click('Previous week');
    expect(r.text()).toContain('HINT');
    await r.unmount();
  });

  test('a skeleton while loading, in both views', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const bar = (r) => r.container.querySelector('div[aria-hidden="true"][style*="height"]');
    const m = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={{}} loading />);
    expect(m.container.querySelector('.fc')).toBeNull();
    expect(bar(m).style.height).toBe('220px');
    expect(m.text()).toContain('HINT');
    await m.click('Week');
    expect(m.container.querySelector('.ryp-week-view')).toBeNull();
    expect(bar(m).style.height).toBe('56px');
    expect(m.text()).not.toContain('EMPTY WEEK');
    await m.unmount();
  });

  test('a pill tap forwards { iso, day, state }; the toggle keeps the selection', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const spies = { onSelectDay: jest.fn() };
    const r = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={NOV} spies={spies} />);
    await tap(td(r, '2026-11-18'));
    expect(spies.onSelectDay).toHaveBeenLastCalledWith({ iso: '2026-11-18', day: 18, state: 'available' });
    await r.click('Week');
    expect(navLabel(r)).toBe('Nov 16 – 22');
    expect(pill(r, '2026-11-18').getAttribute('aria-pressed')).toBe('true');
    await tap(pill(r, '2026-11-18'));
    expect(spies.onSelectDay).toHaveBeenLastCalledWith({ iso: '2026-11-18', day: 18, state: 'available' });
    expect(pill(r, '2026-11-19').tagName).toBe('DIV'); // 'open' is not tappable
    await r.unmount();
  });

  test('month arrows behave as before: onNavigate then changeMonth', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    const spies = { changeMonth: jest.fn(), onNavigate: jest.fn() };
    const r = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={NOV} spies={spies} />);
    await r.click('Next month');
    expect(spies.onNavigate).toHaveBeenCalledTimes(1);
    expect(spies.changeMonth).toHaveBeenLastCalledWith(1);
    expect(navLabel(r)).toBe('December 2026');
    await r.click('Previous month');
    expect(spies.changeMonth).toHaveBeenLastCalledWith(-1);
    expect(navLabel(r)).toBe('November 2026');
    await r.unmount();
  });

  test('storage that throws opens the default view without crashing', async () => {
    jest.setSystemTime(new Date('2026-11-04T15:00:00'));
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const r = await renderScreen(<SessionsHarness initialMonth="2026-11-01" statesByMonth={NOV} />);
    expect(pressed(r, 'Month')).toBe('true');
    await r.click('Week');
    expect(pressed(r, 'Week')).toBe('true');
    expect(weekCells(r)).toHaveLength(7);
    await r.unmount();
  });
});

/** Lets a test change the card's props after mount (anchor, gridKey). */
function RangeHarness({ api, ...props }) {
  const [over, setOver] = useState({});
  api.set = setOver;
  return <RangeCalendarCard {...props} {...over} />;
}

const OCT = {
  '2026-10-05': 'logged',
  '2026-10-06': 'missed',
  '2026-10-12': 'logged',
  '2026-10-13': 'missed',
  '2026-10-14': 'open',
  '2026-10-15': 'future',
};

describe('RangeCalendarCard', () => {
  test('a single-month range: toggle only, no month nav; children render after the grid', async () => {
    jest.setSystemTime(new Date('2026-10-14T15:00:00'));
    const onSelectDay = jest.fn();
    const r = await renderScreen(
      <RangeCalendarCard rangeStart="2026-10-01" rangeEnd="2026-10-31" dayStates={OCT} onSelectDay={onSelectDay} blankOutsideRange>
        <p>LEGEND</p>
      </RangeCalendarCard>
    );
    expect(pressed(r, 'Month')).toBe('true');
    expect(r.container.querySelector('.fc')).not.toBeNull();
    expect(r.button('Previous month')).toBeNull();
    expect(navLabel(r)).toBeNull();
    expect(r.text()).toContain('LEGEND');
    await tap(td(r, '2026-10-06'));
    expect(onSelectDay).toHaveBeenLastCalledWith({ iso: '2026-10-06', day: 6, state: 'missed' });
    await r.unmount();
  });

  test('week nav is bounded, blanks outside the range, and never touches the selection', async () => {
    window.localStorage.setItem(KEY, 'week');
    jest.setSystemTime(new Date('2026-10-14T15:00:00'));
    const onSelectDay = jest.fn();
    const r = await renderScreen(
      <RangeCalendarCard rangeStart="2026-10-01" rangeEnd="2026-10-31" dayStates={OCT} onSelectDay={onSelectDay} blankOutsideRange>
        <p>LEGEND</p>
      </RangeCalendarCard>
    );
    expect(pressed(r, 'Week')).toBe('true');
    expect(navLabel(r)).toBe('Oct 12 – 18');
    expect(pill(r, '2026-10-12').tagName).toBe('BUTTON');
    expect(pill(r, '2026-10-14').tagName).toBe('DIV');
    expect(r.text()).toContain('LEGEND');
    await r.click('Previous week');
    await r.click('Previous week');
    expect(navLabel(r)).toBe('Oct 1 – 4');
    expect(weekCells(r).slice(0, 3).every((c) => c.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(r.button('Previous week').disabled).toBe(true);
    await r.click('Previous week'); // disabled: stays put
    expect(navLabel(r)).toBe('Oct 1 – 4');
    for (let i = 0; i < 4; i++) await r.click('Next week');
    expect(navLabel(r)).toBe('Oct 26 – 31');
    expect(r.button('Next week').disabled).toBe(true);
    expect(onSelectDay).not.toHaveBeenCalled();
    await r.unmount();
  });

  test('without blankOutsideRange the week label and cells run Mon–Sun', async () => {
    window.localStorage.setItem(KEY, 'week');
    jest.setSystemTime(new Date('2026-10-01T15:00:00'));
    const r = await renderScreen(<RangeCalendarCard rangeStart="2026-10-01" rangeEnd="2026-10-31" dayStates={OCT} />);
    expect(navLabel(r)).toBe('Sep 28 – Oct 4');
    expect(weekCells(r).every((c) => c.hasAttribute('data-date'))).toBe(true);
    await r.unmount();
  });

  test('the page follows anchor until the viewer navigates; toggling resets it', async () => {
    jest.setSystemTime(new Date('2026-09-30T15:00:00'));
    const api = {};
    const days = { '2026-10-02': 'available', '2026-10-20': 'available', '2026-11-10': 'available' };
    const r = await renderScreen(
      <RangeHarness api={api} rangeStart="2026-09-30" rangeEnd="2026-11-14" anchor="2026-10-02" dayStates={days} variant="booking" selected="2026-10-02" onSelectDay={() => {}} defaultView="week" />
    );
    expect(pressed(r, 'Week')).toBe('true');
    expect(navLabel(r)).toBe('Sep 28 – Oct 4');
    expect(r.button('Previous week').disabled).toBe(true);
    // The screen's default-day effect moves the anchor: the page follows.
    await act(async () => { api.set({ anchor: '2026-10-20', selected: '2026-10-20' }); });
    expect(navLabel(r)).toBe('Oct 19 – 25');
    // Once navigated, the anchor no longer drags the page.
    await r.click('Next week');
    expect(navLabel(r)).toBe('Oct 26 – Nov 1');
    await act(async () => { api.set({ anchor: '2026-10-02', selected: '2026-10-02' }); });
    expect(navLabel(r)).toBe('Oct 26 – Nov 1');
    // Month view: the months the window covers, bounded.
    await r.click('Month');
    expect(window.localStorage.getItem(KEY)).toBe('month');
    expect(navLabel(r)).toBe('October 2026');
    expect(r.button('Previous month').disabled).toBe(false);
    await r.click('Next month');
    expect(navLabel(r)).toBe('November 2026');
    expect(r.button('Next month').disabled).toBe(true);
    expect(td(r, '2026-11-10').getAttribute('role')).toBe('button');
    // Toggling back resets the page to the anchor's week.
    await r.click('Week');
    expect(navLabel(r)).toBe('Sep 28 – Oct 4');
    await r.unmount();
  });

  test('a gridKey change remounts the month grid; an unchanged key keeps it', async () => {
    jest.setSystemTime(new Date('2026-10-14T15:00:00'));
    const api = {};
    const r = await renderScreen(
      <RangeHarness api={api} rangeStart="2026-10-01" rangeEnd="2026-10-31" dayStates={OCT} gridKey={1} />
    );
    const before = r.container.querySelector('.ryp-contract-cal');
    await act(async () => { api.set({ dayStates: { ...OCT } }); });
    expect(r.container.querySelector('.ryp-contract-cal')).toBe(before);
    await act(async () => { api.set({ gridKey: 2, dayStates: { ...OCT, '2026-10-14': 'logged' } }); });
    const after = r.container.querySelector('.ryp-contract-cal');
    expect(after).not.toBe(before);
    expect(td(r, '2026-10-14').getAttribute('role')).toBe('button');
    await r.unmount();
  });

  test('stored week opens week; storage that throws opens the default', async () => {
    jest.setSystemTime(new Date('2026-10-14T15:00:00'));
    window.localStorage.setItem(KEY, 'week');
    const a = await renderScreen(<RangeCalendarCard rangeStart="2026-10-01" rangeEnd="2026-10-31" dayStates={OCT} />);
    expect(pressed(a, 'Week')).toBe('true');
    await a.unmount();
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const b = await renderScreen(<RangeCalendarCard rangeStart="2026-10-01" rangeEnd="2026-10-31" dayStates={OCT} />);
    expect(pressed(b, 'Month')).toBe('true');
    await b.unmount();
    const c = await renderScreen(<RangeCalendarCard rangeStart="2026-10-01" rangeEnd="2026-10-31" dayStates={OCT} defaultView="week" />);
    expect(pressed(c, 'Week')).toBe('true');
    await c.unmount();
  });

  test('no range yet (empty data) falls back to today without crashing', async () => {
    jest.setSystemTime(new Date('2026-10-14T15:00:00'));
    const r = await renderScreen(<RangeCalendarCard dayStates={{}} variant="booking" defaultView="week" />);
    expect(weekCells(r)).toHaveLength(7);
    expect(navLabel(r)).toBeNull();
    await r.unmount();
  });
});
