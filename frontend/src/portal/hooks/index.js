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
  TODAY,
  CONSENTS,
  RELATIONSHIPS,
  BOOKED_UPCOMING,
  BOOKED_PAST,
  BOOKING_CONFIRMATION,
  CANCELLED_SESSION,
  ALLOWANCE,
  ALLOWANCE_NO_TRAINING,
  ALLOWANCE_NO_TOURNAMENTS,
  SESSION,
  ROSTER,
} from '../data/seed';
import {
  DROP_IN,
  ELITE_TIERS,
  FITNESS_PACKAGES,
  GOLF_PACKAGES,
} from '../data/packages';
import {
  SCAFFOLD_TODAY,
  SEASON,
  SEASON_BY_DATE,
  capacityFor,
  datePill,
  dayLabel,
  resolveBooking,
  rotationFor,
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

/** How a season session renders on a schedule or booking list. */
function displaySession(s, today) {
  const [time, meridiem] = s.time.split(' ');
  return {
    id: s.id,
    date: s.date,
    dayLabel: dayLabel(s.date, today),
    isToday: s.date === today,
    time,
    meridiem,
    type: s.type,
    // A special (a holiday tournament) carries its own name and is not part of
    // the Workshop / Lab / Arena rotation - the label wins over the placeholder
    // rotation cycle.
    name: s.label || rotationFor(s),
    // The generator assigns no coach or bay - coachId is null by design, so
    // nothing is invented here.
    meta: s.special
      ? 'Holiday event · open to tournament competitors'
      : s.overflow
      ? 'Friday overflow block'
      : null,
  };
}

/**
 * GET /schedule/availability + GET /athletes/:id/allowance (04).
 *
 * The athlete's bookings are { date, block } references resolved against the
 * generated season, so what My Schedule shows can never contradict what Book a
 * Session offers - same session objects, same types, same times. A reference
 * into a closure resolves to null and is dropped rather than rendered.
 */
export function useSchedule({ variant = 'upcoming', today = SCAFFOLD_TODAY } = {}) {
  const resolve = (refs) =>
    refs
      .map((ref) => {
        const s = resolveBooking(ref);
        return s ? { ...displaySession(s, today), badge: ref.badge ?? null } : null;
      })
      .filter(Boolean);

  const sessions = variant === 'empty' ? [] : resolve(BOOKED_UPCOMING);
  const past = variant === 'empty' ? [] : resolve(BOOKED_PAST);
  const cancelled = variant === 'cancelled' ? CANCELLED_SESSION : null;

  return useSeedResource({ sessions, past, cancelled, allowance: ALLOWANCE });
}

/**
 * GET /schedule/availability + GET /athletes/:id/allowance (05).
 *
 * Availability comes from the generated season, so what the screen shows is the
 * real weekly pattern with closures applied. Only the visible window is passed
 * through the seam - the screen renders one day at a time.
 *
 * The limit states are per pool, because the pools are independent: a spent
 * tournament allowance leaves every training block bookable, and the reverse.
 * A single `limit` variant could not express either case honestly.
 */
export function useBooking({ variant = 'open', today = SCAFFOLD_TODAY } = {}) {
  const dates = upcomingDates(SEASON, today, 7).map(datePill);

  const slots = dates.flatMap((d) =>
    (SEASON_BY_DATE.get(d.iso) ?? []).map((s) => ({
      ...displaySession(s, today),
      // The screen splits the day list on this; displaySession's date is the
      // same value, kept under both names until the screen is reworked.
      time: s.time,
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

  return useSeedResource({ dates, slots, allowance, confirmation: BOOKING_CONFIRMATION });
}

/** GET /athletes?guardian=:id + GET /billing/:householdId (08). */
export function useHousehold({ variant = 'three' } = {}) {
  const children =
    variant === 'one' ? HOUSEHOLD.children.slice(0, 1) : HOUSEHOLD.children;
  const billing = variant === 'payment' ? BILLING_ISSUE : HOUSEHOLD.billing;
  return useSeedResource({ ...HOUSEHOLD, date: TODAY, children, billing });
}

/**
 * GET /enrollment/form (02) - the consent copy and relationship options.
 * Legal copy is content the academy edits, not something a screen hardcodes.
 */
export function useEnrollmentForm() {
  return useSeedResource({ consents: CONSENTS, relationships: RELATIONSHIPS });
}

/**
 * GET /packages (02 step 3, and later 10 and 15).
 *
 * The catalogue reads through the seam like everything else: the handoff's
 * state list has `tiers[]` arriving from the API, and a hardcoded import is a
 * screen that cannot survive a price change without a deploy.
 */
export function usePackages() {
  return useSeedResource({
    golf: GOLF_PACKAGES,
    dropIn: DROP_IN,
    fitness: FITNESS_PACKAGES,
    elite: ELITE_TIERS,
  });
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
  const onDate = SEASON_BY_DATE.get(today) ?? [];
  // Clamp rather than fall back: a day with fewer blocks than the requested
  // index (a holiday-tournament day has one) must not label its only session
  // "Block 2 of 1".
  const index = Math.min(blockIndex, Math.max(0, onDate.length - 1));
  const session = onDate[index];

  // Built unconditionally - a bare `return` before useSeedResource would make
  // this a conditional hook call.
  const value = session
    ? {
        id: session.id,
        type: session.type,
        blockLabel: `Block ${index + 1} of ${onDate.length}`,
        name: session.label || rotationFor(session),
        meta: `${blockRange(session.time)} · ${session.capacity} capacity · ${ROSTER.length} expected`,
        startsIn: SESSION.startsIn,
      }
    : SESSION;

  return useSeedResource(value);
}

/**
 * "4:00 PM" -> "4:00-5:00 PM", "12:30 PM" -> "12:30-1:30 PM",
 * "11:30 AM" -> "11:30-12:30 PM". Blocks are one hour, so the end keeps the
 * start's minutes and the meridiem flips across noon/midnight.
 */
function blockRange(time) {
  const [clock, meridiem] = time.split(' ');
  const [h, m] = clock.split(':').map(Number);
  // Total minutes on a 24h clock, then add the hour.
  const start24 = ((h % 12) + (meridiem === 'PM' ? 12 : 0)) * 60 + m;
  const end24 = (start24 + 60) % (24 * 60);
  const endH24 = Math.floor(end24 / 60);
  const endH = endH24 % 12 === 0 ? 12 : endH24 % 12;
  const endMeridiem = endH24 < 12 ? 'AM' : 'PM';
  const mm = String(m).padStart(2, '0');
  return `${clock}-${endH}:${mm} ${endMeridiem}`;
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

/**
 * GET /admin/fitness-completion + enrollment + block fill (15).
 *
 * The filter cuts by package, matching a row's packageIds against the filter
 * id. Org-level rows (packageIds: null) survive every filter — that work still
 * exists whichever tier Phil is looking at. The enrolled count follows the
 * filter so the header's number and the stat card cannot disagree; block fill
 * is facility-wide and cannot be cut by tier, which the screen says.
 */
export function useAdminDashboard({ variant = 'populated' } = {}) {
  const filter = variant === 'filtered' ? TIER_FILTERS[1] : TIER_FILTERS[0];
  const matches = (o) =>
    filter.id === 'all' || o.packageIds == null || o.packageIds.includes(filter.id);

  return useSeedResource({
    outstanding: OUTSTANDING.filter(matches),
    metrics:
      filter.id === 'all'
        ? ADMIN_METRICS
        : { ...ADMIN_METRICS, enrolled: filter.count, enrolledLabel: `athletes on ${filter.label.replace(' only', '')}` },
    enrollment: ENROLLMENT_BY_PACKAGE,
    highlightPackage: filter.id === 'all' ? null : filter.id,
    blockFill: BLOCK_FILL,
    filter,
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
