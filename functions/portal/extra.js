/**
 * The extra session at the member rate (owner, 2026-10-10: "that's exactly
 * how I want you to build it"). A family on a monthly token package buys one
 * more session token at THEIR package's per-session rate, from the token
 * meter, with the discount applied for them - no code to type. It is the
 * single token's one-time checkout (checkout.js extraSessionBody, the same
 * catalogue price and client reference) plus a Stripe coupon that takes the
 * difference off $65. The webhook's single path (stripe-single.js) mints it
 * as a TOP-UP: one graceTokens/single_{cs} doc good through
 * single.SEASON_END, the monthly billing left alone.
 *
 * Per-session rate = round(price * 100 / tokens) / 100, from the
 * catalogue's own figures (frontend/src/portal/data/packages.js
 * TOKEN_PACKAGES, memberSessionRate there; extra.test.js reads that file as
 * text, so the two cannot drift apart unnoticed). The coupons exist in
 * Stripe test AND live, made by hand: amount_off in USD, duration once,
 * applies_to the single-token product only, id MEMBER_RATE_<tokens>.
 *
 * Pure: no Firestore, no Stripe, no clock. Every caller passes `nowMs`.
 */
'use strict';

const single = require('./single');

const NOTHING_CHARGED = 'Nothing has been charged.';

/**
 * What a member pays for an extra session, per monthly token package, and
 * the Stripe coupon that gets them there from the single price. Elite
 * (unlimited) and the single token have no member rate.
 * @const {!Object<string, {tokens: number, cents: number, coupon: string}>}
 */
const MEMBER_RATES = {
  't-4': {tokens: 4, cents: 5475, coupon: 'MEMBER_RATE_4'},
  't-6': {tokens: 6, cents: 4983, coupon: 'MEMBER_RATE_6'},
  't-8': {tokens: 8, cents: 4863, coupon: 'MEMBER_RATE_8'},
  't-12': {tokens: 12, cents: 4742, coupon: 'MEMBER_RATE_12'},
  't-16': {tokens: 16, cents: 4494, coupon: 'MEMBER_RATE_16'},
};

/**
 * @param {number} cents An amount in cents.
 * @return {string} '$48.63'.
 */
function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The member rate for one package.
 * @param {*} packageId The athlete's package id.
 * @return {?{packageId: string, tokens: number, cents: number,
 *     offCents: number, coupon: string, label: string}} The rate, what the
 *     coupon takes off the single price, and '$48.63'; null for Elite, the
 *     single token or an unknown package.
 */
function memberRateFor(packageId) {
  if (typeof packageId !== 'string' ||
      !Object.prototype.hasOwnProperty.call(MEMBER_RATES, packageId)) {
    return null;
  }
  const r = MEMBER_RATES[packageId];
  return {packageId, tokens: r.tokens, cents: r.cents,
    offCents: single.SINGLE_PRICE_CENTS - r.cents, coupon: r.coupon,
    label: dollars(r.cents)};
}

/**
 * Does this billing block hold a live, PAID monthly subscription an extra
 * session can top up? Exactly the webhook's top-up condition
 * (stripe-single.js `topUp`) minus past_due, which is refused on its own.
 * Absent billing (a legacy member) has no subscription to top up.
 * @param {?Object} billing The athlete's `billing` map.
 * @return {boolean} True for active, with a subscription, not one-time.
 */
function paidSubscription(billing) {
  const b = billing || {};
  return b.status === 'active' && Boolean(b.subscriptionId) &&
      b.oneTime !== true;
}

/**
 * Why this athlete cannot buy an extra session right now, or null. Checked
 * in checkout's order, before the price and the household, and before any
 * Stripe call.
 * @param {{athlete: !Object, pkg: ?Object, nowMs: number}} a The athlete
 *     doc, its packages doc (null when missing) and the clock.
 * @return {?{reason: string, message: string}} The refusal.
 */
function athleteRefusal(a) {
  const athlete = a.athlete || {};
  if (!memberRateFor(athlete.packageId) ||
      (a.pkg && a.pkg.kind !== 'tokens')) {
    return {reason: 'extra-not-tokens', message: 'Extra sessions at the ' +
      'member rate come with a monthly token package. ' + NOTHING_CHARGED};
  }
  const billing = athlete.billing || {};
  if (billing.status === 'past_due') {
    // A failing card is fixed in Stripe's portal first (the membership's
    // own 'update the card' answer).
    return {reason: 'billing-past-due', message: 'The card on this ' +
      'membership needs updating before you can buy an extra session. ' +
      NOTHING_CHARGED};
  }
  if (!paidSubscription(billing)) {
    return {reason: 'extra-no-subscription', message: 'Extra sessions ' +
      'need a paid monthly membership. Pay for the membership first. ' +
      NOTHING_CHARGED};
  }
  if (!single.saleOpen(a.nowMs)) {
    return {reason: 'single-not-open', message: 'Extra sessions are ' +
      'available from Sat, Oct 10 at 7 AM. ' + NOTHING_CHARGED};
  }
  if (!single.seasonCheckoutOpen(a.nowMs)) {
    return {reason: 'season-over', message: 'Extra sessions for this ' +
      'season are no longer on sale. ' + NOTHING_CHARGED};
  }
  return null;
}

/**
 * The household gate: a frozen (past_due) family fixes its card first, and
 * a lapsed one cannot book what it would buy.
 * @param {!Object} hh The household body (`{}` when missing).
 * @return {?{reason: string, message: string}} The refusal.
 */
function householdRefusal(hh) {
  const status = hh && hh.membership && hh.membership.status;
  if (status === 'past_due') {
    return {reason: 'household-past-due', message: 'A card on this family ' +
      'account needs updating before you can buy an extra session. ' +
      NOTHING_CHARGED};
  }
  if (status === 'lapsed') {
    return {reason: 'household-lapsed', message: 'This family account ' +
      'needs the academy\'s help before you can buy an extra session. ' +
      NOTHING_CHARGED};
  }
  return null;
}

/**
 * What a paid payment-mode session should have charged: the member rate
 * its metadata names (checkout.js writes `memberRate`), otherwise the
 * single price. The webhook flags any other amount for ops review.
 * @param {?Object} session A Stripe Checkout Session.
 * @return {?number} Cents, or null for a member rate nobody knows.
 */
function expectedAmountCents(session) {
  const id = session && session.metadata && session.metadata.memberRate;
  if (!id) return single.SINGLE_PRICE_CENTS;
  const rate = memberRateFor(id);
  return rate ? rate.cents : null;
}

module.exports = {
  MEMBER_RATES,
  athleteRefusal,
  dollars,
  expectedAmountCents,
  householdRefusal,
  memberRateFor,
  paidSubscription,
};
