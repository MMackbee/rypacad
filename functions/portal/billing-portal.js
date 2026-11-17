/**
 * openBillingPortal - "Manage billing in Stripe" on the Billing screen
 * (owner 2026-11-17: parents said the button was broken;
 * docs/portal/plans/2026-11-17-billing-portal/00-note.md).
 *
 * The button used to open Stripe's no-code customer portal LOGIN link
 * (REACT_APP_STRIPE_PORTAL_URL): Stripe asks for an email and mails a
 * sign-in link, so a different address or a spam folder meant nothing
 * happened. This callable signs the family straight in instead: it makes a
 * Stripe customer portal SESSION for the household's own customer and
 * returns its one-time url.
 *
 *   in   {returnPath?: string, athleteId?: string}  (only
 *        '/portal/billing' is honoured as the return path)
 *   out  {url}
 *
 * Who: the logins that manage a household's billing today - the parent of
 * the household (`users.role 'parent'`, its `householdId`), or the 18+
 * athlete who signed up for themselves (`users.role 'athlete'` whose own
 * athlete's household has `createdBy` == their uid). That is the payer
 * test of firestore.rules' package-change branch (athletes/{id} update) and
 * of the Billing route (PortalRoutes BillingRoute, useAuthSession
 * resolveSelfManaged). A child's claimed login and every staff role are
 * refused 'not-payer': staff read the Stripe ids on the family page. The
 * household always comes from the caller's own records, never the payload.
 * A password login whose email is not verified is refused
 * 'email-unverified', as createCheckoutSession refuses it (review SEC-1):
 * the old sign-in link proved the caller held the customer's inbox, and a
 * signed-in session must not skip that proof.
 *
 * The customer (billing-portal-customer.js): every Stripe customer the
 * household holds - its `stripeCustomerId` and `stripeCustomerIds`, and its
 * athletes' `billing.customerId` / `facilityBilling.customerId`. One ->
 * that one; several -> the payload's `athleteId` (one of THIS household's
 * athletes) picks its own, else 'several-customers'; none ->
 * 'no-customer'. Stripe sends the family back to an allowlisted
 * origin + '/portal/billing': the request's Origin header when it is
 * production or staging (localhost:3005 under the Functions emulator only),
 * else production. A client-supplied url is never used.
 *
 * Rate limit: 10 opens per login per rolling 10 minutes, kept in
 * `billingPortalLimits/{uid}` ({openedAtMs: number[], updatedAtMs}) inside
 * a transaction, taken just before the Stripe call. Admin SDK only;
 * firestore.rules closes the collection to every client.
 *
 * Stripe: STRIPE_SECRET_KEY (CHECKOUT_SECRETS). The handler makes one
 * create; the SDK gives up after 10 s and retries a network failure at
 * most once (STRIPE_OPTIONS), inside a 30 s function, so the refusal and
 * its log line land before the platform deadline (review F5). What Stripe
 * says, in the family's words:
 *   'portal-not-set-up'  no customer portal saved in this Stripe mode
 *                        (Dashboard > Settings > Billing > Customer
 *                        portal), or a key that may not make portal
 *                        sessions: a restricted key without "Customer
 *                        portal: Write", or a revoked key (review F1)
 *   'customer-missing'   Stripe has no such customer in this mode (review
 *                        F4): deleted, or a test-mode id under a live key
 *   'stripe-error'       anything else, worth another try
 * Every call logs ONE line, ok or error with its reason and Stripe's error
 * type; never the session url, never more of the customer id than its
 * last 4 characters.
 */
'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const {CHECKOUT_SECRETS} = require('./secrets');
const {customerFor} = require('./billing-portal-customer');

const {HttpsError} = functions.https;

const PRODUCTION_ORIGIN = 'https://portal.rypacademy.com';
/** Origins Stripe may send a family back to. @const {!Array<string>} */
const ORIGINS = [PRODUCTION_ORIGIN, 'https://rypacad.ryptest.com'];
/** The local dev server, under the Functions emulator only. */
const EMULATOR_ORIGINS = ['http://localhost:3005', 'http://127.0.0.1:3005'];
/** Paths Stripe may send a family back to; the first is the default. */
const RETURN_PATHS = ['/portal/billing'];
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const LIMITS = 'billingPortalLimits';
/** The function's deadline: room for both SDK attempts and the log line. */
const TIMEOUT_SECONDS = 30;
/** The Stripe client: give up after 10 s, retry a network failure once. */
const STRIPE_OPTIONS = Object.freeze({timeout: 10000, maxNetworkRetries: 1});

