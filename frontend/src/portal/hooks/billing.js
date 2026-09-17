/**
 * The Billing hub's data (contract v2.4, Sprint 16; staff and athlete
 * views v2.5, Sprint 17) — the one place to see how many tokens are left,
 * and why.
 *
 * ROCK SOLID means one derivation: `data/billingHub.js#hubMemberFor` runs
 * `tokensFor` over the athlete's real documents — every booking, every
 * waitlist entry, every grace token, the period's issued grant — exactly
 * as the booking gate does before it lets a booking through. This file
 * only fetches those documents and hands them over; nothing is counted
 * here. Re-fetches whenever anything that can move a token is bumped
 * (bookings, waitlist, graceTokens, tokenPeriods, athletes, households).
 *
 * Three audiences, one view model: a parent (their household), staff (any
 * household, `householdId` given — rules already let ops/owner read every
 * document involved), an athlete (`useMyTokens`, their own row).
 */

import { hubMemberFor, statusFor } from '../data/billingHub';
import { addDaysISO, todayISO } from '../data/calendar';
import { normalizeAnchorDay, packageById, periodFor } from '../data/packages';
import { GRACE_TOKEN, HOUSEHOLD, PAST_DUE_MEMBERSHIP, PERIOD_ANCHOR_DAY } from '../data/seed';
import { useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { coachingFor } from './index';
import {
  ERR,
  LiveDataError,
  fetchAllAthletes,
  fetchAllHouseholds,
  fetchAthlete,
  fetchBookings,
  fetchCurrentUser,
  fetchGraceTokensByAthlete,
  fetchHousehold,
  fetchHouseholdAthletes,
  fetchPackage,
  fetchSessionsByIds,
  isLive,
} from './live';
import { fetchTokenPeriod } from './grace';
import { fetchWaitlistByAthlete } from './waitlist';

/** The Stripe no-code customer portal login link, when the academy set one up. */
export const STRIPE_PORTAL_URL = process.env.REACT_APP_STRIPE_PORTAL_URL || null;

/** Catalogue facts (price, pending) joined onto a Firestore package doc, which by policy carries no price. */
function packageFacts(pkg) {
  if (!pkg) return null;
  const cat = packageById(pkg.id);
  return { ...pkg, price: cat?.price ?? null, pending: cat?.pending ?? false };
}

/** The membership map the hub reads (absent == active). */
function membershipView(membership) {
  if (!membership) return null;
  return {
    status: membership.status ?? 'active',
    currentPeriodEnd: membership.currentPeriodEnd ?? null,
    attemptCount: membership.attemptCount ?? null,
    nextPaymentAttempt: membership.nextPaymentAttempt ?? null,
    lastFailedAt: membership.lastFailedAt ?? null,
  };
}

function householdView(household, anchorDay) {
  return {
    id: household.id,
    name: household.name ?? null,
    anchorDay,
    membership: membershipView(household.membership),
    stripeCustomerId: household.stripeCustomerId ?? null,
  };
}

async function liveMember(athlete, anchorDay, today) {
  const period = periodFor(today, anchorDay);
  const prevKey = periodFor(addDaysISO(period.periodKey, -1), anchorDay).periodKey;
  const nextKey = periodFor(addDaysISO(period.periodEnd, 1), anchorDay).periodKey;
  const [pkg, bookings, graceTokens, waitlist, tokenPeriod, prevTokenPeriod] = await Promise.all([
    athlete.packageId ? fetchPackage(athlete.packageId) : null,
    fetchBookings(athlete.id, { householdId: athlete.householdId }),
    fetchGraceTokensByAthlete(athlete.id),
    fetchWaitlistByAthlete(athlete.id),
    fetchTokenPeriod(athlete.id, period.periodKey),
    fetchTokenPeriod(athlete.id, prevKey),
  ]);
  // Only the rows the hub lists need their session (label, time): this
  // period's and next period's live bookings and waitlist entries.
  const inScope = (x) =>
    x && x.status !== 'cancelled' && (x.periodKey === period.periodKey || x.periodKey === nextKey) && x.sessionId;
  const sessionIds = [...bookings, ...waitlist].filter(inScope).map((x) => x.sessionId);
  const sessions = sessionIds.length ? await fetchSessionsByIds(sessionIds) : [];
  const sessionsById = Object.fromEntries(sessions.map((s) => [s.id, s]));
  const entry = hubMemberFor({
    athlete,
    pkg: packageFacts(pkg),
    bookings,
    waitlist,
    graceTokens,
    tokenPeriod,
    prevTokenPeriod,
    sessionsById,
    anchorDay,
    today,
  });
  return { ...entry, coaching: coachingFor(bookings, today) };
}

async function liveHub(householdId, today) {
  const [household, athletes] = await Promise.all([fetchHousehold(householdId), fetchHouseholdAthletes(householdId)]);
  const anchorDay = normalizeAnchorDay(household.periodAnchorDay);
  const members = await Promise.all(athletes.map((a) => liveMember(a, anchorDay, today)));
  const membership = membershipView(household.membership);
  const resetsOn = addDaysISO(periodFor(today, anchorDay).periodEnd, 1);
  return {
    household: householdView(household, anchorDay),
    members,
    status: statusFor(membership, { resetsOn, anchorDay }),
    portalUrl: STRIPE_PORTAL_URL,
  };
}

async function liveBillingHub(today, householdId) {
  if (householdId) return liveHub(householdId, today);
  const profile = await fetchCurrentUser();
  if (!profile.householdId) {
    throw new LiveDataError(ERR.INVALID, `users/${profile.uid} has no householdId - Billing is a parent surface.`);
  }
  return liveHub(profile.householdId, today);
}

/** One athlete's own row: their household's anchor, their documents. */
async function liveMyTokens(today) {
  const profile = await fetchCurrentUser();
  if (!profile.athleteId) {
    throw new LiveDataError(ERR.INVALID, `users/${profile.uid} has no athleteId - Membership is an athlete surface.`);
  }
  const athlete = await fetchAthlete(profile.athleteId);
  const household = athlete.householdId ? await fetchHousehold(athlete.householdId) : null;
  const anchorDay = normalizeAnchorDay(household?.periodAnchorDay);
  const member = await liveMember(athlete, anchorDay, today);
  const membership = household ? membershipView(household.membership) : null;
  const resetsOn = addDaysISO(periodFor(today, anchorDay).periodEnd, 1);
  return {
    household: household ? householdView(household, anchorDay) : null,
    member,
    status: statusFor(membership, { resetsOn, anchorDay }),
  };
}

/** Every household with its standing and athletes, for the staff directory. */
async function liveHouseholdsDirectory() {
  const [households, athletes] = await Promise.all([fetchAllHouseholds(), fetchAllAthletes()]);
  const byHousehold = new Map();
  for (const a of athletes) {
    if (!a.householdId) continue;
    if (!byHousehold.has(a.householdId)) byHousehold.set(a.householdId, []);
    byHousehold.get(a.householdId).push({ id: a.id, name: a.name ?? a.id, packageName: packageById(a.packageId)?.name ?? null });
  }
  return households
    .map((h) => ({
      id: h.id,
      name: h.name ?? null,
      status: h.membership?.status ?? 'active',
      athletes: (byHousehold.get(h.id) ?? []).sort((x, y) => String(x.name).localeCompare(String(y.name))),
    }))
    .sort((x, y) => String(x.name ?? x.id).localeCompare(String(y.name ?? y.id)));
}

/**
 * Practice mode: one sample child's hub row, built from the same view model
 * over booking-shaped rows that reproduce the seeded "used" count.
 */
function seedMember(child, today, anchorDay) {
  const pkg = packageById(child.packageId);
  const { periodKey } = periodFor(today, anchorDay);
  const used = child.tokens?.used ?? 0;
  const bookings = Array.from({ length: used }, (_, i) => ({
    id: `${child.id}_sample_${i}`,
    athleteId: child.id,
    sessionId: null,
    status: 'confirmed',
    periodKey,
    date: addDaysISO(periodKey, i * 2),
    type: 'training',
  }));
  const graceTokens = child.id === GRACE_TOKEN.athleteId ? [GRACE_TOKEN] : [];
  const entry = hubMemberFor({ athlete: child, pkg, bookings, waitlist: [], graceTokens, anchorDay, today });
  return { ...entry, coaching: coachingFor(bookings, today) };
}

function seedMembership(variant) {
  if (variant === 'past_due') return membershipView(PAST_DUE_MEMBERSHIP);
  if (variant === 'lapsed') return membershipView({ ...PAST_DUE_MEMBERSHIP, status: 'lapsed', nextPaymentAttempt: null });
  return null;
}

function seedBillingHub(today, variant) {
  const anchorDay = PERIOD_ANCHOR_DAY;
  const { periodEnd } = periodFor(today, anchorDay);
  const membership = seedMembership(variant);
  return {
    household: { id: 'whitfield', name: HOUSEHOLD.name, anchorDay, membership, stripeCustomerId: null },
    members: HOUSEHOLD.children.map((child) => seedMember(child, today, anchorDay)),
    status: statusFor(membership, { resetsOn: addDaysISO(periodEnd, 1), anchorDay }),
    portalUrl: STRIPE_PORTAL_URL,
  };
}

function seedMyTokens(today, variant) {
  const anchorDay = PERIOD_ANCHOR_DAY;
  const { periodEnd } = periodFor(today, anchorDay);
  const membership = seedMembership(variant);
  return {
    household: { id: 'whitfield', name: HOUSEHOLD.name, anchorDay, membership, stripeCustomerId: null },
    member: seedMember(HOUSEHOLD.children[0], today, anchorDay),
    status: statusFor(membership, { resetsOn: addDaysISO(periodEnd, 1), anchorDay }),
  };
}

function useTokenGens() {
  return [
    useInvalidation('bookings'),
    useInvalidation('waitlist'),
    useInvalidation('graceTokens'),
    useInvalidation('tokenPeriods'),
    useInvalidation('athletes'),
    useInvalidation('households'),
    useInvalidation('billing'),
  ];
}

/**
 * `{ data: { household, members, status, portalUrl } | null, loading,
 * error }` — the Billing hub. A parent gets their own household; staff pass
 * `householdId` for any household. `variant` is harness-only ('populated'
 * | 'past_due' | 'lapsed'); live routes pass nothing.
 */
export default function useBillingHub({ variant = 'populated', householdId = null } = {}) {
  const live = isLive();
  const today = todayISO();
  const gens = useTokenGens();
  return useSeedResource(
    live ? null : seedBillingHub(today, variant),
    live ? { source: () => liveBillingHub(today, householdId), deps: ['billing-hub', householdId, today, ...gens] } : undefined
  );
}

/**
 * `{ data: { household, member, status } | null, loading, error }` — the
 * signed-in athlete's own token row, the same view model the hub renders.
 */
export function useMyTokens({ variant = 'populated' } = {}) {
  const live = isLive();
  const today = todayISO();
  const gens = useTokenGens();
  return useSeedResource(
    live ? null : seedMyTokens(today, variant),
    live ? { source: () => liveMyTokens(today), deps: ['my-tokens', today, ...gens] } : undefined
  );
}

/**
 * `{ data: [{ id, name, status, athletes: [{ id, name, packageName }] }] |
 * null, loading, error }` — every household for the staff directory,
 * sorted by name.
 */
export function useHouseholdsDirectory() {
  const live = isLive();
  const gens = [useInvalidation('households'), useInvalidation('athletes')];
  const seed = [
    {
      id: 'whitfield',
      name: HOUSEHOLD.name,
      status: 'active',
      athletes: HOUSEHOLD.children.map((c) => ({ id: c.id, name: c.name, packageName: packageById(c.packageId)?.name ?? null })),
    },
  ];
  return useSeedResource(
    live ? null : seed,
    live ? { source: liveHouseholdsDirectory, deps: ['households-directory', ...gens] } : undefined
  );
}
