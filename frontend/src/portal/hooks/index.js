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
import {
  ATHLETE,
  NEXT_SESSION,
  CONTRACT_SUMMARY,
  CODE_OF_GRIT,
  ONBOARDING,
  DNA_MODULES,
  DNA_STATES,
  DNA_SUMMARY,
  CONTRACT_MONTH,
  CONTRACT_TIERS,
  CONTRACT_STATES,
  CONTRACT_TOTAL_DAYS,
  contractGrid,
} from '../data/athlete';
import {
  ATHLETE_DETAIL,
  CONTRACT_HISTORY,
  LIMITED_DATA_CHECKLIST,
  DUNNING_LADDER,
  BILLING_STATES,
  MEMBERSHIP,
  PAYMENT_METHOD,
  INVOICES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_NOTE,
} from '../data/parent';
import {
  OUTSTANDING,
  ADMIN_METRICS,
  ENROLLMENT_BY_PACKAGE,
  BLOCK_FILL,
  TIER_FILTERS,
  STAFF,
  STAFF_ROLES,
  AUDIT_NOTE,
  SCREENING_NOTE,
  NEWSLETTER_SECTIONS,
  NEWSLETTER_LANDED,
  NEWSLETTER_ISSUE,
  NEWSLETTER_STATES,
} from '../data/admin';

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
      // A special (a holiday tournament) carries its own name and is not part
      // of the Workshop / Lab / Arena rotation - the label wins over the
      // placeholder rotation cycle.
      name: s.label || rotationFor(s),
      // The generator assigns no coach or bay - coachId is null by design, so
      // nothing is invented here. Overflow is the one fact a block carries.
      meta: s.special ? 'Holiday event · open to tournament competitors' : s.overflow ? 'Friday overflow block' : null,
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
        name: session.label || rotationFor(session),
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

/** GET /athletes/:id + next session + contract summary (03). */
export function useAthleteDashboard({ variant = 'populated' } = {}) {
  return useSeedResource({
    athlete: ATHLETE,
    nextSession: variant === 'populated' ? NEXT_SESSION : null,
    contract: variant === 'new' ? null : CONTRACT_SUMMARY,
    onboarding: variant === 'new' ? ONBOARDING : null,
    codeOfGrit: CODE_OF_GRIT,
  });
}

/**
 * GET /athletes/:id/diagnostics (06).
 *
 * Returns raw captured measurements and nothing else. No score, grade, letter
 * or percentile is derived anywhere in this path — the Blueprint measures an
 * athlete against their own future progress, not a model swing, and a rating
 * computed here would leak onto the screen.
 */
export function usePracticeDNA({ variant = 'complete' } = {}) {
  const captured = DNA_STATES[variant] ?? DNA_STATES.complete;
  return useSeedResource({
    summary: DNA_SUMMARY[variant] ?? DNA_SUMMARY.complete,
    modules: DNA_MODULES.map((m) => ({ ...m, captured: captured.includes(m.id) })),
  });
}

/** GET + POST /athletes/:id/commitment-contract (07). */
export function useContract({ variant = 'ontrack' } = {}) {
  const hasContract = variant !== 'none';
  return useSeedResource({
    month: CONTRACT_MONTH,
    totalDays: CONTRACT_TOTAL_DAYS,
    tiers: CONTRACT_TIERS,
    state: hasContract ? CONTRACT_STATES[variant] : null,
    grid: hasContract ? contractGrid(variant) : [],
    tierMinutes: 45,
  });
}

/** GET /athletes/:id (09) — parent view of one linked athlete. */
export function useAthleteDetail({ variant = 'populated' } = {}) {
  const full = variant === 'populated';
  return useSeedResource({
    athlete: ATHLETE_DETAIL,
    history: full ? CONTRACT_HISTORY : [],
    checklist: full ? [] : LIMITED_DATA_CHECKLIST,
    hasEnoughData: full,
  });
}

/** GET /billing/:householdId + /invoices (10). */
export function useBilling({ variant = 'active' } = {}) {
  const state = BILLING_STATES[variant] ?? BILLING_STATES.active;
  return useSeedResource({
    state,
    ladder: DUNNING_LADDER,
    membership: MEMBERSHIP,
    paymentMethod: PAYMENT_METHOD,
    invoices: INVOICES,
    declining: variant !== 'active',
  });
}

/** GET/PUT /guardians/:id/notification-preferences (11). */
export function useNotificationPrefs({ variant = 'default' } = {}) {
  return useSeedResource({
    categories: NOTIFICATION_CATEGORIES,
    note: NOTIFICATION_NOTE,
    saved: variant === 'saved',
  });
}

/** GET /admin/fitness-completion + enrollment + block fill (15). */
export function useAdminDashboard({ variant = 'populated' } = {}) {
  const filtered = variant === 'filtered';
  return useSeedResource({
    outstanding: filtered ? OUTSTANDING.filter((o) => o.tone === 'red') : OUTSTANDING,
    metrics: ADMIN_METRICS,
    enrollment: ENROLLMENT_BY_PACKAGE,
    blockFill: BLOCK_FILL,
    filter: filtered ? TIER_FILTERS[1] : TIER_FILTERS[0],
  });
}

/** GET/POST /admin/staff-accounts (16) — owner only. */
export function useStaff({ variant = 'populated' } = {}) {
  return useSeedResource({
    staff: STAFF,
    roles: STAFF_ROLES,
    auditNote: AUDIT_NOTE,
    screeningNote: SCREENING_NOTE,
    adding: variant === 'add',
  });
}

/** GET /newsletter/issues/:id (17). */
export function useNewsletter({ variant = 'missing' } = {}) {
  const landed = NEWSLETTER_LANDED[variant] ?? [];
  return useSeedResource({
    issue: NEWSLETTER_ISSUE,
    state: NEWSLETTER_STATES[variant] ?? NEWSLETTER_STATES.missing,
    sections: NEWSLETTER_SECTIONS.map((s) => ({ ...s, landed: landed.includes(s.id) })),
    outstandingCount: NEWSLETTER_SECTIONS.length - landed.length,
    status: variant,
  });
}