const COPY = {
  'signed-out': 'Sign in to manage billing.',
  'bad-request': 'That request could not be read. Refresh the page and ' +
      'try again.',
  'email-unverified': 'Verify your email to manage billing in Stripe.',
  'not-payer': 'Only the account that pays for this family can manage its ' +
      'billing in Stripe.',
  'no-customer': 'There is no billing in Stripe for this family yet. It ' +
      'starts with the first payment.',
  'several-customers': 'Your family\'s billing is on more than one Stripe ' +
      'account. Contact the academy to update your card.',
  'customer-missing': 'Your billing record in Stripe could not be found. ' +
      'Contact the academy.',
  'rate-limited': 'Stripe was opened several times in the last few ' +
      'minutes. Try again in a few minutes.',
  'portal-not-set-up': 'Managing billing in Stripe is not switched on yet. ' +
      'Contact the academy to update your card.',
  'stripe-error': 'Couldn\'t open Stripe right now. Try again, or contact ' +
      'the academy.',
  'unavailable': 'Couldn\'t open Stripe right now. Try again, or contact ' +
      'the academy.',
};

let stripeClient;

/**
 * @param {string} key A Stripe secret key.
 * @return {!Object} A Stripe client with STRIPE_OPTIONS (no request made).
 */
function makeStripe(key) {
  return new Stripe(key, Object.assign({}, STRIPE_OPTIONS));
}

/** @return {!Object} The Stripe client, from STRIPE_SECRET_KEY. */
function stripe() {
  if (!stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    stripeClient = makeStripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

/** @return {!Object} The admin Firestore. */
function db() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

/**
 * @param {string} code An HttpsError code.
 * @param {string} reason The stable `details.reason` (a COPY key).
 * @return {!HttpsError} The refusal, in COPY's words.
 */
function refuse(code, reason) {
  return new HttpsError(code, COPY[reason], {reason});
}

/**
 * @param {!Object} store Firestore.
 * @param {string} collection The collection.
 * @param {*} id The id; anything but a non-empty string reads nothing.
 * @return {!Promise<?Object>} The body, or null.
 */
async function read(store, collection, id) {
  if (typeof id !== 'string' || !id) return null;
  const snap = await store.collection(collection).doc(id).get();
  return snap.exists ? snap.data() || {} : null;
}

/**
 * The household this login pays for, or a 'not-payer' refusal: a parent's
 * own household, or the household an athlete login created for itself.
 * @param {!Object} store Firestore.
 * @param {string} uid The caller.
 * @return {!Promise<{id: string, household: !Object}>} The household.
 */
async function payerHousehold(store, uid) {
  const me = await read(store, 'users', uid);
  if (me && me.role === 'parent') {
    const household = await read(store, 'households', me.householdId);
    if (household) return {id: me.householdId, household};
  }
  if (me && me.role === 'athlete') {
    const athlete = await read(store, 'athletes', me.athleteId);
    const id = athlete && athlete.householdId;
    const household = await read(store, 'households', id);
    if (household && household.createdBy === uid) return {id, household};
  }
  throw refuse('permission-denied', 'not-payer');
}

/**
 * Where Stripe sends the family back: an allowlisted origin plus the
 * Billing path. The Origin header is matched exactly; anything else,
 * including no header, is production.
 * @param {!Object} context The callable context.
 * @param {!Object} env The environment (process.env in production).
 * @return {string} The return_url.
 */
function returnUrl(context, env) {
  const raw = context && context.rawRequest;
  const headers = raw && raw.headers ? raw.headers : {};
  const origin = typeof headers.origin === 'string' ? headers.origin : '';
  const allowed = env.FUNCTIONS_EMULATOR ?
      ORIGINS.concat(EMULATOR_ORIGINS) : ORIGINS;
  const base = allowed.includes(origin) ? origin : PRODUCTION_ORIGIN;
  return base + RETURN_PATHS[0];
}

/**
 * The opens that still count against the limit (feedback.js recentSends:
 * no upper bound, so a later-stamped parallel open still counts).
 * @param {?Object} data A billingPortalLimits doc's data.
 * @param {number} nowMs The clock.
 * @return {!Array<number>} Its opens inside the window, or later.
 */
function recentOpens(data, nowMs) {
  const opened = data && Array.isArray(data.openedAtMs) ? data.openedAtMs :
      [];
  return opened.filter((t) => typeof t === 'number' &&
      t > nowMs - RATE_WINDOW_MS);
}

/**
 * Takes one of the caller's ten opens in this window, or refuses.
 * @param {!Object} store Firestore.
 * @param {string} uid The caller.
 * @param {number} nowMs The clock.
 * @return {!Promise<void>} Resolves once the open is recorded.
 */
async function takeSlot(store, uid, nowMs) {
  const ref = store.collection(LIMITS).doc(uid);
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const opened = recentOpens(snap.exists ? snap.data() : null, nowMs);
    if (opened.length >= RATE_LIMIT) {
      throw refuse('resource-exhausted', 'rate-limited');
    }
    tx.set(ref, {openedAtMs: opened.concat([nowMs]), updatedAtMs: nowMs});
  });
}

/**
 * Stripe's refusal when no customer portal configuration is saved in this
 * mode ("...your live mode default configuration has not been created").
 * @param {*} err What the SDK threw.
 * @return {boolean} True for that refusal.
 */
