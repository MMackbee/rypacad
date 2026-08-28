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

/**
 * The contract month as domain facts: a date→state map for the calendar to
 * paint, plus every number the contract screens show — computed from the same
 * map they render, so the hero count, the stats row and the grid cannot
 * disagree.
 *
 * States: 'logged' | 'missed' | 'open' (today, still loggable) | 'future' |
 * 'closed' (academy closure) | 'weekend' (not a contract day).
 *
 * @param {object} opts
 * @param {string} opts.today            'yyyy-MM-dd'.
 * @param {string[]} [opts.closures]     Season closure dates.
 * @param {string[]} [opts.missedDates]  Dates logged as missed.
 * @param {boolean} [opts.completeAll]   Demo state: every contract day logged.
 * @param {number} [opts.minutesPerDay]  Contract tier, for the minutes stat.
 */
export function buildContractMonth({
  today,
  closures = [],
  missedDates = [],
  completeAll = false,
  minutesPerDay = 45,
}) {
  const anchor = parseISO(today);
  const days = eachDayOfInterval({ start: startOfMonth(anchor), end: endOfMonth(anchor) });
  const missed = new Set(missedDates);
  const closed = new Set(closures);

  const dayStates = {};
  const tally = { contractDays: 0, dueSoFar: 0, logged: 0, missed: 0, daysLeft: 0 };
  const monthClosures = [];

  for (const d of days) {
    const iso = format(d, 'yyyy-MM-dd');
    let state;
    if (isSaturday(d) || isSunday(d)) state = 'weekend';
    else if (closed.has(iso)) {
      state = 'closed';
      monthClosures.push(iso);
    } else {
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
    if (state === 'weekend' || state === 'closed' || state === 'future' || state === 'open') continue;
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
    monthClosures,
  };
}

/**
 * Day numbers of the first `count` due contract days, for seeding demo missed
 * dates in a real month without hardcoding which month it is.
 */
export function pickDueDates({ today, closures = [], count, spread = 1 }) {
  const base = buildContractMonth({ today, closures });
  const due = Object.entries(base.dayStates)
    .filter(([, s]) => s === 'logged')
    .map(([iso]) => iso);
  const picked = [];
  for (let i = 0; i < due.length && picked.length < count; i += spread) picked.push(due[i]);
  return picked;
}
