/**
 * createCheckoutSession (contract 1.5, spec 4.2 / 4.5). A monthly tier (or
 * the facility add-on) is ONE Stripe Checkout Session in subscription mode
 * carrying the recurring price AND a one-time "prepaid month" line, with
 * `trial_end` at 00:00 Chicago on the next 1st so every subscription
 * anchors on the 1st (rulings 0.11-0.13). The single session token (owner
 * rulings 2026-09-29/30) is a PAYMENT-mode session of the one-time $65
 * price, card only, expiring before the season cutoff; every paid session
 * becomes one token in the webhook (stripe-single.js), so repeat purchases
 * are allowed. Every Firestore read happens before the Stripe calls;
 * nothing is written here - the webhook (stripe.js) writes.
 */
'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const catalogue = require('./catalogue');
const lib = require('./lib');
const prepaid = require('./prepaid');
const single = require('./single');
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
/** single.SEASON_END as the family reads it (checkout.test.js checks). */
const SEASON_END_LABEL = 'Sat, Feb 27, 2027';
const NOTHING_CHARGED = 'Nothing has been charged.';

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

/** @return {!Error} The 'stripe-error' refusal (Stripe itself failed). */
function stripeUnavailable() {
  return refuse('unavailable', 'stripe-error',
      'Checkout is unavailable right now. Try again in a minute.');
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
 *     portalUrl: string, customerId: ?string, email: ?string}} a Inputs.
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
    success_url: `${base}?paid=${a.athleteId}&cs={CHECKOUT_SESSION_ID}`,
    cancel_url: base,
  };
  if (a.customerId) body.customer = a.customerId;
  else body.customer_email = a.email;
  return body;
}

/**
 * The single session token's Checkout Session request body: a one-time
 * payment of the single price, card only. Pure. Never `invoice_creation`:
 * the webhook mints from the session itself.
 * @param {{householdId: string, athleteId: string, athleteName: ?string,
 *     priceId: string, role: string, portalUrl: string,
 *     customerId: ?string, email: ?string, nowMs: number}} a Inputs.
 * @return {!Object} What `stripe.checkout.sessions.create` receives.
 */
function singleSessionBody(a) {
  const screen = a.role === 'athlete' ? 'home' : 'family';
  const base = `${a.portalUrl}/portal/${screen}`;
  const name = a.athleteName || 'your athlete';
  const metadata = () => ({householdId: a.householdId,
    athleteId: a.athleteId, product: 'tier', packageId: single.SINGLE_ID});
  const body = {
    mode: 'payment',
    client_reference_id: `${a.householdId}__${a.athleteId}__tier`,
    line_items: [{price: a.priceId, quantity: 1}],
    payment_method_types: ['card'],
    metadata: metadata(),
    payment_intent_data: {metadata: metadata(),
      description: `Single session token - ${name}`},
    custom_text: {submit: {message: `One-time payment: one session token ` +
      `for ${name}, good through ${SEASON_END_LABEL}.`}},
    expires_at: single.checkoutExpiresAt(a.nowMs),
    success_url: `${base}?paid=${a.athleteId}&cs={CHECKOUT_SESSION_ID}` +
        '&single=1',
    cancel_url: base,
  };
  if (a.customerId) {
    body.customer = a.customerId;
  } else {
    body.customer_email = a.email;
    body.customer_creation = 'always';
  }
  return body;
}

/**
 * Does the Stripe price contradict what is being sold? The single token must
 * be the one-time $65 USD price with no recurring or customer-chosen amount;
 * a subscription checkout must never carry a one-time price.
 * @param {?Object} price `stripe.prices.retrieve`'s result.
 * @param {boolean} isSingle A single-token checkout.
 * @return {boolean} True to refuse 'price-mismatch'.
 */
function priceMismatch(price, isSingle) {
  const p = price || {};
  if (!isSingle) return p.type === 'one_time';
  return p.type !== 'one_time' || Boolean(p.recurring) ||
      p.unit_amount !== single.SINGLE_PRICE_CENTS || p.currency !== 'usd' ||
      Boolean(p.custom_unit_amount);
}

/**
 * The single token's household gate: a past_due household must fix its card
 * first, and a lapsed one is sold a token only when the webhook could lift
 * it (no other athlete without a billing block).
 * @param {!Object} store Firestore.
 * @param {!Object} hh The household body (`{}` when missing).
 * @param {!Object} athlete The buyer's body.
 * @param {string} athleteId The buyer.
 * @return {!Promise<void>} Throws the refusal.
 */
