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

import { useEffect, useState } from 'react';
import { billingStatusOf, facilityRequestState } from '../data/billingCopy';
import { foldBeforeFirstPeriod, hubMemberFor, positionPeriodFor, statusFor } from '../data/billingHub';
import { addDaysISO, todayISO } from '../data/calendar';
import { householdFacility } from '../data/facility';
import { normalizeAnchorDay, packageById, periodFor } from '../data/packages';
import { GRACE_TOKEN, HOUSEHOLD, PAST_DUE_MEMBERSHIP, PERIOD_ANCHOR_DAY } from '../data/seed';
import { bump, useInvalidation } from './invalidate';
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

/**
 * The Stripe no-code customer portal login link. Sprint 20 (spec 4.4): no
 * longer optional - without it a failed card has no self-serve fix. The app
 * still renders (the hub omits the link), but a LIVE build without it says
 * so in the console once per page load; seed mode and jest never carry the
 * var and never warn. `live`/`url` are injectable for the unit test.
 */
export const STRIPE_PORTAL_URL = process.env.REACT_APP_STRIPE_PORTAL_URL || null;
let portalUrlWarned = false;
export function warnMissingPortalUrl({ live = isLive(), url = STRIPE_PORTAL_URL } = {}) {
  if (portalUrlWarned || !live || url) return false;
  portalUrlWarned = true;
  console.warn(
    'REACT_APP_STRIPE_PORTAL_URL is not set: the billing hub cannot offer the Stripe customer portal, so a failed card has no self-serve fix (Sprint 20, spec 4.4 - required in production).'
  );
  return true;
}

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
  // Before the season every package reads the first period, so the grant
  // read is the prepaid November doc (Elite never has one).
  const period = positionPeriodFor(today, anchorDay);
  const prevKey = periodFor(addDaysISO(period.periodKey, -1), anchorDay).periodKey;
  const [pkg, bookings, graceTokens, waitlist, tokenPeriod, prevTokenPeriod] = await Promise.all([
    athlete.packageId ? fetchPackage(athlete.packageId) : null,
    fetchBookings(athlete.id, { householdId: athlete.householdId }),
    fetchGraceTokensByAthlete(athlete.id),
    fetchWaitlistByAthlete(athlete.id, { householdId: athlete.householdId }), // the filter a parent's read is provable on
    fetchTokenPeriod(athlete.id, period.periodKey),
    fetchTokenPeriod(athlete.id, prevKey),
  ]);
  const nextKey = periodFor(addDaysISO(period.periodEnd, 1), anchorDay).periodKey;
  // Only the rows the hub lists need their session (label, time): this
  // period's and next period's live bookings and waitlist entries.
  // Folded as the hub reads them, so an October row listed under the first
  // period gets its session too.
  const inScope = (x) =>
    x && x.status !== 'cancelled' && (x.periodKey === period.periodKey || x.periodKey === nextKey) && x.sessionId;
  const read = (rows) => foldBeforeFirstPeriod(rows, anchorDay);
  const sessionIds = [...read(bookings), ...read(waitlist)].filter(inScope).map((x) => x.sessionId);
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
  return { ...entry, coaching: coachingFor(bookings, today, pkg) };
}

/** The members who need a checkout (Sprint 20, spec 4.4): never paid, or whose tier subscription ended - drives statusFor's pending branch. Reads the hub's `billing.status`, which is billingStatusOf(athlete): a single-token buyer moved to another package is 'pending' too (ruling 2026-09-29/30). A lapsed athlete re-subscribes through the same createCheckoutSession; the customer portal cannot resume a cancelled subscription. `perPurchase` marks a single-token athlete, whose checkout is a one-time token, never a monthly bill. `packageId` is what that checkout charges for (the pending card's Change package line). */
export function pendingOf(members) {
  return members
    .filter((m) => m.billing?.status === 'pending' || m.billing?.status === 'lapsed')
    .map((m) => ({
      athleteId: m.athleteId, name: m.name, status: m.billing.status, perPurchase: m.package?.kind === 'single', packageId: m.package?.id ?? null,
    }));
}

/**
 * The facility add-on ticked at sign-up that is still to pay (owner
 * request, Mike 2026-09-30): `{ athleteId, name, state }`, state 'pay' (the
 * membership is active - PendingBanner shows the add-on's own Pay button)
 * or 'waiting' (the membership is still pending - a line, no button).
 * It is a FAMILY add-on (owner ruling 2026-09-30): at most ONE row, for the
 * athlete it bills on (a payable one first, should an older sign-up hold a
 * request per child), and none once the family has access - another
 * athlete's add-on, or Elite (data/facility.js householdFacility) - or
 * while an Elite athlete is still to pay (review 2026-09-30).
 * Separate from pendingOf on purpose: an unpaid add-on never blocks
 * booking, so it must not turn the household status to 'pending'.
 */
export function facilityPendingOf(members) {
  const list = members || [];
  const family = householdFacility(list);
  if (family.access || family.eliteDueId) return [];
  const rows = list
    .map((m) => ({ athleteId: m.athleteId, name: m.name, state: facilityRequestState(m) }))
    .filter((r) => r.state !== null);
  const row = rows.find((r) => r.state === 'pay') ?? rows[0];
  return row ? [row] : [];
}

