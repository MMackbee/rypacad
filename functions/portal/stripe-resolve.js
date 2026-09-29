/**
 * Basil-safe accessors and the subject resolution order (spec 4.3). Reads
 * BOTH the pre-Basil shapes (`invoice.subscription`,
 * `subscription.current_period_*`) and the 2025-07-30.basil ones
 * (`invoice.parent.subscription_details.*`, `items.data[0].current_period_*`).
 * `resolveSubject` runs BEFORE the webhook's transaction: it may call Stripe.
 */
'use strict';

const lib = require('./lib');

/** Thrown when Stripe itself failed during resolution. */
class StripeLookupError extends Error {
  /** @param {!Error} cause The Stripe error. */
  constructor(cause) {
    super(`stripe lookup failed: ${cause && cause.message}`);
    this.code = 'stripe-lookup-failed';
    this.cause = cause;
  }
}

/**
 * @param {*} v A Stripe id or expanded object.
 * @return {?string} The id.
 */
function idOf(v) {
  if (!v) return null;
  return typeof v === 'string' ? v : (v.id || null);
}

/**
 * @param {!Object} invoice `event.data.object`.
 * @return {?string} The subscription id.
 */
function subscriptionIdOf(invoice) {
  const inv = invoice || {};
  const basil = inv.parent && inv.parent.subscription_details;
  return idOf(inv.subscription) || idOf(basil && basil.subscription) || null;
}

/**
 * @param {!Object} subscription A subscription object.
 * @return {{start: ?string, end: ?string}} Chicago calendar dates.
 */
function periodOf(subscription) {
  const s = subscription || {};
  const item = (s.items && s.items.data && s.items.data[0]) || {};
  const start = s.current_period_start !== undefined ?
      s.current_period_start : item.current_period_start;
  const end = s.current_period_end !== undefined ?
      s.current_period_end : item.current_period_end;
  return {start: lib.chicagoDateFromUnix(start),
    end: lib.chicagoDateFromUnix(end)};
}

/**
 * @param {!Object} subscription A subscription.
 * @return {?string} The price id.
 */
function priceIdOf(subscription) {
  const s = subscription || {};
  const item = (s.items && s.items.data && s.items.data[0]) || {};
  return (item.price && item.price.id) || (s.plan && s.plan.id) || null;
}

/**
 * Subscription metadata from a subscription OR an invoice (Basil carries it
 * under `parent.subscription_details.metadata`). A real Invoice always has
 * its OWN top-level `metadata` - `{}`, never filled from
 * `subscription_data.metadata` - so an invoice reads only the subscription
 * snapshot, and an empty map counts as absent.
 * @param {!Object} object `event.data.object`.
 * @return {!Object} The metadata map, possibly empty.
 */
function metadataOf(object) {
  const o = object || {};
  const pick = (m) => (m && Object.keys(m).length ? m : null);
  const basil = o.parent && o.parent.subscription_details;
  const legacy = o.subscription_details;
  return pick(basil && basil.metadata) || pick(legacy && legacy.metadata) ||
      (o.object === 'invoice' ? null : pick(o.metadata)) || {};
}

/**
 * @param {?string} ref `client_reference_id`, `${hh}__${ath}__${product}`.
 * @return {?{householdId: string, athleteId: string, product: string}}
 */
function parseClientReference(ref) {
  const parts = String(ref || '').split('__');
  if (parts.length !== 3 || !parts[0] || !parts[1]) return null;
  if (parts[2] !== 'tier' && parts[2] !== 'facility') return null;
  return {householdId: parts[0], athleteId: parts[1], product: parts[2]};
}

/**
 * @param {!Object} db Firestore.
 * @param {string} field The dotted field.
 * @param {string} subId The subscription id.
 * @return {!Promise<?{id: string, data: !Object}>} The first athlete.
 */
async function athleteBy(db, field, subId) {
  const snap = await db.collection('athletes').where(field, '==', subId)
      .limit(1).get();
  if (snap.empty) return null;
  return {id: snap.docs[0].id, data: snap.docs[0].data() || {}};
}

/**
 * Who an event is about, in the spec's order: metadata -> billing sub ->
 * facility sub -> stripeCustomerId -> stripeCustomerIds -> the Checkout
 * Session's client_reference_id (a Stripe read).
 * @param {!Object} event The Stripe event.
 * @param {{db: !Object, stripe: !Object}} deps Firestore and Stripe.
 * @return {!Promise<?{householdId: string, athleteId: ?string,
 *     product: ?string, packageId: ?string, via: string}>} Or null.
 */
async function resolveSubject(event, deps) {
  const o = (event.data && event.data.object) || {};
  const subId = o.object === 'subscription' ? o.id : subscriptionIdOf(o);
  const customer = idOf(o.customer);
  const meta = metadataOf(o);
  if (meta.householdId && meta.athleteId) {
    return {householdId: meta.householdId, athleteId: meta.athleteId,
      product: meta.product || 'tier', packageId: meta.packageId || null,
      via: 'metadata'};
  }
  if (subId) {
    const a = await athleteBy(deps.db, 'billing.subscriptionId', subId);
    if (a) {
      return {householdId: a.data.householdId, athleteId: a.id,
        product: 'tier', packageId: a.data.packageId || null, via: 'billing'};
    }
    const f = await athleteBy(deps.db, 'facilityBilling.subscriptionId',
        subId);
    if (f) {
      return {householdId: f.data.householdId, athleteId: f.id,
        product: 'facility', packageId: null, via: 'facility'};
    }
  }
  if (customer) {
    const hh = lib.householdFromSnap(
        await lib.householdByCustomerQuery(deps.db, customer).get());
    if (hh) {
      return {householdId: hh.id, athleteId: null, product: null,
        packageId: null, via: 'customer'};
    }
    const many = await deps.db.collection('households')
        .where('stripeCustomerIds', 'array-contains', customer).limit(1).get();
    if (!many.empty) {
      return {householdId: many.docs[0].id, athleteId: null, product: null,
        packageId: null, via: 'customer-ids'};
    }
  }
  if (!subId) return null;
  let sessions;
  try {
    sessions = await deps.stripe.checkout.sessions.list(
        {subscription: subId, limit: 1});
  } catch (err) {
    throw new StripeLookupError(err);
  }
  const ref = parseClientReference(sessions.data && sessions.data[0] &&
      sessions.data[0].client_reference_id);
  return ref ? Object.assign(ref, {packageId: null, via: 'checkout-session'}) :
      null;
}

module.exports = {
  StripeLookupError, metadataOf, parseClientReference, periodOf, priceIdOf,
  resolveSubject, subscriptionIdOf,
};
