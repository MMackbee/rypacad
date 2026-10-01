/**
 * The single session token (owner rulings 2026-09-29/30) - PURE copy and
 * counts. A single token is a ONE-TIME $65 purchase: one paid Checkout
 * Session is one graceTokens doc `single_{checkoutSessionId}` (reason
 * 'single-purchase'), good for any bookable session through the season's
 * last day. A single athlete gets no monthly token; they book with tokens
 * they bought (or an ops comp). The server half, and the id format, live in
 * functions/portal/single.js - CHANGE ONE, CHANGE BOTH.
 *
 * Shared by the booking screens, the token meters, the Billing hub and the
 * staff editor so the words cannot drift between them.
 */
import { format, parseISO } from 'date-fns';
import { BOOKING_OPENS_LABEL, bookingOpen } from './calendar';
import { SINGLE_TOKEN } from './packages';
import { SEASON_BOUNDS } from './season';
import { isAdultOnDate } from './signup';

/**
 * Whether single tokens are on sale yet (owner ruling 2026-10-01): from the
 * moment booking opens for token packages - Sat, Oct 10, 2026 at 7:00 AM
 * America/Chicago, calendar.js BOOKING_OPENS_AT, the one date there is.
 * Clock-based, so the code ships early and the sale opens by itself. Before
 * it: sign-up shows the card as not yet available (SINGLE_NOT_OPEN_NOTE), no
 * Pay or Buy button is offered for a single token, and createCheckoutSession
 * refuses 'single-not-open' before any Stripe call. The same rule as
 * functions/portal/single.js saleOpen - CHANGE ONE, CHANGE BOTH.
 * @param {number|Date} now Pins the clock in tests.
 */
export function saleOpen(now = Date.now()) {
  return bookingOpen(now, null);
}

/** Under the single token card at sign-up until the sale opens. */
export const SINGLE_NOT_OPEN_NOTE = `Available ${BOOKING_OPENS_LABEL}. Pick a monthly package now, or come back then.`;
/** Where a Pay or Buy button would be, until the sale opens. */
export const SINGLE_NOT_OPEN_LINE = `Single tokens are available from ${BOOKING_OPENS_LABEL}.`;
/** What createCheckoutSession answers until the sale opens (reason 'single-not-open'), word for word. */
export const SINGLE_NOT_OPEN_MESSAGE = `${SINGLE_NOT_OPEN_LINE} Nothing has been charged.`;

/** The last day a single token is good for (functions/portal/single.js SEASON_END). */
export const SINGLE_EXPIRES = SEASON_BOUNDS.end;
/** '2027-02-27' -> 'Sat, Feb 27': how the token surfaces name a token's last day. */
export function tokenDayLabel(iso) {
  return format(parseISO(iso), 'EEE, MMM d');
}

/** 'Sat, Feb 27' - how every surface names SINGLE_EXPIRES. */
export const SINGLE_EXPIRES_LABEL = tokenDayLabel(SINGLE_EXPIRES);

const TOKEN_PREFIX = 'single_';

/** True for a purchased single token's id (or a booking's graceTokenId). */
export function isSingleTokenId(id) {
  return typeof id === 'string' && id.length > TOKEN_PREFIX.length && id.startsWith(TOKEN_PREFIX);
}

/** The Buy button's label: 'Buy a session token - $65'. */
export const BUY_SINGLE_LABEL = `Buy a session token - $${SINGLE_TOKEN.price}`;

/**
 * Whether an ATHLETE'S OWN LOGIN is offered the single token's Pay or Buy
 * button (owner ruling 2026-10-01: "not unless the child is 18+"). True for
 * the adult who signed up for themselves (user.selfManaged) and for an athlete
 * whose date of birth says 18 or older on `todayISO` (signup.js ADULT_AGE);
 * no date of birth on file counts as under 18. A parent's view and the staff
 * view never ask. Screens only: who createCheckoutSession lets pay is the
 * server's rule, unchanged.
 * @param {{selfManaged?: boolean, dob?: string|null, todayISO: string}} who
 */
export function ownLoginMayBuy({ selfManaged = false, dob = null, todayISO } = {}) {
  return selfManaged === true || isAdultOnDate(dob, todayISO);
}

/** Where that button would be on an under-18 athlete's own login (SINGLE_NOT_OPEN_LINE until the sale opens). */
export const SINGLE_ASK_GUARDIAN_LINE = 'Ask a parent or guardian to buy a session token.';

/**
 * Tokens a single athlete can book with right now: every usable grace token
 * (purchased, or a bonus) plus any ops-comp period tokens left. `grace` is
 * already less the tokens a waitlist spot holds (tokensFor's `held`).
 */
export function availableCount(tokens) {
  return (tokens?.grace?.length ?? 0) + (tokens?.left || 0);
}

/** '1 held by a waitlist spot' when waitlist entries hold tokens (tokensFor's `held`), else null. */
export function heldLine(tokens) {
  const held = tokens?.held || 0;
  if (held <= 0) return null;
  return `${held} held by ${held === 1 ? 'a waitlist spot' : 'waitlist spots'}`;
}

/**
 * '1 session token - good through Sat, Feb 27', 'No session token', plus
 * ' · 1 held by a waitlist spot' when a waitlist entry holds a token.
 */
export function singleTokenLine(tokens) {
  const n = availableCount(tokens);
  const base = n === 0 ? 'No session token' : `${n} session token${n === 1 ? '' : 's'} - good through ${SINGLE_EXPIRES_LABEL}`;
  const held = heldLine(tokens);
  return held ? `${base} · ${held}` : base;
}

/**
 * What a grace-charged booking spends: the soonest-expiring grace token is
 * the one charged, so it names that one.
 */
export function graceSpendLabel(tokens) {
  return tokens?.grace?.[0]?.reason === 'single-purchase' ? 'a session token' : 'a bonus token';
}

/** The ?paid=...&single=1 return once graceTokens/single_{cs} exists. */
export function singleConfirmedLine(open) {
  return open
    ? 'Payment received - your session token is ready to book.'
    : `Payment received - your session token is ready. Booking opens ${BOOKING_OPENS_LABEL}.`;
}

/**
 * The staff package editor's static warning when a change moves an athlete
 * to or from the single token (null otherwise). Moving a monthly subscriber
 * to Single without cancelling in Stripe keeps billing them; moving a token
 * buyer off Single leaves them payment-pending until the new package is paid.
 */
export function packageSwitchWarning(fromId, toId) {
  if (!toId || fromId === toId) return null;
  if (toId === SINGLE_TOKEN.id) {
    return 'Switching to Single token: cancel any monthly subscription in Stripe first. The family then buys session tokens one at a time - there is no monthly token.';
  }
  if (fromId === SINGLE_TOKEN.id) {
    return 'Switching off Single token: if this family bought session tokens, the athlete cannot book until the new package is paid, and unspent session tokens wait until then.';
  }
  return null;
}
