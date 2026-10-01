/**
 * The live-data adapter — the portal's only Firestore touchpoint.
 *
 * Thin by design: each function is one query against the contract collections
 * in docs/portal/TEAM.md, returning plain objects the hooks assemble into
 * screen payloads. No shaping for screens happens here, and no screen imports
 * this file — everything still travels through the hooks in ./index.js, which
 * fall back to seed data whenever isLive() is false.
 *
 * Uses the existing app/auth/db from src/firebase.js (project `rypacad`) —
 * never a second Firebase init. Access control is NOT enforced here; the
 * queries are written to satisfy firestore.rules (equality filters the rules
 * can prove), and the rules are the actual boundary.
 */

import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { bump } from './invalidate';
import { eliteDailyCapHit, normalizeAnchorDay, periodFor, windowDaysFor } from '../data/packages';
import { CHANGEABLE_PACKAGE_IDS } from '../data/packageChange';
import { BOOKING_OPENS_LABEL, academyDateISO, bookingOpen, openThrough, todayISO, windowOpensOn } from '../data/calendar';
import { SPECIALISTS, mentalCapFor } from '../data/specialists';

/** id -> catalogue entry, for the specialist-cap error copy below. */
const SPECIALIST_BY_ID = new Map(SPECIALISTS.map((s) => [s.id, s]));

/** Stable error codes the hooks (and screens, via `error`) can branch on. */
export const ERR = {
  UNAUTHENTICATED: 'unauthenticated',
  PERMISSION: 'permission-denied',
  NOT_FOUND: 'not-found',
  UNAVAILABLE: 'unavailable',
  INVALID: 'invalid-argument',
  UNKNOWN: 'unknown',
};

/**
 * The typed error every adapter function throws. `code` is always one of ERR;
 * `cause` keeps the underlying Firestore error for logging. `reason`
 * (Sprint 11, contract v1.9 pin C; reasons updated Sprint 12, contract v2.0
 * pin B/D/K) is an OPTIONAL, more specific label a few call sites attach
 * beyond `code` — today the booking gate's 'outside-window' (past the
 * package's booking window), 'no-tokens-left' (the period's grant is fully
 * spent), and 'cap-reached' (Yannick's monthly frequency knob only) — so a
 * screen can branch on a stable string instead of pattern-matching
 * `message`. `null` for every other throw in this file; wrap() below
 * preserves whatever `reason` a LiveDataError already carries (it returns
 * the SAME instance for one), so the reason survives from
 * assertWithinPeriodCap through createBooking's catch, through
 * useBooking's book(), to the screen's own catch — no rethrow anywhere in
 * that chain replaces the error object.
 * Sprint 20 adds 'billing-pending' (athlete not paid), 'booking-not-open'
 * (before the Oct 10 gate) and 'calendly-managed' (a Calendly-sourced
 * booking is cancelled from Calendly, not here).
 */
export class LiveDataError extends Error {
  constructor(code, message, cause = null, reason = null) {
    super(message);
    this.name = 'LiveDataError';
    this.code = code;
    this.cause = cause;
    this.reason = reason;
  }
}

/**
 * Map a Firestore SDK error onto our codes; anything unrecognised is UNKNOWN.
 * Exported (Sprint 13) so hooks/waitlist.js and hooks/grace.js — the two new
 * Part 2 modules, kept out of this already-grandfathered file per the pin's
 * own "split new code" instruction — can wrap their own SDK errors with the
 * SAME discipline every function in this file already follows, rather than
 * each re-implementing it.
 */
export function wrap(err, context) {
  if (err instanceof LiveDataError) return err;
  const code =
    {
      'permission-denied': ERR.PERMISSION,
      'not-found': ERR.NOT_FOUND,
      unavailable: ERR.UNAVAILABLE,
      'deadline-exceeded': ERR.UNAVAILABLE,
      unauthenticated: ERR.UNAUTHENTICATED,
      'invalid-argument': ERR.INVALID,
    }[err && err.code] || ERR.UNKNOWN;
  return new LiveDataError(code, `${context}: ${err && err.message ? err.message : err}`, err);
}

/**
 * Whether the portal reads live Firestore data. Off (the default, and the
 * value whenever the variable is unset) means every hook serves seed data and
 * nothing in this file executes — the demo keeps working with no emulator or
 * network at all.
 */
export function isLive() {
  return process.env.REACT_APP_PORTAL_LIVE_DATA === 'true';
}

/** Exported (Sprint 13) for the same reason wrap() is — see its comment. */
export function requireUser() {
  const user = auth.currentUser;
  if (!user) {
    throw new LiveDataError(
      ERR.UNAUTHENTICATED,
      'No signed-in user - live portal data requires Firebase auth.'
    );
  }
  return user;
}

/**
 * The caller's users/{uid} doc — role plus athleteId/householdId, which is
 * how the hooks resolve "whose data" without screens passing ids around.
 * Email comes from auth (it is not duplicated into the users doc).
 */
export async function fetchCurrentUser() {
  const user = requireUser();
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) {
      throw new LiveDataError(
        ERR.NOT_FOUND,
        `No users/${user.uid} doc - the account has not been provisioned for the portal.`
      );
    }
    return { uid: user.uid, email: user.email, ...snap.data() };
  } catch (err) {
    throw wrap(err, 'fetchCurrentUser');
  }
}

/** One athletes/{id} doc. Rules restrict this to the roles the matrix allows. */
export async function fetchAthlete(athleteId) {
  if (!athleteId) throw new LiveDataError(ERR.INVALID, 'fetchAthlete: athleteId is required.');
  try {
    const snap = await getDoc(doc(db, 'athletes', athleteId));
    if (!snap.exists()) {
      throw new LiveDataError(ERR.NOT_FOUND, `No athletes/${athleteId} doc.`);
    }
    return { id: snap.id, ...snap.data() };
  } catch (err) {
    throw wrap(err, 'fetchAthlete');
  }
}

/**
 * Athlete records by id, individually — deliberately NOT the batched
 * `where(documentId(), 'in', chunk)` pattern fetchSessionsByIds uses below.
 * That pattern is safe for sessions because sessions' read rule is
 * unconditional (`signedIn()`); athletes' read rule is per-role and keys off
 * resource.data (own athlete / own household / assigned coach / staff), so a
 * multi-id `in` query only stays provable — and Firestore denies it WHOLESALE
 * otherwise, same as the "list queries must carry the matching equality
 * filter" limit already on fetchHouseholdAthletes/fetchCoachAthletes — when
 * every possible match satisfies the SAME unconditional clause. That is only
 * true for mental/ops/owner. Individual get()s are evaluated per document
 * instead, exactly like liveSessionAttendance's existing per-booking
 * fetchAthlete() join, so each id succeeds or fails on its own; ids the
 * caller cannot read are silently dropped (Promise.allSettled) rather than
 * failing the whole join or crashing the screen.
 *
 * This is the routing lane's answer to the Sprint 7 "join athlete names"
 * pin for an ACADEMY-WIDE surface (useTourStandings): opening athletes to a
 * plain `signedIn()` list read so every role could batch-resolve every name
 * would satisfy the join but breaks the access matrix's "cross-family reads
 * impossible" rule for the WHOLE athlete doc (dob, householdId, coachId,
 * contractMinutes ride along with name). Kept scoped instead — see the
 * routing report's open question on partial name visibility for
 * athlete/parent/coach callers.
 */
export async function fetchAthletesByIds(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return [];
  const settled = await Promise.allSettled(unique.map((id) => fetchAthlete(id)));
  return settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

/**
 * One households/{id} doc — name + guardian contact, never card data (Sprint 6,
 * QA #3: the parent home screen's household name and per-child cards).
 */
export async function fetchHousehold(householdId) {
  if (!householdId) {
    throw new LiveDataError(ERR.INVALID, 'fetchHousehold: householdId is required.');
  }
  try {
    const snap = await getDoc(doc(db, 'households', householdId));
    if (!snap.exists()) {
      throw new LiveDataError(ERR.NOT_FOUND, `No households/${householdId} doc.`);
    }
    return { id: snap.id, ...snap.data() };
  } catch (err) {
    throw wrap(err, 'fetchHousehold');
  }
}

/** One packages/{id} doc — the limits an allowance is derived against. */
export async function fetchPackage(packageId) {
  if (!packageId) throw new LiveDataError(ERR.INVALID, 'fetchPackage: packageId is required.');
  try {
    const snap = await getDoc(doc(db, 'packages', packageId));
    if (!snap.exists()) {
      throw new LiveDataError(ERR.NOT_FOUND, `No packages/${packageId} doc.`);
    }
    return { id: snap.id, ...snap.data() };
  } catch (err) {
    throw wrap(err, 'fetchPackage');
  }
}

/**
 * Sessions from `fromDate` (ISO yyyy-mm-dd) onward, covering the next `days`
 * dates that actually have sessions — closures simply have no docs, so they
 * are skipped the same way the seed's upcomingDates() skips them. Ordered by
 * date; single-field filter + order, so no composite index is needed.
 */
// Every session doc on a date counts against this, not just the golf blocks:
// the callers filter specialists out AFTER the fetch, so Phil's and Yannick's
// slots occupy slots here too. A weekday now carries four training blocks
// (v2.0.3, 2026-09-22) plus those two, which is exactly 6 - the old cap left
// no room at all and silently dropped the late blocks off the coach's day.
// 12 covers a Saturday (5 blocks + the adult block) or a weekday plus holiday
// extras, with headroom.
const MAX_BLOCKS_PER_DAY = 12;

export async function fetchSessions(fromDate, days = 7) {
  if (!fromDate) throw new LiveDataError(ERR.INVALID, 'fetchSessions: fromDate is required.');
  try {
    const snap = await getDocs(
      query(
        collection(db, 'sessions'),
        where('date', '>=', fromDate),
        orderBy('date'),
        limit(days * MAX_BLOCKS_PER_DAY)
      )
    );
    // Trim to the first `days` distinct dates - the over-fetch above only
    // guarantees we have at least that many days in hand.
    const out = [];
    const seen = new Set();
    for (const d of snap.docs) {
      const data = d.data();
      if (!seen.has(data.date)) {
        if (seen.size === days) break;
        seen.add(data.date);
      }
      out.push({ id: d.id, ...data });
    }
    return out;
  } catch (err) {
    throw wrap(err, 'fetchSessions');
  }
}

/**
 * Sessions by document id, for resolving bookings whose sessions fall outside
 * any date window. Chunked because `in` queries carry a small disjunction cap.
 */
export async function fetchSessionsByIds(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return [];
  try {
    const chunks = [];
    for (let i = 0; i < unique.length; i += 10) chunks.push(unique.slice(i, i + 10));
    const snaps = await Promise.all(
      chunks.map((chunk) =>
        getDocs(query(collection(db, 'sessions'), where(documentId(), 'in', chunk)))
      )
    );
    return snaps.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    throw wrap(err, 'fetchSessionsByIds');
  }
}

/**
 * Every athlete in one household — the equality filter firestore.rules
 * proves a parent's list read against (resource.data.householdId ==
 * me().householdId). Powers useHouseholdAthletes and useBillingSummary.
 */
export async function fetchHouseholdAthletes(householdId) {
  if (!householdId) {
    throw new LiveDataError(ERR.INVALID, 'fetchHouseholdAthletes: householdId is required.');
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'athletes'), where('householdId', '==', householdId))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchHouseholdAthletes');
  }
}

