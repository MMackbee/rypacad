/**
 * Month/Week view helpers (owner request 2026-09-30: every calendar gets one
 * Month/Week toggle, and the two views must read the same on every screen).
 *
 * Pure date math over date-fns plus the facade in ./calendar - no storage, no
 * data reads. Weeks are Monday-first to match ContractCalendar's firstDay=1,
 * so a week row here is exactly a row of the month grid.
 *
 * Also the booking calendars' day marks (dayMarksFor): pure derivations over
 * sessions a hook has ALREADY read - they never read anything themselves.
 */

import { addMonths, format, parseISO, startOfWeek } from 'date-fns';
import { addDaysISO, monthBounds } from './calendar';
import { SEASON_BOUNDS } from './season';

/** The one localStorage key holding the viewer's Month/Week choice. */
export const CALENDAR_VIEW_KEY = 'ryp.calendarView';

export function isCalendarView(v) {
  return v === 'month' || v === 'week';
}

/** 'yyyy-MM-dd' -> the Monday on or before it. */
export function weekStartISO(iso) {
  return format(startOfWeek(parseISO(iso), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

/** Monday ISO -> its 7 days, Mon..Sun. */
export function weekDaysISO(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
}

/** 'yyyy-MM-dd' -> 'yyyy-MM-01'. */
export function monthStartISO(iso) {
  return `${format(parseISO(iso), 'yyyy-MM')}-01`;
}

function nextMonthISO(monthISO, delta) {
  return format(addMonths(parseISO(monthStartISO(monthISO)), delta), 'yyyy-MM-dd');
}

/** Ascending Mondays of every week touching [from, to]; [] when from > to. */
export function weeksBetween(fromISO, toISO) {
  if (!fromISO || !toISO || fromISO > toISO) return [];
  const out = [];
  for (let cur = weekStartISO(fromISO); cur <= toISO; cur = addDaysISO(cur, 7)) out.push(cur);
  return out;
}

/** Ascending 'yyyy-MM-01' of every month touching [from, to]; [] when from > to. */
export function monthsBetween(fromISO, toISO) {
  if (!fromISO || !toISO || fromISO > toISO) return [];
  const last = monthStartISO(toISO);
  const out = [];
  for (let cur = monthStartISO(fromISO); cur <= last; cur = nextMonthISO(cur, 1)) out.push(cur);
  return out;
}

/** The Mondays of the rows the month grid draws for `monthISO`. */
export function monthWeekStarts(monthISO) {
  const { start, end } = monthBounds(monthISO);
  return weeksBetween(start, end);
}

/**
 * The whole grid the month draws: the Monday of its first row through the
 * Sunday of its last - November 2026 is 2026-10-26 .. 2026-12-06. The month
 * calendars load this span, so a week straddling two months has data for all
 * seven days (week view across months, 2026-09-30).
 */
export function monthGridBounds(monthISO) {
  const { start, end } = monthBounds(monthISO);
  return { start: weekStartISO(start), end: addDaysISO(weekStartISO(end), 6) };
}

/** Whole months from `monthISO`'s month to `iso`'s: Nov -> Dec 2 is 1, Nov -> Oct 30 is -1. */
export function monthsApart(monthISO, iso) {
  const [y1, m1] = monthISO.split('-').map(Number);
  const [y2, m2] = iso.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/** The entries of an iso-keyed map inside [from, to]. */
export function pickRange(map, fromISO, toISO) {
  return Object.fromEntries(Object.entries(map || {}).filter(([iso]) => iso >= fromISO && iso <= toISO));
}

/** The first non-null candidate inside [from, to], else `from`. */
export function anchorIn(fromISO, toISO, candidates = []) {
  const hit = candidates.find((c) => c && c >= fromISO && c <= toISO);
  return hit || fromISO;
}

/**
 * The label for the VISIBLE part of a week, clamped to [from, to] when given:
 * 'Sep 28 – Oct 4', 'Nov 2 – 8', 'Nov 30' (one visible day), 'Dec 1 – 6'.
 * The booking calendars pass no range ('Nov 30 – Dec 6'); only the
 * Commitment Contract, whose data is one month, still clamps.
 */
export function weekLabel(weekStart, { from, to } = {}) {
  const weekEnd = addDaysISO(weekStart, 6);
  let s = from && from > weekStart ? from : weekStart;
  let e = to && to < weekEnd ? to : weekEnd;
  if (s > e) {
    s = weekStart;
    e = weekEnd;
  }
  const sd = parseISO(s);
  const ed = parseISO(e);
  if (s === e) return format(sd, 'MMM d');
  if (s.slice(0, 7) === e.slice(0, 7)) return `${format(sd, 'MMM d')} – ${format(ed, 'd')}`;
  return `${format(sd, 'MMM d')} – ${format(ed, 'MMM d')}`;
}

/**
 * One week step over the loaded month's grid (week view across months,
 * 2026-09-30). The next week is always weekStart ± 7; the month changes only
 * when that Monday is not a row of the loaded month, so a boundary week is
 * drawn whole from whichever month is loaded: Nov 23 -> Nov 30 stays in
 * November, Nov 30 -> Dec 7 moves to December; back from December, Dec 7 ->
 * Nov 30 stays, Nov 30 -> Nov 23 moves to November.
 *
 * @returns {{ monthDelta: -1|0|1, weekStart: string }}
 */
export function stepGridWeek(monthISO, weekStart, delta) {
  const next = addDaysISO(weekStart, 7 * delta);
  if (monthWeekStarts(monthISO).includes(next)) return { monthDelta: 0, weekStart: next };
  return { monthDelta: delta > 0 ? 1 : -1, weekStart: next };
}

/** The earliest ISO in [from, to] whose state is 'available', or null. */
export function firstAvailableISO(dayStates, fromISO, toISO) {
  const hits = Object.keys(dayStates || {})
    .filter((iso) => iso >= fromISO && iso <= toISO && dayStates[iso] === 'available')
    .sort();
  return hits[0] || null;
}

/**
 * Which painted states open something on tap - a copy of ContractCalendar's
 * `tappable` rule (a parity test pins the two together), plus 'full' in
 * booking: ContractCalendar never sees 'full' (CalendarCard's month grid
 * hands it over as 'available'), so both views tap the same days.
 */
export function isTappableDay(variant, state) {
  return variant === 'booking' ? state === 'available' || state === 'full' : state === 'logged' || state === 'missed';
}

/**
 * useSpecialistSlots' days -> dayStates. A day with an open slot is
 * 'available'; a day whose slots are ALL full is 'full' - painted apart from
 * the open days (toggle review: a full day looked the same as one with
 * openings, which the old strip's dot told apart) but still tappable, so its
 * waitlist stays reachable. A day with no slots is 'open' (not tappable).
 * `waitlist: false` (Yannick's sessions take no waitlist): a day with
 * nothing open is 'open' too - there is nothing on it to tap for.
 */
export function slotDayStates(days, { waitlist = true } = {}) {
  const out = {};
  for (const d of days || []) {
    const slots = d.slots || [];
    out[d.date] = !slots.length ? 'open' : slots.some((s) => s && s.open) ? 'available' : waitlist ? 'full' : 'open';
  }
  return out;
}

/**
 * How far past its own range a marks read looks (review 2026-09-30). Every
 * grid ends on a Sunday (no blocks) and December's ends inside the Christmas
 * break, so without the next week's sessions in hand the read's last days
 * would sit past the horizon below and never be judged.
 */
export const MARKS_LOOKAHEAD_DAYS = 7;

/**
 * The booking calendars' day marks (owner ruling 2026-09-30), from the
 * sessions a hook already read for [from, to] - EVERY type, not only the
 * calendar's own. No closures collection and no sync change: the owner puts
 * no 'Closed' events on the calendar, so an empty in-season day IS a closure.
 *  - 'tournament': the date has a scheduled (not cancelled) tournament.
 *  - 'closed': the date is inside SEASON_BOUNDS and [from, to] (so a day
 *    nobody read is never called closed) and has no scheduled session of ANY
 *    type - training, tournament, phil or mental. Never before Nov 3 or
 *    after Feb 27.
 * A tournament wins over closed, and a day with any session is never closed.
 *
 * Closed also stops at the read's HORIZON - the latest date `sessions` holds
 * any doc for (review 2026-09-30). An empty day past it may simply not be
 * synced yet (the sync's default window is 90 days), so it is left unmarked
 * rather than painted "Academy closed"; an empty read marks nothing closed.
 * A cancelled doc counts toward the horizon: the sync only cancels a session
 * inside a window it just read. Callers read MARKS_LOOKAHEAD_DAYS past `to`
 * so the range's own last days sit inside it.
 *
 * @returns {Object<string, 'tournament'|'closed'>}
 */
export function dayMarksFor(sessions, fromISO, toISO, season = SEASON_BOUNDS) {
  const out = {};
  if (!fromISO || !toISO) return out;
  const busy = new Set();
  let horizon = '';
  for (const s of sessions || []) {
    if (!s || !s.date) continue;
    if (s.date > horizon) horizon = s.date;
    if (s.status === 'cancelled') continue;
    busy.add(s.date);
    if (s.type === 'tournament' && s.date >= fromISO && s.date <= toISO) out[s.date] = 'tournament';
  }
  const from = fromISO > season.start ? fromISO : season.start;
  const to = [toISO, season.end, horizon].sort()[0]; // the earliest; '' for an empty read
  for (let iso = from; iso <= to; iso = addDaysISO(iso, 1)) {
    if (!busy.has(iso)) out[iso] = 'closed';
  }
  return out;
}

/** useSpecialistSlots' days (each with its hook-derived `mark`) -> dayMarks. */
export function slotDayMarks(days) {
  const out = {};
  for (const d of days || []) if (d.mark) out[d.date] = d.mark;
  return out;
}
