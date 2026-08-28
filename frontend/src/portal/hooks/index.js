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
 * substitutes for that. For the live path, firestore.rules is that boundary.
 *
 * Live data: when REACT_APP_PORTAL_LIVE_DATA === 'true', useSchedule and
 * useBooking source from the Firestore adapter in ./live.js instead of seed
 * data - same payload shapes, arriving async through useSeedResource's
 * source mode, so screens see {data: null, loading: true} first and cannot
 * tell the modes apart. With the flag unset the seed path is untouched and
 * the demo needs no emulator, no network, and no signed-in user.
 *
 * Practice mode (Onboarding program v1, docs/portal/TEAM.md): useSchedule and
 * useBooking accept { practice: true }, which pins the hook to the seed source
 * even when REACT_APP_PORTAL_LIVE_DATA === 'true'. INVARIANT: onboarding /
 * practice performs ZERO Firestore writes (and no live reads either) — the
 * practice check short-circuits before isLive() is consulted, so nothing in
 * ./live.js can execute, and book() resolves locally. Why: onboarding is a
 * family learning the app by doing the real actions on the real screens, and
 * a learner must not be able to create a real booking (or spend a real
 * allowance) by practicing. Practice entries are component state, badged
 * PRACTICE, and reset on exit.
 */

import { useRef } from 'react';
import useSeedResource from './useSeedResource';
import {
  ERR,
  LiveDataError,
  createBooking,
  fetchAthlete,
  fetchBookings,
  fetchCurrentUser,
  fetchPackage,
  fetchSessions,
  fetchSessionsByIds,
  isLive,
} from './live';
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
  makeAllowance,
  poolFor,
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
  nextMonthFirstShort,
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
export { default as useOnboardingStatus } from './onboarding';

/**
 * Harness demo states (contract v1.1): every data-bearing hook accepts
 * variant 'loading' (perpetually {data: null, loading: true}) and 'error'
 * (a user-facing failure), so the skeleton and error treatments are
 * reviewable per screen. Demo variants never touch the live source.
 */
const DEMO_DELAY_FOREVER = 2147483647; // setTimeout's max; larger fires instantly
function demoOpts(variant, message) {
  if (variant === 'loading') return { delay: DEMO_DELAY_FOREVER };
  if (variant === 'error') return { error: new Error(message) };
  return null;
}

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
 * Shared copy for the booking waitlist note - one string, both data modes.
 */
const WAITLIST_NOTE =
  'Join the waitlist - you are notified if a spot opens, and unlimited makeups still apply.';

/* ------------------------------------------------------------------------- *
 * Live assembly - Firestore docs (via ./live.js) into the exact payload
 * shapes the seed path produces. Screens must not be able to tell the modes
 * apart, so any shape decision here defers to the seed code above/below it.
 * ------------------------------------------------------------------------- */

/**
 * Who the signed-in user is and what they may book against: their users doc,
 * their athlete record, its package, and every booking on file. This sprint
 * wires the athlete surface only - a parent booking for a linked athlete
 * needs an athlete picker first, which is a frontend/PM sequencing question.
 */
async function liveAthleteContext() {
  const profile = await fetchCurrentUser();
  if (!profile.athleteId) {
    throw new LiveDataError(
      ERR.INVALID,
      `users/${profile.uid} has no athleteId - the live schedule and booking ` +
        'surfaces are wired for athlete-linked accounts only in this sprint.'
    );
  }
  const athlete = await fetchAthlete(profile.athleteId);
  const pkg = athlete.packageId ? await fetchPackage(athlete.packageId) : null;
  const bookings = await fetchBookings(profile.athleteId);
  return { profile, athlete, pkg, bookings };
}

/**
 * The two-pool allowance, derived by counting this cycle's bookings against
 * the package limits - per the contract there is no stored counter to drift.
 * Cancelled bookings do not spend; attended/no-show ones already did.
 * The cycle is the calendar month, resetting on the first (matching the
 * seed's RESETS_ON); true Stripe billing anchors are a later refinement.
 */
