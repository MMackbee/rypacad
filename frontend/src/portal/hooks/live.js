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
  deleteDoc,
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
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { bump } from './invalidate';
import { poolFor } from '../data/packages';
import { SPECIALISTS, SPECIALIST_MONTHLY_CAP } from '../data/specialists';

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
 * `cause` keeps the underlying Firestore error for logging.
 */
export class LiveDataError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = 'LiveDataError';
    this.code = code;
    this.cause = cause;
  }
}

/** Map a Firestore SDK error onto our codes; anything unrecognised is UNKNOWN. */
function wrap(err, context) {
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

function requireUser() {
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
const MAX_BLOCKS_PER_DAY = 6; // 4 Saturday blocks is the weekly max; 6 leaves holiday headroom.

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
 * Monthly-allowance guard at the writer, not just the UI (code review
 * 2026-09-04, finding 2): before any booking lands, count the athlete's
 * non-cancelled bookings for this pool in the session's month against the
 * package limit. A limit of 0 means the pool has NO allowance and every
 * booking is refused (finding 1: `limit > 0` gates treated zero as
 * unlimited). This is client-side derivation like the allowance itself —
 * a true server-side count awaits a Cloud Function, documented in
 * DATA-MODEL.md. Callers that already maintain a running tally
 * (bookRecurring) pass skipCapCheck to avoid re-querying per instance.
 *
 * Sprint 9 pin (contract v1.7): pool 'specialist' (phil/mental) does not
 * answer to a package limit at all — Elite's philSessions/yannickSessions
 * stay null/undecided (parked with billing, data/specialists.js) — so this
 * takes an entirely separate branch, capped instead at
 * SPECIALIST_MONTHLY_CAP PER SESSION TYPE (phil and mental each get their
 * own count), counted from the athlete's non-cancelled bookings of that
 * `type` in the month. `type` is required for this branch only — the
 * existing training/tournament branch below is unchanged and still keys off
 * `pool` alone.
 */
async function assertWithinMonthlyCap({ athleteId, householdId, date, pool, type }) {
  const month = date.slice(0, 7);
  const bookings = await fetchBookings(athleteId, { householdId });

  if (pool === 'specialist') {
    const spent = bookings.filter(
      (b) => b.status !== 'cancelled' && b.type === type && b.date.slice(0, 7) === month
    ).length;
    if (spent >= SPECIALIST_MONTHLY_CAP) {
      const specialist = SPECIALIST_BY_ID.get(type);
      const who = specialist ? specialist.name : 'this specialist';
      const noun = specialist ? specialist.sessionNoun.toLowerCase() : 'session';
      throw new LiveDataError(
        ERR.INVALID,
        `That month's ${noun}s with ${who} are already booked (${spent} of ${SPECIALIST_MONTHLY_CAP}).`
      );
    }
    return;
  }

  const athlete = await fetchAthlete(athleteId);
  const pkg = athlete.packageId ? await fetchPackage(athlete.packageId) : null;
  const limit = (pool === 'tournaments' ? pkg?.tournaments : pkg?.training) ?? 0;
  const spent = bookings.filter(
    (b) => b.status !== 'cancelled' && b.pool === pool && b.date.slice(0, 7) === month
  ).length;
  if (spent >= limit) {
    throw new LiveDataError(
      ERR.INVALID,
      limit === 0
        ? `This package has no ${pool === 'tournaments' ? 'tournament entries' : 'training sessions'}.`
        : `That month's ${pool === 'tournaments' ? 'tournament entries' : 'training sessions'} are already fully booked (${spent} of ${limit}).`
    );
  }
}

export async function createBooking(
  { athleteId, sessionId, date, type, pool, householdId },
  { skipCapCheck = false, silent = false } = {}
) {
  if (!athleteId || !sessionId || !date || !type || !pool || !householdId) {
    throw new LiveDataError(
      ERR.INVALID,
      'createBooking: athleteId, sessionId, date, type, pool and householdId are all required.'
    );
  }
  // poolFor() (data/packages.js) is the one place the type->pool mapping is
  // decided - Sprint 9 extended it with 'specialist' (phil/mental) rather
  // than duplicating the mapping here as a second ternary that could drift.
  if (pool !== poolFor(type)) {
    throw new LiveDataError(
      ERR.INVALID,
      `createBooking: a ${type} session cannot spend the ${pool} pool - the pools never substitute.`
    );
  }
  const user = requireUser();
  if (!skipCapCheck) await assertWithinMonthlyCap({ athleteId, householdId, date, pool, type });
  // Contract v1.1: the booking id IS `{athleteId}_{sessionId}` — the
  // keyspace makes a second booking of the same session an overwrite
  // attempt, which the create-only rules reject. addDoc's random ids were
  // rejected by the deployed rules' id-format check.
  const id = `${athleteId}_${sessionId}`;
  const bookingRef = doc(db, 'bookings', id);
  const sessionRef = doc(db, 'sessions', sessionId);
  const booking = {
    athleteId,
    sessionId,
    date,
    type,
    pool,
    status: 'confirmed',
    householdId,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  };
  try {
    await runTransaction(db, async (tx) => {
      // All reads before any write — Firestore transaction requirement.
      const [sessionSnap, bookingSnap] = await Promise.all([tx.get(sessionRef), tx.get(bookingRef)]);

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
      if (s.status === 'cancelled') {
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
        throw new LiveDataError(ERR.INVALID, 'This session is full.');
      }

      if (isRebook) {
        // updateDoc-style partial write, NOT tx.set(bookingRef, booking) —
        // firestore.rules' new memberBookingUpdateOk() only admits a diff
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
    return { id, ...booking, createdAt: null };
  } catch (err) {
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
 */
export async function cancelBooking({ bookingId }) {
  if (!bookingId) {
    throw new LiveDataError(ERR.INVALID, 'cancelBooking: bookingId is required.');
  }
  requireUser();
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
      const sessionRef = doc(db, 'sessions', booking.sessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists()) {
        throw new LiveDataError(ERR.NOT_FOUND, 'That session no longer exists.');
      }
      const booked = sessionSnap.data().booked ?? 0;

      tx.update(bookingRef, { status: 'cancelled' });
      tx.update(sessionRef, { booked: Math.max(0, booked - 1) });
    });
    // Post-write invalidation seam (Sprint 6 pin): both collections changed,
    // same discipline as createBooking — one bump each, after the commit.
    bump('bookings');
    bump('sessions');
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
