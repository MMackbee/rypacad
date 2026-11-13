/**
 * Staff booking: one athlete as the staff screens see them (spec
 * 01-spec-admin-booking.md 10.1-10.2) - their pay state, tokens, periods,
 * and bookings grouped this period, next period and later.
 *
 * PURE. Imports from data/staffBooking.js, never the reverse.
 */
import { addDaysISO, parseTimeToMinutes } from './calendar';
import { normalizeAnchorDay, periodFor } from './packages';
import { handicapOf } from './reserved';
import { isFreeComp } from './bookingChanges';
import { periodRows } from './billingHub';
import { firstOf } from './staffCancel';

/**
 * 'no-package' | 'past_due' | 'lapsed' | 'unpaid' | 'paid', the first that
 * holds in that order: no package on file; the household's membership past
 * due, then lapsed; the athlete's billing one-time off the single token, or
 * present and not active. Anything else is paid. The server's
 * lib.membershipAllowsBooking plus "no package" - CHANGE ONE, CHANGE BOTH.
 * Anything but paid adds Free only.
 */
export function payStateOf(athlete, household, pkg) {
  if (!pkg) return 'no-package';
  const status = household?.membership?.status;
  if (status === 'past_due') return 'past_due';
  if (status === 'lapsed') return 'lapsed';
  const billing = athlete?.billing;
  if (billing && billing.oneTime === true && athlete.packageId !== 'single') return 'unpaid';
  if (billing && billing.status !== 'active') return 'unpaid';
  return 'paid';
}

/** A `periodFor` result as `{ start, end }`. */
function span({ periodKey, periodEnd }) {
  return { start: periodKey, end: periodEnd };
}

/** One row's badge: Waitlist, Attended, No-show, Free, Session token, Bonus token or Booked. */
function badgeOf(row) {
  if (row.kind === 'waitlist') return 'Waitlist';
  if (row.status === 'attended') return 'Attended';
  if (row.status === 'noshow') return 'No-show';
  if (isFreeComp(row)) return 'Free';
  if (row.viaSingle) return 'Session token';
  if (row.viaGrace) return 'Bonus token';
  return 'Booked';
}

// periodRows reads one period's rows; staff see every period from this one
// on, so each row is read under one shared key.
const ALL = '*';
const underAll = (list) => (list || []).filter(Boolean).map((x) => ({ ...x, periodKey: ALL }));

/**
 * Every non-cancelled booking and waitlist place dated on or after `start`,
 * as billing hub rows (data/billingHub.js periodRows, so the row actions and
 * StaffCancelSheet read them as on Billing) with `type`, the booking's own
 * `periodKey` and a `badge`, sorted by date, then start time.
 */
function rowsFrom({ bookings, waitlist, sessionsById, start }) {
  const { spent, reserved } = periodRows({ bookings: underAll(bookings), waitlist: underAll(waitlist), periodKey: ALL, sessionsById });
  const keyOf = new Map((bookings || []).filter(Boolean).map((b) => [b.id, b.periodKey ?? null]));
  const typeOf = new Map((waitlist || []).filter(Boolean).map((w) => [w.id || `${w.sessionId}_${w.athleteId}`, w.type ?? null]));
  const minutes = (r) => parseTimeToMinutes(r.time) ?? 24 * 60;
  return [...spent, ...reserved]
    .filter((r) => r.date && r.date >= start)
    .map((r) => {
      const type = r.type ?? typeOf.get(r.id) ?? sessionsById[r.sessionId]?.type ?? null;
      const row = r.kind === 'waitlist' ? { ...r, type } : { ...r, periodKey: keyOf.get(r.id) ?? null };
      return { ...row, badge: badgeOf(row) };
    })
    .sort((a, b) => (a.date === b.date ? minutes(a) - minutes(b) : a.date < b.date ? -1 : 1));
}

/**
 * The athlete model every staff booking screen and sheet reads:
 *
 *   { athleteId, name, first, householdId, householdName, packageName, test,
 *     handicap, pkg, anchorDay, payState, tokens, period: { start, end },
 *     nextPeriod: { start, end }, bookings, waitlist, graceTokens,
 *     heldSessionIds, waitingSessionIds,
 *     groups: { thisPeriod, nextPeriod, later } }
 *
 * `tokens` is liveTokens' position with its next period (or null with no
 * package). The periods are the household's own (its anchor day), from
 * `today`. `test` when the athlete or the household is a test one.
 * `heldSessionIds` are the sessions with a non-cancelled booking;
 * `waitingSessionIds` the ones the athlete waits on. The groups hold the
 * rows from this period on: up to its end, up to the next period's end,
 * and later (Elite's month after next, a staff add past the window).
 */
export function staffAthleteModel({ athlete, household, pkg, bookings, waitlist, graceTokens, sessionsById, tokens, today }) {
  const anchorDay = normalizeAnchorDay(household?.periodAnchorDay);
  const current = periodFor(today, anchorDay);
  const period = span(current);
  const nextPeriod = span(periodFor(addDaysISO(current.periodEnd, 1), anchorDay));
  const name = athlete.name ?? athlete.id;
  const rows = rowsFrom({ bookings, waitlist, sessionsById: sessionsById || {}, start: period.start });
  return {
    athleteId: athlete.id,
    name,
    first: firstOf(name),
    householdId: athlete.householdId ?? household?.id ?? null,
    householdName: household?.name ?? null,
    packageName: pkg?.name ?? null,
    test: athlete.test === true || household?.test === true,
    handicap: handicapOf(athlete),
    pkg: pkg ?? null,
    anchorDay,
    payState: payStateOf(athlete, household, pkg),
    tokens: tokens ?? null,
    period,
    nextPeriod,
    bookings: bookings || [],
    waitlist: waitlist || [],
    graceTokens: graceTokens || [],
    heldSessionIds: (bookings || []).filter((b) => b && b.status !== 'cancelled').map((b) => b.sessionId),
    waitingSessionIds: (waitlist || []).filter(Boolean).map((w) => w.sessionId),
    groups: {
      thisPeriod: rows.filter((r) => r.date <= period.end),
      nextPeriod: rows.filter((r) => r.date > period.end && r.date <= nextPeriod.end),
      later: rows.filter((r) => r.date > nextPeriod.end),
    },
  };
}
