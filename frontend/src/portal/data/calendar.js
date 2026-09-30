/**
 * Calendar facade — date-fns does the date math, FullCalendar draws the grids.
 *
 * Nothing in here reimplements a calendar. What remains is (a) one-line label
 * formatting over date-fns, and (b) the contract *domain* rules — which days
 * are contract days and which are logged — expressed as a date→state map that
 * the FullCalendar-based <ContractCalendar> paints. Month shape, weekday
 * offsets and cell layout are FullCalendar's problem, which is the point:
 * August 2026 starts on a Saturday and has 31 days without us knowing that.
 *
 * The schedule's future data source is Google Calendar — FullCalendar's
 * @fullcalendar/google-calendar plugin renders a shared academy calendar from
 * an API key, replacing the generated season as the feed. Until that key
 * exists, the season generator stays the feed and this module stays thin.
 */

import {
  addDays,
  addMonths,
  differenceInYears,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSaturday,
  isSunday,
  parseISO,
  startOfMonth,
} from 'date-fns';

/** Local calendar date as 'yyyy-MM-dd' — the family's wall-clock day. */
export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * 'yyyy-MM-dd' plus n days, via date-fns — THE date stepper (code review
 * 2026-09-04: two hand-rolled UTC copies of this existed; date math never
 * gets reimplemented here again).
 */
export function addDaysISO(iso, n) {
  return format(addDays(parseISO(iso), n), 'yyyy-MM-dd');
}

/**
 * 'yyyy-MM-dd' -> the Saturday on or before it, via date-fns — for seed data
 * that wants a believable "past tournament Saturday" without hand-picking a
 * date that goes stale (Sprint 7, RYP Tour demo standings). Centralized here
 * rather than reimplemented in data/tour.js, per this file's own rule: date
 * math happens once.
 */
export function lastSaturdayOnOrBefore(iso) {
  // Steps back a day at a time (at most 6 steps) - this is seed-data setup,
  // not a hot path, so clarity wins over a modulo trick.
  let cur = parseISO(iso);
  for (let i = 0; i < 7 && !isSaturday(cur); i++) cur = addDays(cur, -1);
  return format(cur, 'yyyy-MM-dd');
}

/**
 * Session time string ("9:00 AM", "12:30 PM") -> minutes since midnight,
 * or null when unparseable. THE 12-hour parser (code review 2026-09-04:
 * three regex copies existed; noon/midnight rules live here once).
 */
export function parseTimeToMinutes(timeStr) {
  const m = String(timeStr || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return h * 60 + Number(m[2]);
}

/**
 * Minutes -> how long a session runs, as a person would say it: "45 min",
 * "1 hr", "1 hr 30 min", "2 hr". Printing raw minutes reads fine at 45 and 60
 * and badly at 120, which Saturday's sessions now are.
 */
export function formatDuration(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  const hrs = Math.floor(n / 60);
  const mins = n % 60;
  if (!hrs) return `${mins} min`;
  return mins ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}

/** '2026-08-28' -> 'Friday, Aug 28'. */
export function longDayLabel(iso) {
  return format(parseISO(iso), 'EEEE, MMM d');
}

/** '2026-08-28' -> 'August 2026'. */
export function monthLabel(iso) {
  return format(parseISO(iso), 'MMMM yyyy');
}

/** '2026-08-28' -> 'August'. */
export function monthName(iso) {
  return format(parseISO(iso), 'MMMM');
}

/** First of the next month, short: '2026-08-28' -> 'Sep 1'. */
export function nextMonthFirstShort(iso) {
  return format(startOfMonth(addMonths(parseISO(iso), 1)), 'MMM d');
}

/** 'yyyy-MM' or 'yyyy-MM-dd' -> a full 'yyyy-MM-dd' within that month. */
function normalizeMonthInput(monthISO) {
  return monthISO && monthISO.length === 7 ? `${monthISO}-01` : monthISO;
}

/**
 * First/last day ('yyyy-MM-dd') of the month containing `monthISO`, plus its
 * label — the window a month-at-a-time surface (the booking calendar) queries
 * and captions against. Accepts either 'yyyy-MM' or a full 'yyyy-MM-dd'.
 */
export function monthBounds(monthISO) {
  const full = normalizeMonthInput(monthISO);
  const anchor = parseISO(full);
  return {
    start: format(startOfMonth(anchor), 'yyyy-MM-dd'),
    end: format(endOfMonth(anchor), 'yyyy-MM-dd'),
    label: monthLabel(full),
  };
}

/**
 * The contract month as domain facts: a date→state map for the calendar to
 * paint, plus every number the contract screens show — computed from the same
 * map they render, so the hero count, the stats row and the grid cannot
 * disagree.
 *
 * States: 'logged' | 'missed' | 'open' (today, still loggable) | 'future' |
 * 'weekend' (not a contract day).
 *
 * Sprint 5 ruling (docs/portal/TEAM.md): closures are schedule facts, not
 * practice facts. Contract logging is legal on ANY non-weekend date — kids
 * practice outside the academy — so this builder no longer takes a closures
 * list or produces a 'closed' state. Closures still matter to session
 * booking, which reads them from season.js instead.
 *
 * @param {object} opts
 * @param {string} opts.today            'yyyy-MM-dd'.
 * @param {string[]} [opts.missedDates]  Dates logged as missed.
 * @param {boolean} [opts.completeAll]   Demo state: every contract day logged.
 * @param {number} [opts.minutesPerDay]  Contract tier, for the minutes stat.
 */
export function buildContractMonth({
  today,
  missedDates = [],
  completeAll = false,
  minutesPerDay = 45,
}) {
  const anchor = parseISO(today);
  const days = eachDayOfInterval({ start: startOfMonth(anchor), end: endOfMonth(anchor) });
  const missed = new Set(missedDates);

  const dayStates = {};
  const tally = { contractDays: 0, dueSoFar: 0, logged: 0, missed: 0, daysLeft: 0 };

  for (const d of days) {
    const iso = format(d, 'yyyy-MM-dd');
    let state;
    if (isSaturday(d) || isSunday(d)) state = 'weekend';
    else {
      tally.contractDays++;
      if (completeAll) {
        state = 'logged';
        tally.logged++;
      } else if (iso > today) {
        state = 'future';
        tally.daysLeft++;
      } else if (iso === today) {
        state = 'open'; // loggable via the pinned CTA, not yet a miss
        tally.daysLeft++;
      } else {
        tally.dueSoFar++;
        state = missed.has(iso) ? 'missed' : 'logged';
        tally[state === 'missed' ? 'missed' : 'logged']++;
      }
    }
    dayStates[iso] = state;
  }
  if (completeAll) tally.dueSoFar = tally.contractDays;

  // Consecutive logged contract days, walking back from the most recent due day.
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const state = dayStates[format(days[i], 'yyyy-MM-dd')];
    if (state === 'weekend' || state === 'future' || state === 'open') continue;
    if (state === 'logged') streak++;
    else break;
  }

  return {
    label: monthLabel(today),
    month: monthName(today),
    start: format(startOfMonth(anchor), 'yyyy-MM-dd'),
    dayStates,
    ...tally,
    streak,
    minutes: tally.logged * minutesPerDay,
  };
}

