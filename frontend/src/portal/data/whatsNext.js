/**
 * The "What's next" card under "Payment received" on the Stripe return
 * (owner decision 2026-09-30): three short lines that tell a family what to
 * do now it has paid. PURE - the paid package, the product, the athlete's
 * login and the clock decide the words, so the card cannot drift from the
 * banner above it (same gate: bookingOpen). Never promises an email - portal
 * email is off.
 */
import { format, parseISO } from 'date-fns';
import { BOOKING_OPENS_LABEL, bookingOpen, openThrough, windowAnchored } from './calendar';
import { packageById, windowDaysFor } from './packages';
import { SEASON_BOUNDS } from './season';

export const WHATS_NEXT_TITLE = "What's next";
export const SEASON_LINK = 'See the season calendar';
/** 'Tue, Nov 3' - the first session day (Nov 2 is set-up day). */
export const SEASON_START_LABEL = format(parseISO(SEASON_BOUNDS.start), 'EEE, MMM d');

/** 'Jordan Whitfield' -> 'Jordan'; Firestore keeps one `name` field. */
export function firstName(name) {
  return String(name ?? '').trim().split(/\s+/)[0] || null;
}

/** An own login that was sent but never claimed (loginStateFor's states). */
export function hasUnclaimedLogin(athlete) {
  const state = athlete?.login?.state;
  return Boolean(athlete?.loginEmail) && (state === 'invited' || state === 'invited-stale');
}

/**
 * The card for one confirmed return, or null for no card.
 * @param {object} a
 * @param {?string} a.packageId  The PAID package (usePaymentConfirmation's).
 * @param {?string} [a.product]  The return's `product`; 'facility' == the add-on.
 * @param {?object} [a.athlete]  `{ name, loginEmail, login }` off the home's data.
 * @param {boolean} [a.self]     The athlete reading their own home: "you", no login line.
 * @param {boolean} [a.selfManaged]  The adult who is their own household: the
 *   add-on reads without "family". A child's own login keeps the family wording.
 * @param {string} [a.host]      Where the portal lives, for the sign-in line.
 * @param {boolean} [a.facilityDue]  The family facility add-on was ticked at sign-up
 *   and is not paid yet (hooks/billing.js facilityPendingOf; owner 2026-09-30).
 * @param {number} [a.now]
 * @return {?{ title: string, lines: string[], book: ?string, season: boolean }}
 */
export function whatsNextFor({ packageId, product = null, athlete = null, self = false, selfManaged = false, host = '', facilityDue = false, now = Date.now() }) {
  if (product === 'facility') return null;
  const pkg = packageById(packageId);
  if (!pkg || (pkg.kind !== 'tokens' && pkg.kind !== 'elite')) return null;
  const first = firstName(athlete?.name);
  const name = first ?? 'Your athlete';
  const lines = [];
  let book = null;
  // Elite books at once; tokens from Oct 10 (the banner's own gate).
  if (bookingOpen(now, pkg)) {
    // While the window counts from Nov 1 (owner ruling 2026-09-30), "up to
    // N days ahead" undersells it - name the last bookable day instead.
    const days = windowDaysFor(pkg);
    const reach = windowAnchored(new Date(now))
      ? `through ${format(parseISO(openThrough(new Date(now), days)), 'EEE, MMM d')}`
      : `up to ${days} days ahead`;
    lines.push(`${self ? 'You' : name} can book now - training, Tour events and Phil, ${reach}.`);
    book = self ? 'Book your first session' : `Book ${first ?? 'your athlete'}'s first session`;
  } else {
    lines.push(`Booking opens ${BOOKING_OPENS_LABEL} - book any training block, Tour event or Phil session then.`);
  }
  const today = format(new Date(now), 'yyyy-MM-dd');
  if (pkg.kind === 'tokens' && today < SEASON_BOUNDS.start) lines.push(`Sessions start ${SEASON_START_LABEL}.`);
  if (!self && hasUnclaimedLogin(athlete)) {
    lines.push(`${name} can sign in at ${host}/portal/signin with ${athlete.loginEmail}.`);
  }
  // Its Pay button sits on the same page, on the pending card below.
  if (facilityDue && pkg.kind === 'tokens') {
    lines.push(`${selfManaged ? 'Facility access' : 'Family facility access'}: pay from your ${self ? 'home' : 'family'} page whenever you're ready.`);
  }
  return { title: WHATS_NEXT_TITLE, lines, book, season: pkg.kind === 'tokens' };
}