function deriveAllowance(pkg, bookings, today) {
  if (!pkg) return null;
  const cycleStart = `${today.slice(0, 7)}-01`;
  const spent = bookings.filter((b) => b.status !== 'cancelled' && b.date >= cycleStart);
  return makeAllowance(pkg, {
    trainingUsed: spent.filter((b) => b.pool === 'training').length,
    tournamentsUsed: spent.filter((b) => b.pool === 'tournaments').length,
    resetsOn: nextMonthFirstShort(today),
  });
}

/** Sort key: chronological, then block order (session ids end in the block index). */
function byDateThenId(a, b) {
  return a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1;
}

/** Live payload for useSchedule - same shape as the seed branch produces. */
async function liveSchedule(today) {
  const ctx = await liveAthleteContext();
  const active = ctx.bookings.filter((b) => b.status !== 'cancelled');

  // Join bookings to their session docs - time, label and overflow/special
  // flags live on the session, and a booking whose session no longer exists
  // is dropped rather than rendered, mirroring the seed's null-resolve rule.
  const sessionsById = new Map(
    (await fetchSessionsByIds(active.map((b) => b.sessionId))).map((s) => [s.id, s])
  );
  const resolve = (b) => {
    const s = sessionsById.get(b.sessionId);
    return s
      ? {
          ...displaySession(s, today),
          badge: b.status === 'confirmed' ? { tone: 'green', label: 'Confirmed' } : null,
        }
      : null;
  };

  const upcoming = active.filter((b) => b.date >= today).map(resolve).filter(Boolean);
  const past = active.filter((b) => b.date < today).map(resolve).filter(Boolean);
  upcoming.sort(byDateThenId);
  past.sort((a, b) => -byDateThenId(a, b)); // most recent first

  return {
    sessions: upcoming,
    past,
    // Academy-cancellation banners need a cancellation reason the contract
    // does not carry yet - flagged in the routing report, null until then.
    cancelled: null,
    allowance: deriveAllowance(ctx.pkg, ctx.bookings, today),
  };
}

/**
 * Live payload for useBooking, plus the identity the book() action needs.
 * The hook strips `identity` off before it reaches the screen - the payload
 * the screen sees is shape-identical to the seed branch.
 */
async function liveBooking(today) {
  const ctx = await liveAthleteContext();
  const sessions = await fetchSessions(today, 7);
  sessions.sort(byDateThenId);

  const dates = [...new Set(sessions.map((s) => s.date))].map(datePill);
  const slots = sessions.map((s) => ({
    ...displaySession(s, today),
    time: s.time,
    capacity: capacityFor(s),
    note: WAITLIST_NOTE,
  }));

  const seasonNote =
    dates.length && dates[0].iso > today
      ? `The 26/27 season opens ${dayLabel(dates[0].iso, today)} — these are the first bookable blocks.`
      : null;

  return {
    dates,
    slots,
    allowance: deriveAllowance(ctx.pkg, ctx.bookings, today),
    seasonNote,
    // Same shape as the seed confirmation; the email is the real account's,
    // and name/when/pool are filled by the screen from the booked slot.
    confirmation: { ...BOOKING_CONFIRMATION, email: ctx.profile.email },
    identity: { athleteId: ctx.athlete.id, householdId: ctx.athlete.householdId },
  };
}

/**
 * GET /schedule/availability + GET /athletes/:id/allowance (04).
 *
 * Seed mode: the athlete's bookings are { date, block } references resolved
 * against the generated season, so what My Schedule shows can never contradict
 * what Book a Session offers - same session objects, same types, same times. A
 * reference into a closure resolves to null and is dropped rather than
 * rendered.
 *
 * Live mode: bookings/{athleteId} joined to their session docs, same shape.
 * The demo-state `variant` knob only applies to seed data - live data shows
 * whatever is real.
 *
 * `practice: true` (onboarding) pins this hook to the seed source regardless
 * of the live flag — see the practice-mode invariant in the file header.
 */
