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
 * Live counterpart to buildContractMonth (Sprint 6, QA #4): the same
 * date -> state map and stats, but 'logged'/'missed' come from real
 * contractLogs minutes instead of a demo missedDates set — a due day (before
 * today) is 'logged' when it has a logged amount >= contractMinutes,
 * 'missed' otherwise (contract v1.3: fulfilled = minutes >= contractMinutes,
 * surplus minutes never bank an extra day). Shape matches buildContractMonth
 * exactly, so useContract's live branch and the seed branch above produce
 * the same payload for ContractCalendar/the stats row.
 *
 * @param {object} opts
 * @param {string} opts.today
 * @param {Map<string, number>} opts.minutesByDate  date -> minutes logged.
 * @param {number} opts.contractMinutes  the athlete's tier; callers must not
 *   call this with a null tier — there is no contract to grid.
 */
export function buildContractMonthFromLogs({ today, minutesByDate, contractMinutes }) {
  const anchor = parseISO(today);
  const days = eachDayOfInterval({ start: startOfMonth(anchor), end: endOfMonth(anchor) });

  const dayStates = {};
  const tally = { contractDays: 0, dueSoFar: 0, logged: 0, missed: 0, daysLeft: 0 };
  const fulfilled = (iso) => (minutesByDate.get(iso) || 0) >= contractMinutes;

  for (const d of days) {
    const iso = format(d, 'yyyy-MM-dd');
    let state;
    if (isSaturday(d) || isSunday(d)) state = 'weekend';
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

  // Consecutive logged contract days, walking back from the most recent due day.
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const state = dayStates[format(days[i], 'yyyy-MM-dd')];
    if (state === 'weekend' || state === 'future' || state === 'open') continue;
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