/** The first period's start while any member's position is still before it - the hero's "Tokens start" date (tester report 2026-09-30), Elite members included (owner report 2026-09-30: nothing resets Oct 1). null from Nov 1. */
export function tokensStartOf(members) {
  return members.find((m) => m.period?.preSeason)?.period.start ?? null;
}

/** True when every member is on the single token - nothing in the household bills monthly. */
export function allPerPurchaseOf(members) {
  return members.length > 0 && members.every((m) => m.package?.kind === 'single');
}

/** True when every member is Elite - the hero then carries no token wording (tester Mike 2026-09-30). */
export function allUnlimitedOf(members) {
  return members.length > 0 && members.every((m) => m.package?.kind === 'elite');
}

/** True when every member is Elite or on the single token - nobody holds a monthly token package, so the hero promises neither "Tokens start" nor "Tokens reset" (Elite holds no tokens; session tokens never reset). */
export function noMonthlyTokensOf(members) {
  return members.length > 0 && members.every((m) => m.package?.kind === 'elite' || m.package?.kind === 'single');
}

async function liveHub(householdId, today, ownAthletes = null) {
  warnMissingPortalUrl();
  const [household, athletes] = await Promise.all([fetchHousehold(householdId), ownAthletes || fetchHouseholdAthletes(householdId)]);
  const anchorDay = normalizeAnchorDay(household.periodAnchorDay);
  const members = await Promise.all(athletes.map((a) => liveMember(a, anchorDay, today)));
  const membership = membershipView(household.membership);
  const resetsOn = addDaysISO(periodFor(today, anchorDay).periodEnd, 1);
  return {
    household: householdView(household, anchorDay),
    members,
    status: statusFor(membership, { resetsOn, tokensStartOn: tokensStartOf(members), anchorDay, pendingAthletes: pendingOf(members), allPerPurchase: allPerPurchaseOf(members), allUnlimited: allUnlimitedOf(members), noMonthlyTokens: noMonthlyTokensOf(members) }),
    facilityPending: facilityPendingOf(members),
    portalUrl: STRIPE_PORTAL_URL,
  };
}

async function liveBillingHub(today, householdId) {
  if (householdId) return liveHub(householdId, today);
  const profile = await fetchCurrentUser();
  // The self-managed 18+ athlete (Mike S6 2026-09-30) is their household's
  // only member. The athletes rule admits an athlete's own doc by id, never
  // the householdId list query a parent's hub runs - so read it by id.
  if (profile.role === 'athlete') {
    if (!profile.athleteId) {
      throw new LiveDataError(ERR.INVALID, `users/${profile.uid} has no athleteId - Billing needs the athlete's own record.`);
    }
    const athlete = await fetchAthlete(profile.athleteId);
    if (!athlete.householdId) {
      throw new LiveDataError(ERR.INVALID, `athletes/${athlete.id} has no householdId - Billing needs a household.`);
    }
    return liveHub(athlete.householdId, today, [athlete]);
  }
  if (!profile.householdId) {
    throw new LiveDataError(ERR.INVALID, `users/${profile.uid} has no householdId - Billing is a parent surface.`);
  }
  return liveHub(profile.householdId, today);
}

/** One athlete's own row: their household's anchor, their documents. */
async function liveMyTokens(today) {
  warnMissingPortalUrl();
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
    status: statusFor(membership, { resetsOn, tokensStartOn: tokensStartOf([member]), anchorDay, pendingAthletes: pendingOf([member]), allUnlimited: allUnlimitedOf([member]) }),
    facilityPending: facilityPendingOf([member]),
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
  // The period the meter reads (the first one, before the season).
  const { periodKey } = positionPeriodFor(today, anchorDay);
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
  return { ...entry, coaching: coachingFor(bookings, today, pkg) };
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
  const members = HOUSEHOLD.children.map((child) => seedMember(child, today, anchorDay));
  return {
    household: { id: 'whitfield', name: HOUSEHOLD.name, anchorDay, membership, stripeCustomerId: null },
    members,
    status: statusFor(membership, { resetsOn: addDaysISO(periodEnd, 1), tokensStartOn: tokensStartOf(members), anchorDay, pendingAthletes: pendingOf(members) }),
    facilityPending: facilityPendingOf(members),
    portalUrl: STRIPE_PORTAL_URL,
  };
}

