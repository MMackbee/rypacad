/**
 * createCheckoutSession (contract 1.5, spec 4.2 / 4.5): ONE Stripe Checkout
 * Session in subscription mode carrying the recurring tier (or facility)
 * price AND a one-time "prepaid month" line, with `trial_end` at 00:00
 * Chicago on the next 1st so every subscription anchors on the 1st
 * (rulings 0.11-0.13). Every Firestore read happens before the Stripe
 * calls; nothing is written here - the webhook (stripe.js) writes.
 */
'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const catalogue = require('./catalogue');
const lib = require('./lib');
const prepaid = require('./prepaid');
const {CHECKOUT_SECRETS} = require('./secrets');

const {HttpsError} = functions.https;
/**
 * Decision D11: Stripe refuses a Checkout `trial_end` under 48 h out, so a
 * checkout that close to the 1st prepays the NEXT month in full. 49 h of
 * lead keeps a clock-skewed request clear of Stripe's boundary.
 */
const MIN_TRIAL_LEAD_MS = 49 * 60 * 60 * 1000;
const PRODUCTS = ['tier', 'facility'];
const FACILITY_NAME = 'Facility access';

let stripeClient;

/** @return {!Object} The Stripe client, from STRIPE_SECRET_KEY. */
function stripe() {
  if (!stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

/** @return {!Object} The admin Firestore, resolved lazily. */
function db() {
  return admin.firestore();
}

/**
 * @param {string} code An HttpsError code.
 * @param {string} reason The contract's `details.reason`.
 * @param {string} message Plain-language copy.
 * @return {!Error} An HttpsError.
 */
function refuse(code, reason, message) {
  return new HttpsError(code, message, {reason});
}

/**
 * @param {!Object} store Firestore.
 * @param {string} collection The collection.
 * @param {?string} id The id.
 * @return {!Promise<?Object>} The body or null.
 */
async function read(store, collection, id) {
  if (!id) return null;
  const snap = await store.collection(collection).doc(id).get();
  return snap.exists ? snap.data() || {} : null;
}

/**
 * Sibling discount (owner, 2026-09-30): a family with more than one athlete
 * on a monthly package gets it on every membership checkout. The single
 * token is a one-time purchase, not a membership, so it does not count,
 * and neither does a lapsed membership (packageId survives a lapse).
 * Checked at checkout only: a 'forever' coupon then stays on that
 * subscription for the season.
 * @param {!Object} store Firestore.
 * @param {string} householdId The family.
 * @return {!Promise<boolean>} Whether the family qualifies.
 */
async function siblingEligible(store, householdId) {
  const snap = await store.collection('athletes')
      .where('householdId', '==', householdId).get();
  const monthly = snap.docs.filter((doc) => {
    const a = doc.data() || {};
    return Boolean(a.packageId) && a.packageId !== 'single' &&
        !(a.billing && a.billing.status === 'lapsed');
  });
  return monthly.length >= 2;
}

/**
 * The coupon id is configured but Stripe has no such coupon in this mode
 * (coupons are made by hand, once per mode): the family gets the code
 * field instead of a refusal.
 * @param {*} err What `sessions.create` threw.
 * @return {boolean} Whether to retry without the coupon.
 */
function couponMissing(err) {
  return Boolean(err) && err.code === 'resource_missing' &&
      String(err.param || '').startsWith('discounts');
}

/**
 * The prepaid period for this checkout, rolled one month forward when the
 * trial would end under 48 h from now (Stripe's Checkout minimum; ruled,
 * D11): the remaining day or two of the current month are free.
 * @param {number} nowMs The clock.
 * @param {{priceCents: number, tokens: ?number}} args The package.
 * @return {!Object} `prepaid.prepaidPeriodFor`'s result.
 */
function prepaidFor(nowMs, args) {
  const p = prepaid.prepaidPeriodFor(nowMs, args);
  if (p.trialEnd * 1000 - nowMs >= MIN_TRIAL_LEAD_MS) return p;
  return prepaid.prepaidPeriodFor(p.trialEnd * 1000 + 60 * 60 * 1000, args);
}

/**
 * The Checkout Session request body (spec 4.2). Pure.
 * @param {{householdId: string, athleteId: string, product: string,
 *     packageId: ?string, priceId: string, currency: string,
 *     productName: string, prepaid: !Object, role: string,
 *     portalUrl: string, customerId: ?string, email: ?string,
 *     sibling: ({eligible: boolean, coupon: ?string}|undefined)}} a Inputs.
 * @return {!Object} What `stripe.checkout.sessions.create` receives.
 */
function sessionBody(a) {
  const screen = a.role === 'athlete' ? 'home' : 'family';
  const base = `${a.portalUrl}/portal/${screen}`;
  const body = {
    mode: 'subscription',
    client_reference_id: `${a.householdId}__${a.athleteId}__${a.product}`,
    line_items: [
      {price: a.priceId, quantity: 1},
      {quantity: 1, price_data: {
        currency: a.currency,
        unit_amount: a.prepaid.amountCents,
        product_data: {
          name: `${a.productName} - ${a.prepaid.label}, prepaid`,
        },
      }},
    ],
    subscription_data: {
      trial_end: a.prepaid.trialEnd,
      metadata: {
        householdId: a.householdId,
        athleteId: a.athleteId,
        product: a.product,
        packageId: a.packageId || '',
        prepaidPeriodKey: a.prepaid.periodKey,
        prepaidTokens: a.prepaid.tokens === null ? '' :
            String(a.prepaid.tokens),
      },
    },
    // The add-on's return names itself so the portal's "What's next" card
    // stays off it; the tier return is unchanged.
    success_url: `${base}?paid=${a.athleteId}` +
        `${a.product === 'facility' ? '&product=facility' : ''}` +
        '&cs={CHECKOUT_SESSION_ID}',
    cancel_url: base,
  };
  if (a.customerId) body.customer = a.customerId;
  else body.customer_email = a.email;
  // Sibling discount (owner, 2026-09-30): only a family with more than one
  // membership sees it. With STRIPE_SIBLING_COUPON set (Phil's coupon id,
  // the same in test and live) Stripe applies it and there is nothing to
  // type; without it the family gets Stripe's "Add promotion code" field
  // and types the code. Stripe accepts one of the two, never both. Tokens
  // come from metadata, never from the amount, so the discount changes no
  // balance.
  if (a.sibling && a.sibling.eligible) {
    if (a.sibling.coupon) body.discounts = [{coupon: a.sibling.coupon}];
    else body.allow_promotion_codes = true;
  }
  return body;
}

/**
 * createCheckoutSession. Checks in the contract's order, then one Stripe
 * price read and one session create.
 * @param {*} data `{athleteId, product}`.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), stripe: (!Object|undefined),
 *     now: (number|undefined), catalogue: (!Object|undefined)}=} deps
 *     Injectable Firestore, Stripe client, clock and catalogue (tests).
 * @return {!Promise<{url: string}>} Where the browser goes.
 */
async function createCheckoutSessionHandler(data, context, deps) {
  const d = deps || {};
  const store = d.db || db();
  const nowMs = d.now === undefined ? Date.now() : Number(d.now);
  const auth = context && context.auth;
  if (!auth || !auth.uid) {
    throw refuse('unauthenticated', 'signed-out', 'Sign in to continue.');
  }
  const token = auth.token || {};
  const req = data || {};
  if (!PRODUCTS.includes(req.product) || typeof req.athleteId !== 'string' ||
      !req.athleteId) {
    throw refuse('invalid-argument', 'invalid-product',
        'Choose what to pay for.');
  }
  const athlete = await read(store, 'athletes', req.athleteId);
  if (!athlete) {
    throw refuse('not-found', 'athlete-not-found',
        'That athlete no longer exists.');
  }
  const me = (await read(store, 'users', auth.uid)) || {};
  const owner = (me.role === 'parent' &&
      me.householdId === athlete.householdId) ||
      me.athleteId === req.athleteId;
  if (!owner) {
    throw refuse('permission-denied', 'not-owner',
        'You can only pay for athletes in your family.');
  }
  const provider = token.firebase && token.firebase.sign_in_provider;
  if (provider === 'password' && token.email_verified !== true) {
    throw refuse('failed-precondition', 'email-unverified',
        'Verify your email to pay.');
  }
  // A 'past_due' subscription still EXISTS (Stripe is retrying the card):
  // a second checkout would create a second subscription. The customer
  // portal's card update is the way back; only pending or lapsed (no live
  // subscription) may start a checkout.
  const live = (b) => Boolean(b) &&
      (b.status === 'active' || b.status === 'past_due');
  const tierPaid = live(athlete.billing);
  const facilityPaid = live(athlete.facilityBilling);
  if (req.product === 'tier') {
    if (!athlete.packageId) {
      throw refuse('failed-precondition', 'no-package',
          'Choose a package first.');
    }
    if (tierPaid) {
      throw refuse('failed-precondition', 'already-active',
          athlete.billing.status === 'past_due' ?
          'This membership has a subscription - update the card in Stripe.' :
          'This membership is already paid.');
    }
  }
  const pkg = await read(store, 'packages', athlete.packageId);
  // Owner ruling 2026-09-29: the single token is a ONE-TIME $65 payment, not
  // a monthly package. This file only builds subscription checkouts, and the
  // one-time path (payment-mode checkout + webhook + token model) is not
  // built yet, so refuse before any Stripe call with a message that says so,
  // instead of Stripe's rejection surfacing as 'Try again in a minute'.
  if (req.product === 'tier' &&
      (athlete.packageId === 'single' || (pkg && pkg.kind === 'single'))) {
    throw refuse('failed-precondition', 'single-one-time',
        'Single tokens are a one-time payment. Online payment for them ' +
        'opens before booking starts on Sat, Oct 10. Nothing has been ' +
        'charged.');
  }
  if (req.product === 'facility') {
    // Absent `billing` == active (spec 4.4): legacy athletes may add on.
    if (!lib.membershipAllowsBooking(null, athlete)) {
      throw refuse('failed-precondition', 'billing-not-active',
          'Pay for the membership first.');
    }
    if (pkg && pkg.kind === 'elite') {
      throw refuse('failed-precondition', 'elite-includes-facility',
          'Elite already includes facility access.');
    }
    if (facilityPaid) {
      throw refuse('failed-precondition', 'already-active',
          'Facility access is already paid.');
    }
  }
  const key = req.product === 'facility' ? catalogue.FACILITY_KEY :
      athlete.packageId;
  const priceId = catalogue.priceIdFor(key, d.catalogue);
  if (!priceId) {
    throw refuse('failed-precondition', 'price-missing',
        'Pricing is not set up yet. Try again later.');
  }
  const hh = (await read(store, 'households', athlete.householdId)) || {};
  const tokens = req.product === 'tier' && pkg && pkg.tokens !== undefined ?
      pkg.tokens : null;
  // The add-on is not a membership: no sibling discount on it. The lookup
  // is optional, so a failed read costs the family the discount, never
  // the checkout.
  const sibling = {
    eligible: false,
    coupon: String(process.env.STRIPE_SIBLING_COUPON || '').trim() || null,
  };
  if (req.product === 'tier') {
    try {
      sibling.eligible = await siblingEligible(store, athlete.householdId);
    } catch (err) {
      console.error('siblingEligible failed, no discount:', err);
    }
  }
  try {
    const client = d.stripe || stripe();
    const price = await client.prices.retrieve(priceId);
    const args = {
      householdId: athlete.householdId,
      athleteId: req.athleteId,
      product: req.product,
      packageId: athlete.packageId || null,
      priceId,
      currency: price.currency || 'usd',
      productName: req.product === 'facility' ? FACILITY_NAME :
          (pkg && pkg.name) || athlete.packageId,
      prepaid: prepaidFor(nowMs, {priceCents: price.unit_amount, tokens}),
      role: me.role === 'athlete' ? 'athlete' : 'parent',
      portalUrl: String(process.env.PORTAL_URL || '').replace(/\/$/, ''),
      customerId: hh.stripeCustomerId || null,
      email: token.email || (hh.guardian && hh.guardian.email) || null,
      sibling,
    };
    let session;
    try {
      session = await client.checkout.sessions.create(sessionBody(args));
    } catch (err) {
      if (!(sibling.eligible && sibling.coupon && couponMissing(err))) {
        throw err;
      }
      console.error(`sibling coupon ${sibling.coupon} is missing in Stripe ` +
          `${process.env.STRIPE_MODE || 'test'} mode: code field used instead`);
      session = await client.checkout.sessions.create(sessionBody(
          Object.assign({}, args, {sibling: {eligible: true, coupon: null}})));
    }
    return {url: session.url};
  } catch (err) {
    console.error('createCheckoutSession stripe error:', err);
    throw refuse('unavailable', 'stripe-error',
        'Checkout is unavailable right now. Try again in a minute.');
  }
}

const createCheckoutSession = functions.runWith({secrets: CHECKOUT_SECRETS})
    .https.onCall((data, context) => createCheckoutSessionHandler(data,
        context));

module.exports = {
  createCheckoutSession, createCheckoutSessionHandler, prepaidFor,
  sessionBody, siblingEligible,
};