/**
 * Every athlete assigned to one coach — the equality filter firestore.rules
 * proves a coach's list read against (resource.data.coachId ==
 * request.auth.uid). Powers useCoachRoster: a real roster, not one session's
 * attendance.
 */
export async function fetchCoachAthletes(coachUid) {
  if (!coachUid) {
    throw new LiveDataError(ERR.INVALID, 'fetchCoachAthletes: coachUid is required.');
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'athletes'), where('coachId', '==', coachUid))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchCoachAthletes');
  }
}

/**
 * Sessions within one inclusive date range — powers useMonthSessions. Both
 * bounds are range filters on the same field ('date'), plus an orderBy on
 * that same field, so this needs only the automatic single-field index, not
 * a composite one.
 */
export async function fetchSessionsInRange(fromDate, toDate) {
  if (!fromDate || !toDate) {
    throw new LiveDataError(ERR.INVALID, 'fetchSessionsInRange: fromDate and toDate are required.');
  }
  try {
    const snap = await getDocs(
      query(
        collection(db, 'sessions'),
        where('date', '>=', fromDate),
        where('date', '<=', toDate),
        orderBy('date')
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchSessionsInRange');
  }
}

/**
 * Every booking for one athlete, unfiltered — the hooks split upcoming/past
 * and derive allowance usage from these rows, because per the contract there
 * is no stored counter to drift.
 *
 * The single athleteId filter is provable for the athlete's own user and
 * for staff. A parent's LIST read is only provable when the query ALSO
 * filters householdId == theirs — the rules clause is
 * `me().householdId == resource.data.householdId`, and a field the query
 * does not constrain denies the whole list (QA re-sweep N1: the family
 * dashboard hard-crashed on exactly this). Parent-context callers pass
 * their householdId; own-athlete callers omit it.
 */
export async function fetchBookings(athleteId, { householdId = null } = {}) {
  if (!athleteId) throw new LiveDataError(ERR.INVALID, 'fetchBookings: athleteId is required.');
  try {
    const filters = [where('athleteId', '==', athleteId)];
    if (householdId) filters.push(where('householdId', '==', householdId));
    const snap = await getDocs(query(collection(db, 'bookings'), ...filters));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchBookings');
  }
}

/**
 * One athlete's own waitlist entries - the reservations the booking gate
 * counts against the period's grant (Sprint 16, contract v2.4), so "tokens
 * left" on the Billing hub and what the gate permits never disagree. Lives
 * here (not hooks/waitlist.js) because that module imports this one.
 */
export async function fetchAthleteWaitlist(athleteId) {
  if (!athleteId) return [];
  try {
    const snap = await getDocs(query(collection(db, 'waitlist'), where('athleteId', '==', athleteId)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchAthleteWaitlist');
  }
}

/**
 * Every booking across an ENTIRE household, every member at once — Sprint 11
 * pin F (family Reservations, contract v1.9). One query on the `householdId`
 * equality filter alone (DATA-MODEL.md index 3: `bookings (householdId ASC,
 * date ASC)`), distinct from fetchBookings above (which always requires
 * athleteId and adds householdId only as a second, narrowing filter for one
 * athlete's own list). The bookings read rule's parent clause,
 * `me().householdId == resource.data.householdId`, is exactly this query's
 * own filter — VERIFIED against the emulator (routing report), not widened.
 */
export async function fetchHouseholdBookings(householdId) {
  if (!householdId) {
    throw new LiveDataError(ERR.INVALID, 'fetchHouseholdBookings: householdId is required.');
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'bookings'), where('householdId', '==', householdId))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchHouseholdBookings');
  }
}

/**
 * Every graceTokens doc for one athlete, unfiltered (contract v2.1, pin E) —
 * the single equality filter (`athleteId ==`) firestore.rules proves the
 * athlete's own query against directly, and a parent's query on one child's
 * athleteId via the get()-indirection join the rules file documents on its
 * own graceTokens match block. Consumed/expired filtering is the CALLER's
 * job (packages.js#tokensFor and this file's own selectGraceToken below both
 * do it) — this is a plain, unfiltered read of what exists.
 */
export async function fetchGraceTokensByAthlete(athleteId) {
  if (!athleteId) {
    throw new LiveDataError(ERR.INVALID, 'fetchGraceTokensByAthlete: athleteId is required.');
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'graceTokens'), where('athleteId', '==', athleteId))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchGraceTokensByAthlete');
  }
}

/**
 * Join the waitlist for a full session (contract v2.1, pin F) — one setDoc
 * at the pinned `{sessionId}_{athleteId}` id, matching the rules' own create
 * shape exactly (sessionId, athleteId, householdId, date, periodKey,
 * joinedAt, createdBy). Called both directly (useWaitlist's join()) and from
 * inside createBooking's full-session fallback below — one write path, no
 * duplicated shape logic between the two callers.
 */
export async function joinWaitlist({ sessionId, athleteId, householdId, date, periodKey, attendee }, { athlete = null, pkg = null } = {}) {
  if (!sessionId || !athleteId || !householdId || !date || !periodKey) {
    throw new LiveDataError(
      ERR.INVALID,
      'joinWaitlist: sessionId, athleteId, householdId, date and periodKey are all required.'
    );
  }
  const user = requireUser();
  // Sprint 20 (spec 4.4, 5): the same two gates createBooking runs. Its
  // full-session fallback passes the docs it already read; useWaitlist's
  // own join() lands here cold and pays the two reads.
  const a = athlete ?? (await fetchAthlete(athleteId));
  assertAthleteBillingActive(a);
  const p = pkg ?? (a.packageId ? await fetchPackage(a.packageId) : null);
  assertBookingOpen(p);
  try {
    const id = `${sessionId}_${athleteId}`;
    await setDoc(doc(db, 'waitlist', id), {
      sessionId,
      athleteId,
      householdId,
      date,
      periodKey,
      joinedAt: serverTimestamp(),
      createdBy: user.uid,
      // Absent means the athlete attends. Only a Yannick 1:1 ever sets it
      // (owner ruling, 2026-09-22), and the promotion trigger copies it onto
      // the booking it writes.
      ...(attendee === 'parent' ? { attendee } : {}),
    });
    bump('waitlist');
    bump('bookings'); // the schedule/reservations lists subscribe to bookings
    return { id, sessionId, athleteId, householdId, date, periodKey };
  } catch (err) {
    throw wrap(err, 'joinWaitlist');
  }
}

/**
 * The soonest-expiring, unconsumed grace token that covers a booking date
 * (contract v2.1, pin E's charge order: "the soonest-expiring unconsumed
 * grace token with expiresAt >= session.date"). Mirrors packages.js#tokensFor's
 * own grace derivation (consumed == some non-cancelled booking references the
 * id) so the SAME rule that decides what displays as "available" is what
 * createBooking actually spends — but filters by the BOOKING'S date here,
 * not "today" (tokensFor's own filter), since a grace token minted for a
 * near-term makeup should not be offered for a booking made well before it
 * expires but scheduled for a date the token itself would have already
 * lapsed by.
 */
function selectGraceToken(bookings, graceTokens, date) {
  const live = (bookings || []).filter((b) => b && b.status !== 'cancelled');
  const consumed = new Set(live.map((b) => b.graceTokenId).filter(Boolean));
  const candidates = (graceTokens || [])
    .filter((g) => g && !consumed.has(g.id) && g.expiresAt >= date)
    .sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));
  return candidates[0] ?? null;
}

/**
 * Per-athlete paid status (Sprint 20, spec 4.4): absent == active for every
 * athlete provisioned before this sprint; anything else blocks booking with
 * the pending copy. firestore.rules' athleteBillingOk() is the server half.
 */
