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

import { useState } from 'react';
import useSeedResource from './useSeedResource';
import { bump, useInvalidation } from './invalidate';
import {
  ERR,
  LiveDataError,
  cancelBooking,
  createBooking,
  createContractLog,
  deleteContractLog,
  fetchAthlete,
  fetchAthletesByIds,
  fetchBookings,
  fetchBookingsBySession,
  fetchCoachAthletes,
  fetchContractLogs,
  fetchCurrentUser,
  fetchHousehold,
  fetchHouseholdAthletes,
  fetchPackage,
  fetchSessions,
  fetchSessionsByIds,
  fetchSessionsInRange,
  fetchTournamentResults,
  fetchTournamentResultsForSession,
  isLive,
  saveTournamentResults,
  setBookingNoshowReason,
  updateBookingStatus,
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
  SEASON,
  SEASON_BOUNDS,
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
  addDaysISO,
  ageFromDob,
  buildContractMonth,
  buildContractMonthFromLogs,
  longDayLabel,
  monthBounds,
  nextMonthFirstShort,
  parseTimeToMinutes,
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
import { TOUR_SEED, bracketFor, deriveTourStandings } from '../data/tour';
import { SPECIALISTS, SPECIALIST_BOOKING_WINDOW_DAYS } from '../data/specialists';

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

/** id -> catalogue entry (data/specialists.js) — Phil/Yannick, never invented. */
const SPECIALIST_BY_ID = new Map(SPECIALISTS.map((sp) => [sp.id, sp]));

/**
 * The generic name a session with no explicit label falls back to —
 * 'Tournament block' / 'Training block' for the generator's two original
 * types, or (Sprint 9 pin, contract v1.7) '<sessionNoun> · <name>' for a
 * specialist 1-on-1 (data/specialists.js), e.g. "Mental game session ·
 * Yannick" — NEVER 'Training block' for a phil/mental session. Shared by
 * every place a bare session type becomes a readable name: displaySession
 * below, plus useCoachDay's live day view and liveAthleteDetail's upcoming
 * list, which each had their own copy of the same ternary before this
 * sprint (useSession, the one other copy, reads only the generated season,
 * which never produces a phil/mental type — routed through this helper too
 * anyway, so a fourth divergent copy can never reappear here).
 */
export function genericSessionName(type) {
  const specialist = SPECIALIST_BY_ID.get(type);
  if (specialist) return `${specialist.sessionNoun} · ${specialist.name}`;
  return type === 'tournament' ? 'Tournament block' : 'Training block';
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
    name: s.label || genericSessionName(s.type),
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
 * The signed-in athlete's profile + athlete doc only - no package or booking
 * fetch, unlike liveAthleteContext above, since practice logging needs
 * neither. Shared by usePracticeLog's read and write paths.
 */
async function liveAthleteIdentity() {
  const profile = await fetchCurrentUser();
  if (!profile.athleteId) {
    throw new LiveDataError(
      ERR.INVALID,
      `users/${profile.uid} has no athleteId - practice logging is wired for ` +
        'athlete-linked accounts only.'
    );
  }
  const athlete = await fetchAthlete(profile.athleteId);
  return { profile, athlete };
}

/**
 * The full package catalogue as one flat list, and a lookup by id - used to
 * join an athlete's packageId to its name (and, for billing only, its
 * STATIC price; Firestore package docs carry no price by policy).
 */
const PACKAGE_CATALOGUE = [...GOLF_PACKAGES, DROP_IN, ...FITNESS_PACKAGES, ...ELITE_TIERS];
function packageById(packageId) {
  return PACKAGE_CATALOGUE.find((p) => p.id === packageId) || null;
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
          badge:
            b.status === 'confirmed'
              ? { tone: 'green', label: 'Confirmed' }
              : b.status === 'attended'
              ? { tone: 'neutral', label: 'Attended' }
              : b.status === 'noshow'
              ? { tone: 'red', label: 'No-show' }
              : null,
          // Sprint 9 pin: cancel(bookingId) below needs the real booking id
          // (never the session id displaySession already carries as `id`),
          // and `cancellable` is the exact pinned formula - status
          // 'confirmed' AND still in the future. Past items compute false
          // here for free (their date is always < today).
          bookingId: b.id,
          status: b.status,
          cancellable: b.status === 'confirmed' && b.date > today,
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
 * Who is booking (Sprint 6 pin, QA #2): an athlete's own account, or a parent
 * booking for one of their linked athletes. Distinct from liveAthleteContext,
 * which assumes an athlete-linked account throws otherwise — a parent user
 * has no athleteId of their own, and which child they are booking for is a
 * per-call choice (book(slot, { athleteId })), not something resolved once
 * up front here.
 */
async function liveBookingIdentity() {
  const profile = await fetchCurrentUser();
  if (profile.athleteId) return { role: 'athlete', profile };
  if (profile.householdId) return { role: 'parent', profile };
  throw new LiveDataError(
    ERR.INVALID,
    `users/${profile.uid} has neither athleteId nor householdId - the booking ` +
      'surface is wired for athlete-linked or parent accounts only.'
  );
}

/**
 * Live payload for useBooking, plus the identity the book() action needs.
 * The hook strips `identity` off before it reaches the screen - the payload
 * the screen sees is shape-identical to the seed branch.
 *
 * An athlete caller gets their own allowance up front, same as before. A
 * parent caller has not chosen a child yet at this point - `allowance` is
 * null rather than any one child's number (never invented, never picked for
 * them); the screen's child picker reads each child's own allowance from
 * useHouseholdAthletes(), which already returns it per athlete.
 */
async function liveBooking(today) {
  const who = await liveBookingIdentity();
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

  let allowance = null;
  let identity;
  if (who.role === 'athlete') {
    const athlete = await fetchAthlete(who.profile.athleteId);
    const pkg = athlete.packageId ? await fetchPackage(athlete.packageId) : null;
    const bookings = await fetchBookings(athlete.id);
    allowance = deriveAllowance(pkg, bookings, today);
    identity = { role: 'athlete', athleteId: athlete.id, householdId: athlete.householdId };
  } else {
    identity = { role: 'parent', householdId: who.profile.householdId };
  }

  return {
    dates,
    slots,
    allowance,
    seasonNote,
    // Same shape as the seed confirmation; the email is the real account's,
    // and name/when/pool are filled by the screen from the booked slot.
    confirmation: { ...BOOKING_CONFIRMATION, email: who.profile.email },
    identity,
  };
}

/**
 * The seed cast's one athlete id (matches data/tour.js's TOUR_SEED_NAMES and
 * the real Whitfield athleteId elsewhere in this repo — never a fresh
 * invented id). Seed mode has no real booking docs to read an id off of, so
 * cancel(bookingId) needs SOMETHING to echo back; this mirrors the live
 * keyspace's own `{athleteId}_{sessionId}` formula (docs/portal/TEAM.md
 * "Booking id is `{athleteId}_{sessionId}`") purely for shape parity with
 * live mode. It is never looked up against anything - seed's cancel() is a
 * local no-op (see useSchedule below).
 */
const SEED_ATHLETE_ID = 'jordan';
function seedBookingId(sessionId) {
  return `${SEED_ATHLETE_ID}_${sessionId}`;
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
  // Post-write invalidation seam (Sprint 6 pin): re-run after any booking
  // write, not just one made through this hook instance.
  const bookingsGen = useInvalidation('bookings');

  const resolve = (refs) =>
    refs
      .map((ref) => {
        const s = resolveBooking(ref);
        if (!s) return null;
        return {
          ...displaySession(s, today),
          badge: ref.badge ?? null,
          // Sprint 9 pin: same three fields the live branch's resolve()
          // adds, so cancel()/`cancellable` behave identically in both
          // modes. Every BOOKED_UPCOMING/BOOKED_PAST reference is a
          // confirmed booking by construction (there is no seed concept of
          // attended/no-show/cancelled bookings yet), so `status` is fixed
          // and `cancellable` reduces to the same date check the live
          // branch runs.
          bookingId: seedBookingId(s.id),
          status: 'confirmed',
          cancellable: s.date > today,
        };
      })
      .filter(Boolean);

  const sessions = variant === 'empty' ? [] : resolve(BOOKED_UPCOMING);
  const past = variant === 'empty' ? [] : resolve(BOOKED_PAST);
  const cancelled = variant === 'cancelled' ? CANCELLED_SESSION : null;

  const demo = demoOpts(variant, "Your schedule didn't load.");
  const state = useSeedResource(
    demo || live ? null : { sessions, past, cancelled, allowance: ALLOWANCE },
    demo ??
      (live ? { source: () => liveSchedule(today), deps: ['schedule', today, bookingsGen] } : undefined)
  );

  /**
   * Cancel a booking off this hook's own list (Sprint 9 pin). Additive to
   * the {data, loading, error} contract, same idiom as useBooking's book():
   * live mode calls the real transaction (live.js's cancelBooking, which
   * bumps 'bookings' and 'sessions' itself on success - the invalidation
   * seam above re-runs this hook, and every other mounted hook watching
   * either collection, with no extra wiring here); seed mode is a LOCAL
   * NO-OP ECHO, matching useBooking's book() in seed mode - there is no real
   * document to mutate, so it resolves without touching the static seed
   * arrays.
   */
  const cancel = async (bookingId) => {
    if (!live) return { id: bookingId, status: 'cancelled', simulated: true };
    return cancelBooking({ bookingId });
  };

  return { ...state, cancel };
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
 *
 * Sprint 6 pin (QA #2): a parent account can book too, for a linked athlete
 * they choose. `book(slot, { athleteId })` takes the chosen child at call
 * time; `bookingFor` ('athlete' | 'parent' | null while loading/seed) tells
 * the screen which case it is in, so it knows whether to show a child
 * picker — the picker's own choices come from the existing
 * useHouseholdAthletes(), not duplicated here.
 */
export function useBooking({ variant = 'open', today = todayISO(), practice = false } = {}) {
  // Practice short-circuits before isLive(): with practice set, the live
  // source below is unreachable, ./live.js never runs, and book() takes the
  // local (seed) branch — a practice booking cannot become a real one.
  const live = !practice && isLive();
  // Who the booking is for, captured when the live source resolves - a
  // parent's caller identity carries no athleteId until book() is called
  // with one. State (not a ref): `bookingFor` below is derived from it and
  // must trigger a render when the live source resolves.
  const [identity, setIdentity] = useState(null);

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

  // Post-write invalidation seam (Sprint 6 pin): a booking changes both
  // collections - re-run after either bumps, not just one made through this
  // hook instance.
  const bookingsGen = useInvalidation('bookings');
  const sessionsGen = useInvalidation('sessions');

  const demo = demoOpts(variant, "Open blocks didn't load.");
  const state = useSeedResource(
    demo || live ? null : { dates, slots, allowance, seasonNote, confirmation: BOOKING_CONFIRMATION },
    demo ??
      (live
        ? {
            source: async () => {
              const { identity: id, ...payload } = await liveBooking(today);
              setIdentity(id);
              return payload;
            },
            deps: ['booking', today, bookingsGen, sessionsGen],
          }
        : undefined)
  );

  /**
   * Persist a booking for a slot off this hook's `data.slots`. Additive to the
   * {data, loading, error} contract - existing screens ignore it; wiring the
   * confirm tap to `await book(slot)` is the frontend lane's move.
   *
   * `athleteId` is required when the caller is a parent (bookingFor ===
   * 'parent') - the screen must have a child selected before calling book().
   * An athlete caller ignores the option (they can only ever book themselves).
   */
  const book = async (slot, { athleteId } = {}) => {
    if (!live) return slot;
    if (!identity) {
      throw new LiveDataError(
        ERR.INVALID,
        'book() called before the booking data finished loading.'
      );
    }
    if (identity.role === 'parent') {
      if (!athleteId) {
        throw new LiveDataError(
          ERR.INVALID,
          'book() needs the child to book for - pass { athleteId } for a parent account.'
        );
      }
      return createBooking({
        athleteId,
        sessionId: slot.id,
        date: slot.date,
        type: slot.type,
        pool: poolFor(slot.type),
        householdId: identity.householdId,
      });
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

  /**
   * Recurring booking (owner's ruling, TEAM.md "Recurring booking pins"):
   * book the same weekday+time weekly, from the week AFTER `slot` through
   * `untilISO`, capped at the monthly allowance for the slot's pool — a
   * month whose pool is exhausted is skipped week by week until the next
   * month resets it. Full sessions, missing weeks and already-booked
   * sessions skip with a reason. Every instance is the same individual
   * booking transaction as book(); nothing new is stored.
   *
   * Returns { booked: [{date,id}], skipped: [{date,reason}] }.
   */
  const bookRecurring = async (slot, { athleteId, untilISO } = {}) => {
    if (!live) return { booked: [], skipped: [], simulated: true };
    if (!identity) {
      throw new LiveDataError(ERR.INVALID, 'bookRecurring() called before booking data loaded.');
    }
    if (!untilISO) {
      throw new LiveDataError(ERR.INVALID, 'bookRecurring() needs { untilISO }.');
    }
    const forAthleteId = identity.role === 'parent' ? athleteId : identity.athleteId;
    if (!forAthleteId) {
      throw new LiveDataError(ERR.INVALID, 'bookRecurring() needs the child - pass { athleteId }.');
    }

    const athlete = await fetchAthlete(forAthleteId);
    const pkg = athlete.packageId ? await fetchPackage(athlete.packageId) : null;
    const pool = poolFor(slot.type);
    // A limit of 0 (drop-in tournaments, no package) means the pool has NO
    // allowance: every week skips at 'monthly limit' — `limit > 0` gating
    // treated real zeroes as unlimited (code review 2026-09-04, finding 1).
    const limit = (pool === 'tournaments' ? pkg?.tournaments : pkg?.training) ?? 0;
    const bookings = await fetchBookings(
      forAthleteId,
      identity.role === 'parent' ? { householdId: identity.householdId } : {}
    );
    // Per-month spend for this pool, and which sessions are already held -
    // both derived, same as the allowance itself (no stored counters).
    const tally = new Map();
    const have = new Set();
    for (const b of bookings) {
      if (b.status === 'cancelled') continue;
      have.add(b.sessionId);
      if (b.pool === pool) {
        const month = b.date.slice(0, 7);
        tally.set(month, (tally.get(month) || 0) + 1);
      }
    }

    // Every candidate week's sessions in ONE range query, matched locally —
    // one query per week was ~25 serial round-trips (finding 8a).
    const firstDate = addDaysISO(slot.date, 7);
    const sessionsByDate = new Map();
    let lastSessionDate = null;
    if (firstDate <= untilISO) {
      for (const s of await fetchSessionsInRange(firstDate, untilISO)) {
        const list = sessionsByDate.get(s.date) ?? [];
        list.push(s);
        sessionsByDate.set(s.date, list);
        if (!lastSessionDate || s.date > lastSessionDate) lastSessionDate = s.date;
      }
    }
    // Stop at the last scheduled session rather than the requested end date:
    // "rest of the season" means as far as the schedule actually goes, and
    // weeks past it are not real skips worth reporting.
    const endDate = lastSessionDate && lastSessionDate < untilISO ? lastSessionDate : untilISO;

    const booked = [];
    const skipped = [];
    for (let date = firstDate; date <= endDate; date = addDaysISO(date, 7)) {
      const month = date.slice(0, 7);
      if ((tally.get(month) || 0) >= limit) {
        skipped.push({ date, reason: 'monthly limit' });
        continue;
      }
      const match = (sessionsByDate.get(date) ?? []).find(
        (s) => s.time === slot.time && s.type === slot.type && s.status !== 'cancelled'
      );
      if (!match) {
        skipped.push({ date, reason: 'no session' });
        continue;
      }
      if (have.has(match.id)) {
        skipped.push({ date, reason: 'already booked' });
        continue;
      }
      if ((match.booked ?? 0) >= (match.capacity ?? 0)) {
        skipped.push({ date, reason: 'full' });
        continue;
      }
      try {
        // skipCapCheck: this loop maintains the running tally itself (the
        // writer's own cap query per instance would be redundant reads);
        // silent: one invalidation bump AFTER the loop instead of a refetch
        // storm per iteration (finding 8b).
        await createBooking(
          {
            athleteId: forAthleteId,
            sessionId: match.id,
            date: match.date,
            type: match.type,
            pool,
            householdId: identity.householdId,
          },
          { skipCapCheck: true, silent: true }
        );
        booked.push({ date: match.date, id: match.id });
        tally.set(month, (tally.get(month) || 0) + 1);
        have.add(match.id);
      } catch (err) {
        skipped.push({
          date,
          reason: /already/i.test(err?.message || '') ? 'already booked' : 'full',
        });
      }
    }
    if (booked.length) {
      bump('bookings');
      bump('sessions');
    }
    return { booked, skipped };
  };

  return { ...state, book, bookRecurring, bookingFor: identity ? identity.role : null };
}

/**
 * Bookable sessions for one calendar month, grouped by date - the shape the
 * new Book a Session month calendar (Sprint 5 UI ruling) reads instead of a
 * flat 7-day list. Cancelled sessions are excluded here so a screen never has
 * to re-check status. Shared by the seed and live branches below.
 */
function groupSessionsByDate(sessions, today) {
  const byDate = new Map();
  for (const s of sessions) {
    if (s.status === 'cancelled') continue;
    const list = byDate.get(s.date);
    // The pinned month-session shape keeps the raw numbers alongside the
    // display fields: the booking sheet computes spots-left from
    // capacity/booked, which displaySession (a list formatter) drops.
    // ONE canonical time shape for month rows: `time` is the doc's FULL
    // string ("9:00 AM") and meridiem is REMOVED — carrying the full string
    // next to displaySession's stale split meridiem left two incompatible
    // shapes under the same field names (code review 2026-09-04): consumers
    // split `time` themselves.
    const { meridiem: _split, ...display } = displaySession(s, today);
    const row = { ...display, time: s.time, capacity: s.capacity, booked: s.booked };
    if (list) list.push(row);
    else byDate.set(s.date, [row]);
  }
  return [...byDate.keys()].sort().map((date) => ({ date, sessions: byDate.get(date) }));
}

/**
 * Live payload for useMonthSessions - a single date-range query (>= start,
 * <= end, both on the 'date' field) plus orderBy('date'), so only the
 * automatic single-field index is needed, never a composite one.
 */
async function liveMonthSessions(monthISO, today) {
  const { start, end, label } = monthBounds(monthISO);
  const sessions = await fetchSessionsInRange(start, end);
  sessions.sort(byDateThenId);
  return { month: label, days: groupSessionsByDate(sessions, today) };
}

/**
 * GET /schedule/month?month=:monthISO (Sprint 5) - the booking calendar's
 * data source: tap a date, see that day's sessions, pick one. `monthISO` is
 * 'yyyy-MM' or any 'yyyy-MM-dd' within the month; defaults to the current
 * month. Seed: the generated season, filtered to the requested month - the
 * same SEASON useBooking reads, so the two surfaces cannot disagree.
 */
export function useMonthSessions(monthISO, { practice = false } = {}) {
  // Practice pins the seed source (onboarding invariant, TEAM.md): the
  // walkthrough's booking step must work signed-out with zero network.
  const live = !practice && isLive();
  const today = todayISO();
  const resolvedMonth = monthISO || today;
  // Post-write invalidation seam (Sprint 6 pin): a booking changes
  // sessions.booked - re-run so spots-left stays correct after a write made
  // anywhere, not just through this hook instance.
  const sessionsGen = useInvalidation('sessions');

  const seedValue = () => {
    const { start, end, label } = monthBounds(resolvedMonth);
    const inMonth = SEASON.filter((s) => s.date >= start && s.date <= end);
    return { month: label, days: groupSessionsByDate(inMonth, today) };
  };

  return useSeedResource(
    live ? null : seedValue(),
    live
      ? {
          source: () => liveMonthSessions(resolvedMonth, today),
          deps: ['month-sessions', resolvedMonth, sessionsGen],
        }
      : undefined
  );
}

/**
 * Seed fortnight pattern for useSpecialistSlots (Sprint 9 pin) — a
 * DETERMINISTIC, believable schedule, not real production data (production
 * comes from the Google Calendar sync per contract v1.7; the db lane's
 * emulator seed hand-adds slots following this SAME weekday/time pattern so
 * the demo and the emulator tell the same story). Yannick (mental) sits
 * Tue/Thu late afternoon; Phil (phil) sits Mon/Wed/Fri, earlier in the
 * afternoon; both 45-minute 1-on-1s, capacity 1 — the times are invented
 * (there is no real production schedule to read yet), the PEOPLE are not
 * (SPECIALISTS, data/specialists.js). Session ids follow the real seed
 * convention (`YYYY-MM-DD-s<n>`, docs/portal/TEAM.md's "-x0 extras"
 * convention, new letter) purely for shape parity with live mode - nothing
 * here is ever written anywhere.
 */
const PHIL_WEEKDAYS = new Set([1, 3, 5]); // Mon, Wed, Fri (Date#getUTCDay)
const MENTAL_WEEKDAYS = new Set([2, 4]); // Tue, Thu
const PHIL_TIMES = ['3:00 PM', '3:45 PM'];
const MENTAL_TIMES = ['4:30 PM', '5:15 PM'];

export function seedSpecialistDays(specialistId, today) {
  const onMental = specialistId === 'mental';
  const weekdays = onMental ? MENTAL_WEEKDAYS : PHIL_WEEKDAYS;
  const times = onMental ? MENTAL_TIMES : PHIL_TIMES;
  // v1.7.1: capacity comes from the SPECIALISTS registry — phil is a group
  // session of 6, mental a true 1:1. A phil demo slot carries a believable
  // partial fill so the "spots left" treatment is reviewable in seed mode.
  const capacity = SPECIALISTS.find((s) => s.id === specialistId)?.capacity ?? 1;

  const days = [];
  for (let i = 0; i < SPECIALIST_BOOKING_WINDOW_DAYS; i++) {
    const date = addDaysISO(today, i);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const slots = weekdays.has(dow)
      ? times.map((time, idx) => {
          const booked = capacity > 1 ? (i + idx) % capacity : 0;
          return {
            sessionId: `${date}-s${idx}`,
            time,
            booked,
            capacity,
            open: booked < capacity,
          };
        })
      : [];
    days.push({ date, dayLabel: dayLabel(date, today), slots });
  }
  return days;
}

/**
 * Live payload for useSpecialistSlots — the same fetchSessionsInRange
 * useMonthSessions already reads (single-field 'date' range + orderBy, no
 * composite index), filtered down to this specialist's own session type and
 * grouped by date. Cancelled-by-academy sessions (sessions.status, Sprint 4
 * pin) are dropped like any other closure. EVERY day in the window is
 * emitted, even ones with no matching session at all - the day strip needs
 * a pill for every day, not just the ones with slots - which fetchSessions
 * InRange's result alone cannot guarantee (a day with zero specialist
 * sessions produces zero rows, not an empty-array placeholder).
 */
async function liveSpecialistSlots(specialistId, today) {
  const toDate = addDaysISO(today, SPECIALIST_BOOKING_WINDOW_DAYS - 1);
  const sessions = await fetchSessionsInRange(today, toDate);

  const byDate = new Map();
  for (const s of sessions) {
    if (s.type !== specialistId || s.status === 'cancelled') continue;
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }

  const days = [];
  for (let i = 0; i < SPECIALIST_BOOKING_WINDOW_DAYS; i++) {
    const date = addDaysISO(today, i);
    const onDate = (byDate.get(date) ?? [])
      .slice()
      .sort((a, b) => (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(b.time) ?? 0));
    days.push({
      date,
      dayLabel: dayLabel(date, today),
      slots: onDate.map((s) => {
        const capacity = s.capacity ?? 1;
        const booked = s.booked ?? 0;
        return { sessionId: s.id, time: s.time, booked, capacity, open: booked < capacity };
      }),
    });
  }
  return { days };
}

/**
 * GET /specialists/:id/slots (Sprint 9 pin, contract v1.7) — one specialist's
 * bookable 1-on-1 slots over the rolling SPECIALIST_BOOKING_WINDOW_DAYS
 * window (data/specialists.js), the Life-Time-style booking screen's day
 * strip + slot list. `specialistId` is 'phil' | 'mental' (SPECIALISTS' own
 * ids, which double as the sessions.type value). Booking a slot goes through
 * the EXISTING createBooking (poolFor('phil'|'mental') === 'specialist',
 * data/packages.js) - unchanged signature, no booking action lives on this
 * hook.
 */
export function useSpecialistSlots(specialistId) {
  const live = isLive();
  const today = todayISO();
  // Post-write invalidation seam (Sprint 6 pin), both collections per the
  // Sprint 9 pin: a booking or a cancel always bumps 'bookings' AND
  // 'sessions' together (createBooking/cancelBooking, live.js) - subscribing
  // to both here (rather than 'sessions' alone, as useMonthSessions does)
  // re-runs this hook on either bump, not just the one that happens to fire
  // second.
  const sessionsGen = useInvalidation('sessions');
  const bookingsGen = useInvalidation('bookings');

  // No specialist picked yet (the picker stage) -> no query at all. Running
  // the live source with specialistId null returned 14 honest-but-empty
  // days, which then sat as STALE data while the real fetch ran after a
  // pick — the screen's default-day effect read them and landed on today
  // instead of the first day with availability (integration browser pass).
  return useSeedResource(
    live && specialistId ? null : { days: specialistId ? seedSpecialistDays(specialistId, today) : [] },
    live && specialistId
      ? {
          source: () => liveSpecialistSlots(specialistId, today),
          deps: ['specialist-slots', specialistId, today, sessionsGen, bookingsGen],
        }
      : undefined
  );
}

/**
 * Seed branch for useSpecialistSessions — the same fortnight
 * seedSpecialistDays generates, flattened to the specialist's own day-view
 * shape. Roster names stay EMPTY in seed mode (no invented people; the
 * screen renders the booked count and, live, the real names).
 */
function seedSpecialistDaySessions(specialistId, today) {
  return seedSpecialistDays(specialistId, today)
    .flatMap((d) =>
      d.slots.map((s) => ({
        sessionId: s.sessionId,
        date: d.date,
        dayLabel: d.dayLabel,
        time: s.time,
        booked: s.booked,
        capacity: s.capacity,
        athletes: [],
      }))
    );
}

/**
 * Live payload for useSpecialistSessions — the specialist's OWN upcoming
 * sessions over the same rolling window the booking screen shows, each
 * joined to its live roster (non-cancelled bookings -> athlete names via
 * the per-id join; a name the caller cannot read renders as a count, not a
 * crash). Powers the "My sessions" day view (Sprint 9 amendment v1.7.1:
 * specialist-side access).
 */
async function liveSpecialistSessions(specialistId, today) {
  const toDate = addDaysISO(today, SPECIALIST_BOOKING_WINDOW_DAYS - 1);
  const sessions = await fetchSessionsInRange(today, toDate);
  const mine = sessions
    .filter((s) => s.type === specialistId && s.status !== 'cancelled')
    .sort(byDateThenId);

  const withRosters = await Promise.all(
    mine.map(async (s) => {
      const bookings = await fetchBookingsBySession(s.id);
      const active = bookings.filter((b) => b.status !== 'cancelled');
      const athletes = await fetchAthletesByIds(active.map((b) => b.athleteId));
      const nameById = new Map(athletes.map((a) => [a.id, a.name]));
      return {
        sessionId: s.id,
        date: s.date,
        dayLabel: dayLabel(s.date, today),
        time: s.time,
        booked: active.length,
        capacity: s.capacity ?? 1,
        athletes: active.map((b) => ({
          athleteId: b.athleteId,
          name: nameById.get(b.athleteId) ?? null,
        })),
      };
    })
  );
  return { sessions: withRosters };
}

/**
 * GET /specialists/:id/my-sessions (Sprint 9 amendment v1.7.1) — the
 * signed-in specialist's upcoming sessions with per-session rosters:
 * { data: { sessions: [{ sessionId, date, dayLabel, time, booked,
 *   capacity, athletes: [{ athleteId, name }] }] }, loading, error }.
 * Subscribed to both invalidation generations, so a family's booking or
 * cancellation refreshes an open specialist day view immediately.
 */
export function useSpecialistSessions(specialistId) {
  const live = isLive();
  const today = todayISO();
  const sessionsGen = useInvalidation('sessions');
  const bookingsGen = useInvalidation('bookings');

  return useSeedResource(
    live && specialistId ? null : { sessions: specialistId ? seedSpecialistDaySessions(specialistId, today) : [] },
    live && specialistId
      ? {
          source: () => liveSpecialistSessions(specialistId, today),
          deps: ['specialist-sessions', specialistId, today, sessionsGen, bookingsGen],
        }
      : undefined
  );
}

/**
 * '2026-11-02' -> 'Mon' — the short weekday the household card's compact
 * `next.when` line needs ("Mon 4:00 PM", matching the seed shape). The only
 * place this abbreviation is needed; displaySession's dayLabel (the long
 * form, "Today" / "Monday, Nov 2") is what every other surface reads.
 */
function shortWeekday(iso) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`)
  );
}

/**
 * One household athlete's full home-card: package + allowance (same
 * derivation as useHouseholdAthletes), their real next upcoming booking, and
 * a contract standing/percentage built the same way liveContract() builds
 * the full Contract screen (below) — so a child's card can never disagree
 * with their own Contract screen. Sprint 6 pin: "useHousehold's per-child
 * cards... real athletes + real allowances", read as covering every field a
 * card shows, not just allowance — "no screen may show seed numbers in live
 * mode."
 *
 * `standing` is null (no badge) rather than the seed's dashed 'New' state
 * when there is no reliable "just enrolled" signal to read live (no
 * enrollment-date field on the athlete doc) — an unbadged card, not an
 * invented one. Same for `age`/`ageLine`: dob is frequently null (per
 * DATA-MODEL.md, "no birthday is invented"), and a null dob renders no age
 * rather than a fabricated one.
 */
async function liveChildCard(a, today) {
  const pkg = a.packageId ? await fetchPackage(a.packageId) : null;
  // Parent context: the compound filter is what makes the list read
  // provable under the rules (see fetchBookings).
  const bookings = await fetchBookings(a.id, { householdId: a.householdId });
  const active = bookings.filter((b) => b.status !== 'cancelled');
  const upcoming = active.filter((b) => b.date >= today).sort(byDateThenId);

  let next = null;
  if (upcoming.length) {
    const sessionsById = new Map(
      (await fetchSessionsByIds([upcoming[0].sessionId])).map((s) => [s.id, s])
    );
    const s = sessionsById.get(upcoming[0].sessionId);
    if (s) {
      const disp = displaySession(s, today);
      next = { type: disp.type, when: `${shortWeekday(s.date)} ${disp.time} ${disp.meridiem}`, meta: disp.name };
    }
  }

  const contractMinutes = a.contractMinutes ?? null;
  let standing = null;
  let contract = null;
  if (contractMinutes != null) {
    const logs = await fetchContractLogs(a.id);
    const minutesByDate = new Map(logs.map((l) => [l.date, l.minutes || 0]));
    const m = buildContractMonthFromLogs({ today, minutesByDate, contractMinutes });
    contract = m.dueSoFar ? Math.round((m.logged / m.dueSoFar) * 100) : 0;
    standing = m.missed > 0 ? { tone: 'yellow', label: 'Behind' } : { tone: 'green', label: 'On track' };
  }

  const age = ageFromDob(a.dob ?? null);
  const ageLine =
    [age != null ? `Age ${age}` : null, contractMinutes != null ? `${contractMinutes} min tier` : null]
      .filter(Boolean)
      .join(' · ') || null;

  return {
    id: a.id,
    name: a.name,
    age,
    ageLine,
    standing,
    next,
    contract,
    packageId: a.packageId ?? null,
    allowance: deriveAllowance(pkg, bookings, today),
  };
}

/**
 * Live payload for useHousehold — the household's real name, every real
 * child's real card (liveChildCard above), and a billing placeholder: Stripe
 * wiring is out of scope this sprint (TEAM.md, Sprint 5 "Billing rows"), so
 * `status: 'ok'` here is the same documented placeholder useBillingSummary's
 * `status: 'active'` already uses, not a fabricated payment state.
 */
async function liveHousehold(today) {
  const profile = await fetchCurrentUser();
  if (!profile.householdId) {
    throw new LiveDataError(
      ERR.INVALID,
      `users/${profile.uid} has no householdId - this surface is wired for ` +
        'parent accounts only.'
    );
  }
  const [household, athletes] = await Promise.all([
    fetchHousehold(profile.householdId),
    fetchHouseholdAthletes(profile.householdId),
  ]);
  const children = await Promise.all(athletes.map((a) => liveChildCard(a, today)));
  return {
    name: household.name ?? null,
    date: longDayLabel(today),
    children,
    billing: { status: 'ok', retryStep: 0 },
  };
}

/** GET /athletes?guardian=:id + GET /billing/:householdId (08). */
export function useHousehold({ variant = 'three' } = {}) {
  const live = isLive();
  const today = todayISO();
  // Post-write invalidation seam (Sprint 6 pin): a booking or a contract log
  // can change a child's card - re-run after either bumps.
  const bookingsGen = useInvalidation('bookings');
  const contractLogsGen = useInvalidation('contractLogs');

  const demo = demoOpts(variant, "Your family's data didn't load.");
  const children =
    variant === 'one' ? HOUSEHOLD.children.slice(0, 1) : HOUSEHOLD.children;
  const billing = variant === 'payment' ? BILLING_ISSUE : HOUSEHOLD.billing;

  return useSeedResource(
    demo || live ? null : { ...HOUSEHOLD, date: TODAY, children, billing },
    demo ??
      (live
        ? {
            source: () => liveHousehold(today),
            deps: ['household', today, bookingsGen, contractLogsGen],
          }
        : undefined)
  );
}

/**
 * Live payload for useHouseholdAthletes - every athlete in the household,
 * joined to their package for packageName + allowance limits, usage derived
 * from bookings the same way liveSchedule/liveBooking do (no stored counter
 * to drift).
 */
async function liveHouseholdAthletes(today) {
  const profile = await fetchCurrentUser();
  if (!profile.householdId) {
    throw new LiveDataError(
      ERR.INVALID,
      `users/${profile.uid} has no householdId - this surface is wired for ` +
        'parent accounts only.'
    );
  }
  const athletes = await fetchHouseholdAthletes(profile.householdId);
  return Promise.all(
    athletes.map(async (a) => {
      const pkg = a.packageId ? await fetchPackage(a.packageId) : null;
      // Parent context — compound filter for rules provability (fetchBookings).
      const bookings = await fetchBookings(a.id, { householdId: profile.householdId });
      return {
        id: a.id,
        name: a.name,
        packageId: a.packageId ?? null,
        packageName: pkg ? pkg.name : null,
        allowance: deriveAllowance(pkg, bookings, today),
      };
    })
  );
}

/**
 * GET /athletes?householdId=:id (Sprint 5) - every athlete in the signed-in
 * parent's household, replacing the hard-coded Whitfield seed on surfaces
 * that need the real roster (not the fixed-shape dashboard cards
 * useHousehold serves). Live: athletes where householdId == the caller's
 * householdId - the equality filter firestore.rules can prove on a list read.
 */
export function useHouseholdAthletes() {
  const live = isLive();
  const today = todayISO();
  // Post-write invalidation seam (Sprint 6 pin): a new booking changes a
  // child's allowance - re-run after any bookings write, including one made
  // through useBooking's book() for this same child.
  const bookingsGen = useInvalidation('bookings');
  const seedRows = HOUSEHOLD.children.map((c) => ({
    id: c.id,
    name: c.name,
    packageId: c.packageId,
    packageName: packageById(c.packageId)?.name ?? null,
    allowance: c.allowance,
  }));
  return useSeedResource(
    live ? null : seedRows,
    live
      ? { source: () => liveHouseholdAthletes(today), deps: ['household-athletes', bookingsGen] }
      : undefined
  );
}

/**
 * GET /billing/:householdId (Sprint 5) - one row per child: package name and
 * price from the STATIC catalogue (data/packages.js), never from a Firestore
 * package doc, which by policy carries no price. Status is an 'active'
 * placeholder until Stripe wiring lands.
 */
export function useBillingSummary() {
  const live = isLive();
  const rowFor = (id, name, packageId) => {
    const pkg = packageById(packageId);
    return {
      athleteId: id,
      name,
      packageName: pkg ? pkg.name : null,
      price: pkg ? pkg.price : null,
      status: 'active',
    };
  };
  const seedRows = HOUSEHOLD.children.map((c) => rowFor(c.id, c.name, c.packageId));

  const liveBillingSummary = async () => {
    const profile = await fetchCurrentUser();
    if (!profile.householdId) {
      throw new LiveDataError(
        ERR.INVALID,
        `users/${profile.uid} has no householdId - billing is a parent surface only.`
      );
    }
    const athletes = await fetchHouseholdAthletes(profile.householdId);
    return { rows: athletes.map((a) => rowFor(a.id, a.name, a.packageId)) };
  };

  return useSeedResource(
    live ? null : { rows: seedRows },
    live ? { source: liveBillingSummary, deps: ['billing-summary'] } : undefined
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

/**
 * GET /coach/blocks?date=today (12).
 *
 * Live (QA re-sweep #6/#7/N4 — this hook had NO live branch, so the coach's
 * Overview/Sessions/attendance all ran on seed fixtures and every block's
 * sessionId was null): blocks are TODAY'S real sessions. Every block carries
 * its real `sessionId`, which is what makes the attendance thread-through
 * and useSessionAttendance's writes real. Coach assignment on sessions is
 * still null in real data (one-coach academy), so the day view is today's
 * schedule rather than an assignment-filtered subset; `expected` is the
 * session's real booked count, and bay is never invented.
 */
export function useCoachDay({ variant = 'today' } = {}) {
  const live = isLive();
  const today = todayISO();

  const blocks =
    variant === 'concurrent'
      ? COACH_BLOCKS_CONCURRENT
      : variant === 'none'
      ? []
      : COACH_BLOCKS;

  const liveCoachDay = async () => {
    const profile = await fetchCurrentUser();
    // The next day that actually has sessions — today when today does (the
    // in-season case), otherwise the upcoming session day, so a pre-season
    // coach sees their real next working day instead of months of "off".
    const upcoming = (await fetchSessions(today, 1)).filter((s) => s.status !== 'cancelled');
    const dayISO = upcoming[0]?.date ?? today;
    const sessions = upcoming.filter((s) => s.date === dayISO);
    const isToday = dayISO === today;
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const toMinutes = (t) => parseTimeToMinutes(t) ?? 0;
    return {
      coach: { name: profile.displayName ?? 'Coach', date: isToday ? today : `Next session day · ${dayISO}` },
      blocks: sessions
        .map((s) => {
          const start = toMinutes(s.time);
          const status = !isToday
            ? 'next'
            : nowMinutes >= start + 60 ? 'closed' : nowMinutes >= start ? 'now' : 'next';
          return {
            id: s.id,
            sessionId: s.id,
            time: s.time,
            type: s.type,
            name: s.label || genericSessionName(s.type),
            meta: `${s.booked ?? 0} of ${s.capacity ?? '—'} booked`,
            status,
          };
        }),
      concurrent: false,
      attention: [], // no live signal to derive this from yet — never invented
      outstanding: [],
    };
  };

  return useSeedResource(
    live
      ? null
      : {
          coach: COACH,
          blocks,
          concurrent: variant === 'concurrent',
          attention: ATTENTION_LIST,
          outstanding: COACH_OUTSTANDING,
        },
    live ? { source: liveCoachDay, deps: ['coach-day', today] } : undefined
  );
}

/**
 * GET /coach/roster (Sprint 5) - every athlete assigned to the coach, a real
 * roster rather than one session's attendance (that stays useRoster, screen
 * 13). Live: athletes where coachId == the signed-in coach's uid - the
 * equality filter firestore.rules can prove on a list read.
 */
export function useCoachRoster() {
  const live = isLive();

  const liveCoachRoster = async () => {
    const profile = await fetchCurrentUser();
    const athletes = await fetchCoachAthletes(profile.uid);
    return athletes
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((a) => ({
        id: a.id,
        name: a.name,
        meta: a.contractMinutes != null ? `${a.contractMinutes} min tier` : null,
      }));
  };

  return useSeedResource(
    live ? null : ROSTER,
    live ? { source: liveCoachRoster, deps: ['coach-roster'] } : undefined
  );
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
        name: session.label || genericSessionName(session.type),
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
  const [clock] = time.split(' ');
  const [, m] = clock.split(':').map(Number);
  const start24 = parseTimeToMinutes(time) ?? 0;
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

/**
 * Badge/line/hint for a contract month built from real logs (Sprint 6, QA
 * #3/#4) — the live counterpart to contractFor()'s per-demo-variant copy
 * below. Shared by liveAthleteDashboard's mini card and liveContract's full
 * screen so the two read the same state off the same
 * buildContractMonthFromLogs() result and can never disagree, mirroring the
 * seed code's own stated goal for its variant-keyed `state` object.
 */
function liveContractState(m) {
  if (m.missed > 0) {
    return {
      badge: { tone: 'red', label: 'Behind' },
      line: `${m.missed} day${m.missed === 1 ? '' : 's'} behind with ${m.daysLeft} contract day${
        m.daysLeft === 1 ? '' : 's'
      } left. Every remaining day has to be logged to make the Commitment Board.`,
      hint: 'Missed a day? Tap it in the grid to add a late entry.',
    };
  }
  if (m.contractDays > 0 && m.logged === m.contractDays) {
    return {
      badge: { tone: 'yellow', label: 'Complete' },
      line: `All ${m.contractDays} contract days logged. You are on ${m.month}’s Commitment Board.`,
      hint: 'Weekends are not contract days.',
    };
  }
  return {
    badge: { tone: 'green', label: 'On track' },
    line: `${m.logged} of ${m.dueSoFar} days due so far. ${m.daysLeft} contract day${
      m.daysLeft === 1 ? '' : 's'
    } left — one miss still keeps the month.`,
    hint: 'One tap. Nothing else on this screen needs typing.',
  };
}

/**
 * Live payload for useAthleteDashboard (Sprint 6, QA #3): allowance and next
 * session derived from real bookings — nothing invented, none upcoming ->
 * null, matching the screen's own empty state rather than fabricating a
 * session. The contract mini-card reuses buildContractMonthFromLogs, the
 * same builder liveContract() (below) uses for the full screen.
 */
async function liveAthleteDashboard(today) {
  const ctx = await liveAthleteContext();
  const active = ctx.bookings.filter((b) => b.status !== 'cancelled');
  const upcoming = active.filter((b) => b.date >= today).sort(byDateThenId);

  let nextSession = null;
  if (upcoming.length) {
    const sessionsById = new Map(
      (await fetchSessionsByIds([upcoming[0].sessionId])).map((s) => [s.id, s])
    );
    const s = sessionsById.get(upcoming[0].sessionId);
    nextSession = s ? displaySession(s, today) : null;
  }

  const contractMinutes = ctx.athlete.contractMinutes ?? null;
  let contract = null;
  if (contractMinutes != null) {
    const logs = await fetchContractLogs(ctx.athlete.id);
    const minutesByDate = new Map(logs.map((l) => [l.date, l.minutes || 0]));
    const m = buildContractMonthFromLogs({ today, minutesByDate, contractMinutes });
    contract = {
      logged: m.logged,
      total: m.dueSoFar,
      month: m.month,
      pct: m.dueSoFar ? Math.round((m.logged / m.dueSoFar) * 100) : 0,
      line: liveContractState(m).line,
    };
  }

  return {
    athlete: {
      // Firestore stores one `name` field (no first/full split) - both keys
      // carry the same real value rather than guessing a split.
      name: ctx.athlete.name,
      fullName: ctx.athlete.name,
      date: longDayLabel(today),
      allowance: deriveAllowance(ctx.pkg, ctx.bookings, today),
    },
    nextSession,
    contract,
    // No demo "new athlete" onboarding checklist concept in live mode.
    onboarding: null,
    codeOfGrit: CODE_OF_GRIT,
  };
}

/** GET /athletes/:id + next session + contract summary (03). */
export function useAthleteDashboard({ variant = 'populated', today = todayISO(), practice = false } = {}) {
  // Practice pins the seed branch (onboarding invariant; QA 2026-09-08: the
  // walkthrough's dashboard preview errored while signed out).
  const live = !practice && isLive();
  // Post-write invalidation seam (Sprint 6 pin): a booking or a contract log
  // write changes this card - re-run after either bumps.
  const bookingsGen = useInvalidation('bookings');
  const contractLogsGen = useInvalidation('contractLogs');
  const demo = demoOpts(variant, "Your dashboard didn't load.");

  // The next session is the athlete's first booked reference, resolved against
  // the season - the old seed invented "The Lab · Sim 2 · Luke" wholesale.
  const firstRef = BOOKED_UPCOMING[0];
  const resolved = variant === 'populated' && firstRef ? resolveBooking(firstRef) : null;
  const nextSession = resolved ? displaySession(resolved, today) : null;

  // The contract summary derives from the same real-month build the Contract
  // screen uses, so the dashboard card and the full screen cannot disagree.
  const summary = variant === 'new' || demo ? null : contractFor('ontrack', today);

  return useSeedResource(
    demo || live
      ? null
      : {
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
        },
    demo ??
      (live
        ? {
            source: () => liveAthleteDashboard(today),
            deps: ['athlete-dashboard', today, bookingsGen, contractLogsGen],
          }
        : undefined)
  );
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
  const missedDates =
    variant === 'behind'
      ? pickDueDates({ today, count: 6, spread: 2 })
      : variant === 'ontrack'
      ? pickDueDates({ today, count: 1, spread: 4 })
      : [];

  const m = buildContractMonth({
    today,
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

  // Sprint 5 ruling: closures are schedule facts, not practice facts, and no
  // longer excuse a contract day - the caption no longer calls one out.
  const caption = 'Weekends are not contract days.';

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

/** Shape returned when there is no contract month to show — no tier, or the 'none' demo variant. */
const NO_CONTRACT_MONTH = { month: null, dayStates: {}, stats: null, state: null, caption: null };

/**
 * Live payload for useContract (Sprint 6, QA #4): dayStates/stats built from
 * real contractLogs via buildContractMonthFromLogs, consistent with
 * usePracticeLog's own live totals (both read fetchContractLogs for the
 * signed-in athlete). A null contractMinutes tier means there is no contract
 * to grid — NO_CONTRACT_MONTH, the same empty shape the seed 'none' variant
 * already produces, rather than inventing a tier.
 */
async function liveContract(today) {
  const { athlete } = await liveAthleteIdentity();
  const contractMinutes = athlete.contractMinutes ?? null;
  if (contractMinutes == null) {
    return { ...NO_CONTRACT_MONTH, tiers: CONTRACT_TIERS, tierMinutes: null };
  }
  const logs = await fetchContractLogs(athlete.id);
  const minutesByDate = new Map(logs.map((l) => [l.date, l.minutes || 0]));
  const m = buildContractMonthFromLogs({ today, minutesByDate, contractMinutes });
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
    state: liveContractState(m),
    // Sprint 5 ruling: closures are schedule facts, not practice facts, and no
    // longer excuse a contract day.
    caption: 'Weekends are not contract days.',
    tiers: CONTRACT_TIERS,
    tierMinutes: contractMinutes,
  };
}

export function useContract({ variant = 'ontrack', today = todayISO(), practice = false } = {}) {
  // Practice pins the seed branch (onboarding invariant — the third hook to
  // need this pin; QA 2026-09-08: the walkthrough's log step showed
  // "CONTRACT DIDN'T LOAD" because this fetched live while signed out).
  const live = !practice && isLive();
  // Post-write invalidation seam (Sprint 6 pin): re-run after any
  // contractLogs write, not just one made through this hook instance.
  const contractLogsGen = useInvalidation('contractLogs');

  const built = variant === 'none' ? null : contractFor(variant, today);
  return useSeedResource(
    live
      ? null
      : {
          ...(built ?? NO_CONTRACT_MONTH),
          tiers: CONTRACT_TIERS,
          tierMinutes: 45,
        },
    live
      ? { source: () => liveContract(today), deps: ['contract', today, contractLogsGen] }
      : undefined
  );
}

/**
 * Live payload for usePracticeLog - this cycle's logged minutes, derived
 * client-side from an unfiltered per-athlete query (fetchContractLogs), the
 * same pattern deriveAllowance() uses for bookings: no stored counter to
 * drift, no composite index to provision.
 */
async function livePracticeLog(today) {
  const { athlete } = await liveAthleteIdentity();
  const logs = await fetchContractLogs(athlete.id);
  const cycleStart = `${today.slice(0, 7)}-01`;
  const cycleLogs = logs.filter((l) => l.date >= cycleStart && l.date <= today);
  return {
    totalMinutes: cycleLogs.reduce((sum, l) => sum + (l.minutes || 0), 0),
    loggedToday: logs.some((l) => l.date === today),
    // Today's already-logged minutes: a second entry the same day ADDS to
    // this (a morning session plus an evening session is one day's total) —
    // the original replace-on-relog silently discarded earlier practice.
    todayMinutes: logs.find((l) => l.date === today)?.minutes ?? 0,
    contractMinutes: athlete.contractMinutes ?? null,
  };
}

/**
 * POST /athletes/:id/contract-logs (Sprint 5, contract v1.3) - logs a real
 * practice day with a real minutes value, replacing the fixed-tier-only tap
 * the Commitment Contract screen has today. Additive to the {data, loading,
 * error} contract: `logPractice({ minutes })` writes one contractLogs doc
 * (id `{athleteId}_{date}`) via live.js's createContractLog, snapshotting
 * `contractMinutes` off the athlete doc at log time so a later tier change
 * cannot rewrite history. Fulfilled = minutes >= contractMinutes - extra
 * minutes never bank extra days.
 *
 * Seed mode keeps the logged entry in this hook's own component state - the
 * same simulation the contract screen already does for onboarding practice,
 * carrying a real minutes value instead of a bare logged/not-logged flag.
 * Nothing here writes live unless isLive().
 *
 * Sprint 6 pin ("post-write refresh"): the ad hoc local refreshKey this hook
 * used to bump itself after its own write is now the shared invalidation
 * seam (./invalidate) — createContractLog bumps 'contractLogs' itself, so
 * this hook (and useContract, and useAthleteDashboard's contract card) all
 * re-run together, not just whichever one made the write.
 */
export function usePracticeLog({ today = todayISO(), practice = false } = {}) {
  // Practice pins the seed branch (onboarding invariant): no live query, and
  // logPractice stays a local no-op-persist — never a contractLogs write.
  const live = !practice && isLive();
  const [seedEntry, setSeedEntry] = useState(null); // { date, minutes } | null
  const contractLogsGen = useInvalidation('contractLogs');

  const SEED_CONTRACT_MINUTES = 45; // matches the seed athlete's tier (ATHLETE, HOUSEHOLD's Jordan)
  const seedLoggedToday = Boolean(seedEntry && seedEntry.date === today);
  const seedValue = {
    totalMinutes: seedLoggedToday ? seedEntry.minutes : 0,
    loggedToday: seedLoggedToday,
    // Same field the live payload carries — the footer's day total read
    // this and got nothing in seed mode (code review 2026-09-04, finding 4).
    todayMinutes: seedLoggedToday ? seedEntry.minutes : 0,
    contractMinutes: SEED_CONTRACT_MINUTES,
  };

  const state = useSeedResource(
    live ? null : seedValue,
    live
      ? { source: () => livePracticeLog(today), deps: ['practice-log', today, contractLogsGen] }
      : undefined
  );

  const logPractice = async ({ minutes, date }) => {
    // A second entry the same day ACCUMULATES (owner's report, 2026-09-01:
    // "my time logged resets on every entry"). `minutes` is the DELTA; the
    // day total comes back in the result. Live accumulation happens INSIDE
    // createContractLog's transaction — adding from this hook's last-loaded
    // snapshot let a fast second save overwrite from a stale base (code
    // review 2026-09-04, finding 3).
    //
    // `date` (owner's report 2026-09-10: "late entry isn't working"): an
    // optional target day, defaulting to today — the contract calendar's
    // "Add late entry" logs a PAST date through this exact same path, and
    // the rules already accept any date (the id pins athleteId+date, never
    // "today"; DATA-MODEL: any date is loggable).
    const target = date ?? today;
    if (!live) {
      // Seed keeps its single-entry demo record. A late entry for another
      // day is acknowledged but not tracked — seed's calendar comes from
      // the static month builder, so there is nothing for it to repaint.
      if (target !== today) return { date: target, minutes };
      const already = seedLoggedToday ? seedEntry.minutes : 0;
      const entry = { date: today, minutes: Math.min(720, already + minutes) };
      setSeedEntry(entry);
      return entry;
    }
    const { athlete } = await liveAthleteIdentity();
    // createContractLog bumps the 'contractLogs' generation itself on
    // success - this hook's own subscription above picks that up and
    // re-runs, so there is nothing to bump here directly.
    return createContractLog({
      athleteId: athlete.id,
      date: target,
      minutes,
      contractMinutes: athlete.contractMinutes ?? null,
    });
  };

  // Remove one day's log outright (owner's report 2026-09-10: "Remove
  // entry" was inert). Live: deletes contractLogs/{athleteId}_{date} — the
  // delete bumps 'contractLogs' so every contract surface repaints. Seed:
  // clears the local entry when it matches, same no-op-persist posture as
  // logPractice above.
  const removeLog = async ({ date }) => {
    if (!date) return null;
    if (!live) {
      if (seedEntry?.date === date) setSeedEntry(null);
      return { date };
    }
    const { athlete } = await liveAthleteIdentity();
    return deleteContractLog({ athleteId: athlete.id, date });
  };

  return { ...state, logPractice, removeLog, totalMinutes: state.data?.totalMinutes ?? 0 };
}

/**
 * Live payload for useAthleteDetail. Attendance history, the Commitment
 * Board count and month-over-month contract history are not sourced live
 * this sprint - there is no attendance-marking write path yet (see
 * useRoster.js) and no aggregation over contractLogs - so those fields are
 * placeholders ('—'), never invented numbers, and `hasEnoughData` stays true
 * so a long-enrolled real athlete does not get told they are new.
 */
async function liveAthleteDetail(athleteId) {
  const athlete = await fetchAthlete(athleteId);
  const pkg = athlete.packageId ? await fetchPackage(athlete.packageId) : null;
  const subline =
    [
      athlete.contractMinutes != null ? `${athlete.contractMinutes} min tier` : null,
      pkg ? `${pkg.name} package` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null;

  // Everything the kid has scheduled (owner's ask, 2026-09-01): the athlete's
  // upcoming bookings joined to their sessions. The viewer decides the query
  // shape - a parent's list read is only rules-provable with the household
  // compound filter; staff query by athleteId alone.
  const viewer = await fetchCurrentUser();
  const bookings = await fetchBookings(
    athleteId,
    viewer.role === 'parent' ? { householdId: viewer.householdId } : {}
  );
  const today = todayISO();
  const active = bookings.filter((b) => b.status !== 'cancelled' && b.date >= today);
  active.sort(byDateThenId);
  const sessionsById = new Map(
    (await fetchSessionsByIds(active.map((b) => b.sessionId))).map((s) => [s.id, s])
  );
  const upcoming = active.map((b) => {
    const s = sessionsById.get(b.sessionId);
    return {
      id: b.sessionId,
      date: b.date,
      dayLabel: dayLabel(b.date, today),
      time: s?.time ?? null,
      name: s?.label || genericSessionName(b.type),
      status: b.status,
    };
  });

  return {
    athlete: {
      name: athlete.name,
      subline,
      attendance: '—',
      attendanceLabel: 'attendance — not tracked live yet',
      board: '—',
      boardLabel: 'months on the Board — not tracked live yet',
    },
    upcoming,
    history: [],
    checklist: [],
    hasEnoughData: true,
  };
}

/**
 * GET /athletes/:id (09) — athlete detail. Parent: their own linked
 * athlete(s). Staff (ops/owner/mental): any athlete. Routed by id
 * (Sprint 5): PortalRoutes reads /portal/athlete/:athleteId and passes
 * `athleteId` in as a prop - this hook never reads the route itself.
 *
 * Live whenever isLive() AND an athleteId was passed — full stop. Sprint 6
 * (QA #1, BLOCKER): this used to also fall back to seed data for any id that
 * happened to match a seed household kid id (jordan/reese/nico), which meant
 * a parent viewing Reese's real record got served Jordan's seed payload
 * whenever Reese's real athleteId string collided with the seed id. Live
 * mode now always fetches the passed athleteId; only a genuinely missing
 * athleteId (the un-migrated/harness caller) falls back to seed data. Seed
 * mode (isLive() false) is unchanged.
 */
export function useAthleteDetail({ athleteId, variant = 'populated' } = {}) {
  const live = isLive() && athleteId != null;
  const full = variant === 'populated';
  const seedValue = {
    athlete: ATHLETE_DETAIL,
    history: full ? CONTRACT_HISTORY : [],
    checklist: full ? [] : LIMITED_DATA_CHECKLIST,
    hasEnoughData: full,
  };
  return useSeedResource(
    live ? null : seedValue,
    live
      ? { source: () => liveAthleteDetail(athleteId), deps: ['athlete-detail', athleteId] }
      : undefined
  );
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

/**
 * Live payload for useSessionAttendance — every active booking for one
 * session, joined to the athlete's name. Read authorization is the EXISTING
 * bookings-read rule's coach clause (athleteData(resource.data.athleteId)
 * .coachId == caller) — Firestore evaluates that per candidate document for
 * list/query reads too (a get() keyed off a field the query does not itself
 * filter on is the standard "join" pattern for row-level list security), so
 * no new rules grant was needed for this hook; verified against the emulator
 * (routing report). One consequence worth knowing: on a block shared across
 * coaches, each coach's roster silently shows only their own assigned
 * athletes — consistent with "coach → assigned athletes only, by assignment,
 * never by role," not a bug.
 *
 * Per-athlete name lookups use fetchAthlete() (a single-document read,
 * already coach-readable under the same assignment rule) rather than a
 * batched by-id list query, which would need its own, unbuilt list-query
 * grant on `athletes` for the coach role.
 */
async function liveSessionAttendance(sessionId) {
  const bookings = await fetchBookingsBySession(sessionId);
  const athletes = await Promise.all(bookings.map((b) => fetchAthlete(b.athleteId)));
  const nameById = new Map(athletes.map((a) => [a.id, a.name]));
  return bookings
    .map((b) => ({
      bookingId: b.id,
      athleteId: b.athleteId,
      name: nameById.get(b.athleteId) ?? null,
      status: b.status,
      // Coach's optional no-show note (owner's report 2026-09-10) — absent
      // on most bookings, so the row carries an honest null.
      noshowReason: b.noshowReason ?? null,
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/**
 * GET /sessions/:id/bookings + attendance marking (Sprint 6 pin, QA #6/#7) —
 * pinned shape: { data: [{ bookingId, athleteId, name, status,
 * noshowReason }], loading, error, mark(bookingId, status),
 * setReason(bookingId, reason) } (noshowReason/setReason added 2026-09-10,
 * owner's report). `status` is confirmed|attended|noshow;
 * attendance IS bookings.status (coach IN -> 'attended', OUT -> 'noshow',
 * un-marking -> back to 'confirmed' is the caller's job to decide, not this
 * hook's).
 *
 * Coach-only, sessionId-scoped, live-only surface — there is no seed/demo
 * branch to keep in sync (no session-scoped seed roster exists), matching
 * this file's existing "screens must not crash with the live flag off"
 * convention: with isLive() false or no sessionId yet, this resolves to an
 * empty list and a no-op mark() rather than touching ./live.js.
 */
export function useSessionAttendance(sessionId) {
  const live = isLive();
  // Post-write invalidation seam (Sprint 6 pin): a mark() from this hook OR
  // any other coach's re-runs every mounted instance reading bookings.
  const bookingsGen = useInvalidation('bookings');

  const state = useSeedResource(
    live && sessionId ? null : [],
    live && sessionId
      ? { source: () => liveSessionAttendance(sessionId), deps: ['session-attendance', sessionId, bookingsGen] }
      : undefined
  );

  const mark = async (bookingId, status) => {
    if (!live) return { id: bookingId, status };
    return updateBookingStatus({ bookingId, status });
  };

  // Persist the coach's no-show reason (owner's report 2026-09-10: the
  // "+ Add a reason" chip was inert). Same rules surface as mark() —
  // setBookingNoshowReason bumps 'bookings' itself, so this hook's rows
  // (and the family's views) refresh with the saved note.
  const setReason = async (bookingId, reason) => {
    if (!live) return { id: bookingId, noshowReason: reason || null };
    return setBookingNoshowReason({ bookingId, reason });
  };

  return { ...state, mark, setReason };
}

/**
 * Live payload for useTourStandings — every tournamentResults doc, joined to
 * athlete names and each event's session label, run through
 * data/tour.js's deriveTourStandings() (the SAME function the seed constant
 * below is computed with, so live and seed can never disagree on the math).
 *
 * Contract v1.6 (Sprint 8): a doc with no int `score` cannot be ranked and
 * is skipped defensively before anything else runs — none should exist
 * (every write is shape-checked server-side), but a read path never trusts
 * that blindly.
 *
 * Name visibility (Sprint 7 open question — resolved as contract v1.5.1,
 * TEAM.md Sprint 7 integration): results written since the amendment carry
 * the athlete's display name snapshotted at write time, so this academy-
 * public leaderboard shows every name to every role without widening the
 * athletes read matrix. deriveTourStandings prefers each row's own name;
 * the fetchAthletesByIds join below runs only for pre-amendment docs with
 * no name — an individual get() per athlete (see its doc comment in
 * ./live.js for why a batched `in` query is unsafe), where an id the
 * caller cannot read still resolves to name: null rather than failing the
 * screen. Session labels (fetchSessionsByIds) have no such limit —
 * sessions are readable by any signed-in user unconditionally. `bracket` is
 * read straight off each doc (also a write-time snapshot, contract v1.6) —
 * no join needed for it at all.
 */
async function liveTourStandings() {
  const raw = await fetchTournamentResults();
  const results = raw.filter((r) => Number.isInteger(r.score));
  const athleteIds = [...new Set(results.filter((r) => r.name == null).map((r) => r.athleteId))];
  const sessionIds = [...new Set(results.map((r) => r.sessionId))];
  const [athletes, sessions] = await Promise.all([
    fetchAthletesByIds(athleteIds),
    fetchSessionsByIds(sessionIds),
  ]);
  const nameById = new Map(athletes.map((a) => [a.id, a.name]));
  const labelById = new Map(sessions.map((s) => [s.id, s.label]));
  return deriveTourStandings(results, { nameById, labelById });
}

/**
 * GET /tour/standings (Sprint 8 pin, contract v1.6, supersedes v1.5.1) —
 * pinned shape: { data: { brackets: [{ id, label, standings: [{ athleteId,
 *   name, rank, points, events, wins }] }], events: [{ date, label,
 *   results: [{ athleteId, name, bracket, score, position }] }] (v1.6.1:
 *   an event is a DATE — all of one Saturday's blocks merged into one
 *   weekly field, see deriveTourStandings),
 *   counting: { eventsHeld, counted, drops } }, loading, error }. `counting`
 * (owner's drop-week rule, 2026-09-10) says how many of the season's weeks
 * sum into each bracket's `points` — see data/tour.js's TOUR_DROP_RATE.
 * Position is derived from `score`, never stored — see deriveTourStandings.
 *
 * Academy-wide and readable by every role (contract v1.5: "standings are
 * academy-public") — unlike every other hook in this file there is no role
 * branching on the read side; the only asymmetry is the name-resolution
 * limit documented on liveTourStandings above.
 *
 * Seed: TOUR_SEED (data/tour.js) — a believable demo season with all three
 * brackets populated, always full regardless of role. Live: subscribes to
 * the 'tournamentResults' invalidation generation, so a coach/staff
 * saveResults() anywhere refreshes every mounted standings screen (the
 * Sprint 6 post-write-refresh pattern).
 */
export function useTourStandings() {
  const live = isLive();
  const resultsGen = useInvalidation('tournamentResults');

  return useSeedResource(
    live ? null : TOUR_SEED,
    live ? { source: liveTourStandings, deps: ['tour-standings', resultsGen] } : undefined
  );
}

/**
 * Live payload for useTournamentResults(sessionId) — one tournament's
 * existing results, position included. Reuses deriveTourStandings itself
 * (data/tour.js) rather than re-deriving position/ranking a second way: the
 * results for a single sessionId are exactly one `events[]` entry, so
 * running them through the same function useTourStandings uses guarantees
 * identical math (and the same bracket-order-then-position sort the pinned
 * shape wants) with no duplicated logic.
 *
 * Contract v1.6: a doc with no int `score` is skipped defensively, same as
 * liveTourStandings. Since contract v1.5.1 each doc carries its own name
 * snapshot; the fetchAthletesByIds join (individual get()s — see the
 * name-visibility note on liveTourStandings) runs only for pre-amendment
 * docs missing one. Staff entering results already have the read access
 * that fallback join needs (mental/ops/owner unconditionally; coach's
 * assigned-roster clause), so every name is expected to resolve for the
 * caller actually using this hook to enter results.
 */
async function liveTournamentResults(sessionId) {
  const raw = await fetchTournamentResultsForSession(sessionId);
  const results = raw.filter((r) => Number.isInteger(r.score));
  const athletes = await fetchAthletesByIds(
    results.filter((r) => r.name == null).map((r) => r.athleteId)
  );
  const nameById = new Map(athletes.map((a) => [a.id, a.name]));
  const { events } = deriveTourStandings(results, { nameById });
  // v1.6.1 events are keyed by DATE, and one session's rows all share the
  // session's own date — so this is either exactly one event or none.
  const event = events[0] ?? null;
  return { results: event ? event.results : [] };
}

/**
 * GET /tournaments/:sessionId/results + result entry (Sprint 8 pin,
 * contract v1.6, supersedes v1.5) — pinned shape: { data: { results:
 * [{ athleteId, name, bracket, score, position }] }, loading, error,
 * saveResults(entries) } where entries = [{ athleteId, name, bracket,
 * score }] (name/bracket: write-time snapshots, see saveTournamentResults;
 * `position` in the read shape is DERIVED, never part of what the caller
 * sends). Coach/mental/ops/owner-only write surface (enforced in
 * firestore.rules, not here), sessionId-scoped, live-only - same "no
 * seed/demo branch to keep in sync" posture as useSessionAttendance: with
 * isLive() false or no sessionId yet, this resolves to an empty results
 * list and a no-op saveResults(), so the results-entry screen never crashes
 * in the demo/harness.
 *
 * `date` for the write is derived from the sessionId's own leading
 * YYYY-MM-DD (sessions are always `YYYY-MM-DD-<block>`) — never a second
 * fact the caller could pass out of sync with the id.
 */
export function useTournamentResults(sessionId) {
  const live = isLive();
  // Post-write invalidation seam (Sprint 6 pin, generalized here): a
  // saveResults() from this hook OR from another coach's session re-runs
  // every mounted instance reading tournamentResults, including
  // useTourStandings.
  const resultsGen = useInvalidation('tournamentResults');

  const state = useSeedResource(
    live && sessionId ? null : { results: [] },
    live && sessionId
      ? {
          source: () => liveTournamentResults(sessionId),
          deps: ['tournament-results', sessionId, resultsGen],
        }
      : undefined
  );

  const saveResults = async (entries) => {
    if (!live || !sessionId) {
      return { sessionId, count: Array.isArray(entries) ? entries.length : 0 };
    }
    const date = String(sessionId).slice(0, 10);
    // saveTournamentResults bumps 'tournamentResults' itself on success -
    // this hook's own subscription above picks that up and re-runs.
    return saveTournamentResults(sessionId, date, entries);
  };

  return { ...state, saveResults };
}

/**
 * GET .../athletes?ids=... resolved to age brackets (Sprint 8 pin, contract
 * v1.6) — feeds the SCORE entry screen's per-athlete bracket chip, computed
 * BEFORE a save so saveResults() can send the same write-time bracket
 * snapshot tournamentResults docs carry (data/tour.js's bracketFor, as of
 * SEASON_BOUNDS.start — never "today", so it always matches what the write
 * will snapshot no matter when the coach saves). Returns a plain
 * { [athleteId]: bracketId | null } map, not an array, so the screen can key
 * straight off the athleteId it is already iterating (the roster) without a
 * second lookup structure.
 *
 * Live: fetchAthletesByIds — the coach calling this already has the read
 * access an athlete-by-id join needs for their own roster (assigned coach /
 * staff clauses on the athletes matrix), same access this screen's roster
 * fetch itself relies on. An id the caller cannot read is silently dropped
 * (fetchAthletesByIds' own Promise.allSettled behavior) rather than failing
 * the whole map.
 *
 * Seed mode never fetches — `data` is `{}` synchronously, matching the pin
 * ("Seed mode: {} and never fetches"); the score-entry harness state does
 * not need real brackets to render its chips.
 *
 * `athleteIds` is an array whose identity can change every render (a new
 * literal built from the roster each time) — useSeedResource's `deps` must
 * be a stable, comparable key, so this joins the de-duped, sorted ids into
 * one string rather than depending on the array itself (which would refetch
 * every render even when the actual ids never changed).
 *
 * Hooks stay unconditional regardless of live/seed/empty-ids: useSeedResource
 * always runs here, exactly once, with its two arguments deciding which
 * branch it takes internally — never a conditional hook call.
 */
export function useAthleteBrackets(athleteIds) {
  const live = isLive();
  const ids = Array.isArray(athleteIds) ? athleteIds.filter(Boolean) : [];
  const idsKey = [...new Set(ids)].sort().join(',');
  const shouldFetch = live && idsKey.length > 0;

  const liveAthleteBrackets = async () => {
    const athletes = await fetchAthletesByIds(ids);
    const out = {};
    for (const a of athletes) out[a.id] = bracketFor(a.dob ?? null, SEASON_BOUNDS.start);
    return out;
  };

  return useSeedResource(
    shouldFetch ? null : {},
    shouldFetch ? { source: liveAthleteBrackets, deps: ['athlete-brackets', idsKey] } : undefined
  );
}