function seedMyTokens(today, variant) {
  const anchorDay = PERIOD_ANCHOR_DAY;
  const { periodEnd } = periodFor(today, anchorDay);
  const membership = seedMembership(variant);
  const member = seedMember(HOUSEHOLD.children[0], today, anchorDay);
  return {
    household: { id: 'whitfield', name: HOUSEHOLD.name, anchorDay, membership, stripeCustomerId: null },
    member,
    status: statusFor(membership, { resetsOn: addDaysISO(periodEnd, 1), tokensStartOn: tokensStartOf([member]), anchorDay, pendingAthletes: pendingOf([member]) }),
    facilityPending: facilityPendingOf([member]),
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
 * `{ data: { household, members, status, facilityPending, portalUrl } |
 * null, loading, error }` — the Billing hub. A parent gets their own household (a
 * self-managed athlete, their one-member household); staff pass
 * `householdId` for any household. `variant` is harness-only ('populated'
 * | 'past_due' | 'lapsed'); live routes pass nothing. `practice` (the
 * onboarding walkthrough) pins the seed: no live read, no real Pay button.
 */
export default function useBillingHub({ variant = 'populated', householdId = null, practice = false } = {}) {
  const live = !practice && isLive();
  const today = todayISO();
  const gens = useTokenGens();
  return useSeedResource(
    live ? null : seedBillingHub(today, variant),
    live ? { source: () => liveBillingHub(today, householdId), deps: ['billing-hub', householdId, today, ...gens] } : undefined
  );
}

/**
 * `{ data: { household, member, status, facilityPending } | null, loading,
 * error }` — the signed-in athlete's own token row, the same view model the
 * hub renders.
 * `practice` pins the seed, as for useBillingHub.
 */
export function useMyTokens({ variant = 'populated', practice = false } = {}) {
  const live = !practice && isLive();
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

/**
 * `{ data: { access, source, holderId, eliteId, eliteDueId } | null, loading, error }` -
 * whether an athlete's FAMILY has facility access (data/facility.js), for
 * the staff athlete card: one athlete's own flags no longer say (owner
 * ruling 2026-09-30). A coach cannot list a household (rules), so on an
 * error the caller reads the one athlete it has.
 */
export function useHouseholdFacility(householdId) {
  const live = isLive();
  const gen = useInvalidation('athletes');
  return useSeedResource(
    live ? null : householdFacility(HOUSEHOLD.children),
    live && householdId
      ? { source: async () => householdFacility(await fetchHouseholdAthletes(householdId)), deps: ['household-facility', householdId, gen] }
      : undefined
  );
}

/** `${athleteId}|${cs}` -> { packageId } once its ?paid= return confirmed (this page load). Keyed by the Checkout Session too: a second single-token purchase is a new confirmation. */
const confirmedPayments = new Map();

/**
 * The `?paid=<athleteId>` return from Stripe Checkout (Sprint 20, spec 4.2):
 * `{ state: 'idle'|'confirming'|'confirmed'|'timeout', billingStatus }`. Polls
 * every 5 s, 24 attempts (2 min); on confirmation bumps athletes + billing +
 * graceTokens (every hub/home hook re-reads) and strips the query from the
 * address bar so a refresh does not poll again. The screen passes what it
 * read from useSearchParams; a null athleteId means nothing to confirm.
 *
 * A single-token return (`&cs=<id>&single=1`, ruling 2026-09-29/30) confirms
 * when graceTokens/single_{cs} exists - the athlete is often ALREADY active
 * from an earlier token, so their billing status proves nothing. Every other
 * return confirms on billingStatusOf(athlete) === 'active' (a one-time buyer
 * moved to a monthly package stays pending until that checkout lands).
 */
export function usePaymentConfirmation(athleteId, { cs = null, single = false } = {}) {
  const [state, setState] = useState({ state: 'idle', billingStatus: null, packageId: null });
  useEffect(() => {
    if (!athleteId || !isLive()) return undefined;
    // Confirmed once already this page load: the bump below makes the home
    // re-fetch, which unmounts and remounts the banner while the router still
    // carries ?paid= (replaceState is invisible to it) - answer from memory
    // instead of polling and bumping again, which looped (review 2026-09-29).
    const key = `${athleteId}|${cs || ''}`;
    const done = confirmedPayments.get(key);
    if (done) {
      setState({ state: 'confirmed', billingStatus: 'active', packageId: done.packageId });
      return undefined;
    }
    let alive = true;
    let attempts = 0;
    let timer = null;
    setState({ state: 'confirming', billingStatus: null, packageId: null });
    const tick = async () => {
      if (!alive) return;
      attempts += 1;
      let status = null;
      let packageId = null;
      try {
        if (single && cs) {
          const tokens = await fetchGraceTokensByAthlete(athleteId);
          const paid = tokens.some((g) => g.id === `single_${cs}`);
          status = paid ? 'active' : null;
          packageId = paid ? 'single' : null;
        } else {
          const a = await fetchAthlete(athleteId);
          status = billingStatusOf(a);
          packageId = a.packageId ?? null;
        }
      } catch (err) {
        status = null; // a transient read error is just another attempt
      }
      if (!alive) return;
      if (status === 'active') {
        confirmedPayments.set(key, { packageId });
        bump('athletes');
        bump('billing');
        bump('graceTokens');
        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch (err) {
          /* a locked history is not a failure */
        }
        setState({ state: 'confirmed', billingStatus: status, packageId });
        return;
      }
      if (attempts >= 24) {
        setState({ state: 'timeout', billingStatus: status, packageId });
        return;
      }
      setState({ state: 'confirming', billingStatus: status, packageId });
      timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [athleteId, cs, single]);
  return state;
}