export function assertAthleteBillingActive(athlete) {
  const status = athlete?.billing?.status ?? 'active';
  if (status === 'active') return;
  throw new LiveDataError(ERR.INVALID, 'Payment pending - finish checkout to start booking', null, 'billing-pending');
}

/**
 * The Oct 10 gate (Sprint 20, spec 5): token members book from
 * BOOKING_OPENS_AT, Elite at once. `now` is injectable for tests.
 */
export function assertBookingOpen(pkg, now = Date.now()) {
  if (bookingOpen(now, pkg)) return;
  throw new LiveDataError(ERR.INVALID, `Booking opens ${BOOKING_OPENS_LABEL}`, null, 'booking-not-open');
}

/**
 * Create one booking in the contract shape, inside a Firestore transaction
 * (Sprint 6, QA #5) — reads the session, requires booked < capacity, requires
 * no existing booking at this id, then writes the booking AND increments
 * session.booked by 1 in the same atomic operation, so two families racing
 * for the last spot can never both win it (firestore.rules re-checks the
 * booked diff is exactly +1 within [0, capacity] independently — this
 * transaction is the client-side half of that guarantee, not a substitute
 * for it). The server stamps createdAt; createdBy is the signed-in uid.
 *
 * QA #8: every rejection here is a LiveDataError with a plain-language
 * message — full session and already-booked are the two friendly cases the
 * client can detect itself; anything the rules deny for another reason still
 * reaches the caller wrapped (never a raw PERMISSION_DENIED), via the catch
 * below.
 */
/**
 * Booking-window guard (contract v2.0, pin D) — the ONE check that gates
 * EVERY package alike, Elite included: a date the family cannot see yet is
 * not bookable regardless of how it would be charged. Split out of the old
 * assertWithinPeriodCap (Sprint 12) so createBooking (below) can run it
 * unconditionally while the token-pool checks that follow it branch on
 * chargedFrom. `now` is injectable for tests, like assertBookingOpen's;
 * openThrough carries the Nov 1 launch anchor.
 */
export function assertWithinBookingWindow(pkg, date, now = new Date()) {
  const windowDays = windowDaysFor(pkg);
  if (date > openThrough(now, windowDays)) {
    throw new LiveDataError(
      ERR.INVALID,
      `That date opens for booking at 7 AM on ${windowOpensOn(date, windowDays)}.`,
      null,
      'outside-window'
    );
  }
}

/**
 * Yannick's frequency knob (contract v2.0, pin K; unchanged by Part 2) — the
 * ONE place a cap check is allowed to branch on session type
 * (SPECIALIST_MONTHLY_CAP.mental, data/specialists.js). Runs regardless of
 * how the booking ends up charged (grace, period or Elite): it is a cadence
 * rule on how often the athlete sees Yannick, not a pool a grace token could
 * exempt someone from.
 */
function assertMentalCadence(type, date, bookings, pkg) {
  // v2.0.1 (Sprint 18): per package - Elite two a month, everyone else one.
  const mentalCap = mentalCapFor(pkg);
  if (type === 'mental' && mentalCap != null) {
    const month = date.slice(0, 7);
    const usedThisMonth = (bookings || []).filter(
      (b) =>
        (b.status === 'attended' || b.status === 'confirmed') &&
        b.type === 'mental' &&
        (b.date || '').slice(0, 7) === month
    ).length;
    if (usedThisMonth >= mentalCap) {
      const specialist = SPECIALIST_BY_ID.get('mental');
      const who = specialist ? specialist.name : 'Yannick';
      throw new LiveDataError(
        ERR.INVALID,
        `${who}'s sessions are limited to ${mentalCap} a month, already booked this month.`,
        null,
        'cap-reached'
      );
    }
  }
}

/**
 * Elite's frequency caps (contract v2.0.1, Sprint 18): at most one training-
 * block, one tournament and one Phil booking per date (owner 2026-09-30). Not a pool,
 * never a charge - the same class of rule as the mental cadence above, and
 * the other named exception to "charging never branches on type". Typed
 * reason 'one-per-day' so the booking screens can say so.
 */
function assertEliteDailyCap(pkg, type, date, bookings) {
  if (!eliteDailyCapHit(pkg, type, date, bookings)) return;
  throw new LiveDataError(
    ERR.INVALID,
    type === 'phil'
      ? "Elite includes one session with Phil a day, and there's already one booked that day."
      : type === 'tournament'
        ? "Elite includes one Tour event a day, and there's already one booked that day."
        : "Elite includes one training block a day, and there's already one booked that day.",
    null,
    'one-per-day'
  );
}

/**
 * The athlete's PERIOD cap (contract v2.0 pin B) — ONLY reached when the
 * charge is falling through to 'period' (createBooking below skips this
 * entirely for Elite and for a grace-charged booking, per contract v2.1 §6/
 * pin E: "it never counts as a period spend"). `used` excludes grace-charged
 * bookings (graceTokenId set) — the SAME seam amendment
 * data/packages.js#tokensFor already applies, kept in lockstep here so the
 * cap this function enforces never disagrees with what the token card
 * displays as spent. `waitlist` (Sprint 16, contract v2.4): the athlete's
 * own waitlist entries in this period RESERVE tokens - tokensFor subtracts
 * them from `left`, so the gate does too; otherwise the hub could read
 * "0 left" while a booking still went through.
 */
export function assertPeriodTokensLeft(pkg, bookings, periodKey, issuedGrant, waitlist = [], currentPeriodKey = null) {
  if (!pkg || pkg.tokens !== null) {
    // Contract v2.1 pin C: an issued tokenPeriods doc (Stripe or ops) is the
    // grant when it exists; the package's own tokens are the fallback.
    const granted = pkg ? issuedGrant ?? pkg.tokens ?? 0 : 0;
    const used = (bookings || []).filter(
      (b) => b.status !== 'cancelled' && b.periodKey === periodKey && !b.graceTokenId
    ).length;
    const reserved = (waitlist || []).filter((w) => w && w.periodKey === periodKey).length;
    if (used + reserved >= granted) {
      throw new LiveDataError(
        ERR.INVALID,
        granted === 0
          ? 'This package has no tokens to spend — ask the academy to assign one.'
          : `${currentPeriodKey && periodKey > currentPeriodKey ? "Next period's" : "This period's"} tokens are already fully booked (${used} of ${granted}${reserved ? `, ${reserved} held on a waitlist` : ''}).`,
        null,
        'no-tokens-left'
      );
    }
  }
}

// Internal control-flow marker (contract v2.1, pin F): thrown from inside
// createBooking's transaction when the session is full, caught by the outer
// catch to divert to joinWaitlist() instead of surfacing as an error. Never
// exported, never a real LiveDataError - a full session is not a failure,
// it is the pinned "book() resolves { status: 'waitlisted' }" path.
const SESSION_FULL = Symbol('session-full');

