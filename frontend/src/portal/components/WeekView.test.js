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

describe('booking day marks (owner ruling 2026-09-30)', () => {
  // Sat Oct 10 a tournament day with sessions, Sun Oct 11 closed.
  const states = { '2026-10-06': 'available', '2026-10-09': 'full', '2026-10-10': 'available' };
  const marks = { '2026-10-09': 'tournament', '2026-10-10': 'tournament', '2026-10-11': 'closed' };
  const blend = (rgba, base) => {
    const [r, g, b, a] = rgba.match(/[\d.]+/g).map(Number);
    const bb = channels(base);
    return `rgb(${[r, g, b].map((v, i) => Math.round(v * a + bb[i] * (1 - a))).join(', ')})`;
  };

  test('a tournament day: yellow, no star, and "Tour day" in its name; still a button', async () => {
    const onSelectDay = jest.fn();
    const r = await renderScreen(<WeekView weekStart={WEEK} dayStates={states} dayMarks={marks} variant="booking" onSelectDay={onSelectDay} />);
    const t = cell(r, '2026-10-10');
    expect(t.tagName).toBe('BUTTON');
    expect(t.getAttribute('aria-label')).toBe('Saturday, Oct 10, Tour day');
    expect(t.getAttribute('data-mark')).toBe('tournament');
    expect(t.style.background).toBe('rgba(244, 238, 25, 0.1)');
    expect(t.style.borderColor.toLowerCase()).toBe('#f4ee19');
    // The colour is the mark (tester 2026-09-30): no star in the pill.
    expect(t.textContent).toBe('Sat10');
    expect(t.querySelector('[aria-hidden="true"]')).toBeNull();
    await act(async () => { t.click(); });
    expect(onSelectDay).toHaveBeenCalledWith({ iso: '2026-10-10', day: 10, state: 'available' });
    // Full and a tournament day: both said, and still dashed.
    expect(cell(r, '2026-10-09').getAttribute('aria-label')).toBe('Friday, Oct 9, Tour day, full - waitlist only');
    expect(cell(r, '2026-10-09').style.borderStyle).toBe('dashed');
    // An unmarked day is untouched.
    expect(cell(r, '2026-10-06').getAttribute('aria-label')).toBe('Tuesday, Oct 6');
    expect(cell(r, '2026-10-06').hasAttribute('data-mark')).toBe(false);
    await r.unmount();
  });

  test('a closed day: struck through, "academy closed" for screen readers, never a button, and readable', async () => {
    const onSelectDay = jest.fn();
    // Even a stray 'available' state never makes a closed day tappable.
    const r = await renderScreen(
      <WeekView weekStart={WEEK} dayStates={{ ...states, '2026-10-11': 'available' }} dayMarks={marks} variant="booking" onSelectDay={onSelectDay} />
    );
    const c = cell(r, '2026-10-11');
    expect(c.tagName).toBe('DIV');
    expect(c.hasAttribute('tabindex')).toBe(false);
    expect(c.getAttribute('title')).toBe('Academy closed');
    expect(c.getAttribute('data-mark')).toBe('closed');
    expect(c.textContent).toBe('Sun11, academy closed');
    const sr = [...c.querySelectorAll('span')].find((s) => s.textContent === ', academy closed');
    expect([sr.style.position, sr.style.width, sr.style.height, sr.style.overflow]).toEqual(['absolute', '1px', '1px', 'hidden']);
    const date = [...c.querySelectorAll('span')].find((s) => s.textContent === '11');
    expect(date.style.textDecoration).toBe('line-through');
    expect(contrast(c.style.color, blend(c.style.background, CARD))).toBeGreaterThanOrEqual(4.5);
    await act(async () => { c.click(); });
    expect(onSelectDay).not.toHaveBeenCalled();
    await r.unmount();
  });

  test('a selected tournament day keeps the green fill, with no star', async () => {
    const r = await renderScreen(
      <WeekView weekStart={WEEK} dayStates={states} dayMarks={marks} variant="booking" selected="2026-10-10" onSelectDay={() => {}} />
    );
    const t = cell(r, '2026-10-10');
    expect(t.style.background).toBe('rgb(0, 175, 81)');
    expect(t.style.color).toBe('rgb(0, 0, 0)');
    expect(t.textContent).toBe('Sat10');
    await r.unmount();
  });

  test('the contract variant ignores marks', async () => {
    const r = await renderScreen(<WeekView weekStart={WEEK} dayStates={STATES} dayMarks={{ '2026-10-06': 'closed', '2026-10-05': 'tournament' }} onSelectDay={() => {}} />);
    expect(cell(r, '2026-10-06').tagName).toBe('BUTTON');
    expect(cell(r, '2026-10-06').getAttribute('aria-label')).toBe('Tuesday, Oct 6');
    expect(r.container.querySelectorAll('[data-mark]')).toHaveLength(0);
    expect(r.text()).not.toContain('★');
    await r.unmount();
  });
});

test("'inactive' (outside the contract window) paints as a weekend and is never tappable", async () => {
  const onSelectDay = jest.fn();
  const r = await renderScreen(<WeekView weekStart={WEEK} dayStates={{ '2026-10-05': 'inactive', '2026-10-06': 'logged' }} onSelectDay={onSelectDay} />);
  const off = cell(r, '2026-10-05');
  const weekend = cell(r, '2026-10-11');
  expect(off.tagName).toBe('DIV');
  expect(off.getAttribute('data-state')).toBe('inactive');
  expect(off.style.background).toBe(weekend.style.background);
  expect(off.style.borderColor).toBe(weekend.style.borderColor);
  expect(off.style.color).toBe(weekend.style.color);
  await act(async () => { off.click(); });
  expect(onSelectDay).not.toHaveBeenCalled();
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
