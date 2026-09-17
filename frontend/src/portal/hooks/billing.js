/**
 * The Billing hub's data (contract v2.4, Sprint 16) — the parents' one
 * place to see how many tokens are left, and why.
 *
 * ROCK SOLID means one derivation: `data/billingHub.js#hubMemberFor` runs
 * `tokensFor` over the athlete's real documents — every booking, every
 * waitlist entry, every grace token, the period's issued grant — exactly
 * as the booking gate does before it lets a booking through. This file
 * only fetches those documents and hands them over; nothing is counted
 * here. Re-fetches whenever anything that can move a token is bumped
 * (bookings, waitlist, graceTokens, tokenPeriods, athletes, households).
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

async function liveBillingHub(today) {
  const profile = await fetchCurrentUser();
  if (!profile.householdId) {
    throw new LiveDataError(ERR.INVALID, `users/${profile.uid} has no householdId - Billing is a parent surface.`);
  }
  const [household, athletes] = await Promise.all([
    fetchHousehold(profile.householdId),
    fetchHouseholdAthletes(profile.householdId),
  ]);
  const anchorDay = normalizeAnchorDay(household.periodAnchorDay);
  const members = await Promise.all(athletes.map((a) => liveMember(a, anchorDay, today)));
  const membership = membershipView(household.membership);
  const resetsOn = addDaysISO(periodFor(today, anchorDay).periodEnd, 1);
  return {
    household: {
      id: household.id,
      name: household.name ?? null,
      anchorDay,
      membership,
      stripeCustomerId: household.stripeCustomerId ?? null,
    },
    members,
    status: statusFor(membership, { resetsOn, anchorDay }),
    portalUrl: STRIPE_PORTAL_URL,
  };
}

/**
 * Practice mode: the sample Whitfields, built from the same view model over
 * booking-shaped rows that reproduce each child's seeded "used" count, so
 * the page reads the same in both modes. `variant` previews the two Stripe
 * states no seed household carries.
 */
function seedBillingHub(today, variant) {
  const anchorDay = PERIOD_ANCHOR_DAY;
  const { periodKey, periodEnd } = periodFor(today, anchorDay);
  const members = HOUSEHOLD.children.map((child) => {
    const pkg = packageById(child.packageId);
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
  });
  const membership =
    variant === 'past_due'
      ? membershipView(PAST_DUE_MEMBERSHIP)
      : variant === 'lapsed'
        ? membershipView({ ...PAST_DUE_MEMBERSHIP, status: 'lapsed', nextPaymentAttempt: null })
        : null;
  return {
    household: { id: 'whitfield', name: HOUSEHOLD.name, anchorDay, membership, stripeCustomerId: null },
    members,
    status: statusFor(membership, { resetsOn: addDaysISO(periodEnd, 1), anchorDay }),
    portalUrl: STRIPE_PORTAL_URL,
  };
}

/**
 * `{ data: { household, members, status, portalUrl } | null, loading,
 * error }` — the Billing hub. `variant` is harness-only ('populated' |
 * 'past_due' | 'lapsed'); live routes pass nothing.
 */
export default function useBillingHub({ variant = 'populated' } = {}) {
  const live = isLive();
  const today = todayISO();
  const gens = [
    useInvalidation('bookings'),
    useInvalidation('waitlist'),
    useInvalidation('graceTokens'),
    useInvalidation('tokenPeriods'),
    useInvalidation('athletes'),
    useInvalidation('households'),
    useInvalidation('billing'),
  ];
  return useSeedResource(
    live ? null : seedBillingHub(today, variant),
    live ? { source: () => liveBillingHub(today), deps: ['billing-hub', today, ...gens] } : undefined
  );
}