export async function createBooking(
  { athleteId, sessionId, date, type, householdId, attendee },
  { skipCapCheck = false, silent = false, createdVia = null } = {}
) {
  if (!athleteId || !sessionId || !date || !type || !householdId) {
    throw new LiveDataError(
      ERR.INVALID,
      'createBooking: athleteId, sessionId, date, type and householdId are all required.'
    );
  }
  const user = requireUser();
  // The period a booking spends is the one its SESSION DATE falls in, never
  // the period it is made in (contract v2.0 §6, pin B) - read once here so
  // every check below and the write itself agree on the same anchor.
  const household = await fetchHousehold(householdId);
  const anchorDay = normalizeAnchorDay(household.periodAnchorDay);
  const { periodKey } = periodFor(date, anchorDay);

  const athlete = await fetchAthlete(athleteId);
  const pkg = athlete.packageId ? await fetchPackage(athlete.packageId) : null;
  const isElite = Boolean(pkg) && pkg.tokens === null;

  // Sprint 20 (spec 4.4, then 5): paid status and the Oct 10 gate, before
  // the window/cadence/cap checks - both are free (no extra read) and run
  // for every caller, bookRecurring's skipCapCheck instances included.
  assertAthleteBillingActive(athlete);
  assertBookingOpen(pkg);
  const currentPeriodKey = periodFor(todayISO(), anchorDay).periodKey;

  // Charge order (contract v2.1 pin E): Elite -> nothing charged; else the
  // soonest-expiring unconsumed grace token covering this date; else the
  // period, subject to its own cap. Grace selection and the window/mental
  // checks are client-side derivation like the cap check always was (see
  // assertPeriodTokensLeft's own comment) - a query, so none of it can run
  // INSIDE the transaction below (the client SDK only allows tx.get() on a
  // single document reference, never a query); `skipCapCheck` (bookRecurring's
  // own running tally) skips the window/mental/cap assertions exactly as
  // before, but grace selection still runs even then - a real grace token is
  // honored on a recurring instance if one happens to cover its date.
  let bookings = null;
  if (!skipCapCheck || !isElite) {
    bookings = await fetchBookings(athleteId, { householdId });
  }
  if (!skipCapCheck) {
    assertWithinBookingWindow(pkg, date);
    assertMentalCadence(type, date, bookings, pkg);
    assertEliteDailyCap(pkg, type, date, bookings);
  }

  let chargedFrom = 'period';
  let graceTokenId = null;
  if (isElite) {
    chargedFrom = 'elite';
  } else {
    const graceTokens = await fetchGraceTokensByAthlete(athleteId);
    const grace = selectGraceToken(bookings, graceTokens, date);
    if (grace) {
      chargedFrom = 'grace';
      graceTokenId = grace.id;
    } else if (!skipCapCheck) {
      const issued = await getDoc(doc(db, 'tokenPeriods', `${athleteId}_${periodKey}`)).catch(() => null);
      const issuedGrant = issued && issued.exists() ? issued.data().granted : undefined;
      const waitlist = await fetchAthleteWaitlist(athleteId);
      assertPeriodTokensLeft(pkg, bookings, periodKey, issuedGrant, waitlist, currentPeriodKey);
    }
  }

  // Contract v1.1: the booking id IS `{athleteId}_{sessionId}` — the
  // keyspace makes a second booking of the same session an overwrite
  // attempt, which the create-only rules reject. addDoc's random ids were
  // rejected by the deployed rules' id-format check.
  const id = `${athleteId}_${sessionId}`;
  const bookingRef = doc(db, 'bookings', id);
  const sessionRef = doc(db, 'sessions', sessionId);
  const householdRef = doc(db, 'households', householdId);
  const booking = {
    athleteId,
    sessionId,
    date,
    type,
    // periodKey (contract v2.0, pin B) and chargedFrom/graceTokenId
    // (contract v2.1, pin E) are ALL write-once at create - a re-book (the
    // isRebook branch below) only ever updates `status`
    // (memberBookingUpdateOk's own hasOnly), so a booking keeps whatever it
    // was FIRST charged even across a cancel/re-book cycle - the same
    // "history, not a live join" discipline periodKey already established.
    periodKey,
    status: 'confirmed',
    householdId,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    chargedFrom,
    ...(graceTokenId ? { graceTokenId } : {}),
    // WHO ATTENDS a Yannick 1:1 (owner ruling, 2026-09-22) - the athlete by
    // default, or the parent instead. It never touches the charge: the named
    // athlete's token is spent either way, which is why it sits beside
    // chargedFrom without being part of it. Write-once like its neighbours.
    ...(type === 'mental' && attendee === 'parent' ? { attendee } : {}),
    // HOW it was made, when not a single tap: 'repeat' marks bookRecurring's
    // weekly copies, which onBookingCreated (functions/index.js) sends no
    // notice for (owner report 2026-09-30). Absent == a single booking;
    // the rules admit only 'repeat'. Write-once like its neighbours.
    ...(createdVia ? { createdVia } : {}),
  };
  try {
    await runTransaction(db, async (tx) => {
      // All reads before any write — Firestore transaction requirement.
      const [householdSnap, sessionSnap, bookingSnap] = await Promise.all([
        tx.get(householdRef),
        tx.get(sessionRef),
        tx.get(bookingRef),
      ]);

      // The membership gate (contract v2.1, pin H) - read LIVE, inside the
      // transaction, rather than trusting the pre-fetch above (which only
      // exists for anchorDay math and could be stale by the time this
      // commits): a household that went past_due/lapsed between the two
      // reads is caught here, not just by the rules on the eventual write.
      // Absent == active, the same default every other membership read uses.
      const h = householdSnap.exists() ? householdSnap.data() : null;
      const membershipStatus = h?.membership?.status ?? 'active';
      if (membershipStatus === 'past_due' || membershipStatus === 'lapsed') {
        throw new LiveDataError(
          ERR.INVALID,
          "This household's membership is not active right now — new bookings are paused until it's resolved.",
          null,
          'membership-inactive'
        );
      }

      if (!sessionSnap.exists()) {
        throw new LiveDataError(ERR.NOT_FOUND, 'That session no longer exists.');
      }
      // Sprint 9 pin (contract v1.7): re-booking after a cancellation flips
      // status on the SAME doc (the keyspace's whole point — one booking per
      // athlete per session, ever) rather than being blocked. Any OTHER
      // existing status (confirmed/attended/noshow) still blocks a new
      // create, message unchanged.
      const isRebook = bookingSnap.exists() && bookingSnap.data().status === 'cancelled';
      if (bookingSnap.exists() && !isRebook) {
        throw new LiveDataError(ERR.INVALID, 'This athlete already has this session booked.');
      }

      const s = sessionSnap.data();
      // `status` null-safe (db lane reconciliation, Sprint 13): the season
      // generator's own seeded sessions still carry no status field at all;
      // absent means the same thing 'scheduled' does everywhere else this
      // file and firestore.rules read the field.
      if ((s.status ?? 'scheduled') === 'cancelled') {
        throw new LiveDataError(ERR.INVALID, 'This session was cancelled by the academy.');
      }
      if (s.date !== date || s.type !== type) {
        throw new LiveDataError(
          ERR.INVALID,
          'This session changed since you loaded it — refresh and try again.'
        );
      }
      const capacity = s.capacity ?? 0;
      const booked = s.booked ?? 0;
      if (booked >= capacity) {
        // Full session (contract v2.1, pin F): no charge is made here at
        // all - joining the waitlist reserves nothing but a queue slot;
        // the real charge happens at promotion (server-side trigger).
        throw SESSION_FULL;
      }

      if (isRebook) {
        // updateDoc-style partial write, NOT tx.set(bookingRef, booking) —
        // firestore.rules' memberBookingUpdateOk() only admits a diff
        // hasOnly(['status']); rewriting the whole doc (even with identical
        // values) would re-stamp createdAt via serverTimestamp() and widen
        // the diff, and the rule would reject it.
        tx.update(bookingRef, { status: 'confirmed' });
      } else {
        tx.set(bookingRef, booking);
      }
      tx.update(sessionRef, { booked: booked + 1 });
    });
    // Post-write invalidation seam (Sprint 6 pin): every hook reading
    // bookings or sessions re-runs, not just this one. `silent` lets a bulk
    // caller (bookRecurring) bump ONCE after its loop instead of triggering
    // a refetch storm per instance (code review 2026-09-04, finding 8).
    if (!silent) {
      bump('bookings');
      bump('sessions');
    }
    return { id, ...booking, createdAt: null, status: 'confirmed' };
  } catch (err) {
    if (err === SESSION_FULL) {
      // joinWaitlist bumps 'waitlist' itself on success - nothing more to
      // invalidate here (no bookings/sessions write happened on this path).
      const entry = await joinWaitlist({ sessionId, athleteId, householdId, date, periodKey, attendee }, { athlete, pkg });
      const queue = await getDocs(query(collection(db, 'waitlist'), where('sessionId', '==', sessionId))).catch(() => null);
      return {
        id: entry.id,
        athleteId,
        sessionId,
        date,
        type,
        householdId,
        status: 'waitlisted',
        chargedFrom: null,
        position: queue ? queue.size : null,
      };
    }
    throw wrap(err, 'createBooking');
  }
}

/**
 * Cancel a CONFIRMED booking (Sprint 9 pin, contract v1.7) — the athlete's
 * own user or the household parent may cancel; firestore.rules'
 * memberBookingUpdateOk() is the server-side half (diff hasOnly(['status']),
 * confirmed->cancelled only from this function — the re-book direction,
 * cancelled->confirmed, lives in createBooking's transaction above, not
 * here). One transaction: read the booking (must exist and be 'confirmed')
 * and its session, then flip booking.status to 'cancelled' AND give the
 * slot back on its session (booked - 1, floored at 0) — the EXACT mirror of
 * createBooking's +1, covered by the sessions match block's existing
 * bookedDiffOk() clause with no rules change (verified in the routing
 * report). Mirrors createBooking's error-code discipline throughout
 * (LiveDataError codes, wrap()).
 *
 * Client-side cancel-window gating (My Schedule: cancellable until the day
 * before; day-of shows a "contact the academy" line instead of the button)
 * is the CALLER's job — this function performs no date check itself,
 * matching the rules' own accepted gap for v1.
 *
 * Cancel a series (2026-09-30, hooks/cancelSeries.js): each week is this
 * same call with cancelledVia 'series' - the one marker the rules admit, so
 * onBookingCancelled sends no notice per week - and `silent`, so the caller
 * bumps once after its loop (as createBooking does for bookRecurring).
 */
export async function cancelBooking({ bookingId, cancelledVia = null, silent = false }) {
  if (!bookingId) {
    throw new LiveDataError(ERR.INVALID, 'cancelBooking: bookingId is required.');
  }
  const user = requireUser();
  const bookingRef = doc(db, 'bookings', bookingId);
  try {
    await runTransaction(db, async (tx) => {
      // All reads before any write — Firestore transaction requirement.
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists()) {
        throw new LiveDataError(ERR.NOT_FOUND, 'This booking no longer exists.');
      }
      const booking = bookingSnap.data();
      if (booking.status !== 'confirmed') {
        throw new LiveDataError(
          ERR.INVALID,
          `Only a confirmed booking can be cancelled (this one is ${booking.status}).`
        );
      }
      // Sprint 20 (spec 6.1): a Calendly-sourced booking is cancelled from
      // Calendly's email; the webhook writes the cancel. Rules refuse it too.
      if (booking.source === 'calendly') {
        throw new LiveDataError(ERR.INVALID, "Cancel or reschedule from Calendly's email", null, 'calendly-managed');
      }
      const sessionRef = doc(db, 'sessions', booking.sessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists()) {
        throw new LiveDataError(ERR.NOT_FOUND, 'That session no longer exists.');
      }
      const booked = sessionSnap.data().booked ?? 0;

      // Contract v2.1, pin G: a member's own cancel is now traceable —
      // cancelledBy the caller's own uid, cancelReason pinned to 'member'.
      // Nothing about WHO created the booking matters here (a booking the
      // system created via waitlist promotion, createdBy: 'system', is
      // cancellable by its own athlete/household parent exactly the same
      // way — firestore.rules' memberBookingUpdateOk() keys off the
      // caller's athleteId/householdId match, never createdBy). Both new
      // fields ride the SAME update as `status` so the rule's
      // hasOnly(['status','cancelledBy','cancelReason']) is satisfied in
      // one write, not a follow-up.
      // A single cancel clears the series marker a re-booked row may still
      // carry from an earlier series cancel, so its own notice still goes
      // (no field, no diff: the write is unchanged for every other row).
      const via = cancelledVia === 'series' ? 'series' : deleteField();
      tx.update(bookingRef, { status: 'cancelled', cancelledBy: user.uid, cancelReason: 'member', cancelledVia: via });
      tx.update(sessionRef, { booked: Math.max(0, booked - 1) });
    });
    // Post-write invalidation seam (Sprint 6 pin): both collections changed,
    // same discipline as createBooking — one bump each, after the commit.
    if (!silent) {
      bump('bookings');
      bump('sessions');
    }
    return { id: bookingId, status: 'cancelled' };
  } catch (err) {
    throw wrap(err, 'cancelBooking');
  }
}

