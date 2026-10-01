/**
 * createCheckoutSession (contract 1.5, spec 4.2 / 4.5). A monthly tier (or
 * the facility add-on) is ONE Stripe Checkout Session in subscription mode
 * carrying the recurring price AND a one-time "prepaid month" line, with
 * `trial_end` at 00:00 Chicago on the next 1st so every subscription
 * anchors on the 1st (rulings 0.11-0.13). The single session token (owner
 * rulings 2026-09-29/30) is a PAYMENT-mode session of the one-time $65
 * price, card only, expiring before the season cutoff; every paid session
 * becomes one token in the webhook (stripe-single.js), so repeat purchases
 * are allowed. It is on sale from the moment booking opens (ruling
 * 2026-10-01, single.saleOpen): before that the handler refuses
 * 'single-not-open'. Every Firestore read happens before the Stripe calls;
 * nothing is written here - the webhook (stripe.js) writes.
 */
'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const catalogue = require('./catalogue');
const facility = require('./facility');
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
/**
 * Monthly memberships by price, lowest first ($299 < $569 < $719 < $999;
 * frontend/src/portal/data/packages.js holds the figures). Only the order
 * matters here. The single token is not a membership and has no rank.
 * @const {!Object<string, number>}
 */
const PACKAGE_RANK = {'t-6': 1, 't-12': 2, 't-16': 3, 'elite': 4};
/** The package's part of a pair coupon id. @const {!Object<string, string>} */
const PACKAGE_LABEL = {
  't-6': '6', 't-12': '12', 't-16': '16', 'elite': 'ELITE',
};
const FACILITY_NAME = 'Family facility access';
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
 * Does this `billing` (or `facilityBilling`) block hold a live subscription?
 * A 'past_due' subscription still EXISTS (Stripe is retrying the card). A
 * paid single token (`oneTime` with no subscription) is not one.
 * @param {?Object} b The billing map.
 * @return {boolean} True for active or past_due, except a one-time block.
 */
function live(b) {
  return Boolean(b) && (b.status === 'past_due' ||
      (b.status === 'active' && !(b.oneTime === true && !b.subscriptionId)));
}

/**
 * Sibling discount (owner, 2026-09-30): the second and later memberships in
 * a family get it - this checkout qualifies when ANOTHER athlete in the
 * household already holds a PAID monthly membership (active or past_due;
 * no billing map = a legacy active member). Review 2026-09-30: a never-paid
 * sibling does not count, or one paying child plus an unpaid sibling would
 * keep the 'forever' coupon all season. The single token is a one-time
 * purchase, not a membership: neither the 'single' package nor a one-time
 * billing block (a single buyer moved to a monthly package and still to
 * pay for it) counts. Checked at checkout only.
 *
 * Owner ruling 2026-10-01 ("lesser value"): what a family saves is 20% of
 * the LOWER membership, whichever one it pays first. So this checkout is
 * measured against the dearest membership the family already pays:
 *   - it costs the same or more than this one: the plain coupon, 20% off
 *     this membership (`lower` null);
 *   - it costs less: this membership is the family's highest, and what
 *     comes off it is 20% of that cheaper one (`lower` = its package id),
 *     through the coupon `siblingCouponId` names.
 * @param {!Object} store Firestore.
 * @param {string} householdId The family.
 * @param {string} athleteId The athlete being paid for (never counts).
 * @param {?string} packageId The package being paid for.
 * @return {!Promise<{eligible: boolean, lower: ?string}>} The decision.
 */
async function siblingEligible(store, householdId, athleteId, packageId) {
  const mine = PACKAGE_RANK[packageId];
  if (!mine) return {eligible: false, lower: null}; // unknown: no guess
  const snap = await store.collection('athletes')
      .where('householdId', '==', householdId).get();
  let best = null;
  snap.docs.forEach((doc) => {
    const a = doc.data() || {};
    const paid = !a.billing || live(a.billing);
    const rank = PACKAGE_RANK[a.packageId] || 0;
    if (doc.id !== athleteId && paid && rank &&
        (!best || rank > PACKAGE_RANK[best])) best = a.packageId;
  });
  if (!best) return {eligible: false, lower: null};
  return {eligible: true, lower: PACKAGE_RANK[best] >= mine ? null : best};
}