/**
 * Missed contract days a month absorbs before the athlete reads as Behind
 * (contract-buffer ruling, 2026-09-30): Behind is the 6th missed weekday, not
 * the 1st. Late entries shrink `missed`, so backfilling flips it back.
 */
export const BEHIND_BUFFER_DAYS = 5;

/**
 * Live counterpart to buildContractMonth (Sprint 6, QA #4): the same
 * date -> state map and stats, but 'logged'/'missed' come from real
 * contractLogs minutes instead of a demo missedDates set — a due day (before
 * today) is 'logged' when it has a logged amount >= contractMinutes,
 * 'missed' otherwise (contract v1.3: fulfilled = minutes >= contractMinutes,
 * surplus minutes never bank an extra day). Shape matches buildContractMonth
 * exactly, so useContract's live branch and the seed branch above produce
 * the same payload for ContractCalendar/the stats row.
 *
 * The contract window (contract-buffer ruling, 2026-09-30): only weekdays in
 * [startISO, endISO] are contract days. A weekday outside it paints
 * 'inactive' ('logged' when it carries a full log) and never counts toward
 * due, missed, logged, days left, contract days or the streak - so nobody is
 * Behind before their contract starts or after the season ends.
 *
 * @param {object} opts
 * @param {string} opts.today
 * @param {Map<string, number>} opts.minutesByDate  date -> minutes logged.
 * @param {number} opts.contractMinutes  the athlete's tier; callers must not
 *   call this with a null tier — there is no contract to grid.
 * @param {string|null} [opts.startISO]  first contract day, 'yyyy-MM-dd'.
 * @param {string|null} [opts.endISO]    last contract day, 'yyyy-MM-dd'.
 */
