/**
 * Read hooks for the portal.
 *
 * Each one names the endpoint it will call when the API lands (see
 * docs/portal/design-handoff.md, "Data fetching"). Until then they resolve seed
 * data through useSeedResource, which already returns the {data, loading, error}
 * shape an async call produces.
 *
 * Access control note: the role filtering these hooks imply is presentation
 * only. The handoff is explicit that every request must re-check the caller's
 * role *and* row-level ownership server-side - a parent must never be able to
 * reach another family's records by guessing an id. Nothing in this directory
 * substitutes for that.
 */

import useSeedResource from './useSeedResource';
import {
  COACH,
  COACH_BLOCKS,
  COACH_BLOCKS_CONCURRENT,
  ATTENTION_LIST,
  COACH_OUTSTANDING,
  DIAGNOSTIC_ATHLETE,
  DIAGNOSTIC_SECTIONS,
  HOUSEHOLD,
  BILLING_ISSUE,
  SCHEDULE,
  CANCELLED_SESSION,
  ALLOWANCE,
  ALLOWANCE_NO_TRAINING,
  ALLOWANCE_NO_TOURNAMENTS,
  SESSION,
  ROSTER,
} from '../data/seed';
import {
  SCAFFOLD_TODAY,
  SEASON,
  capacityFor,
  datePill,
  rotationFor,
  sessionsForDate,
  upcomingDates,
} from '../data/season';

export { default as useSeedResource } from './useSeedResource';
export { default as useAuthSession } from './useAuthSession';
export { default as useRoster } from './useRoster';

/** GET /schedule/availability + GET /athletes/:id/allowance (04). */
export function useSchedule({ variant = 'upcoming' } = {}) {
  const sessions = variant === 'empty' ? [] : SCHEDULE;
  const cancelled = variant === 'cancelled' ? CANCELLED_SESSION : null;
  return useSeedResource({ sessions, cancelled, allowance: ALLOWANCE });
}

/**
 * GET /schedule/availability + GET /athletes/:id/allowance (05).
 *
 * Availability now comes from the generated season rather than a hand-written
 * slot list, so what the screen shows is the real weekly pattern with closures
 * applied. Only the visible window is passed through the seam - the full season
 * is 269 sessions and the screen renders one day at a time.
 *
 * The limit states are per pool, because the pools are independent: a spent
 * tournament allowance leaves every training block bookable, and the reverse.
 * A single `limit` variant could not express either case honestly.
 */
export function useBooking({ variant = 'open', today = SCAFFOLD_TODAY } = {}) {
  const dates = upcomingDates(SEASON, today, 7).map(datePill);

  const slots = dates.flatMap((d) =>
    sessionsForDate(SEASON, d.iso).map((s) => ({
      id: s.id,
      iso: s.iso ?? d.iso,
      date: d.iso,
      time: s.time,
      type: s.type,
      overflow: s.overflow,
      name: rotationFor(s),
      // The generator assigns no coach or bay - coachId is null by design, so
      // nothing is invented here. Overflow is the one fact a block carries.
      meta: s.overflow ? 'Friday overflow block' : null,
      capacity:
        variant === 'full'
          ? { state: 'full', label: 'Full' }
          : capacityFor(s),
      note:
        'Join the waitlist - you are notified if a spot opens, and unlimited makeups still apply.',
    }))
  );

  const allowance = {
    open: ALLOWANCE,
    full: ALLOWANCE,
    confirmed: ALLOWANCE,
    limitTraining: ALLOWANCE_NO_TRAINING,
    limitTournament: ALLOWANCE_NO_TOURNAMENTS,
  }[variant] || ALLOWANCE;

  return useSeedResource({ dates, slots, allowance });
}

/** GET /athletes?guardian=:id + GET /billing/:householdId (08). */
export function useHousehold({ variant = 'three' } = {}) {
  const children =
    variant === 'one' ? HOUSEHOLD.children.slice(0, 1) : HOUSEHOLD.children;
  const billing = variant === 'payment' ? BILLING_ISSUE : HOUSEHOLD.billing;
  return useSeedResource({ ...HOUSEHOLD, children, billing });
}

/** GET /coach/blocks?date=today - filtered by coach assignment, not role (12). */
export function useCoachDay({ variant = 'today' } = {}) {
  const blocks =
    variant === 'concurrent'
      ? COACH_BLOCKS_CONCURRENT
      : variant === 'none'
      ? []
      : COACH_BLOCKS;

  return useSeedResource({
    coach: COACH,
    blocks,
    concurrent: variant === 'concurrent',
    attention: ATTENTION_LIST,
    outstanding: COACH_OUTSTANDING,
  });
}

/**
 * GET /coach/roster/:sessionId - the session header only; marks live in useRoster.
 *
 * Reads the block out of the generated season rather than a hand-written
 * constant, so the roster header matches what the schedule actually says is
 * running: same date, same block order, same capacity.
 */
export function useSession({ today = SCAFFOLD_TODAY, blockIndex = 1 } = {}) {
  const onDate = sessionsForDate(SEASON, today);
  const session = onDate[blockIndex] || onDate[0];

  // Built unconditionally - a bare `return` before useSeedResource would make
  // this a conditional hook call.
  const value = session
    ? {
        id: session.id,
        type: session.type,
        blockLabel: `Block ${blockIndex + 1} of ${onDate.length}`,
        name: rotationFor(session),
        meta: `${blockRange(session.time)} · ${session.capacity} capacity · ${ROSTER.length} expected`,
        startsIn: SESSION.startsIn,
      }
    : SESSION;

  return useSeedResource(value);
}

/** "4:00 PM" -> "4:00-5:00 PM". Blocks are one hour. */
function blockRange(time) {
  const hour = parseInt(time, 10);
  const meridiem = time.slice(-2);
  const end = (hour % 12) + 1;
  return `${time.replace(/ [AP]M$/, '')}-${end}:00 ${meridiem}`;
}

/** GET /athletes/:id/diagnostics (14). */
export function useDiagnostic() {
  return useSeedResource({
    athlete: DIAGNOSTIC_ATHLETE,
    sections: DIAGNOSTIC_SECTIONS,
  });
}