/**
 * Every contractLog for one athlete, unfiltered — mirrors fetchBookings:
 * a single equality filter needs no composite index, and usePracticeLog
 * derives the current cycle's total client-side from these rows, the same
 * way deriveAllowance() derives booking usage. There is no stored counter to
 * drift either way.
 */
export async function fetchContractLogs(athleteId) {
  if (!athleteId) {
    throw new LiveDataError(ERR.INVALID, 'fetchContractLogs: athleteId is required.');
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'contractLogs'), where('athleteId', '==', athleteId))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchContractLogs');
  }
}

/**
 * Log practice minutes for a day — contract v1.3 shape, ACCUMULATING.
 * `minutes` here is the DELTA the athlete just practiced; the transaction
 * reads the day's existing log and writes existing + delta (capped at the
 * rules' 720), so two quick entries can never lose each other (code review
 * 2026-09-04, finding 3: the old read-outside-write version let a fast
 * second save overwrite from a stale base). Doc id `{athleteId}_{date}`
 * stays the one-log-per-day keyspace; `contractMinutes` is the caller's
 * tier snapshot, never re-derived, so later tier changes cannot rewrite
 * history. Returns the day's new TOTAL in `minutes`.
 */
export async function createContractLog({ athleteId, date, minutes, contractMinutes = null }) {
  if (!athleteId || !date || minutes == null) {
    throw new LiveDataError(
      ERR.INVALID,
      'createContractLog: athleteId, date and minutes are all required.'
    );
  }
  const user = requireUser();
  try {
    const id = `${athleteId}_${date}`;
    const ref = doc(db, 'contractLogs', id);
    const total = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const already = snap.exists() ? snap.data().minutes || 0 : 0;
      const newTotal = Math.min(720, already + minutes);
      tx.set(ref, {
        athleteId,
        date,
        minutes: newTotal,
        contractMinutes,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      return newTotal;
    });
    // Post-write invalidation seam (Sprint 6 pin): usePracticeLog AND
    // useContract AND useAthleteDashboard all re-run, not just whichever
    // hook made the write.
    bump('contractLogs');
    return { id, athleteId, date, minutes: total, contractMinutes };
  } catch (err) {
    throw wrap(err, 'createContractLog');
  }
}

/**
 * Remove one day's practice log (owner's report, 2026-09-10: the contract
 * calendar's "Remove entry" was an inert button). Deletes the
 * `{athleteId}_{date}` doc outright — the keyspace makes the target exact,
 * and a deleted day simply returns to "not logged", which the month
 * derivation already renders. Athlete's own user only, enforced by the
 * contractLogs delete rule, not here.
 */
export async function deleteContractLog({ athleteId, date }) {
  if (!athleteId || !date) {
    throw new LiveDataError(
      ERR.INVALID,
      'deleteContractLog: athleteId and date are both required.'
    );
  }
  requireUser();
  try {
    const id = `${athleteId}_${date}`;
    await deleteDoc(doc(db, 'contractLogs', id));
    // Same invalidation the create path uses: every mounted contract surface
    // re-derives, so the calendar cell repaints without a remount.
    bump('contractLogs');
    return { id, athleteId, date };
  } catch (err) {
    throw wrap(err, 'deleteContractLog');
  }
}

/**
 * Every non-cancelled booking for one session — the coach's live attendance
 * roster (Sprint 6, QA #7). Read authorization is the EXISTING bookings-read
 * rule's coach clause (athleteData(resource.data.athleteId).coachId ==
 * caller) — Firestore evaluates that per candidate document for list/query
 * reads too (get()-indirection keyed off a field the query does NOT filter
 * on is the well-established "join" pattern for row-level list security), so
 * no new rules grant was needed; verified against the emulator (routing
 * report). A side effect worth knowing: on a block shared across coaches,
 * each coach's roster silently shows only their own assigned athletes,
 * consistent with "coach → assigned athletes only, by assignment not role."
 *
 * Query: sessionId == AND status in [...] rides the existing
 * (sessionId ASC, status ASC) composite (firestore.indexes.json) — no new
 * index needed.
 */
