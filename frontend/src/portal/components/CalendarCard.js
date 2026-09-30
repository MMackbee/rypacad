import React, { useState } from 'react';
import { color } from '../tokens';
import { Body, Card } from './Primitives';
import { SkeletonBar } from './Skeleton';
import ContractCalendar from './ContractCalendar';
import WeekView from './WeekView';
import CalendarViewToggle from './CalendarViewToggle';
import { DayMarkLegend } from './DayMarks';
import { MonthNav } from './MonthCalendar';
import useCalendarView from '../hooks/calendarView';
import { monthBounds, monthLabel, todayISO } from '../data/calendar';
import {
  anchorIn,
  firstAvailableISO,
  monthGridBounds,
  monthStartISO,
  monthWeekStarts,
  monthsApart,
  monthsBetween,
  pickRange,
  stepGridWeek,
  weekDaysISO,
  weekLabel,
  weekStartISO,
  weeksBetween,
} from '../data/calendarViews';

/**
 * The one calendar card every screen renders (owner request 2026-09-30:
 * "a toggle on every view where either the calendar or the week view
 * populates ... needs to be consistent"). The header puts the Month/Week
 * toggle in the same place everywhere; the grid below is the unmodified
 * ContractCalendar (Month) or the shared WeekView (Week), handed the SAME
 * dayStates / selected / onSelectDay, so a tap behaves identically in both.
 *
 * Two data modes, because screens hold their data two ways:
 *  - SessionsCalendarCard: month-driven; the screen owns monthISO (it feeds
 *    useMonthSessions, which loads the month's whole grid), and a week is a
 *    whole Mon-Sun row of that grid, even across a month end.
 *  - RangeCalendarCard: a fixed range the screen already holds; nav is
 *    bounded to the months/weeks the range touches.
 *
 * The booking calendars also pass `dayMarks` (tournament / closed days,
 * DayMarks.js); a card that gets it paints the marks in both views and shows
 * their legend. The Commitment Contract never passes it.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The month grid: the unmodified ContractCalendar plus the two Week-view cues
 * it cannot draw itself (toggle review 2026-09-30), so Month and Week match.
 * A 'full' day is handed to the grid as 'available' - it stays a tappable
 * button and its waitlist stays reachable - and is repainted dashed/muted by
 * date (a full tournament day keeps its yellow and only turns dashed). The
 * selected bookable day gets WeekView's solid green fill.
 */
function MonthGrid({ gridKey, start, dayStates, dayMarks, variant, selected, onSelectDay }) {
  const marks = dayMarks || {};
  const full = Object.keys(dayStates).filter((iso) => dayStates[iso] === 'full' && ISO_DAY.test(iso));
  const states = full.length ? { ...dayStates, ...Object.fromEntries(full.map((iso) => [iso, 'available'])) } : dayStates;
  const css = [
    `.ryp-cal-month .ryp-day-selected.ryp-day-available .fc-daygrid-day-frame { background: ${color.primary}; color: #000; }`,
    ...full.map((iso) =>
      marks[iso] === 'tournament'
        ? `.ryp-cal-month td[data-date="${iso}"]:not(.ryp-day-selected) .fc-daygrid-day-frame { border-style: dashed; }`
        : `.ryp-cal-month td[data-date="${iso}"]:not(.ryp-day-selected) .fc-daygrid-day-frame { background: transparent; border-style: dashed; color: ${color.textSecondary}; }`),
  ].join('\n');
  // A tapped full day reports 'full', exactly as WeekView does.
  const onSelect = onSelectDay && full.length
    ? (day) => onSelectDay(full.includes(day.iso) ? { ...day, state: 'full' } : day)
    : onSelectDay;
  // FullCalendar keeps its mount-time painting (QA 2026-09-08 #5), so the
  // marks ride in the key: a changed mark remounts the grid.
  const sig = Object.keys(marks).sort().map((iso) => `${iso}:${marks[iso]}`).join(',');
  return (
    <div className="ryp-cal-month">
      <style>{css}</style>
      <ContractCalendar
        key={sig ? `${gridKey}|${sig}` : gridKey}
        start={start}
        dayStates={states}
        dayMarks={dayMarks}
        variant={variant}
        selected={selected}
        onSelectDay={onSelect}
      />
    </div>
  );
}

/** Toggle row, then (when given) the prev/label/next row. */
export function CalendarCardHeader({ view, onViewChange, nav }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <CalendarViewToggle value={view} onChange={onViewChange} />
      </div>
      {nav ? (
        <div style={{ marginBottom: 10 }}>
          <MonthNav {...nav} />
        </div>
      ) : null}
    </>
  );
}

