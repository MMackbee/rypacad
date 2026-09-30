import React, { act } from 'react';
import { renderScreen } from '../screens/testRender';
import WeekView from './WeekView';
import ContractCalendar from './ContractCalendar';
import { isTappableDay } from '../data/calendarViews';

const WEEK = '2026-10-05'; // Mon Oct 5 .. Sun Oct 11
const STATES = {
  '2026-10-05': 'logged',
  '2026-10-06': 'missed',
  '2026-10-07': 'open',
  '2026-10-08': 'future',
  '2026-10-09': 'available',
  '2026-10-10': 'closed',
  // Oct 11 missing -> 'weekend'
};

const cells = (r) => [...r.container.querySelector('.ryp-week-view').children];
const cell = (r, iso) => r.container.querySelector(`.ryp-week-view [data-date="${iso}"]`);

test('renders 7 cells, Monday first, weekday over date', async () => {
  const r = await renderScreen(<WeekView weekStart={WEEK} dayStates={STATES} />);
  const all = cells(r);
  expect(all).toHaveLength(7);
  expect(all.map((c) => c.getAttribute('data-date'))).toEqual([
    '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
  ]);
  expect(all[0].textContent).toBe('Mon5');
  expect(all[6].textContent).toBe('Sun11');
  await r.unmount();
});

test('booking: only available days are buttons', async () => {
  const onSelectDay = jest.fn();
  const r = await renderScreen(
    <WeekView weekStart={WEEK} dayStates={STATES} variant="booking" onSelectDay={onSelectDay} />
  );
  expect(cell(r, '2026-10-09').tagName).toBe('BUTTON');
  expect(cell(r, '2026-10-09').getAttribute('aria-label')).toBe('Friday, Oct 9');
  for (const iso of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-10', '2026-10-11']) {
    expect(cell(r, iso).tagName).toBe('DIV');
    expect(cell(r, iso).hasAttribute('tabindex')).toBe(false);
  }
  await r.unmount();
});

test('contract: logged and missed days are buttons, no aria-pressed', async () => {
  const onSelectDay = jest.fn();
  const r = await renderScreen(<WeekView weekStart={WEEK} dayStates={STATES} onSelectDay={onSelectDay} />);
  expect(cell(r, '2026-10-05').tagName).toBe('BUTTON');
  expect(cell(r, '2026-10-06').tagName).toBe('BUTTON');
  expect(cell(r, '2026-10-05').hasAttribute('aria-pressed')).toBe(false);
  for (const iso of ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) {
    expect(cell(r, iso).tagName).toBe('DIV');
  }
  await r.unmount();
});

test('a tap emits { iso, day, state } to the same handler shape as the month grid', async () => {
  const onSelectDay = jest.fn();
  const r = await renderScreen(<WeekView weekStart={WEEK} dayStates={STATES} onSelectDay={onSelectDay} />);
  await act(async () => { cell(r, '2026-10-06').click(); });
  expect(onSelectDay).toHaveBeenCalledTimes(1);
  expect(onSelectDay).toHaveBeenCalledWith({ iso: '2026-10-06', day: 6, state: 'missed' });
  await act(async () => { cell(r, '2026-10-07').click(); }); // open: not tappable
  expect(onSelectDay).toHaveBeenCalledTimes(1);
  await r.unmount();
});

test('without onSelectDay nothing is a button', async () => {
  const r = await renderScreen(<WeekView weekStart={WEEK} dayStates={STATES} variant="booking" />);
  expect(r.container.querySelectorAll('button')).toHaveLength(0);
  await r.unmount();
});

test('aria-pressed and the ring follow `selected` in booking', async () => {
  const states = { '2026-10-06': 'available', '2026-10-09': 'available' };
  const r = await renderScreen(
    <WeekView weekStart={WEEK} dayStates={states} variant="booking" selected="2026-10-09" onSelectDay={() => {}} />
  );
  expect(cell(r, '2026-10-09').getAttribute('aria-pressed')).toBe('true');
  expect(cell(r, '2026-10-06').getAttribute('aria-pressed')).toBe('false');
  expect(cell(r, '2026-10-09').style.boxShadow).toContain('0 0 0 2px');
  expect(cell(r, '2026-10-06').style.boxShadow).toBe('none');
  await r.unmount();
});

test("'closed' paints as 'open'; a missing day as 'weekend'", async () => {
  const r = await renderScreen(<WeekView weekStart={WEEK} dayStates={STATES} />);
  expect(cell(r, '2026-10-10').getAttribute('data-state')).toBe('open');
  expect(cell(r, '2026-10-11').getAttribute('data-state')).toBe('weekend');
  await r.unmount();
});

test('visibleFrom / visibleTo blank the days outside, keeping 7 slots', async () => {
  const r = await renderScreen(
    <WeekView weekStart="2026-09-28" dayStates={{}} visibleFrom="2026-10-01" visibleTo="2026-10-31" />
  );
  const all = cells(r);
  expect(all).toHaveLength(7);
  expect(all.slice(0, 3).every((c) => c.getAttribute('aria-hidden') === 'true' && !c.hasAttribute('data-date'))).toBe(true);
  expect(all.slice(3).map((c) => c.getAttribute('data-date'))).toEqual([
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  ]);
  const tail = await renderScreen(<WeekView weekStart="2026-11-30" visibleTo="2026-11-30" />);
  expect(cells(tail).filter((c) => c.hasAttribute('data-date'))).toHaveLength(1);
  await tail.unmount();
  await r.unmount();
});

describe('parity with the unmodified ContractCalendar', () => {
  const normalized = (s) => (s === 'closed' ? 'open' : s ?? 'weekend');

  for (const variant of ['contract', 'booking']) {
    test(`${variant}: the same days are tappable and emit the same payload`, async () => {
      const monthCalls = [];
      const weekCalls = [];
      const month = await renderScreen(
        <ContractCalendar start="2026-10-01" dayStates={STATES} variant={variant} onSelectDay={(d) => monthCalls.push(d)} />
      );
      const week = await renderScreen(
        <WeekView weekStart={WEEK} dayStates={STATES} variant={variant} onSelectDay={(d) => weekCalls.push(d)} />
      );
      const tds = [...month.container.querySelectorAll('td[data-date]')];
      expect(tds.length).toBeGreaterThanOrEqual(31);
      for (const td of tds) {
        const iso = td.getAttribute('data-date');
        expect([iso, td.getAttribute('role') === 'button']).toEqual([iso, isTappableDay(variant, normalized(STATES[iso]))]);
      }
      for (const iso of Object.keys(STATES).concat('2026-10-11')) {
        const td = month.container.querySelector(`td[data-date="${iso}"]`);
        const wc = cell(week, iso);
        expect([iso, wc.tagName === 'BUTTON']).toEqual([iso, td.getAttribute('role') === 'button']);
        await act(async () => { td.click(); });
        await act(async () => { wc.click(); });
      }
      expect(weekCalls).toEqual(monthCalls);
      expect(weekCalls.length).toBe(variant === 'booking' ? 1 : 2);
      await week.unmount();
      await month.unmount();
    });
  }
});