export async function fetchBookingsBySession(sessionId) {
  if (!sessionId) {
    throw new LiveDataError(ERR.INVALID, 'fetchBookingsBySession: sessionId is required.');
  }
  try {
    const snap = await getDocs(
      query(
        collection(db, 'bookings'),
        where('sessionId', '==', sessionId),
        where('status', 'in', ['confirmed', 'attended', 'noshow'])
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchBookingsBySession');
  }
}

/**
 * Mark attendance (Sprint 6, QA #6/#7): bookings.status is attendance — coach
 * IN -> 'attended', OUT -> 'noshow', un-marking -> back to 'confirmed'.
 * firestore.rules restricts this to the athlete's assigned coach and to the
 * status field only, transitioning only among confirmed|attended|noshow.
 */
export async function updateBookingStatus({ bookingId, status }) {
  if (!bookingId || !status) {
    throw new LiveDataError(
      ERR.INVALID,
      'updateBookingStatus: bookingId and status are both required.'
    );
  }
  if (!['confirmed', 'attended', 'noshow'].includes(status)) {
    throw new LiveDataError(
      ERR.INVALID,
      `updateBookingStatus: status must be confirmed, attended or noshow - got "${status}".`
    );
  }
  requireUser();
  try {
    await updateDoc(doc(db, 'bookings', bookingId), { status });
    // Post-write invalidation seam (Sprint 6 pin): every hook reading
    // bookings re-runs, including other coaches' or the family's own view.
    bump('bookings');
    return { id: bookingId, status };
  } catch (err) {
    throw wrap(err, 'updateBookingStatus');
  }
}

/**
 * Coach's optional no-show reason on one booking (owner's report,
 * 2026-09-10: the roster's "+ Add a reason" chip was an inert button). A
 * single free-text field on the booking doc — `noshowReason`, string <=200
 * or null to clear — under the same assigned-coach attendance rule that
 * governs status (the rules' attendanceUpdateOk now admits exactly this one
 * extra key). Readable wherever the booking is readable, so the family sees
 * the reason on their own records, which is the point of recording one.
 */
export async function setBookingNoshowReason({ bookingId, reason }) {
  if (!bookingId) {
    throw new LiveDataError(
      ERR.INVALID,
      'setBookingNoshowReason: bookingId is required.'
    );
  }
  const clean = typeof reason === 'string' ? reason.trim().slice(0, 200) : null;
  requireUser();
  try {
    await updateDoc(doc(db, 'bookings', bookingId), { noshowReason: clean || null });
    bump('bookings');
    return { id: bookingId, noshowReason: clean || null };
  } catch (err) {
    throw wrap(err, 'setBookingNoshowReason');
  }
}

/**
 * Every tournamentResults doc, unfiltered (Sprint 7 pin) — powers
 * useTourStandings. The read rule is `signedIn()` alone (contract v1.5:
 * standings are academy-public), so no equality filter is needed to make an
 * unfiltered read provable. The season's tournament count is small (a
 * handful of Saturdays), so one plain read is simpler than a date-range
 * query and costs the same.
 */
export async function fetchTournamentResults() {
  try {
    const snap = await getDocs(query(collection(db, 'tournamentResults'), orderBy('date')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchTournamentResults');
  }
}

/**
 * tournamentResults for one session — powers useTournamentResults's read
 * side (results entry screen, pre-filled on re-entry). Single equality
 * filter needs no composite index; provable for every role since the read
 * rule does not depend on resource.data at all.
 */
export async function fetchTournamentResultsForSession(sessionId) {
  if (!sessionId) {
    throw new LiveDataError(
      ERR.INVALID,
      'fetchTournamentResultsForSession: sessionId is required.'
    );
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'tournamentResults'), where('sessionId', '==', sessionId))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchTournamentResultsForSession');
  }
}

/**
 * Save one tournament's raw SCORES (Sprint 8 pin, contract v1.6, supersedes
 * v1.5.1) — coach/mental/ops/owner only, enforced by firestore.rules, not
 * here. One setDoc PER ENTRY (a create for a new athlete result, an
 * overwrite for a correction — contract v1.5: "no delete in v1, corrections
 * overwrite via update"), each carrying the pinned shape exactly: sessionId,
 * athleteId, name, bracket, date, score, createdBy, createdAt. POSITION IS
 * NO LONGER STORED — it derives at read time from score within each
 * (sessionId, bracket) group (data/tour.js's deriveTourStandings). Doc id is
 * `{sessionId}_{athleteId}`, mirroring bookings/contractLogs — one result
 * per athlete per tournament.
 *
 * `name` (contract v1.5.1) and `bracket` (contract v1.6) are both write-time
 * snapshots the CALLER supplies — this function does no athlete lookups of
 * its own. `name` is the athlete's display name from the roster the staff
 * member entering results is already reading; `bracket` is computed by the
 * caller via useAthleteBrackets (data/tour.js's bracketFor, as of
 * SEASON_BOUNDS.start) before saveResults() is invoked. Both stay pure
 * display denormalization — points/position derive from `score` alone — so
 * the academy-public standings can show every name and group by bracket
 * WITHOUT widening the athletes read matrix (the full athlete doc carries
 * dob/householdId/contractMinutes; these carry name/bracket alone). Both are
 * string or null — a missing roster name or unset dob never blocks a save.
 *
 * `date` is the CALLER's job to pass, but it must equal the sessionId's own
 * leading YYYY-MM-DD (sessions are always `YYYY-MM-DD-<block>`) — the rule
 * checks that independently, so a mismatched date here is rejected
 * server-side, not just client-side.
 *
 * Entries are validated up front, before any write starts, so a bad entry
 * anywhere in the list never leaves a partial save in flight: every entry
 * needs an athleteId and an int score in [18, 200] (strokes); name/bracket,
 * when present, must be strings (null is fine — never required).
 *
 * ONE bump('tournamentResults') after every entry lands, not per entry (the
 * refetch-storm lesson, mirroring createBooking's bulk `silent` pattern) —
 * every mounted useTourStandings/useTournamentResults instance re-runs
 * exactly once per save, not once per athlete.
 */
export async function saveTournamentResults(sessionId, date, entries) {
  if (!sessionId || !date || !Array.isArray(entries) || entries.length === 0) {
    throw new LiveDataError(
      ERR.INVALID,
      'saveTournamentResults: sessionId, date and a non-empty entries array are required.'
    );
  }
  for (const entry of entries) {
    const scoreOk =
      entry && Number.isInteger(entry.score) && entry.score >= 18 && entry.score <= 200;
    const nameOk = !entry || entry.name == null || typeof entry.name === 'string';
    const bracketOk = !entry || entry.bracket == null || typeof entry.bracket === 'string';
    if (!entry || !entry.athleteId || !scoreOk || !nameOk || !bracketOk) {
      throw new LiveDataError(
        ERR.INVALID,
        'saveTournamentResults: every entry needs an athleteId and an int score between 18 ' +
          'and 200 (name/bracket, if present, must be strings).'
      );
    }
  }
  const user = requireUser();
  try {
    await Promise.all(
      entries.map(({ athleteId, score, name, bracket }) => {
        const id = `${sessionId}_${athleteId}`;
        return setDoc(doc(db, 'tournamentResults', id), {
          sessionId,
          athleteId,
          name: typeof name === 'string' && name ? name : null,
          bracket: typeof bracket === 'string' && bracket ? bracket : null,
          date,
          score,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      })
    );
    bump('tournamentResults');
    return { sessionId, count: entries.length };
  } catch (err) {
    throw wrap(err, 'saveTournamentResults');
  }
}

/* ------------------------------------------------------------------------- *
 * Sprint 10 ("make it real": intake paths + live staff surfaces) — contract
 * v1.8. Same discipline as everything above: one Firestore touchpoint per
 * function, LiveDataError throughout, bump() the affected collection(s)
 * exactly once per write, never more than the write actually changed.
 * ------------------------------------------------------------------------- */

/**
 * One enrollmentRequests/{uid} doc, or null when the guardian has never
 * submitted (contract v1.8, A). Unlike every other fetch* in this file this
 * one does NOT throw NOT_FOUND for a missing doc — "no request yet" is a
 * defined UI state (NotProvisioned's "start enrollment"), not an error.
 */
export async function fetchEnrollmentRequest(uid) {
  if (!uid) throw new LiveDataError(ERR.INVALID, 'fetchEnrollmentRequest: uid is required.');
  try {
    const snap = await getDoc(doc(db, 'enrollmentRequests', uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    throw wrap(err, 'fetchEnrollmentRequest');
  }
}

/** The signed-in guardian's own request — used before a users/{uid} doc exists, so this reads auth directly rather than through fetchCurrentUser(). */
export async function fetchMyEnrollmentRequest() {
  const user = requireUser();
  return fetchEnrollmentRequest(user.uid);
}

/**
 * Submit or resubmit the signed-in guardian's enrollment request — ONE
 * function for both, matching firestore.rules' single update clause: create
 * when no doc exists yet, otherwise update (the 'declined' -> 'pending'
 * resubmit is just an update whose current status happens to be 'declined').
 * `guardian`/`athletes`/`consents` are exactly the contract v1.8 shape; the
 * caller (useEnrollment) is responsible for their contents, this function
 * only adds the identity/status/timestamp fields the rules require.
 */
export async function submitMyEnrollmentRequest({ guardian, athletes, consents, guardianNotes = null }) {
  const user = requireUser();
  const ref = doc(db, 'enrollmentRequests', user.uid);
  try {
    const existing = await getDoc(ref);
    const now = serverTimestamp();
    // guardianNotes: { emergencyContact, medical } free text or null — the
    // registration form collects it; approval moves it to each athlete's
    // private/medical doc (never surfaced on the request after that).
    const notes =
      guardianNotes && (guardianNotes.emergencyContact || guardianNotes.medical)
        ? {
            emergencyContact: guardianNotes.emergencyContact ?? null,
            medical: guardianNotes.medical ?? null,
          }
        : null;
    const payload = { guardian, athletes, consents, guardianNotes: notes, status: 'pending', updatedAt: now };
    if (existing.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, declineReason: null, createdAt: now, reviewedBy: null, reviewedAt: null });
    }
    bump('enrollmentRequests');
    return { id: user.uid, ...payload, updatedAt: null };
  } catch (err) {
    throw wrap(err, 'submitMyEnrollmentRequest');
  }
}

/** Every pending enrollmentRequests doc — the ops/owner approval queue. */
export async function fetchPendingEnrollmentRequests() {
  try {
    const snap = await getDocs(query(collection(db, 'enrollmentRequests'), where('status', '==', 'pending')));
    // The doc id IS the guardian's auth uid — exposed under both names so
    // the queue's approve(uid)/decline(uid) calls and the row keys read it
    // by either (PM integration: the card read `.uid` and got undefined).
    return snap.docs.map((d) => ({ id: d.id, uid: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchPendingEnrollmentRequests');
  }
}

/**
 * Approve one enrollmentRequests/{uid} — the pinned "one batched write"
 * (contract v1.8, A): households/{autoId} from guardian, athletes/{autoId}
 * per submitted athlete (all in the new household, coachId null — coach
 * assignment is a separate, unbuilt admin action), users/{uid} for the
 * guardian as a parent, and the request itself flipped to 'approved'. All
 * five-plus writes land in one writeBatch so a half-approved family (a
 * household with no linked users doc, say) can never happen.
 *
 * households.guardian mirrors DATA-MODEL.md's existing shape exactly
 * ({ name, email, phone } as one map) rather than inventing flat
 * guardianEmail/guardianPhone fields.
 *
 * Kids' own logins are NOT created here (contract v1.8: "a later
 * provisioning step, parent-managed is the default") — only the guardian's
 * users doc is written.
 */
export async function approveEnrollmentRequest(uid) {
  if (!uid) throw new LiveDataError(ERR.INVALID, 'approveEnrollmentRequest: uid is required.');
  const user = requireUser();
  try {
    const reqSnap = await getDoc(doc(db, 'enrollmentRequests', uid));
    if (!reqSnap.exists()) {
      throw new LiveDataError(ERR.NOT_FOUND, 'This enrollment request no longer exists.');
    }
    const request = reqSnap.data();

    // NOT the single 7-write batch the pin first described: in the live
    // emulator every rule's me() get() across that many writes ran into
    // Firestore's document-access cap for multi-document requests and the
    // batch errored partway (PM integration, 2026-09-11) — production has
    // the same cap. Three requests instead, made RETRY-SAFE: a re-approval
    // after a partial failure finds the family's household by guardian
    // email and skips straight to whatever is still missing, so a
    // half-approved family self-heals on the next tap instead of
    // duplicating.
    const email = request.guardian?.email ?? null;
    let householdId = null;
    let athleteIds = [];
    if (email) {
      const found = await getDocs(query(collection(db, 'households'), where('guardian.email', '==', email)));
      if (!found.empty) householdId = found.docs[0].id;
    }

    if (!householdId) {
    const batch = writeBatch(db);

    const householdRef = doc(collection(db, 'households'));
    // "Whitfield family", not "Dana Whitfield family": the surname is the
    // last word of the guardian's name (PM integration reconciliation).
    const surname = (request.guardian?.name ?? '').trim().split(/\s+/).pop();
    batch.set(householdRef, {
      name: surname ? `${surname} family` : 'New family',
      guardian: {
        name: request.guardian?.name ?? null,
        email: request.guardian?.email ?? null,
        phone: request.guardian?.phone ?? null,
      },
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });

    for (const a of request.athletes || []) {
      const athleteRef = doc(collection(db, 'athletes'));
      batch.set(athleteRef, {
        name: a.name ?? null,
        dob: a.dob ?? null,
        householdId: householdRef.id,
        packageId: a.packageId ?? null,
        contractMinutes: a.contractMinutes ?? null,
        // Contract-buffer Phase 2: a kid approved onto a tier starts the
        // contract today (Chicago), so a mid-month approval is not Behind on
        // day one. The create rule is hasAll, so the extra field is allowed.
        ...(a.contractMinutes != null ? { contractStart: chicagoDateISO() } : {}),
        coachId: null,
        // v2.0.1 (Sprint 18): the add-on is never on by default; the signed
        // waiver (enrollment consent) is what later lets ops switch it on.
        facilityAccess: false,
        facilityAccessConsent:
          request.consents && request.consents.facilityAccess === true
            ? { signedAt: serverTimestamp(), byUid: uid }
            : null,
      });
      athleteIds.push(athleteRef.id);
      // Emergency contact + medical notes the guardian typed at enrollment
      // land in the athlete's private/medical doc — the data-minimization
      // home the rules already scope to on-site staff (contract v1.8
      // amendment at PM integration). Household-level notes apply to every
      // kid on the request.
      const notes = request.guardianNotes;
      if (notes && (notes.emergencyContact || notes.medical)) {
        batch.set(doc(db, 'athletes', athleteRef.id, 'private', 'medical'), {
          emergencyContact: { name: notes.emergencyContact ?? null, phone: null, relationship: null },
          medicalNotes: notes.medical ?? null,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Family creation (household + athletes + their medical docs) commits
    // together — a handful of writes, well under the access cap.
    await batch.commit();
    householdId = householdRef.id;
    } else {
      // Retry path: the household already exists from an earlier partial
      // approval — reuse its athletes rather than creating a second set.
      const kids = await getDocs(query(collection(db, 'athletes'), where('householdId', '==', householdId)));
      athleteIds = kids.docs.map((d) => d.id);
    }

    // The guardian's own users doc — its own request (the users rules make
    // several me() reads of their own).
    await setDoc(doc(db, 'users', uid), {
      role: 'parent',
      householdId,
      athleteId: null,
      staff: false,
      specialistId: null,
      displayName: request.guardian?.name ?? null,
      email: request.guardian?.email ?? null,
    });

    // Status last: if anything above failed, the request stays pending and
    // the next Approve tap resumes from the household lookup.
    await updateDoc(doc(db, 'enrollmentRequests', uid), {
      status: 'approved',
      reviewedBy: user.uid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Four collections changed - one bump each, matching the "single bump()
    // per write" discipline (bump the collection, not per-document).
    bump('households');
    bump('athletes');
    bump('users');
    bump('enrollmentRequests');
    return { uid, householdId, athleteIds };
  } catch (err) {
    throw wrap(err, 'approveEnrollmentRequest');
  }
}

/** Decline one enrollmentRequests/{uid} with a reason the guardian will see. */
export async function declineEnrollmentRequest(uid, reason) {
  if (!uid) throw new LiveDataError(ERR.INVALID, 'declineEnrollmentRequest: uid is required.');
  const user = requireUser();
  try {
    await updateDoc(doc(db, 'enrollmentRequests', uid), {
      status: 'declined',
      declineReason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
      reviewedBy: user.uid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    bump('enrollmentRequests');
    return { uid, status: 'declined' };
  } catch (err) {
    throw wrap(err, 'declineEnrollmentRequest');
  }
}

/** 'yyyy-MM-dd' in America/Chicago: data/calendar.js's one derivation, kept under this name for its callers. */
export function chicagoDateISO(now = new Date()) {
  return academyDateISO(now);
}

/**
 * Set (or clear) an athlete's Commitment Contract tier (contract v1.8, B) —
 * the athlete's own user or the household parent, enforced by
 * firestore.rules' contractMinutesUpdateOk(), not here. `minutes` must be
 * one of the three real tiers or null (no tier / "not started").
 *
 * `start` (contract-buffer Phase 2): the caller is moving a no-tier athlete
 * onto a tier (NoContract, StartContractCard), so the write also stamps
 * athletes.contractStart with today's Chicago date - the contract window
 * opens there and earlier weekdays of the month never count as missed.
 * Changing an existing tier passes no `start` and leaves contractStart alone.
 *
 * Rules still at hasOnly(['contractMinutes']) (the frontend shipped from
 * main before the firestore.rules deploy) refuse the stamped write, so a
 * permission-denied start retries with the tier alone: the contract starts
 * with the Nov 3 window (Phase 1) instead of failing. A write refused for
 * any other reason is refused again and throws as before.
 */
export async function setContractTier({ athleteId, minutes, start = false }) {
  if (!athleteId) throw new LiveDataError(ERR.INVALID, 'setContractTier: athleteId is required.');
  if (minutes != null && ![20, 45, 90].includes(minutes)) {
    throw new LiveDataError(ERR.INVALID, 'setContractTier: minutes must be 20, 45, 90 or null.');
  }
  requireUser();
  const ref = doc(db, 'athletes', athleteId);
  let patch = { contractMinutes: minutes };
  if (start && minutes != null) patch.contractStart = chicagoDateISO();
  try {
    let contractStartDropped = false;
    try {
      await updateDoc(ref, patch);
    } catch (err) {
      if (!patch.contractStart || err?.code !== 'permission-denied') throw err;
      // Review 2026-09-30: never silent - the contract now counts from the
      // season start (Nov 3) instead of today, and the caller can say so.
      console.warn(`setContractTier: contractStart refused by the rules (deploy them); ${athleteId} counts from the season start`);
      contractStartDropped = true;
      patch = { contractMinutes: minutes };
      await updateDoc(ref, patch);
    }
    bump('athletes');
    return { athleteId, ...patch, ...(contractStartDropped ? { contractStartDropped: true } : {}) };
  } catch (err) {
    throw wrap(err, 'setContractTier');
  }
}

/**
 * Assign an athlete's ONE package (contract v2.0, pin A/B — narrowed from
 * Sprint 11's golf-plus-fitness pair now that fitnessPackageId is retired
 * along with the fitness catalogue it pointed into) — ops/owner only,
 * enforced by firestore.rules' packageAssignmentUpdateOk(), not here.
 * `packageId` is required — every athlete always carries exactly one
 * package (a token package, Elite, or Single). Assignment is IMMEDIATE and
 * un-prorated (the pin's own words, unchanged): nothing already booked is
 * touched, no cancellations, no refunds — there is no money here, only
 * which package pointer the athlete's token position derives from going
 * forward.
 */
export async function setAthletePackages(athleteId, { packageId, facilityAccess }) {
  if (!athleteId) {
    throw new LiveDataError(ERR.INVALID, 'setAthletePackages: athleteId is required.');
  }
  if (typeof packageId !== 'string' || !packageId) {
    throw new LiveDataError(ERR.INVALID, 'setAthletePackages: packageId is required.');
  }
  requireUser();
  try {
    // v2.0.1 (Sprint 18): the facility-access add-on rides the same rules
    // branch (hasOnly packageId/facilityAccess/updatedAt); written only when
    // the editor sends a boolean, so older callers are untouched.
    const patch = { packageId, updatedAt: serverTimestamp() };
    if (typeof facilityAccess === 'boolean') patch.facilityAccess = facilityAccess;
    await updateDoc(doc(db, 'athletes', athleteId), patch);
    bump('athletes');
    return { athleteId, packageId, facilityAccess: patch.facilityAccess ?? null };
  } catch (err) {
    throw wrap(err, 'setAthletePackages');
  }
}

/**
 * A family's own package change BEFORE the first payment (tester S4,
 * 2026-09-30) - the household parent or the athlete's own login, only while
 * billing.status is 'pending' and only to a monthly package, enforced by
 * firestore.rules' pendingPackageUpdateOk(), not here. Nothing else moves:
 * the next Pay now checks out the new package (createCheckoutSession reads
 * packageId fresh and expires an open session for another price).
 */
export async function changePendingPackage(athleteId, packageId) {
  if (!athleteId) throw new LiveDataError(ERR.INVALID, 'changePendingPackage: athleteId is required.');
  if (!CHANGEABLE_PACKAGE_IDS.includes(packageId)) {
    throw new LiveDataError(ERR.INVALID, `changePendingPackage: ${packageId} is not a monthly package.`);
  }
  requireUser();
  try {
    await updateDoc(doc(db, 'athletes', athleteId), { packageId, updatedAt: serverTimestamp() });
    bump('athletes');
    return { athleteId, packageId };
  } catch (err) {
    throw wrap(err, 'changePendingPackage');
  }
}

/**
 * Set a household's billing-PERIOD anchor day (contract v2.0, pin B) —
 * ops/owner only, enforced by firestore.rules' householdPeriodUpdateOk(),
 * not here. `day` is clamped to the pin's 1-28 range client-side via
 * normalizeAnchorDay (data/packages.js) before it ever reaches the write;
 * the rules re-check the same bound server-side. Every athlete in the
 * household re-derives its token period the moment this lands (periodFor
 * reads the household doc live, not a cached anchor), so this is the one
 * write that can move where every member's "period" starts and ends.
 */
export async function setHouseholdPeriodAnchorDay(householdId, day) {
  if (!householdId) {
    throw new LiveDataError(ERR.INVALID, 'setHouseholdPeriodAnchorDay: householdId is required.');
  }
  requireUser();
  const periodAnchorDay = normalizeAnchorDay(day);
  try {
    await updateDoc(doc(db, 'households', householdId), {
      periodAnchorDay,
      updatedAt: serverTimestamp(),
    });
    bump('households');
    return { householdId, periodAnchorDay };
  } catch (err) {
    throw wrap(err, 'setHouseholdPeriodAnchorDay');
  }
}

/**
 * Every diagnostics capture for one athlete (contract v1.8, C), newest
 * first. `publishedOnly` is how a member caller (athlete/parent) stays
 * inside firestore.rules' PUBLISHED-only read grant; a staff caller omits it
 * and sees drafts too. Sorted client-side rather than via orderBy() so no
 * new composite index is needed for a subcollection this small (a handful
 * of captures per athlete, ever).
 */
export async function fetchAthleteDiagnostics(athleteId, { publishedOnly = false, draftOnly = false } = {}) {
  if (!athleteId) {
    throw new LiveDataError(ERR.INVALID, 'fetchAthleteDiagnostics: athleteId is required.');
  }
  try {
    // One status per query: the published-only read rule makes an
    // unfiltered list unprovable for athletes/parents (see liveDiagnostic).
    const filters = publishedOnly
      ? [where('status', '==', 'published')]
      : draftOnly
      ? [where('status', '==', 'draft')]
      : [];
    const snap = await getDocs(query(collection(db, 'athletes', athleteId, 'diagnostics'), ...filters));
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (b.capturedAt?.toMillis?.() ?? 0) - (a.capturedAt?.toMillis?.() ?? 0));
    return rows;
  } catch (err) {
    throw wrap(err, 'fetchAthleteDiagnostics');
  }
}

/**
 * Save a diagnostics capture (contract v1.8, C) — upserts the athlete's
 * single OPEN draft (queried by status == 'draft', never a guessed id: this
 * collection uses auto-ids, so there is no `{athleteId}_{x}` keyspace to
 * probe the way bookings/contractLogs do). `publish: true` flips the
 * capture to 'published'; because the query only ever finds a doc whose
 * status is still 'draft', a SECOND save after publishing finds nothing and
 * creates a fresh capture instead of reopening the published one — exactly
 * "a second publish creates a new capture; history is the collection."
 */
export async function saveDiagnosticCapture(athleteId, { values, notes = null, publish = false }) {
  if (!athleteId) {
    throw new LiveDataError(ERR.INVALID, 'saveDiagnosticCapture: athleteId is required.');
  }
  const user = requireUser();
  try {
    const status = publish ? 'published' : 'draft';
    const now = serverTimestamp();
    const openDraft = await getDocs(
      query(collection(db, 'athletes', athleteId, 'diagnostics'), where('status', '==', 'draft'))
    );
    if (!openDraft.empty) {
      const ref = openDraft.docs[0].ref;
      await updateDoc(ref, { values, notes, status, updatedAt: now });
      bump('diagnostics');
      return { id: ref.id, athleteId, status };
    }
    const ref = doc(collection(db, 'athletes', athleteId, 'diagnostics'));
    await setDoc(ref, {
      athleteId,
      capturedBy: user.uid,
      capturedAt: now,
      updatedAt: now,
      status,
      values,
      notes,
    });
    bump('diagnostics');
    return { id: ref.id, athleteId, status };
  } catch (err) {
    throw wrap(err, 'saveDiagnosticCapture');
  }
}

/**
 * Every athlete, unfiltered (contract v1.8, D) — the admin dashboard's
 * enrolled-count/by-package/who-needs-a-call surfaces. Provable for
 * mental/ops/owner unconditionally (the athletes read rule's staff clause
 * does not reference resource.data at all), so no equality filter is
 * needed the way parent/coach list reads require one.
 */
export async function fetchAllAthletes() {
  try {
    const snap = await getDocs(collection(db, 'athletes'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchAllAthletes');
  }
}

/**
 * Every household, unfiltered (contract v2.1, pin H — useAdminDashboard's
 * new membership card: active/past_due/lapsed counts and the lapsed
 * households list). Provable for ops/owner unconditionally, same as
 * fetchAllAthletes above — the households read rule's staff clause does not
 * reference resource.data either.
 */
export async function fetchAllHouseholds() {
  try {
    const snap = await getDocs(collection(db, 'households'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchAllHouseholds');
  }
}

/**
 * Non-cancelled... actually EVERY booking with status 'noshow' from a given
 * date onward (contract v1.8, D's "no-shows this month"). Needs a NEW
 * composite index — bookings (status ASC, date ASC) — that this routing
 * lane does NOT own (firestore.indexes.json is the db lane's file); flagged
 * prominently in the routing report as a cross-lane dependency. Provable for
 * staff the same unconditional way fetchAllAthletes is.
 */
export async function fetchNoShowBookingsSince(dateISO) {
  if (!dateISO) {
    throw new LiveDataError(ERR.INVALID, 'fetchNoShowBookingsSince: dateISO is required.');
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'bookings'), where('status', '==', 'noshow'), where('date', '>=', dateISO))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchNoShowBookingsSince');
  }
}

/**
 * Every contractLogs doc from a given date onward, across every athlete
 * (contract v1.8, D's "contract behind" — ONE range query, single-field
 * filter, no composite index needed, per the pin's own "db lane confirms
 * the query is index-free"). Provable for staff unconditionally, same as
 * fetchAllAthletes.
 */
export async function fetchContractLogsSince(dateISO) {
  if (!dateISO) {
    throw new LiveDataError(ERR.INVALID, 'fetchContractLogsSince: dateISO is required.');
  }
  try {
    const snap = await getDocs(query(collection(db, 'contractLogs'), where('date', '>=', dateISO)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchContractLogsSince');
  }
}

/**
 * Every diagnostics capture academy-wide, via the collectionGroup read
 * firestore.rules' `/{path=**}/diagnostics/{captureId}` match grants
 * (contract v1.8, C + D). Unfiltered and sorted/filtered client-side
 * (status === 'published' for the "no diagnostic yet" list) rather than a
 * `where('status', ...)` server-side filter, so this needs no
 * collection-group-scoped index at all — the routing lane's own
 * "index-free where reasonably possible" preference, since collection-group
 * equality indexes are NOT automatic the way single-collection ones are.
 */
export async function fetchAllDiagnostics() {
  try {
    const snap = await getDocs(collectionGroup(db, 'diagnostics'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchAllDiagnostics');
  }
}

/**
 * Every users doc with staff == true (contract v1.8, E) — the Staff & Roles
 * list. Single-field equality, automatically indexed, provable for
 * ops/owner per the widened users read rule.
 */
export async function fetchStaffUsers() {
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('staff', '==', true)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchStaffUsers');
  }
}

/** Every pending staffInvites doc (contract v1.8, E). */
export async function fetchPendingStaffInvites() {
  try {
    const snap = await getDocs(query(collection(db, 'staffInvites'), where('status', '==', 'pending')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchPendingStaffInvites');
  }
}

/**
 * Create a staff invite (contract v1.8, E) — owner-only, enforced by
 * firestore.rules, not here. Email is lowercased CLIENT-side (the rules
 * deliberately do not re-check it — see the staffInvites match's own
 * comment on why). Consumed later by scripts/provision-family.mjs (db
 * lane), which looks the auth uid up by email and marks this 'provisioned'
 * — nothing in this file marks an invite provisioned; that is a
 * server-side/script action, not a client one.
 */
export async function createStaffInvite({ email, role, displayName = null, specialistId = null }) {
  if (!email || !role) {
    throw new LiveDataError(ERR.INVALID, 'createStaffInvite: email and role are both required.');
  }
  const user = requireUser();
  try {
    const ref = doc(collection(db, 'staffInvites'));
    await setDoc(ref, {
      email: String(email).trim().toLowerCase(),
      role,
      displayName,
      specialistId,
      status: 'pending',
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
    bump('staffInvites');
    return { id: ref.id, email, role, displayName, specialistId, status: 'pending' };
  } catch (err) {
    throw wrap(err, 'createStaffInvite');
  }
}

/**
 * Persist the signed-in user's own notification preferences (contract v1.8,
 * G) — the ONE self-write the users collection grants, enforced by
 * firestore.rules' diff hasOnly(['notificationPrefs']). `prefs` is the
 * COMPLETE desired map ({ [categoryId]: { email, push } }) — the caller
 * (useNotificationPrefs) merges its locally-edited categories onto the
 * currently-loaded set before calling this, since a partial map here would
 * silently drop every category not included.
 */
export async function saveNotificationPrefs(prefs) {
  const user = requireUser();
  try {
    await updateDoc(doc(db, 'users', user.uid), { notificationPrefs: prefs });
    bump('users');
    return { notificationPrefs: prefs };
  } catch (err) {
    throw wrap(err, 'saveNotificationPrefs');
  }
}

/**
 * Self-service mobile phone for text notices - the second (and last) field a
 * member writes on their own users doc (rules: hasOnly notificationPrefs +
 * phone). Trimmed, capped at 32 characters, empty clears to null.
 */
export async function saveMyPhone(phone) {
  const user = requireUser();
  const clean = typeof phone === 'string' ? phone.trim().slice(0, 32) : '';
  try {
    await updateDoc(doc(db, 'users', user.uid), { phone: clean || null });
    bump('users');
    return { phone: clean || null };
  } catch (err) {
    throw wrap(err, 'saveMyPhone');
  }
}

/**
 * Set (or clear) a session's coach note (contract v1.8, H) — string <=500 or
 * null, the one field firestore.rules' coachNoteUpdateOk() admits. Mirrors
 * setBookingNoshowReason's trim/cap/null-on-empty discipline exactly.
 */
export async function setSessionCoachNote({ sessionId, note }) {
  if (!sessionId) {
    throw new LiveDataError(ERR.INVALID, 'setSessionCoachNote: sessionId is required.');
  }
  const clean = typeof note === 'string' ? note.trim().slice(0, 500) : null;
  requireUser();
  try {
    await updateDoc(doc(db, 'sessions', sessionId), { coachNote: clean || null });
    bump('sessions');
    return { id: sessionId, coachNote: clean || null };
  } catch (err) {
    throw wrap(err, 'setSessionCoachNote');
  }
}
