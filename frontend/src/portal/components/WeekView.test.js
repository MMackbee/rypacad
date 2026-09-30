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

// WCAG relative luminance / contrast, for 'rgb(r, g, b)' or '#rrggbb'.
const channels = (c) => (c.startsWith('#') ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c.match(/\d+/g).slice(0, 3).map(Number));
const luminance = (c) => {
  const [r, g, b] = channels(c).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const CARD = '#1A1A1A'; // Card large's surface, what a transparent pill sits on

test('days without sessions are readable: weekday and date >= 4.5:1 on the card (toggle review)', async () => {
  const r = await renderScreen(<WeekView weekStart={WEEK} dayStates={{ '2026-10-07': 'open', '2026-10-08': 'future' }} variant="booking" onSelectDay={() => {}} />);
  // Mon, Tue and Fri-Sun have no key -> 'weekend'; Wed/Thu are 'open'/'future' on the dimmed fill.
  for (const iso of ['2026-10-05', '2026-10-06', '2026-10-09', '2026-10-10', '2026-10-11']) {
    const c = cell(r, iso);
    expect(c.getAttribute('data-state')).toBe('weekend');
    expect(contrast(c.style.color, CARD)).toBeGreaterThanOrEqual(4.5);
    expect(c.style.borderColor).not.toBe('rgb(28, 28, 28)'); // the invisible #1c1c1c outline is gone
  }
  for (const iso of ['2026-10-07', '2026-10-08']) {
    expect(contrast(cell(r, iso).style.color, '#141414')).toBeGreaterThanOrEqual(4.5);
  }
  await r.unmount();
});

test('the selected bookable day is filled solid green with black text, not just ringed (toggle review)', async () => {
  const states = { '2026-10-06': 'available', '2026-10-09': 'available' };
  const r = await renderScreen(
    <WeekView weekStart={WEEK} dayStates={states} variant="booking" selected="2026-10-09" onSelectDay={() => {}} />
  );
  const on = cell(r, '2026-10-09');
  const off = cell(r, '2026-10-06');
  expect(on.style.background).toBe('rgb(0, 175, 81)');
  expect(on.style.color).toBe('rgb(0, 0, 0)');
  expect(contrast(on.style.color, '#00AF51')).toBeGreaterThanOrEqual(4.5);
  expect(off.style.background).not.toBe('rgb(0, 175, 81)');
  await r.unmount();
  // The contract calendar keeps its ring-only selection (a missed day stays red).
  const c = await renderScreen(<WeekView weekStart={WEEK} dayStates={STATES} selected="2026-10-06" onSelectDay={() => {}} />);
  expect(cell(c, '2026-10-06').style.background).not.toBe('rgb(0, 175, 81)');
  expect(cell(c, '2026-10-06').style.boxShadow).toContain('0 0 0 2px');
  await c.unmount();
});

test("a 'full' day is tappable (its waitlist) but not painted like a day with open spots", async () => {
  const onSelectDay = jest.fn();
  const states = { '2026-10-06': 'available', '2026-10-09': 'full' };
  const r = await renderScreen(<WeekView weekStart={WEEK} dayStates={states} variant="booking" onSelectDay={onSelectDay} />);
  const full = cell(r, '2026-10-09');
  const open = cell(r, '2026-10-06');
  expect(full.tagName).toBe('BUTTON');
  expect(full.getAttribute('aria-label')).toBe('Friday, Oct 9, full - waitlist only');
  expect(full.style.borderStyle).toBe('dashed');
  expect(open.style.borderStyle).toBe('solid');
  expect(full.style.background).not.toBe(open.style.background);
  expect(full.style.color).not.toBe(open.style.color);
  expect(contrast(full.style.color, CARD)).toBeGreaterThanOrEqual(4.5);
  await act(async () => { full.click(); });
  expect(onSelectDay).toHaveBeenCalledWith({ iso: '2026-10-09', day: 9, state: 'full' });
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

// Owner bug 2026-09-30 ("the week view cant be scrolled when using a
// desktop"): the row fits its container at any width - 7 equal columns that
// may shrink - so there is never a sideways scroll for a mouse to miss.
test('fits any width: 7 equal, shrinkable columns and no horizontal scroller', async () => {
  const r = await renderScreen(
    <WeekView weekStart={WEEK} dayStates={STATES} variant="booking" onSelectDay={() => {}} />
  );
  const row = r.container.querySelector('.ryp-week-view');
  expect(row.style.display).toBe('grid');
  expect(row.style.gridTemplateColumns.replace(/\s/g, '')).toBe('repeat(7,minmax(0,1fr))');
  expect(row.style.overflowX).toBe('');
  expect(row.style.overflow).toBe('');
  for (const c of cells(r)) {
    expect(parseFloat(c.style.minWidth)).toBe(0);
    expect(c.style.width).toBe('100%');
  }
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