export function buildContractMonthFromLogs({ today, minutesByDate, contractMinutes, startISO = null, endISO = null }) {
  const anchor = parseISO(today);
  const days = eachDayOfInterval({ start: startOfMonth(anchor), end: endOfMonth(anchor) });

  const dayStates = {};
  const tally = { contractDays: 0, dueSoFar: 0, logged: 0, missed: 0, daysLeft: 0 };
  const fulfilled = (iso) => (minutesByDate.get(iso) || 0) >= contractMinutes;
  const outside = (iso) => Boolean((startISO && iso < startISO) || (endISO && iso > endISO));

  for (const d of days) {
    const iso = format(d, 'yyyy-MM-dd');
    let state;
    if (isSaturday(d) || isSunday(d)) state = 'weekend';
    else if (outside(iso)) state = fulfilled(iso) ? 'logged' : 'inactive';
    else {
      tally.contractDays++;
      if (iso > today) {
        state = 'future';
        tally.daysLeft++;
      } else if (iso === today) {
        // Today goes green the moment it is fulfilled - hardcoding 'open'
        // here meant a logged day never flipped until tomorrow (user
        // report, 2026-09-01). Unfulfilled today stays 'open': loggable,
        // not yet a miss.
        if (fulfilled(iso)) {
          state = 'logged';
          tally.logged++;
          // A fulfilled today is due-and-done: counting it logged without
          // counting it due made logged/dueSoFar read 120% ("6 of 5 days").
          tally.dueSoFar++;
        } else {
          state = 'open';
          tally.daysLeft++;
        }
      } else {
        tally.dueSoFar++;
        state = fulfilled(iso) ? 'logged' : 'missed';
        tally[state]++;
      }
    }
    dayStates[iso] = state;
  }

  // Consecutive logged contract days, walking back from the most recent due
  // day. Days outside the window (inactive, or logged before the start) are
  // not contract days, so they neither extend nor break the streak.
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const iso = format(days[i], 'yyyy-MM-dd');
    const state = dayStates[iso];
    if (state === 'weekend' || state === 'future' || state === 'open' || outside(iso)) continue;
    if (state === 'logged') streak++;
    else break;
  }

  // Real minutes actually logged this month (not logged-day-count x tier —
  // that was the seed's simulation; here the numbers are real), summed only
  // over this month's dates so an unfiltered per-athlete log map is safe to
  // pass in.
  let minutes = 0;
  for (const iso of Object.keys(dayStates)) minutes += minutesByDate.get(iso) || 0;

  return {
    label: monthLabel(today),
    month: monthName(today),
    start: format(startOfMonth(anchor), 'yyyy-MM-dd'),
    dayStates,
    ...tally,
    streak,
    minutes,
    startISO,
    endISO,
    notStarted: Boolean(startISO) && today < startISO,
    ended: Boolean(endISO) && today > endISO,
    behind: tally.missed > BEHIND_BUFFER_DAYS,
  };
}

/** dob ('yyyy-MM-dd') -> whole years old, or null when dob is unknown — never invented. */
export function ageFromDob(dob) {
  return dob ? differenceInYears(new Date(), parseISO(dob)) : null;
}

/**
 * Day numbers of the first `count` due contract days, for seeding demo missed
 * dates in a real month without hardcoding which month it is.
 */
export function pickDueDates({ today, count, spread = 1 }) {
  const base = buildContractMonth({ today });
  const due = Object.entries(base.dayStates)
    .filter(([, s]) => s === 'logged')
    .map(([iso]) => iso);
  const picked = [];
  for (let i = 0; i < due.length && picked.length < count; i += spread) picked.push(due[i]);
  return picked;
}

/* ------------------------------------------------------------------------- *
 * Booking window (Sprint 12 pin D, contract section 5). The window ROLLS AT
 * 07:00 America/Chicago, not midnight: before 7 AM the anchor is still
 * yesterday. Pure; the routing lane's createBooking gate and every day strip
 * read it, and BookSession/SpecialistBooking render days past it as locked
 * with "opens 7 AM on <date>" (windowOpensOn).
 * ------------------------------------------------------------------------- */

const ACADEMY_TZ = 'America/Chicago';
const WINDOW_ROLL_HOUR = 7;

function academyLocalParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ACADEMY_TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  // Some engines print midnight as "24" under hour12: false.
  return { date: get('year') + '-' + get('month') + '-' + get('day'), hour: Number(get('hour')) % 24 };
}

/** The last session date bookable right now for a package with this window. */
export function openThrough(now = new Date(), windowDays = 30) {
  const { date, hour } = academyLocalParts(now);
  const anchor = hour >= WINDOW_ROLL_HOUR ? date : addDaysISO(date, -1);
  return addDaysISO(anchor, windowDays);
}

/** The local date on which a session date first enters the window (at 7 AM). */
export function windowOpensOn(sessionDateISO, windowDays = 30) {
  return addDaysISO(sessionDateISO, -windowDays);
}

/* ------------------------------------------------------------------------- *
 * The Oct 10 gate (Sprint 20, spec 5): booking opens for token members at
 * 07:00 America/Chicago on 2026-10-10; Elite books as soon as it is paid.
 * ONE constant, read by createBooking/joinWaitlist/bookRecurring (live.js),
 * the specialist screen's Calendly button and every banner; firestore.rules
 * carries the same millisecond value in bookingOpenOk(). Retire after launch
 * (GitHub #26).
 * ------------------------------------------------------------------------- */
export const BOOKING_OPENS_AT = 1791633600000; // 2026-10-10T12:00:00Z = 07:00 America/Chicago
export const BOOKING_OPENS_LABEL = 'Sat, Oct 10 at 7 AM';
export function bookingOpen(now = Date.now(), pkg = null) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return pkg?.kind === 'elite' || t >= BOOKING_OPENS_AT;
}
