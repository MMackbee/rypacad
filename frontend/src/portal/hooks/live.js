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
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';

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
 * Note for later parent-surface wiring: this single equality filter is
 * provable for the athlete's own user and for staff. A parent reading a
 * child's bookings needs the compound query (athleteId == AND householdId ==)
 * for the rules to prove household membership on a list read.
 */
export async function fetchBookings(athleteId) {
  if (!athleteId) throw new LiveDataError(ERR.INVALID, 'fetchBookings: athleteId is required.');
  try {
    const snap = await getDocs(
      query(collection(db, 'bookings'), where('athleteId', '==', athleteId))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchBookings');
  }
}

/**
 * Create one booking in the contract shape. The server stamps createdAt;
 * createdBy is the signed-in uid, which firestore.rules re-checks along with
 * the household linkage, the session's real date/type, and the pool the
 * booking spends — a tournament block can never spend the training pool.
 */
export async function createBooking({ athleteId, sessionId, date, type, pool, householdId }) {
  if (!athleteId || !sessionId || !date || !type || !pool || !householdId) {
    throw new LiveDataError(
      ERR.INVALID,
      'createBooking: athleteId, sessionId, date, type, pool and householdId are all required.'
    );
  }
  if (pool !== (type === 'tournament' ? 'tournaments' : 'training')) {
    throw new LiveDataError(
      ERR.INVALID,
      `createBooking: a ${type} session cannot spend the ${pool} pool - the two allowances never substitute.`
    );
  }
  const user = requireUser();
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
    // Contract v1.1: the booking id IS `{athleteId}_{sessionId}` — the
    // keyspace makes a second booking of the same session an overwrite
    // attempt, which the create-only rules reject. addDoc's random ids were
    // rejected by the deployed rules' id-format check.
    const id = `${athleteId}_${sessionId}`;
    await setDoc(doc(db, 'bookings', id), booking);
    return { id, ...booking, createdAt: null };
  } catch (err) {
    throw wrap(err, 'createBooking');
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
 * Create (or overwrite the same day's) contractLog — contract v1.3 shape.
 * Doc id is `{athleteId}_{date}`, which is both how one-log-per-day is
 * enforced (a second log the same day overwrites the same doc rather than
 * duplicating) and how firestore.rules pins date to the id. `contractMinutes`
 * is a snapshot the caller supplies (the athlete's tier at log time), not
 * re-derived here, so a later tier change cannot rewrite history. The server
 * stamps createdAt; createdBy is the signed-in uid, both re-checked by rules.
 */
export async function createContractLog({ athleteId, date, minutes, contractMinutes = null }) {
  if (!athleteId || !date || minutes == null) {
    throw new LiveDataError(
      ERR.INVALID,
      'createContractLog: athleteId, date and minutes are all required.'
    );
  }
  const user = requireUser();
  const log = {
    athleteId,
    date,
    minutes,
    contractMinutes,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  };
  try {
    const id = `${athleteId}_${date}`;
    await setDoc(doc(db, 'contractLogs', id), log);
    return { id, ...log, createdAt: null };
  } catch (err) {
    throw wrap(err, 'createContractLog');
  }
}