export function useSchedule({ variant = 'upcoming', today = todayISO(), practice = false } = {}) {
  // Practice short-circuits before isLive(): with practice set, the live
  // source below is unreachable and ./live.js never runs.
  const live = !practice && isLive();

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

  const demo = demoOpts(variant, "Your schedule didn't load.");
  return useSeedResource(
    demo || live ? null : { sessions, past, cancelled, allowance: ALLOWANCE },
    demo ?? (live ? { source: () => liveSchedule(today), deps: ['schedule', today] } : undefined)
  );
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
 *
 * Live mode sources sessions and the derived allowance from Firestore, and
 * the returned `book(slot)` persists a booking through the adapter - which
 * pool it spends is recorded on the write, and firestore.rules re-checks it
 * against the session's real type. In seed mode book(slot) resolves locally,
 * matching today's screen behavior (the screen keeps the booked slot in
 * component state).
 *
 * `practice: true` (onboarding) pins this hook to the seed source regardless
 * of the live flag, and book(slot) resolves locally exactly as seed mode
 * does — see the practice-mode invariant in the file header.
 */
export function useBooking({ variant = 'open', today = todayISO(), practice = false } = {}) {
  // Practice short-circuits before isLive(): with practice set, the live
  // source below is unreachable, ./live.js never runs, and book() takes the
  // local (seed) branch — a practice booking cannot become a real one.
  const live = !practice && isLive();
  // Who the booking is for, captured when the live source resolves. A ref,
  // not state: it never drives a render, only the book() write.
  const identityRef = useRef(null);

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
      note: WAITLIST_NOTE,
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

  const demo = demoOpts(variant, "Open blocks didn't load.");
  const state = useSeedResource(
    demo || live ? null : { dates, slots, allowance, seasonNote, confirmation: BOOKING_CONFIRMATION },
    demo ??
      (live
        ? {
            source: async () => {
              const { identity, ...payload } = await liveBooking(today);
              identityRef.current = identity;
              return payload;
            },
            deps: ['booking', today],
          }
        : undefined)
  );

  /**
   * Persist a booking for a slot off this hook's `data.slots`. Additive to the
   * {data, loading, error} contract - existing screens ignore it; wiring the
   * confirm tap to `await book(slot)` is the frontend lane's move.
   */
  const book = async (slot) => {
    if (!live) return slot;
    const identity = identityRef.current;
    if (!identity) {
      throw new LiveDataError(
        ERR.INVALID,
        'book() called before the booking data finished loading.'
      );
    }
    return createBooking({
      athleteId: identity.athleteId,
      sessionId: slot.id,
      date: slot.date,
      type: slot.type,
      pool: poolFor(slot.type),
      householdId: identity.householdId,
    });
  };

  return { ...state, book };
}

/** GET /athletes?guardian=:id + GET /billing/:householdId (08). */
export function useHousehold({ variant = 'three' } = {}) {
  const demo = demoOpts(variant, "Your family's data didn't load.");
  const children =
    variant === 'one' ? HOUSEHOLD.children.slice(0, 1) : HOUSEHOLD.children;
  const billing = variant === 'payment' ? BILLING_ISSUE : HOUSEHOLD.billing;
  return useSeedResource(
    demo ? null : { ...HOUSEHOLD, date: TODAY, children, billing },
    demo ?? undefined
  );
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
  const demo = demoOpts(variant, "Your dashboard didn't load.");

  // The next session is the athlete's first booked reference, resolved against
  // the season - the old seed invented "The Lab · Sim 2 · Luke" wholesale.
  const firstRef = BOOKED_UPCOMING[0];
  const resolved = variant === 'populated' && firstRef ? resolveBooking(firstRef) : null;
  const nextSession = resolved ? displaySession(resolved, today) : null;

  // The contract summary derives from the same real-month build the Contract
  // screen uses, so the dashboard card and the full screen cannot disagree.
  const summary = variant === 'new' || demo ? null : contractFor('ontrack', today);

  return useSeedResource(demo ? null : {
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
  }, demo ?? undefined);
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
