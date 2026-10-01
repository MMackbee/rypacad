/**
 * The single session token (owner rulings 2026-09-29/30): a ONE-TIME $65
 * purchase, not a monthly package. One paid Checkout Session is one token,
 * `graceTokens/single_{checkoutSessionId}`, valid for any bookable session
 * through the last day of the season. Repeat purchases are allowed; refunds
 * are manual and VOID the token (expiresAt '2000-01-01'), never delete it.
 *
 * Pure: no Firestore, no Stripe, no clock. Every caller passes `nowMs`. The
 * webhook, checkout, the promotion/Calendly writers and the double-spend
 * guard all share these names so the id format and the season cutoff live
 * in one place.
 *
 * On sale from the moment booking opens (owner ruling 2026-10-01): Sat,
 * Oct 10, 2026 at 7:00 AM America/Chicago, the gate token-package booking
 * uses (lib.BOOKING_OPENS_AT). `saleOpen` reads that one constant, so the
 * code deploys early and the sale opens by the clock.
 */
'use strict';

const lib = require('./lib');

/**
 * The last day a single token is good for. Mirrors
 * frontend/src/portal/data/season.js:72 (`SEASON_BOUNDS.end`); single.test.js
 * reads that literal as text, so the two cannot drift apart unnoticed.
 * @const {string}
 */
const SEASON_END = '2027-02-27';
/** 00:00 America/Chicago (CST, -6) on Feb 28, 2027. @const {number} */
const SEASON_CUTOFF_MS = Date.UTC(2027, 1, 28, 6);
/** The package id (and `packages/{id}.kind`) of the single token. */
const SINGLE_ID = 'single';
/** The owner's price, in cents (ruling 2026-09-22). @const {number} */
const SINGLE_PRICE_CENTS = 6500;
/** Stripe refuses a Checkout Session expiring sooner than 30 minutes. */
const CHECKOUT_MIN_MS = 30 * 60 * 1000;
/** Stripe's maximum Checkout Session life, less a 5-minute margin. */
const CHECKOUT_LIFE_MS = 24 * 60 * 60 * 1000 - 5 * 60 * 1000;
/** Every single token's id starts with this. @const {string} */
const TOKEN_PREFIX = 'single_';

/**
 * The graceTokens id for one paid Checkout Session. The id IS the
 * idempotency key: a webhook redelivery or a manual Resend finds it and
 * writes nothing.
 * @param {string} checkoutSessionId Stripe's `cs_...` id.
 * @return {string} `'single_' + checkoutSessionId`.
 */
function tokenIdFor(checkoutSessionId) {
  return TOKEN_PREFIX + checkoutSessionId;
}

/**
 * @param {*} id A graceTokens id (or a booking's `graceTokenId`).
 * @return {boolean} True for a purchased single token's id.
 */
function isSingleTokenId(id) {
  return typeof id === 'string' && id.length > TOKEN_PREFIX.length &&
      id.startsWith(TOKEN_PREFIX);
}

/**
 * An athlete who books only with purchased tokens: on the single package, or
 * still carrying the one-time billing block after a package change.
 * @param {?Object} athlete An `athletes/{id}` body.
 * @param {?Object=} pkg The athlete's `packages/{id}` body, when read.
 * @return {boolean} True for a single-only athlete.
 */
function isSingleOnly(athlete, pkg) {
  const a = athlete || {};
  return a.packageId === SINGLE_ID ||
      Boolean(pkg && pkg.kind === SINGLE_ID) ||
      Boolean(a.billing && a.billing.oneTime === true);
}

/**
 * The PaymentIntent id of a Checkout Session, stored on the token so a
 * refund can be matched later. Stripe sends a string unless expanded.
 * @param {?Object} session A Stripe Checkout Session.
 * @return {?string} `pi_...`, or null when there is none.
 */
function paymentIntentIdOf(session) {
  const pi = session && session.payment_intent;
  if (typeof pi === 'string') return pi || null;
  return (pi && typeof pi.id === 'string' && pi.id) || null;
}

/**
 * Whether single tokens are on sale yet: from the instant booking opens for
 * token members (`lib.bookingOpen` with no Elite package, i.e.
 * `nowMs >= lib.BOOKING_OPENS_AT`). There is no second date constant.
 * @param {number} nowMs Epoch millis.
 * @return {boolean} True from Sat, Oct 10, 2026 at 7:00 AM Chicago.
 */
function saleOpen(nowMs) {
  return lib.bookingOpen(nowMs, null);
}

/**
 * Whether a single token may still be sold: at least CHECKOUT_MIN_MS must
 * remain before the season cutoff, or Stripe would refuse the expiry.
 * @param {number} nowMs Epoch millis.
 * @return {boolean} True while checkout is open.
 */
function seasonCheckoutOpen(nowMs) {
  return SEASON_CUTOFF_MS - nowMs >= CHECKOUT_MIN_MS;
}

/**
 * A single checkout's `expires_at`: 24 h less 5 min from now, never past the
 * season cutoff, so nobody can pay for a token after the season ends.
 * @param {number} nowMs Epoch millis.
 * @return {number} Unix seconds.
 */
function checkoutExpiresAt(nowMs) {
  return Math.floor(Math.min(nowMs + CHECKOUT_LIFE_MS, SEASON_CUTOFF_MS) /
      1000);
}

/**
 * Whether a subscription event belongs to a subscription this athlete gave
 * up when buying single tokens (`billing.retiredSubscriptionIds`). Such late
 * events are recorded 'ignored-retired-subscription' and write nothing.
 * @param {?Object} athlete An `athletes/{id}` body.
 * @param {string} product `'tier' | 'facility'`.
 * @param {?string} subId The event's subscription id.
 * @return {boolean} True for a retired tier subscription.
 */
function isRetiredSubscription(athlete, product, subId) {
  const billing = (athlete && athlete.billing) || {};
  const retired = Array.isArray(billing.retiredSubscriptionIds) ?
      billing.retiredSubscriptionIds : [];
  return product === 'tier' && Boolean(subId) && retired.includes(subId);
}

module.exports = {
  CHECKOUT_MIN_MS,
  SEASON_CUTOFF_MS,
  SEASON_END,
  SINGLE_ID,
  SINGLE_PRICE_CENTS,
  checkoutExpiresAt,
  isRetiredSubscription,
  isSingleOnly,
  isSingleTokenId,
  paymentIntentIdOf,
  saleOpen,
  seasonCheckoutOpen,
  tokenIdFor,
};
