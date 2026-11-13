/**
 * Staff booking hooks and calls (spec 01-spec-admin-booking.md 10.1, 10.7):
 * the athlete model, one session, one day's bookable sessions, a session's
 * waitlist count, and the add and move calls (staffBookSession and
 * moveBooking's staff mode), with practice-mode simulation.
 *
 * Staff read every household (the rules let the owner and ops read every
 * document involved), so the athlete's reads carry no household filter.
 * Practice mode calls nothing live, as hooks/move.js: the athlete is built
 * from the billing seed member, the day list from data/season.js, and an
 * add or move resolves `{ simulated: true }`.
 *
 * Not re-exported from hooks/index.js: screen tests mock '../hooks' (the
 * hooks/move.js precedent). The server decides every charge, seat and
 * email; data/staffBooking.js only predicts them for the copy.
 */
import { bump, useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import {
  ERR,
  LiveDataError,
  fetchAthlete,
  fetchBookings,
  fetchGraceTokensByAthlete,
  fetchHousehold,
  fetchPackage,
  fetchSessionsByIds,
  fetchSessionsInRange,
  isLive,
} from './live';
import { fetchWaitlistByAthlete, fetchWaitlistBySession } from './waitlist';
import { liveTokens } from './index';
import { seedMember } from './billing';
import { callMoveBooking, callStaffBookSession } from './callables';
import { staffAthleteModel } from '../data/staffAthlete';
import { staffRefusalLine } from '../data/staffBookingCopy';
import { academyDateISO } from '../data/calendar';
import { normalizeAnchorDay, packageById, periodFor } from '../data/packages';
import { isHiddenSession } from '../data/hiddenSessions';
import { SEASON, sessionsForDate } from '../data/season';
import { GRACE_TOKEN, HOUSEHOLD, PERIOD_ANCHOR_DAY } from '../data/seed';

// ---- The athlete ---------------------------------------------------------------

/** The athlete model read live: every read athlete-scoped, none household-filtered. */
async function liveStaffAthlete(athleteId, today) {
  const athlete = await fetchAthlete(athleteId);
  const [household, pkg, bookings, waitlist, graceTokens] = await Promise.all([
    athlete.householdId ? fetchHousehold(athlete.householdId) : null,
    athlete.packageId ? fetchPackage(athlete.packageId) : null,
    fetchBookings(athleteId),
    fetchWaitlistByAthlete(athleteId),
    fetchGraceTokensByAthlete(athleteId),
  ]);
  const anchorDay = normalizeAnchorDay(household?.periodAnchorDay);
  const start = periodFor(today, anchorDay).periodKey;
  // Only the rows the screen lists (this period on) need their session.
  const ids = [...bookings, ...waitlist].filter((r) => r && (!r.date || r.date >= start)).map((r) => r.sessionId);
  const [sessions, tokens] = await Promise.all([
    fetchSessionsByIds(ids),
    liveTokens(athlete, pkg, bookings, anchorDay, today),
  ]);
  const sessionsById = Object.fromEntries(sessions.map((s) => [s.id, s]));
  return staffAthleteModel({ athlete, household, pkg, bookings, waitlist, graceTokens, sessionsById, tokens, today });
}

/** One read for a practice-mode athlete that is not in the sample family (a constant: seed mode compares it). */
const SEED_NOT_FOUND = new LiveDataError(ERR.NOT_FOUND, 'No such athlete in the sample family.');

/** The next period's count off a billing hub member, in liveTokens' `nextPeriod` shape. */
function seedNextPeriod(member) {
  const np = member.nextPeriod;
  if (!np || np.granted == null) return null;
  const left = Math.max(0, np.granted - (np.used || 0) - (np.reserved || 0));
  return { periodKey: np.periodKey, periodEnd: np.end, booked: np.booked, used: np.used, reserved: np.reserved, granted: np.granted, left };
}

/**
 * Practice mode: a sample child (HOUSEHOLD.children) as the staff model,
 * from the billing seed member's rows (hooks/billing.js seedMember) and its
 * tokens; null for an id the sample family does not have.
 */
function seedStaffAthlete(athleteId, today) {
  const child = HOUSEHOLD.children.find((c) => c.id === athleteId);
  if (!child) return null;
  const anchorDay = PERIOD_ANCHOR_DAY;
  const member = seedMember(child, today, anchorDay);
  const bookings = member.spent.map((r) => ({
    id: r.id,
    athleteId: child.id,
    sessionId: r.sessionId,
    status: r.status,
    date: r.date,
    type: r.type,
    periodKey: member.period.periodKey,
  }));
  return staffAthleteModel({
    athlete: { ...child, householdId: 'whitfield' },
    household: { id: 'whitfield', name: HOUSEHOLD.name, periodAnchorDay: anchorDay },
    pkg: packageById(child.packageId),
    bookings,
    waitlist: [],
    graceTokens: child.id === GRACE_TOKEN.athleteId ? [GRACE_TOKEN] : [],
    sessionsById: {},
    tokens: member.tokens ? { ...member.tokens, nextPeriod: seedNextPeriod(member) } : null,
    today,
  });
}

/**
 * `{ data: StaffAthleteModel | null, loading, error }` for one athlete
 * (data/staffAthlete.js), read staff-wide; a missing athlete is an error
 * with code ERR.NOT_FOUND. Re-reads when bookings, sessions, waitlist places
 * or grace tokens change anywhere.
 */
export function useStaffAthlete(athleteId) {
  const live = isLive();
  const gens = [useInvalidation('bookings'), useInvalidation('sessions'), useInvalidation('waitlist'), useInvalidation('graceTokens')];
  const today = academyDateISO(new Date());
  const seed = live ? null : seedStaffAthlete(athleteId, today);
  return useSeedResource(
    seed,
    live
      ? { source: () => liveStaffAthlete(athleteId, today), deps: ['staff-athlete', athleteId, today, ...gens] }
      : { error: seed ? null : SEED_NOT_FOUND }
  );
}

// ---- Sessions ------------------------------------------------------------------

/** `{ data: session | null, loading, error }`: one session doc by id (null when it is gone). */
export function useStaffSession(sessionId) {
  const live = isLive();
  const gen = useInvalidation('sessions');
  const seed = live ? null : SEASON.find((s) => s.id === sessionId) ?? null;
  return useSeedResource(
    seed,
    live
      ? {
          source: async () => (sessionId ? (await fetchSessionsByIds([sessionId]))[0] ?? null : null),
          deps: ['staff-session', sessionId, gen],
        }
      : undefined
  );
}

/** A session staff may add to or move onto: not cancelled, hidden, display-only or a 1:1. */
function staffListable(s) {
  return Boolean(s) && s.status !== 'cancelled' && !isHiddenSession(s) && s.bookable !== false && s.type !== 'mental';
}

/**
 * `{ data: Session[] | null, loading, error }`: the sessions on one day staff
 * may add to or move onto. `reloadKey` re-reads (a refused add or move).
 */
export function useStaffDaySessions(dateISO, reloadKey = 0) {
  const live = isLive();
  const gen = useInvalidation('sessions');
  return useSeedResource(
    live ? null : sessionsForDate(SEASON, dateISO).filter(staffListable),
    live
      ? { source: async () => (await fetchSessionsInRange(dateISO, dateISO)).filter(staffListable), deps: ['staff-day', dateISO, reloadKey, gen] }
      : undefined
  );
}

/**
 * `{ data: number | null }`: how many others wait on the session (the
 * athlete's own entry left out). Read only when `enabled` (a full session);
 * null otherwise, in practice mode, and while it loads.
 */
export function useSessionWaitlistCount(sessionId, { athleteId = null, enabled = false } = {}) {
  const on = isLive() && Boolean(enabled) && Boolean(sessionId);
  const gen = useInvalidation('waitlist');
  return useSeedResource(
    null,
    on
      ? {
          source: async () => (await fetchWaitlistBySession(sessionId)).filter((w) => w && w.athleteId !== athleteId).length,
          deps: ['staff-waitlist-count', sessionId, athleteId, gen],
        }
      : undefined
  );
}

// ---- The calls -----------------------------------------------------------------

/** Every list that shows bookings, seats or waitlist places. */
function reloadBookings() {
  bump('bookings');
  bump('sessions');
  bump('waitlist');
}

/**
 * One callable call, then the lists reload - after a refusal too: a refusal
 * means the page showed something that changed, and no answer may mean it
 * went through. A failure rejects with staff words (staffRefusalLine), the
 * `reason`, the server's `{ taken, capacity }` as `details` when it sent
 * them, and the callable's error as `cause`.
 */
async function staffCall(call, { action, first }) {
  let result;
  try {
    result = await call();
  } catch (err) {
    reloadBookings();
    const reason = (err && err.reason) || null;
    const sent = err && err.cause && err.cause.details;
    const details = sent ? { taken: sent.taken, capacity: sent.capacity } : null;
    throw Object.assign(new Error(staffRefusalLine(reason, { action, first }, err)), { reason, details, cause: err });
  }
  reloadBookings();
  return result;
}

/**
 * Adds the athlete to the session (the staffBookSession callable): `free`
 * and `allowFull` go only when true. Practice mode calls nothing and
 * resolves a simulated result.
 */
export async function staffBookSession({ athleteId, sessionId, free, allowFull } = {}, { first } = {}) {
  if (!isLive()) {
    return {
      simulated: true,
      bookingId: `${athleteId}_${sessionId}`,
      athleteId,
      sessionId,
      comp: Boolean(free),
      chargedFrom: null,
      booked: null,
      capacity: null,
      overrides: [],
    };
  }
  const payload = { athleteId, sessionId, ...(free ? { free: true } : {}), ...(allowFull ? { allowFull: true } : {}) };
  return staffCall(() => callStaffBookSession(payload), { action: 'add', first });
}

/**
 * Moves a booking (moveBooking, whose staff mode the caller's role picks):
 * `allowFull` goes only when true. Practice mode calls nothing and resolves
 * a simulated result.
 */
export async function staffMoveBooking({ bookingId, toSessionId, allowFull } = {}, { first } = {}) {
  if (!isLive()) return { simulated: true, bookingId: null, movedFrom: bookingId, sessionId: toSessionId, overrides: [] };
  const payload = { bookingId, toSessionId, ...(allowFull ? { allowFull: true } : {}) };
  return staffCall(() => callMoveBooking(payload), { action: 'move', first });
}