function portalNotSetUp(err) {
  return Boolean(err) && err.type === 'StripeInvalidRequestError' &&
      /default configuration/i.test(String(err.message || ''));
}

/**
 * What a failed create tells the family (the header's table). Retrying
 * helps only 'stripe-error'.
 * @param {*} err What the SDK threw.
 * @return {!HttpsError} The refusal.
 */
function stripeRefusal(err) {
  const type = err && err.type;
  if (portalNotSetUp(err) || type === 'StripePermissionError' ||
      type === 'StripeAuthenticationError') {
    return refuse('failed-precondition', 'portal-not-set-up');
  }
  if (type === 'StripeInvalidRequestError' &&
      err.code === 'resource_missing' && (err.param === 'customer' ||
      /no such customer/i.test(String(err.message || '')))) {
    return refuse('failed-precondition', 'customer-missing');
  }
  return refuse('unavailable', 'stripe-error');
}

/**
 * The checks, then the one Stripe call. `who` collects what the log line
 * may say as it becomes known.
 * @param {*} data The payload.
 * @param {!Object} context The callable context.
 * @param {!Object} d The deps.
 * @param {!Object} who `{uid, household, customer, stripe}`, filled in.
 * @return {!Promise<{url: string}>} The portal session's url.
 */
async function openPortal(data, context, d, who) {
  const auth = context && context.auth;
  if (!auth || !auth.uid) throw refuse('unauthenticated', 'signed-out');
  who.uid = auth.uid;
  // As createCheckoutSession (checkout.js): a password login has proved
  // its inbox before it reaches the payer's billing.
  const token = auth.token || {};
  const provider = token.firebase && token.firebase.sign_in_provider;
  if (provider === 'password' && token.email_verified !== true) {
    throw refuse('failed-precondition', 'email-unverified');
  }
  const req = data == null ? {} : data;
  if (typeof req !== 'object' || (req.returnPath != null &&
      typeof req.returnPath !== 'string') || (req.athleteId != null &&
      (typeof req.athleteId !== 'string' || !req.athleteId))) {
    throw refuse('invalid-argument', 'bad-request');
  }
  const env = d.env || process.env;
  const store = d.db || db();
  const now = d.now instanceof Date ? d.now : new Date();
  const {id, household} = await payerHousehold(store, auth.uid);
  who.household = id;
  const picked = await customerFor(store, {id, household,
    athleteId: req.athleteId == null ? null : req.athleteId});
  if (!picked.customer) throw refuse(picked.code, picked.reason);
  const customer = picked.customer;
  who.customer = customer.slice(-4);
  await takeSlot(store, auth.uid, now.getTime());
  let session;
  try {
    const client = d.stripe || stripe();
    session = await client.billingPortal.sessions.create({customer,
      return_url: returnUrl(context, env)});
  } catch (err) {
    who.stripe = [err && err.type, err && err.code].filter(Boolean)
        .join('/') || (err && err.name) || 'error';
    throw stripeRefusal(err);
  }
  const url = session && typeof session.url === 'string' ? session.url : '';
  if (!url.startsWith('https://')) {
    who.stripe = 'no-url';
    throw refuse('unavailable', 'stripe-error');
  }
  return {url};
}

/**
 * The callable's body, exported so the unit tests can call it in-process.
 * @param {*} data `{returnPath?, athleteId?}`.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), stripe: (!Object|undefined),
 *     env: (!Object|undefined), now: (!Date|undefined)}=} deps Test seams.
 * @return {!Promise<{url: string}>} Where the browser goes.
 */
async function openBillingPortalHandler(data, context, deps) {
  const who = {uid: '-', household: '-', customer: '', stripe: ''};
  const tags = () => `uid=${who.uid} household=${who.household}` +
      (who.customer ? ` customer=...${who.customer}` : '');
  try {
    const out = await openPortal(data, context, deps || {}, who);
    console.log(`openBillingPortal: ok ${tags()}`);
    return out;
  } catch (err) {
    const known = err instanceof HttpsError;
    const reason = known && err.details && err.details.reason ?
        err.details.reason : 'unavailable';
    console.error(`openBillingPortal: error ${tags()} reason=${reason}` +
        (who.stripe ? ` stripe=${who.stripe}` : '') +
        (known ? '' : ` cause=${(err && err.name) || 'error'}`));
    if (known) throw err;
    throw refuse('unavailable', 'unavailable');
  }
}

/**
 * The callable. Binds STRIPE_SECRET_KEY, as createCheckoutSession does, and
 * ends at TIMEOUT_SECONDS, as door.js's unlockDoor sets its own.
 */
const openBillingPortal = functions.runWith({secrets: CHECKOUT_SECRETS,
  timeoutSeconds: TIMEOUT_SECONDS})
    .https.onCall((data, context) => openBillingPortalHandler(data,
        context));

module.exports = {
  ORIGINS, RATE_LIMIT, RATE_WINDOW_MS, RETURN_PATHS, STRIPE_OPTIONS,
  makeStripe, openBillingPortal, openBillingPortalHandler,
};