/**
 * Month-driven card (BookSession, the coach's Sessions tab). Week view is one
 * row of the month's grid already loaded - no second read - drawn whole
 * across a month end ('Nov 30 – Dec 6'). Stepping to a Monday that is not a
 * row of the loaded month calls the screen's own changeMonth(±1)
 * (stepGridWeek). Month view renders the same ContractCalendar and captions
 * the screens rendered before, painting only the month's own days.
 *
 * @param {string} monthISO           'yyyy-MM-01' the screen has loaded.
 * @param {(delta: number) => void} changeMonth
 * @param {boolean} loading
 * @param {object} dayStates          iso -> 'available'|'open' for the month's whole grid.
 * @param {object} [dayMarks]         iso -> 'tournament'|'closed'; given, the marks and their legend show.
 * @param {string} [selected]
 * @param {(day) => void} onSelectDay  Fired by both views with { iso, day, state }.
 * @param {() => void} [onNavigate]    Fired before any prev/next (clears selection).
 * @param {React.ReactNode} hint       Caption when the view has sessions.
 * @param {{ month: string, week: string }} emptyCopy
 * @param {'month'|'week'} [defaultView]
 */
export function SessionsCalendarCard({
  monthISO,
  changeMonth,
  loading,
  dayStates = {},
  dayMarks,
  selected,
  onSelectDay,
  onNavigate,
  hint,
  emptyCopy = {},
  defaultView = 'month',
}) {
  const [view, setView] = useCalendarView(defaultView);
  const [weekPick, setWeekPick] = useState(null);
  const { start, end } = monthBounds(monthISO);
  const grid = monthGridBounds(monthISO);
  const rows = monthWeekStarts(monthISO);
  // Untouched, the week follows the selected day (anywhere on the grid),
  // else today, else the month's first bookable day - those two only inside
  // the month itself, so the pre-season jump lands on Nov 2 - 8.
  const weekStart = rows.includes(weekPick)
    ? weekPick
    : selected && selected >= grid.start && selected <= grid.end
      ? weekStartISO(selected)
      : weekStartISO(anchorIn(start, end, [todayISO(), firstAvailableISO(dayStates, start, end)]));

  const onViewChange = (next) => {
    setWeekPick(null);
    // A day picked on a boundary week outside the loaded month (Dec 2 while
    // November is loaded): Month moves to that month so the selection stays
    // visible - no onNavigate, the selection is kept.
    if (next === 'month' && selected && (selected < start || selected > end)) changeMonth(monthsApart(monthISO, selected));
    setView(next);
  };
  const stepWeek = (delta) => {
    const s = stepGridWeek(monthISO, weekStart, delta);
    if (onNavigate) onNavigate();
    if (s.monthDelta) changeMonth(s.monthDelta);
    setWeekPick(s.weekStart);
  };
  const stepMonth = (delta) => {
    if (onNavigate) onNavigate();
    changeMonth(delta);
  };

  const nav =
    view === 'month'
      ? { label: monthLabel(monthISO), onPrev: () => stepMonth(-1), onNext: () => stepMonth(1) }
      : {
          label: weekLabel(weekStart),
          prevLabel: 'Previous week',
          nextLabel: 'Next week',
          onPrev: () => stepWeek(-1),
          onNext: () => stepWeek(1),
        };

  // The month grid gets the month's own days only: FullCalendar leaves the
  // out-of-month cells blank but still mounts them, and a blank Dec 1 must
  // never become a focus stop.
  const monthStates = pickRange(dayStates, start, end);
  // Month: any available day in the month - the same test the screens ran
  // before (days.some(d => d.sessions.length)). Week: all seven days.
  const hasInView =
    view === 'month'
      ? Object.values(monthStates).some((s) => s === 'available')
      : weekDaysISO(weekStart).some((iso) => dayStates[iso] === 'available');

  return (
    <Card large>
      <CalendarCardHeader view={view} onViewChange={onViewChange} nav={nav} />
      {loading ? (
        <SkeletonBar height={view === 'month' ? 220 : 56} style={{ marginTop: 4 }} />
      ) : view === 'month' ? (
        <MonthGrid
          gridKey={monthISO}
          start={monthISO}
          dayStates={monthStates}
          dayMarks={dayMarks && pickRange(dayMarks, start, end)}
          variant="booking"
          selected={selected}
          onSelectDay={onSelectDay}
        />
      ) : (
        <WeekView
          weekStart={weekStart}
          dayStates={dayStates}
          dayMarks={dayMarks}
          variant="booking"
          selected={selected}
          onSelectDay={onSelectDay}
        />
      )}
      {!loading && !hasInView ? (
        <Body size={12} style={{ marginTop: 14, textAlign: 'center' }}>
          {emptyCopy[view]}
        </Body>
      ) : (
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 13 }}>
          {hint}
        </Body>
      )}
      {dayMarks ? <DayMarkLegend /> : null}
    </Card>
  );
}

