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
  BOOKING_DATES,
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
  SLOTS,
  ALLOWANCE,
  ALLOWANCE_NO_TRAINING,
  ALLOWANCE_NO_TOURNAMENTS,
  SESSION,
} from '../data/seed';

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
 * The limit states are per pool, because the pools are independent: a spent
 * tournament allowance leaves every training block bookable, and the reverse.
 * A single `limit` variant could not express either case honestly.
 */
export function useBooking({ variant = 'open' } = {}) {
  const slots =
    variant === 'full'
      ? SLOTS.map((s) => ({ ...s, capacity: { state: 'full', label: 'Full' } }))
      : SLOTS;

  const allowance = {
    open: ALLOWANCE,
    full: ALLOWANCE,
    confirmed: ALLOWANCE,
    limitTraining: ALLOWANCE_NO_TRAINING,
    limitTournament: ALLOWANCE_NO_TOURNAMENTS,
  }[variant] || ALLOWANCE;

  return useSeedResource({ dates: BOOKING_DATES, slots, allowance });
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

/** GET /coach/roster/:sessionId - the session header only; marks live in useRoster. */
export function useSession() {
  return useSeedResource(SESSION);
}

/** GET /athletes/:id/diagnostics (14). */
export function useDiagnostic() {
  return useSeedResource({
    athlete: DIAGNOSTIC_ATHLETE,
    sections: DIAGNOSTIC_SECTIONS,
  });
}
