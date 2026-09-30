/**
 * The Billing hub's view model (contract v2.4, Sprint 16) — PURE. No
 * Firestore, no React: every function here takes documents and a date and
 * returns what the screen renders, so `billingHub.test.js` can pin the math.
 *
 * ONE NUMBER, ONE DERIVATION: "tokens left" is `tokensFor` from packages.js,
 * the same call the booking gate makes. This file never recounts; it adds
 * the EVIDENCE — which bookings spent the tokens, which waitlist entries
 * reserve them, which bonus tokens are on file, when the period resets and
 * what the next one grants — so a parent can trace every number to a
 * session on their own schedule.
 */

import { addDaysISO, BOOKING_OPENS_LABEL, bookingOpen, longDayLabel } from './calendar';
import { normalizeAnchorDay, periodFor, SINGLE_TOKEN, tokensFor } from './packages';

/** Days from `fromISO` to `toISO` (calendar days, UTC-noon arithmetic). */
export function daysBetween(fromISO, toISO) {
  const a = Date.UTC(...fromISO.split('-').map(Number).map((n, i) => (i === 1 ? n - 1 : n)), 12);
  const b = Date.UTC(...toISO.split('-').map(Number).map((n, i) => (i === 1 ? n - 1 : n)), 12);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** "1st" / "2nd" / "3rd" / "15th" — the billing day of the month. */
export function ordinal(n) {
  const v = Number(n);
  if (!Number.isInteger(v)) return '';
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th';
  return `${v}${suffix}`;
}

const TYPE_LABELS = {
  training: 'Training block',
  tournament: 'Tournament',
  phil: 'Performance session',
  mental: 'Mental game session',
  adult: 'Adult block',
};

/** What to call a session in a list row: its own label, else its type's. */
export function sessionLabel(session, fallbackType) {
  const type = (session && session.type) || fallbackType || null;
  return (session && session.label) || TYPE_LABELS[type] || 'Session';
}

/**
 * Bookings and waitlist entries of one period as list rows, oldest first.
 * A booking row says how it was paid (`viaGrace`), so the list's count of
 * period-charged rows is exactly `tokens.used` and the grace-charged rows
 * are exactly the consumed bonus tokens.
 */
export function periodRows({ bookings, waitlist, periodKey, sessionsById = {} }) {
  const byDate = (a, b) => (a.date === b.date ? String(a.id).localeCompare(String(b.id)) : a.date < b.date ? -1 : 1);
  const spent = (bookings || [])
    .filter((b) => b && b.status !== 'cancelled' && b.periodKey === periodKey)
    .map((b) => {
      const session = sessionsById[b.sessionId] || null;
      return {
        id: b.id,
        kind: 'booking',
        date: b.date || (session && session.date) || null,
        sessionId: b.sessionId || null,
        label: sessionLabel(session, b.type),
        time: (session && session.time) || null,
        status: b.status || 'confirmed',
        viaGrace: Boolean(b.graceTokenId),
      };
    })
    .sort(byDate);
  const reserved = (waitlist || [])
    .filter((w) => w && w.periodKey === periodKey)
    .map((w) => {
      const session = sessionsById[w.sessionId] || null;
      return {
        id: w.id || `${w.sessionId}_${w.athleteId}`,
        kind: 'waitlist',
        date: w.date || (session && session.date) || null,
        sessionId: w.sessionId || null,
        label: sessionLabel(session, w.type),
        time: (session && session.time) || null,
        status: 'waitlisted',
        viaGrace: false,
      };
    })
    .sort(byDate);
  return { spent, reserved };
}

/**
 * One member's hub entry. `tokens` is tokensFor's own output plus the
 * grace reasons the hook seam wants; everything else is evidence and dates.
 * @param {{athlete, pkg, bookings, waitlist, graceTokens, tokenPeriod,
 *   prevTokenPeriod, sessionsById, anchorDay, today}} args
 */
export function hubMemberFor(args) {
  const { athlete, pkg, bookings = [], waitlist = [], graceTokens = [], tokenPeriod = null, prevTokenPeriod = null } = args;
  const sessionsById = args.sessionsById || {};
  const anchorDay = normalizeAnchorDay(args.anchorDay);
  const today = args.today;
  const period = periodFor(today, anchorDay);
  const resetsOn = addDaysISO(period.periodEnd, 1);
  const nextPeriod = periodFor(resetsOn, anchorDay);
  const prevPeriod = periodFor(addDaysISO(period.periodKey, -1), anchorDay);

  const raw = tokensFor(athlete, pkg, bookings, waitlist, graceTokens, period.periodKey, { today, tokenPeriod });
  const byId = new Map((graceTokens || []).map((g) => [g.id, g]));
  const tokens = {
    ...raw,
    grace: raw.grace.map((g) => ({
      ...g,
      reason: byId.get(g.id)?.reason ?? null,
      sourceSessionId: byId.get(g.id)?.sourceSessionId ?? null,
    })),
  };

  const { spent, reserved } = periodRows({ bookings, waitlist, periodKey: period.periodKey, sessionsById });
  const nextRows = periodRows({ bookings, waitlist, periodKey: nextPeriod.periodKey, sessionsById });
  const unlimited = tokens.unlimited;
  const nextGranted = unlimited ? null : pkg ? pkg.tokens ?? 0 : 0;

  const lastUsed = (bookings || []).filter(
    (b) => b && b.status !== 'cancelled' && b.periodKey === prevPeriod.periodKey && !b.graceTokenId
  ).length;
  const lastPeriod = pkg
    ? {
        periodKey: prevPeriod.periodKey,
        start: prevPeriod.periodKey,
        end: prevPeriod.periodEnd,
        granted: unlimited ? null : prevTokenPeriod?.granted ?? pkg.tokens ?? 0,
        used: lastUsed,
      }
    : null;

  const daysLeft = daysBetween(today, period.periodEnd);
  const expiryNudge =
    !unlimited && pkg && tokens.left > 0 && daysLeft <= 7
      ? { left: tokens.left, on: period.periodEnd, days: daysLeft }
      : null;

  return {
    athleteId: athlete.id,
    name: athlete.name,
    package: pkg
      ? {
          id: pkg.id,
          name: pkg.name,
          kind: pkg.kind ?? null,
          tokens: pkg.tokens ?? null,
          price: pkg.price ?? null,
          pending: pkg.pending ?? false,
          windowDays: pkg.windowDays ?? null,
          access247: Boolean(pkg.access247),
        }
      : null,
    period: { periodKey: period.periodKey, start: period.periodKey, end: period.periodEnd, resetsOn, daysLeft },
    tokens,
    spent,
    reserved,
    nextPeriod: {
      periodKey: nextPeriod.periodKey,
      start: nextPeriod.periodKey,
      end: nextPeriod.periodEnd,
      granted: nextGranted,
      booked: nextRows.spent.length,
      reserved: nextRows.reserved.length,
    },
    lastPeriod,
    expiryNudge,
    // Elite has no countdown, so "how much did we use it" is the only honest
    // measure of the period for them (owner ruling, 2026-09-22). Derived from
    // the same rows the list below shows - never a stored counter. null for
    // everyone else, whose meter already answers the question.
    attendance: unlimited
      ? {
        booked: spent.length,
        attended: spent.filter((r) => r.status === 'attended').length,
        // Bookings store 'noshow'; there is no hyphen in the stored value.
        noShows: spent.filter((r) => r.status === 'noshow').length,
      }
      : null,
    contractMinutes: athlete.contractMinutes ?? null,
    // v2.0.1 (Sprint 18): the $300 add-on, a line item on the Plan card.
    facilityAccess: Boolean(athlete.facilityAccess),
    // Sprint 20 (spec 4.5): the signed waiver (`{ signedAt, byUid } | null`
    // on the doc, DATA-MODEL:79, ops-verified) as a boolean, so the hub card
    // can read "Facility access: paid - waiver pending" (facility billing
    // active, consent absent) versus "active" (both).
    facilityAccessConsent: Boolean(athlete.facilityAccessConsent),
    // Sprint 20 (spec 4.4): the per-athlete paid state that gates booking.
    // Absent == active for every athlete provisioned before this sprint;
    // `facility` is the add-on subscription's own state (null == no add-on).
    billing: {
      status: athlete.billing?.status ?? 'active',
      facility: athlete.facilityBilling?.status ?? null,
    },
  };
}

/** "Ava", "Ava and Ben", "Ava, Ben and Cy". */
function listNames(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** The retry position Stripe reported, clamped to the three-attempt ladder. */
function attemptOf(membership) {
  const n = Number(membership && membership.attemptCount);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(3, n);
}

/**
 * The hero card's state from `households.membership` (absent == active).
 * Copy is the contract's: past due PAUSES new bookings (Sprint 13 pin H),
 * lapsed released them. Dates appear only when the Stripe handler recorded
 * them; nothing here invents a retry schedule.
 *
 * The single token is a one-time purchase (owner ruling, 2026-09-30): a
 * pending list of only single-token athletes (`perPurchase`, hooks/billing.js
 * pendingOf) and an all-single household (`opts.allPerPurchase`) never read
 * "billed monthly".
 *
 * The monthly pending body names the Oct 10 gate until it opens (UX review
 * P-07: "can book as soon as checkout is complete" was untrue for token
 * packages before then). `opts.now` (ms) pins the clock in tests.
 */
export function statusFor(membership, opts = {}) {
  const status = (membership && membership.status) || 'active';
  const resetsOn = opts.resetsOn || null;
  const pendingAthletes = Array.isArray(opts.pendingAthletes) ? opts.pendingAthletes : [];
  const billingDay = opts.anchorDay ? ordinal(normalizeAnchorDay(opts.anchorDay)) : null;
  const attempt = attemptOf(membership);
  const next = membership && membership.nextPaymentAttempt ? longDayLabel(membership.nextPaymentAttempt) : null;
  const failed = membership && membership.lastFailedAt ? longDayLabel(membership.lastFailedAt) : null;

  if (status === 'past_due') {
    return {
      status,
      tone: attempt === 3 ? 'red' : 'yellow',
      badge: { tone: attempt === 3 ? 'red' : 'yellow', label: attempt ? `Retry ${attempt} of 3` : 'Past due' },
      title: failed ? `Card declined ${failed}` : "A payment didn't go through",
      body:
        (next ? `Stripe retries automatically on ${next}. ` : 'Stripe retries automatically. ') +
        "New bookings are paused until it clears; everything already booked is kept. Updating the card now retries immediately.",
      ladder: [
        { label: 'Card declined', detail: failed || 'Invoice unpaid', step: 0 },
        { label: attempt ? `Retry ${attempt} of 3` : 'Automatic retries', detail: next ? `Next attempt ${next}` : 'Up to three attempts', step: 1 },
        { label: 'Booking access restricted', detail: 'If every retry fails · all athletes', step: 2 },
      ],
      ladderAt: 1,
      cta: 'Update payment method',
      paused: true,
    };
  }
  // Sprint 20 (spec 4.4): an athlete who needs a checkout - never paid, or
  // whose tier subscription ENDED (billing.status 'lapsed'). Ranked after
  // past_due (a failing card is fixed in the portal; a second checkout would
  // double-subscribe) but BEFORE the household lapsed block: when the last
  // tier subscription ends the household lapses too, and the only way back
  // is a new checkout per lapsed athlete - the customer portal cannot resume
  // a cancelled subscription (review 2026-09-28). Copy is the contract's,
  // shared with the home banners.
  if (pendingAthletes.length > 0) {
    const names = listNames(pendingAthletes.map((a) => a.name));
    const ended = pendingAthletes.some((a) => a.status === 'lapsed');
    const perPurchase = pendingAthletes.every((a) => a.perPurchase === true);
    return {
      status: 'pending',
      tone: 'yellow',
      badge: { tone: 'yellow', label: ended ? 'Payment needed' : 'Payment pending' },
      title: ended ? 'Membership ended - pay to book again' : 'Payment pending - finish checkout to start booking',
      body: perPurchase
        ? `${names} can book once their session token is paid for. A session token is a one-time $${SINGLE_TOKEN.price} payment.`
        : `${names} can book once checkout is complete${bookingOpen(opts.now ?? Date.now()) ? '' : ` (token packages from ${BOOKING_OPENS_LABEL})`}. Billed monthly on the 1st once you've paid.`,
      ladder: null,
      ladderAt: null,
      cta: 'Pay now',
      paused: false,
      pendingAthletes,
    };
  }
  if (status === 'lapsed') {
    return {
      status,
      tone: 'red',
      badge: { tone: 'red', label: 'Restricted' },
      title: 'Membership lapsed',
      body: "Upcoming bookings were released. Once payment resumes, book again from what's open. Contract logging is unaffected.",
      ladder: [
        { label: 'Card declined', detail: failed || 'Invoice unpaid', step: 0 },
        { label: 'Automatic retries', detail: 'All attempts failed', step: 1 },
        { label: 'Booking access restricted', detail: 'All athletes', step: 2 },
      ],
      ladderAt: 2,
      cta: 'Update payment method',
      paused: true,
    };
  }
  return {
    status: 'active',
    tone: 'default',
    badge: { tone: 'green', label: 'Active' },
    title: resetsOn ? `Tokens reset ${longDayLabel(resetsOn)}` : 'Membership active',
    body: opts.allPerPurchase === true
      ? 'Session tokens are one-time payments - nothing bills monthly.'
      : `${billingDay ? `Billed monthly on the ${billingDay}. ` : ''}Nothing needs attention.`,
    ladder: null,
    ladderAt: null,
    cta: null,
    paused: false,
  };
}
