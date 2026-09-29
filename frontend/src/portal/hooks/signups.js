/**
 * Sign-up era reads (Sprint 20, spec 3.2 + 7): loginInvites here; the
 * admin sign-ups report's queries and useSignups are appended by Task 13.
 * New surface, kept out of live.js/index.js (the grace.js/waitlist.js
 * precedent); imports shared primitives FROM ./live, never the other way.
 */
import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, fetchAllAthletes, isLive, wrap } from './live';
import { useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { buildSignupRows } from '../data/signups';

/**
 * loginInvites/{emailLower}, or null when there is none OR the viewer may
 * not read it. Rules (Task 5) grant the read to the verified owner, the
 * household's parent and ops/owner; a coach opening AthleteDetail is
 * denied, which is not an error here - data/signups.js#loginStateFor
 * renders a null invite behind a loginEmail as 'invited'. Any other
 * failure (offline, unavailable) still throws.
 */
export async function fetchLoginInvite(email) {
  if (!email || typeof email !== 'string') return null;
  try {
    const snap = await getDoc(doc(db, 'loginInvites', email.trim().toLowerCase()));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    const wrapped = wrap(err, 'fetchLoginInvite');
    if (wrapped.code === ERR.PERMISSION) return null;
    throw wrapped;
  }
}

/*
 * The admin sign-ups report's data (spec 7) - ops/owner only; every query
 * below is provable under the staff clauses (households, athletes,
 * loginInvites, bookings, calendlyEvents all grant ops/owner unconditionally).
 */
const rowsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

/** Self-signed-up households, newest first; households without `signup` are simply absent from the index. */
export async function fetchSignupHouseholds() {
  try {
    return rowsOf(await getDocs(query(collection(db, 'households'), orderBy('signup.at', 'desc'))));
  } catch (err) {
    throw wrap(err, 'fetchSignupHouseholds');
  }
}

export async function fetchLoginInvites() {
  try {
    return rowsOf(await getDocs(collection(db, 'loginInvites')));
  } catch (err) {
    throw wrap(err, 'fetchLoginInvites');
  }
}

/** The closed flag list (contract section 2) - an `in` query, no composite index. */
export const BOOKING_FLAGS = ['over-cap', 'over-cadence', 'membership-inactive', 'before-open'];
export async function fetchFlaggedBookings() {
  try {
    return rowsOf(await getDocs(query(collection(db, 'bookings'), where('flag', 'in', BOOKING_FLAGS))));
  } catch (err) {
    throw wrap(err, 'fetchFlaggedBookings');
  }
}

export async function fetchUnresolvedCalendlyEvents() {
  try {
    return rowsOf(await getDocs(query(collection(db, 'calendlyEvents'), where('outcome', '==', 'unresolved'))));
  } catch (err) {
    throw wrap(err, 'fetchUnresolvedCalendlyEvents');
  }
}

async function liveSignups() {
  const [households, athletes, invites, flaggedBookings, calendlyEvents] = await Promise.all([
    fetchSignupHouseholds(), fetchAllAthletes(), fetchLoginInvites(), fetchFlaggedBookings(), fetchUnresolvedCalendlyEvents(),
  ]);
  return buildSignupRows({ households, athletes, invites, flaggedBookings, calendlyEvents, now: new Date() });
}

const EMPTY = { rows: [], counts: { all: 0, unpaid: 0, flagged: 0, unresolved: 0 }, unresolved: [] };

/**
 * `{ data: { rows, counts: { all, unpaid, flagged, unresolved }, unresolved }
 * | null, loading, error }` (D9) - see data/signups.js for the row shape.
 * Invalidation keys: households, athletes, bookings, loginInvites (new bump key).
 */
export default function useSignups() {
  const live = isLive();
  const gens = [useInvalidation('households'), useInvalidation('athletes'), useInvalidation('bookings'), useInvalidation('loginInvites')];
  return useSeedResource(live ? null : EMPTY, live ? { source: liveSignups, deps: ['signups', ...gens] } : undefined);
}
