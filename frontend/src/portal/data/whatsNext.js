/**
 * The "What's next" card under "Payment received" on the Stripe return
 * (owner decision 2026-09-30): three short lines that tell a family what to
 * do now it has paid. PURE - the paid package, the product, the athlete's
 * login and the clock decide the words, so the card cannot drift from the
 * banner above it (same gate: bookingOpen). Never promises an email - portal
 * email is off.
 */
import { format, parseISO } from 'date-fns';
import { BOOKING_OPENS_LABEL, bookingOpen } from './calendar';
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
 * @param {string} [a.host]      Where the portal lives, for the sign-in line.
 * @param {number} [a.now]
 * @return {?{ title: string, lines: string[], book: ?string, season: boolean }}
 */
export function whatsNextFor({ packageId, product = null, athlete = null, self = false, host = '', now = Date.now() }) {
  if (product === 'facility') return null;
  const pkg = packageById(packageId);
  if (!pkg || (pkg.kind !== 'tokens' && pkg.kind !== 'elite')) return null;
  const first = firstName(athlete?.name);
  const name = first ?? 'Your athlete';
  const lines = [];
  let book = null;
  // Elite books at once; tokens from Oct 10 (the banner's own gate).
  if (bookingOpen(now, pkg)) {
    lines.push(`${self ? 'You' : name} can book now - training, tournaments and Phil, up to ${windowDaysFor(pkg)} days ahead.`);
    book = self ? 'Book your first session' : `Book ${first ?? 'your athlete'}'s first session`;
  } else {
    lines.push(`Booking opens ${BOOKING_OPENS_LABEL} - book any training block, tournament or Phil session then.`);
  }
  const today = format(new Date(now), 'yyyy-MM-dd');
  if (pkg.kind === 'tokens' && today < SEASON_BOUNDS.start) lines.push(`Sessions start ${SEASON_START_LABEL}.`);
  if (!self && hasUnclaimedLogin(athlete)) {
    lines.push(`${name} can sign in at ${host}/portal/signin with ${athlete.loginEmail}.`);
  }
  return { title: WHATS_NEXT_TITLE, lines, book, season: pkg.kind === 'tokens' };
}
