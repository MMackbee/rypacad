/**
 * Sign-up era view-model helpers (Sprint 20): the child-login line (spec
 * 3.2) here, the admin sign-ups report's row builder appended by Task 13
 * (spec 7). PURE - no React, no Firebase; hooks/signups.js fetches, this
 * file derives. Routing-owned (D1): the frontend lane's report helpers
 * live in data/signupsReport.js, never here.
 */
import { differenceInYears, format, parseISO } from 'date-fns';
import { packageById } from './packages';

/** An open invite older than this is 'invited-stale' - ops fixes the email (spec 3.2, 7). */
export const STALE_INVITE_DAYS = 7;

/** A Date from a Date, a Firestore Timestamp (toDate) or an ISO string; null otherwise. */
export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DDTHH:mm' in the browser's zone, or null. */
export function stamp(v) {
  const d = toDate(v);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : null;
}

/**
 * The child-login state the parent's family page, the athlete card and the
 * report all show (spec 3.2 "Login: none / not claimed / claimed <date>"):
 *   none          - no loginEmail (the parent's account runs the child), or
 *                   the invite was orphaned by claimInvite (athlete gone)
 *   invited       - an open invite; ALSO a loginEmail whose invite doc is
 *                   missing or unreadable by this viewer (a coach - rules
 *                   grant the read to the household parent and ops/owner)
 *   invited-stale - open for more than STALE_INVITE_DAYS
 *   claimed       - claimInvite flipped it; claimedAt stamped
 * `now` is injectable for tests.
 */
export function loginStateFor(loginEmail, invite, now = new Date()) {
  if (!loginEmail) return { state: 'none', claimedAt: null };
  if (!invite) return { state: 'invited', claimedAt: null };
  if (invite.status === 'orphaned') return { state: 'none', claimedAt: null };
  if (invite.status === 'claimed') return { state: 'claimed', claimedAt: stamp(invite.claimedAt) };
  const created = toDate(invite.createdAt);
  const stale = created ? now.getTime() - created.getTime() > STALE_INVITE_DAYS * 86400000 : false;
  return { state: stale ? 'invited-stale' : 'invited', claimedAt: null };
}

/** One report athlete's login columns (contract 4.2) from loginStateFor. */
function loginFor(athlete, invite, now) {
  const loginEmail = athlete.loginEmail ?? null;
  const { state, claimedAt } = loginStateFor(loginEmail, invite, now);
  return { login: state, loginEmail, loginClaimedAt: claimedAt };
}

/**
 * The admin sign-ups report (spec 7) - one row per self-signed-up household
 * (`signup` present; legacy provisioned households are not sign-ups), in
 * the input order (hooks/signups.js queries `signup.at desc`). Returns
 * `{ rows, counts: { all, unpaid, flagged, unresolved }, unresolved }` (D9).
 */
export function buildSignupRows({ households = [], athletes = [], invites = [], flaggedBookings = [], calendlyEvents = [], now = new Date() }) {
  const today = format(now, 'yyyy-MM-dd');
  const inviteByAthlete = new Map(invites.map((i) => [i.athleteId, i]));
  const byHousehold = new Map();
  for (const a of athletes) {
    if (!a.householdId) continue;
    if (!byHousehold.has(a.householdId)) byHousehold.set(a.householdId, []);
    byHousehold.get(a.householdId).push(a);
  }
  // Two parents of the same children each signing up is the likeliest bad
  // outcome of a mass email: two families, two subscriptions per child. The
  // same athlete name + date of birth in two households flags both rows so
  // ops can merge and refund before the second card is charged again.
  const sameKid = (a) => `${String(a.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}|${a.dob ?? ''}`;
  const householdsByKid = new Map();
  for (const a of athletes) {
    if (!a.householdId || !a.dob || !a.name) continue;
    const k = sameKid(a);
    if (!householdsByKid.has(k)) householdsByKid.set(k, new Set());
    householdsByKid.get(k).add(a.householdId);
  }
  const rows = households
    .filter((h) => h && h.signup)
    .map((h) => {
      const kids = byHousehold.get(h.id) ?? [];
      const kidIds = new Set(kids.map((a) => a.id));
      const rowAthletes = kids.map((a) => ({
        athleteId: a.id,
        name: a.name ?? a.id,
        age: a.dob ? differenceInYears(parseISO(today), parseISO(a.dob)) : null,
        packageId: a.packageId ?? null,
        packageName: packageById(a.packageId)?.name ?? null,
        handicap: Number.isInteger(a.handicap) ? a.handicap : null,
        billing: a.billing?.status ?? 'active',
        facility: a.facilityBilling?.status ?? null,
        ...loginFor(a, inviteByAthlete.get(a.id), now),
      }));
      const flags = [
        ...flaggedBookings.filter((b) => b.flag && kidIds.has(b.athleteId)).map((b) => ({ kind: 'booking', id: b.id, flag: b.flag, date: b.date ?? null })),
        ...calendlyEvents.filter((e) => e.householdId && e.householdId === h.id).map((e) => ({ kind: 'calendly', id: e.id, outcome: e.outcome, receivedAt: stamp(e.receivedAt) })),
        ...kids.flatMap((a) => {
          const others = [...(householdsByKid.get(sameKid(a)) ?? [])].filter((id) => id !== h.id);
          return others.map((other) => ({ kind: 'duplicate', id: `${a.id}~${other}`, athleteName: a.name ?? a.id, otherHouseholdId: other }));
        }),
      ];
      return {
        householdId: h.id,
        name: h.name ?? null,
        signedUpAt: stamp(h.signup.at),
        mode: h.signup.mode ?? null,
        parent: { name: h.guardian?.name ?? null, email: h.guardian?.email ?? null, phone: h.guardian?.phone ?? null },
        athletes: rowAthletes,
        flags,
        unpaid: rowAthletes.some((a) => a.billing === 'pending'),
        flagged: flags.length > 0,
      };
    });
  // An unresolved Calendly booking has no household to hang off; it is its
  // own list (AdminSignups: "Unmatched Calendly bookings", inside Flagged).
  const unresolved = calendlyEvents.filter((e) => e.outcome === 'unresolved' && !e.householdId).map((e) => ({ id: e.id, outcome: e.outcome, receivedAt: stamp(e.receivedAt) }));
  return {
    rows,
    counts: { all: rows.length, unpaid: rows.filter((r) => r.unpaid).length, flagged: rows.filter((r) => r.flagged).length, unresolved: unresolved.length },
    unresolved,
  };
}