async function assertSingleHousehold(store, hh, athlete, athleteId) {
  const status = hh.membership && hh.membership.status;
  if (status === 'past_due') {
    throw refuse('failed-precondition', 'household-past-due',
        'A card on this family account needs updating before you can ' +
        'buy a session token. ' + NOTHING_CHARGED);
  }
  if (status !== 'lapsed') return;
  const snap = await store.collection('athletes')
      .where('householdId', '==', athlete.householdId).get();
  if (snap.docs.some((doc) => doc.id !== athleteId &&
      !(doc.data() || {}).billing)) {
    throw refuse('failed-precondition', 'household-lapsed-legacy',
        'This family account needs the academy\'s help before you can ' +
        'buy a session token. ' + NOTHING_CHARGED);
  }
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
  // subscription) may start a checkout. A paid single token (`oneTime`
  // with no subscription) is not a subscription: buying again is allowed.
  const live = (b) => Boolean(b) && (b.status === 'past_due' ||
      (b.status === 'active' && !(b.oneTime === true && !b.subscriptionId)));
  const tierPaid = live(athlete.billing);
  const facilityPaid = live(athlete.facilityBilling);
  if (req.product === 'tier') {
    if (!athlete.packageId) {
      throw refuse('failed-precondition', 'no-package',
          'Choose a package first.');
    }
    if (tierPaid) {
      let copy = athlete.billing.status === 'past_due' ?
          'This membership has a subscription - update the card in Stripe.' :
          'This membership is already paid.';
      if (athlete.packageId === single.SINGLE_ID) {
        // Never tell the parent to cancel in Stripe themselves.
        copy = 'This athlete still has a monthly plan - contact the ' +
            'academy to switch to session tokens.';
      }
      throw refuse('failed-precondition', 'already-active', copy);
    }
  }
  const pkg = await read(store, 'packages', athlete.packageId);
  // Owner rulings 2026-09-29/30: the single token is a ONE-TIME $65 payment
  // (payment-mode checkout below), sold until 30 minutes before the season
  // cutoff so Stripe still accepts the session's expiry.
  const singlePkg = athlete.packageId === single.SINGLE_ID ||
      Boolean(pkg && pkg.kind === single.SINGLE_ID);
  const isSingle = req.product === 'tier' && singlePkg;
  if (isSingle && !single.seasonCheckoutOpen(nowMs)) {
    throw refuse('failed-precondition', 'season-over',
        'Session tokens for this season are no longer on sale. ' +
        NOTHING_CHARGED);
  }
  if (req.product === 'facility') {
    if (singlePkg) {
      throw refuse('failed-precondition', 'single-no-facility',
          'Facility access comes with a monthly membership, not with ' +
          'session tokens. ' + NOTHING_CHARGED);
    }
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
  // The single token always sells the catalogue's single price: the
  // webhook accepts no other one-time price.
  let key = isSingle ? single.SINGLE_ID : athlete.packageId;
  if (req.product === 'facility') key = catalogue.FACILITY_KEY;
  const priceId = catalogue.priceIdFor(key, d.catalogue);
  if (!priceId) {
    throw refuse('failed-precondition', 'price-missing',
        'Pricing is not set up yet. Try again later.');
  }
  const hh = (await read(store, 'households', athlete.householdId)) || {};
  if (isSingle) await assertSingleHousehold(store, hh, athlete, req.athleteId);
  const tokens = req.product === 'tier' && pkg && pkg.tokens !== undefined ?
      pkg.tokens : null;
  let client;
  let price;
  try {
    client = d.stripe || stripe();
    price = await client.prices.retrieve(priceId);
  } catch (err) {
    console.error('createCheckoutSession stripe error:', err);
    throw stripeUnavailable();
  }
  // Outside any catch: a wrong catalogue price is a setup error the
  // family must never see as 'try again in a minute'.
  if (priceMismatch(price, isSingle)) {
    console.error(`createCheckoutSession: price ${priceId} does not match ` +
        (isSingle ? 'the one-time $65 single token' : 'a subscription'));
    throw refuse('failed-precondition', 'price-mismatch',
        'Pricing is not set up correctly yet. ' + NOTHING_CHARGED);
  }
  const common = {
    householdId: athlete.householdId,
    athleteId: req.athleteId,
    priceId,
    role: me.role === 'athlete' ? 'athlete' : 'parent',
    portalUrl: String(process.env.PORTAL_URL || '').replace(/\/$/, ''),
    customerId: hh.stripeCustomerId || null,
    email: token.email || (hh.guardian && hh.guardian.email) || null,
  };
  try {
    const body = isSingle ?
      singleSessionBody(Object.assign({athleteName: athlete.name || null,
        nowMs}, common)) :
      sessionBody(Object.assign({
        product: req.product,
        packageId: athlete.packageId || null,
        currency: price.currency || 'usd',
        productName: req.product === 'facility' ? FACILITY_NAME :
            (pkg && pkg.name) || athlete.packageId,
        prepaid: prepaidFor(nowMs, {priceCents: price.unit_amount, tokens}),
      }, common));
    const session = await client.checkout.sessions.create(body);
    return {url: session.url};
  } catch (err) {
    console.error('createCheckoutSession stripe error:', err);
    throw stripeUnavailable();
  }
}

const createCheckoutSession = functions.runWith({secrets: CHECKOUT_SECRETS})
    .https.onCall((data, context) => createCheckoutSessionHandler(data,
        context));

module.exports = {
  SEASON_END_LABEL, createCheckoutSession, createCheckoutSessionHandler,
  prepaidFor, priceMismatch, sessionBody, singleSessionBody,
};