/**
 * The coupon id for a sibling decision. The plain coupon (`base`, 20%) when
 * the discount is 20% of the membership being paid; otherwise the coupon
 * that takes 20% of the LOWER membership off the dearer one, named
 * `<base>_<lower>_<this>` (SIBLING20_6_ELITE ...), a percent coupon created
 * in Stripe for each pair so a prorated first month scales with it.
 * @param {?string} base STRIPE_SIBLING_COUPON.
 * @param {?string} lower The cheaper paid sibling's package id, or null.
 * @param {?string} packageId The package being paid for.
 * @return {?string} The coupon id, or null when none is configured.
 */
function siblingCouponId(base, lower, packageId) {
  if (!base) return null;
  if (!lower) return base;
  return `${base}_${PACKAGE_LABEL[lower]}_${PACKAGE_LABEL[packageId]}`;
}

/**
 * The household's athlete docs, each with its id, for the family facility
 * checks (facility.js householdFacility).
 * @param {!Object} store Firestore.
 * @param {?string} householdId The family.
 * @return {!Promise<!Array<!Object>>} `[{id, ...data}]`.
 */
async function householdAthletes(store, householdId) {
  if (!householdId) return [];
  const snap = await store.collection('athletes')
      .where('householdId', '==', householdId).get();
  return snap.docs.map((doc) => Object.assign({id: doc.id}, doc.data()));
}

/**
 * Two taps on Pay now (two tabs, a stalled return) used to open two
 * Checkout Sessions, and a family that paid both got two subscriptions
 * (the webhook keeps the first and flags the second for a refund; QA S9,
 * 2026-09-30). The open session is reused while it is for the same price
 * AND the same discount decision; one for a different price (the family
 * changed package) or discount (a sibling was added or lapsed since) is
 * expired first.
 * @param {!Object} client Stripe.
 * @param {!Object} athlete The athlete doc.
 * @param {string} product 'tier' | 'facility'.
 * @param {string} priceId What this checkout would charge.
 * @param {string} discount `discountKey`'s value for this checkout.
 * @return {!Promise<?string>} The open session's url, or null.
 */
async function reuseOpenSession(client, athlete, product, priceId, discount) {
  const pending = athlete.pendingCheckout && athlete.pendingCheckout[product];
  if (!pending || !pending.sessionId) return null;
  let s;
  try {
    s = await client.checkout.sessions.retrieve(pending.sessionId);
  } catch (err) {
    return null;
  }
  if (s.status !== 'open' || !s.url) return null;
  const sameDeal = pending.priceId === priceId &&
      (pending.discount || 'none') === discount;
  if (sameDeal) return s.url;
  try {
    await client.checkout.sessions.expire(s.id);
  } catch (err) {
    // It expires on its own within 24 h; the new one is the live offer.
  }
  return null;
}

/**
 * What the sibling decision means for the Stripe page, for comparing a
 * remembered session with what this checkout would build.
 * @param {{eligible: boolean, coupon: ?string}} sibling The decision.
 * @return {string} 'none' | 'code' | the coupon id.
 */
function discountKey(sibling) {
  if (!sibling.eligible) return 'none';
  return sibling.coupon || 'code';
}

/**
 * Stripe refused the coupon: missing in this mode (coupons are made by
 * hand, once per mode), expired, fully redeemed, or not applicable. The
 * family gets the code field instead of a refusal, and the log says why.
 * @param {*} err What `sessions.create` threw.
 * @return {boolean} Whether to retry without the coupon.
 */
function couponRefused(err) {
  return Boolean(err) && String(err.param || '').startsWith('discounts');
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

const billDay = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', timeZone: lib.TZ,
});

/**
 * The sentence beside the pay button. Stripe renders `trial_end` as "N days
 * free" and testers read that as a trial of the academy (2026-09-30); this
 * says what today's charge is for and when the next one happens.
 * @param {!Object} p `prepaidFor`'s result.
 * @return {string} `custom_text.submit.message` (Stripe's limit is 1200).
 */
