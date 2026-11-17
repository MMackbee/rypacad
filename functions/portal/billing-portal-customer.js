/**
 * Which Stripe customer "Manage billing in Stripe" opens (openBillingPortal,
 * billing-portal.js; review 2026-11-17 F2/F3).
 *
 * A household can hold more than one Stripe customer. The webhook's
 * linkCustomer (stripe-checkout.js) keeps the FIRST in `stripeCustomerId`
 * and adds every one to `stripeCustomerIds`; a checkout started before the
 * first payment landed (a Checkout tab left open, a second parent's login)
 * makes another, and its subscription bills that one. A family linked by
 * scripts/link-subscription.mjs before 2026-11-17 has its customer on the
 * athlete only (`billing.customerId`). So the candidates are the
 * household's two fields plus each of its athletes' `billing.customerId`
 * and `facilityBilling.customerId`, without repeats:
 *
 *   none     'no-customer' (nothing paid yet)
 *   one      that one
 *   several  the payload's `athleteId` picks that athlete's own customer
 *            (its membership's, else its facility add-on's); without one,
 *            or for an athlete with no customer of its own,
 *            'several-customers' - never one of them silently.
 *
 * An `athleteId` that is not one of the household's athletes is refused
 * 'not-payer' whatever the count. Reads only, through the Admin SDK.
 */
'use strict';

/**
 * @param {*} value A stored id.
 * @return {string} It trimmed, or '' when it is not a string.
 */
function idOf(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {?Object} athlete An athletes doc's data.
 * @return {string} Its membership's customer, else its facility add-on's,
 *     else ''.
 */
function athleteCustomer(athlete) {
  const a = athlete || {};
  return idOf(a.billing && a.billing.customerId) ||
      idOf(a.facilityBilling && a.facilityBilling.customerId);
}

/**
 * @param {!Object} household The households doc's data.
 * @param {!Array<!Object>} athletes Its athletes' data.
 * @return {!Array<string>} Every customer it holds, the primary first, no
 *     repeats.
 */
function householdCustomers(household, athletes) {
  const out = [];
  const add = (value) => {
    const id = idOf(value);
    if (id && !out.includes(id)) out.push(id);
  };
  add(household && household.stripeCustomerId);
  const listed = household && household.stripeCustomerIds;
  if (Array.isArray(listed)) listed.forEach(add);
  for (const a of athletes) {
    add(a && a.billing && a.billing.customerId);
    add(a && a.facilityBilling && a.facilityBilling.customerId);
  }
  return out;
}

/**
 * The rule above, without Firestore.
 * @param {!Object} household The households doc's data.
 * @param {!Array<!Object>} athletes Its athletes, each with its doc `id`.
 * @param {?string} athleteId The payload's athlete, or null.
 * @return {({customer: string}|{code: string, reason: string})} The
 *     customer, or the refusal's HttpsError code and reason.
 */
function pickCustomer(household, athletes, athleteId) {
  let named = null;
  if (athleteId != null) {
    named = athletes.find((a) => a.id === athleteId) || null;
    if (!named) return {code: 'permission-denied', reason: 'not-payer'};
  }
  const all = householdCustomers(household, athletes);
  if (all.length === 0) {
    return {code: 'failed-precondition', reason: 'no-customer'};
  }
  if (all.length === 1) return {customer: all[0]};
  const own = athleteCustomer(named);
  if (own) return {customer: own};
  return {code: 'failed-precondition', reason: 'several-customers'};
}

/**
 * Reads the household's athletes and applies pickCustomer.
 * @param {!Object} store Firestore.
 * @param {{id: string, household: !Object, athleteId: ?string}} args The
 *     caller's own household (never the payload's) and the payload's
 *     athlete.
 * @return {!Promise<({customer: string}|{code: string, reason: string})>}
 *     As pickCustomer.
 */
async function customerFor(store, args) {
  const snap = await store.collection('athletes')
      .where('householdId', '==', args.id).get();
  const athletes = snap.docs.map((doc) =>
    Object.assign({}, doc.data() || {}, {id: doc.id}));
  return pickCustomer(args.household, athletes, args.athleteId);
}

module.exports = {
  athleteCustomer, customerFor, householdCustomers, pickCustomer,
};