/**
 * Bounded card (CommitmentContract's month, SpecialistBooking's rolling slot
 * window). Nav appears only when the range spans more than one page, stops at
 * the ends (disabled arrows), and never changes the selection. Until the
 * viewer navigates, the page follows `anchor` (else today, else rangeStart).
 *
 * @param {string} [rangeStart]  First ISO of the data (default today).
 * @param {string} [rangeEnd]    Last ISO of the data (default rangeStart).
 * @param {string} [anchor]      The day the page should show until navigated.
 * @param {object} dayStates
 * @param {'contract'|'booking'} [variant]
 * @param {string} [selected]
 * @param {(day) => void} [onSelectDay]
 * @param {'month'|'week'} [defaultView]
 * @param {boolean} [blankOutsideRange]  Week view blanks days outside the range.
 * @param {string|number} [gridKey]      Appended to the month grid's key to force a repaint.
 * @param {React.ReactNode} [hint]       One-line caption under the grid, styled as SessionsCalendarCard's.
 * @param {object} [dayMarks]            Booking only: iso -> 'tournament'|'closed'; given, the marks and their legend show.
 * @param {React.ReactNode} [children]   Rendered after the grid (captions, legend).
 */
export function RangeCalendarCard({
  rangeStart,
  rangeEnd,
  anchor,
  dayStates = {},
  dayMarks,
  variant = 'contract',
  selected,
  onSelectDay,
  defaultView = 'month',
  blankOutsideRange = false,
  gridKey = '',
  hint = null,
  children,
}) {
  const [view, setView] = useCalendarView(defaultView);
  const [monthPick, setMonthPick] = useState(null);
  const [weekPick, setWeekPick] = useState(null);
  const from = rangeStart ?? todayISO();
  const to = rangeEnd ?? from;
  const a = anchorIn(from, to, [anchor, todayISO()]);
  const months = monthsBetween(from, to);
  const weeks = weeksBetween(from, to);
  const monthISO = months.includes(monthPick) ? monthPick : monthStartISO(a);
  const weekStart = weeks.includes(weekPick) ? weekPick : weekStartISO(a);

  const isMonth = view === 'month';
  const pages = isMonth ? months : weeks;
  const idx = pages.indexOf(isMonth ? monthISO : weekStart);
  const go = (delta) => {
    const next = pages[idx + delta];
    if (!next) return;
    if (isMonth) setMonthPick(next);
    else setWeekPick(next);
  };
  const nav =
    pages.length > 1
      ? {
          label: isMonth ? monthLabel(monthISO) : weekLabel(weekStart, blankOutsideRange ? { from, to } : {}),
          ...(isMonth ? null : { prevLabel: 'Previous week', nextLabel: 'Next week' }),
          onPrev: () => go(-1),
          onNext: () => go(1),
          prevDisabled: idx <= 0,
          nextDisabled: idx >= pages.length - 1,
        }
      : null;

  const onViewChange = (next) => {
    setMonthPick(null);
    setWeekPick(null);
    setView(next);
  };

  return (
    <Card large>
      <CalendarCardHeader view={view} onViewChange={onViewChange} nav={nav} />
      {isMonth ? (
        <MonthGrid
          gridKey={`${monthISO}-${gridKey}`}
          start={monthISO}
          dayStates={dayStates}
          dayMarks={dayMarks}
          variant={variant}
          selected={selected}
          onSelectDay={onSelectDay}
        />
      ) : (
        <WeekView
          weekStart={weekStart}
          dayStates={dayStates}
          dayMarks={dayMarks}
          variant={variant}
          selected={selected}
          onSelectDay={onSelectDay}
          visibleFrom={blankOutsideRange ? from : undefined}
          visibleTo={blankOutsideRange ? to : undefined}
        />
      )}
      {hint ? (
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 13 }}>
          {hint}
        </Body>
      ) : null}
      {dayMarks ? <DayMarkLegend /> : null}
      {children}
    </Card>
  );
}