function trialNote(p) {
  const covers = p.prorated ? `the rest of ${p.label}` : `${p.label} in full`;
  return `Today's charge covers ${covers}. Stripe calls the time until ` +
      'monthly billing starts on ' +
      `${billDay.format(new Date(p.trialEnd * 1000))} a free trial - ` +
      'nothing else is charged before then.';
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
    custom_text: {submit: {message: trialNote(a.prepaid)}},
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
  // with no subscription) is not a subscription: buying again is allowed
  // (`live`, above).
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
  // (payment-mode checkout below), sold from the day booking opens until 30
  // minutes before the season cutoff so Stripe still accepts the session's
  // expiry.
  const singlePkg = athlete.packageId === single.SINGLE_ID ||
      Boolean(pkg && pkg.kind === single.SINGLE_ID);
  const isSingle = req.product === 'tier' && singlePkg;
  // Owner ruling 2026-10-01: single tokens go on sale when booking opens
  // (single.saleOpen, the lib.bookingOpen gate - Sat, Oct 10, 2026 at
  // 7:00 AM Chicago). Clock-based, so this ships before that day; refused
  // here, before any Stripe call.
  if (isSingle && !single.saleOpen(nowMs)) {
    throw refuse('failed-precondition', 'single-not-open',
        'Single tokens are available from Sat, Oct 10 at 7 AM. ' +
        NOTHING_CHARGED);
  }
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
    // Owner ruling 2026-09-30: the add-on is one per FAMILY and a live
    // Elite membership covers the family. It still bills on this athlete.
    const family = facility.householdFacility(
        await householdAthletes(store, athlete.householdId));
    if (family.holderId && family.holderId !== req.athleteId) {
      throw refuse('failed-precondition', 'family-has-facility',
          'Your family already has facility access.');
    }
    if (family.eliteId) {
      throw refuse('failed-precondition', 'elite-includes-facility',
          'Elite already includes facility access for your family.');
    }
    // An Elite athlete still to pay (review 2026-09-30): selling the add-on
    // now would leave the family paying for both once Elite is paid.
    if (family.eliteDueId) {
      throw refuse('failed-precondition', 'elite-includes-facility',
          'Elite includes facility access for your family. ' +
          'Pay for the Elite membership first.');
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
  // The add-on is not a membership: no sibling discount on it. Nor is the
  // single token: it never earns the discount, and siblingEligible never
  // counts it toward a sibling's. The lookup is optional, so a failed read
  // costs the family the discount, never the checkout.
  const base = String(process.env.STRIPE_SIBLING_COUPON || '').trim() || null;
  const sibling = {eligible: false, coupon: base, lower: null};
  if (req.product === 'tier' && !isSingle) {
    try {
      const found = await siblingEligible(store, athlete.householdId,
          req.athleteId, athlete.packageId);
      sibling.eligible = found.eligible;
      sibling.lower = found.lower;
      sibling.coupon = siblingCouponId(base, found.lower, athlete.packageId);
    } catch (err) {
      console.error('siblingEligible failed, no discount:', err);
    }
  }
  let client;
  let price;
  let discount = discountKey(sibling);
  try {
    client = d.stripe || stripe();
    const open = await reuseOpenSession(client, athlete, req.product,
        priceId, discount);
    if (open) return {url: open};
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
    let session;
    if (isSingle) {
      // One-time payment: no prepaid month, no trial, no discount.
      session = await client.checkout.sessions.create(singleSessionBody(
          Object.assign({athleteName: athlete.name || null, nowMs}, common)));
    } else {
      const args = Object.assign({
        product: req.product,
        packageId: athlete.packageId || null,
        currency: price.currency || 'usd',
        productName: req.product === 'facility' ? FACILITY_NAME :
            (pkg && pkg.name) || athlete.packageId,
        prepaid: prepaidFor(nowMs, {priceCents: price.unit_amount, tokens}),
        sibling,
      }, common);
      try {
        session = await client.checkout.sessions.create(sessionBody(args));
      } catch (err) {
        if (!(sibling.eligible && sibling.coupon && couponRefused(err))) {
          throw err;
        }
        console.error(`sibling coupon ${sibling.coupon} refused by Stripe ` +
            `(${process.env.STRIPE_MODE || 'test'} mode): ` +
            `${err.message || err}; code field used instead`);
        // The code field takes the plain 20% code, which is only right when
        // 20% of THIS membership is owed; a pair coupon that is missing
        // means no discount on this page rather than too large a one.
        const fallback = {eligible: !sibling.lower, coupon: null};
        discount = discountKey(fallback);
        session = await client.checkout.sessions.create(sessionBody(
            Object.assign({}, args, {sibling: fallback})));
      }
    }
    // Remembered so a second Pay now reuses it (reuseOpenSession). A failed
    // write only loses that protection, never the checkout.
    try {
      await store.collection('athletes').doc(req.athleteId).set({
        pendingCheckout: {[req.product]: {sessionId: session.id, priceId,
          discount, createdAt: new Date(nowMs).toISOString()}},
      }, {merge: true});
    } catch (err) {
      console.error('pendingCheckout write failed:', err);
    }
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
  prepaidFor, priceMismatch, sessionBody, siblingCouponId, siblingEligible,
  singleSessionBody,
};
