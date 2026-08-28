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
  HOLIDAY_CLOSURES_2026_27,
  SEASON,
  SEASON_BY_DATE,
  capacityFor,
  datePill,
  dayLabel,
  resolveBooking,
  upcomingDates,
} from '../data/season';
import {
  ATHLETE,
  CODE_OF_GRIT,
  ONBOARDING,
  DNA_MODULES,
  DNA_STATES,
  DNA_SUMMARY,
  CONTRACT_TIERS,
} from '../data/athlete';
import {
  buildContractMonth,
  longDayLabel,
  pickDueDates,
  todayISO,
} from '../data/calendar';
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
    // A special (a holiday tournament) carries its real event name. Everything
    // else is the generic block for its type - the Workshop/Lab/Arena rotation
    // was an invented placeholder, and no made-up name ships before real
    // sessions exist to book.
    name: s.label || (s.type === 'tournament' ? 'Tournament block' : 'Training block'),
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
export function useSchedule({ variant = 'upcoming', today = todayISO() } = {}) {
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
export function useBooking({ variant = 'open', today = todayISO() } = {}) {
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

  // Before the season opens, the first bookable day is weeks out - say so
  // rather than presenting November dates as if they were this week.
  const seasonNote =
    dates.length && dates[0].iso > today
      ? `The 26/27 season opens ${dayLabel(dates[0].iso, today)} — these are the first bookable blocks.`
      : null;

  return useSeedResource({ dates, slots, allowance, seasonNote, confirmation: BOOKING_CONFIRMATION });
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
export function useSession({ today = todayISO(), blockIndex = 1 } = {}) {
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
        name: session.label || (session.type === 'tournament' ? 'Tournament block' : 'Training block'),
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
export function useAthleteDashboard({ variant = 'populated', today = todayISO() } = {}) {
  // The next session is the athlete's first booked reference, resolved against
  // the season - the old seed invented "The Lab · Sim 2 · Luke" wholesale.
  const firstRef = BOOKED_UPCOMING[0];
  const resolved = variant === 'populated' && firstRef ? resolveBooking(firstRef) : null;
  const nextSession = resolved ? displaySession(resolved, today) : null;

  // The contract summary derives from the same real-month build the Contract
  // screen uses, so the dashboard card and the full screen cannot disagree.
  const summary = variant === 'new' ? null : contractFor('ontrack', today);

  return useSeedResource({
    athlete: ATHLETE,
    nextSession,
    contract: summary
      ? {
          logged: summary.stats.logged,
          total: summary.stats.dueSoFar,
          month: summary.month.name,
          pct: summary.stats.dueSoFar
            ? Math.round((summary.stats.logged / summary.stats.dueSoFar) * 100)
            : 0,
          line: summary.state.line,
        }
      : null,
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
/**
 * The contract month for a demo state, built from the real current month.
 * date-fns/FullCalendar own the calendar shape; this only decides which due
 * days read as missed for each state and writes the copy from the numbers.
 */
function contractFor(variant, today) {
  const closures = HOLIDAY_CLOSURES_2026_27;
  const missedDates =
    variant === 'behind'
      ? pickDueDates({ today, closures, count: 6, spread: 2 })
      : variant === 'ontrack'
      ? pickDueDates({ today, closures, count: 1, spread: 4 })
      : [];

  const m = buildContractMonth({
    today,
    closures,
    missedDates,
    completeAll: variant === 'complete',
    minutesPerDay: 45,
  });

  const state = {
    ontrack: {
      badge: { tone: 'green', label: 'On track' },
      line: `${m.logged} of ${m.dueSoFar} days due so far. ${m.daysLeft} contract days left — one miss still keeps the month.`,
      hint: 'One tap. Nothing else on this screen needs typing.',
    },
    behind: {
      badge: { tone: 'red', label: 'Behind' },
      line: `${m.missed} days behind with ${m.daysLeft} contract days left. Every remaining day has to be logged to make the Commitment Board.`,
      hint: 'Missed a day? Tap it in the grid to add a late entry.',
    },
    complete: {
      badge: { tone: 'yellow', label: 'Complete' },
      line: `All ${m.contractDays} contract days logged. You are on ${m.month}’s Commitment Board.`,
      hint: 'Weekends are not contract days.',
    },
  }[variant];

  const caption = [
    'Weekends are not contract days.',
    ...m.monthClosures.map(
      (c) => `${longDayLabel(c)} is an academy closure and does not count against you.`
    ),
  ].join(' ');

  return {
    month: { label: m.label, name: m.month, start: m.start },
    dayStates: m.dayStates,
    stats: {
      logged: m.logged,
      contractDays: m.contractDays,
      dueSoFar: m.dueSoFar,
      missed: m.missed,
      daysLeft: m.daysLeft,
      streak: m.streak,
      minutes: m.minutes,
    },
    state,
    caption,
  };
}

export function useContract({ variant = 'ontrack', today = todayISO() } = {}) {
  const built = variant === 'none' ? null : contractFor(variant, today);
  return useSeedResource({
    ...(built ?? { month: null, dayStates: {}, stats: null, state: null, caption: null }),
    tiers: CONTRACT_TIERS,
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
