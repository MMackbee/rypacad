/**
 * Family facility access (owner ruling 2026-09-30): the $300/month add-on
 * is ONE per household and covers every athlete in it; a live Elite
 * membership covers the household too. Billing stays on one athlete, the
 * holder (`facilityBilling`, written by stripe.js) - nothing here changes
 * that. Pure: checkout.js and family.js read the athletes and ask here.
 * Kept in step by hand with `frontend/src/portal/data/facility.js`.
 */
'use strict';

/** The monthly token packages - the only ones the add-on goes with. */
const ADD_ON_PACKAGES = ['t-6', 't-12', 't-16'];
const ELITE_ID = 'elite';

/**
 * @param {?Object} b A `billing` or `facilityBilling` map.
 * @return {boolean} Whether a subscription exists (paid, or retrying).
 */
function live(b) {
  return Boolean(b) && (b.status === 'active' || b.status === 'past_due');
}

/**
 * Whether a household has facility access, and why. An add-on counts while
 * its subscription is live (active or past_due); Elite while its membership
 * is (active or past_due, or no `billing` map on a legacy athlete).
 * @param {?Array<?Object>} athletes The household's athlete docs, each with
 *     its `id`.
 * @return {{access: boolean, source: ?string, holderId: ?string,
 *     eliteId: ?string, eliteDueId: ?string}} `source` is 'elite' | 'add-on'
 *     | null (Elite wins when both are true); `holderId` is the athlete the
 *     add-on bills on. `eliteDueId` is an Elite athlete still to pay: no
 *     access yet, but the add-on is not sold to a family about to have it.
 */
function householdFacility(athletes) {
  const list = (athletes || []).filter(Boolean);
  const holder = list.find((a) => live(a.facilityBilling));
  const elite = list.find((a) => a.packageId === ELITE_ID &&
      (!a.billing || live(a.billing)));
  const due = list.find((a) => a.packageId === ELITE_ID &&
      Boolean(a.billing) && a.billing.status === 'pending');
  return {
    access: Boolean(holder || elite),
    source: elite ? 'elite' : holder ? 'add-on' : null,
    holderId: holder ? holder.id || null : null,
    eliteId: elite ? elite.id || null : null,
    eliteDueId: due ? due.id || null : null,
  };
}

/**
 * A sign-up or add-athlete submission with at most ONE `facilityRequested`
 * left true: the first ticked athlete on a monthly token package. Nobody
 * keeps it when the submission holds an Elite athlete, or when the
 * household already there (add-athlete) has an Elite athlete whose
 * membership has not ended, a request, or a live add-on. Coerced, never
 * refused: a tab still on the per-athlete bundle must finish sign-up.
 * @param {!Array<!Object>} athletes Normalized entries (family-validate).
 * @param {?Array<?Object>=} existing The household's athlete docs.
 * @return {!Array<!Object>} Copies, in order.
 */
function oneFacilityRequest(athletes, existing) {
  const there = (existing || []).filter(Boolean);
  const blocked = athletes.some((a) => a.packageId === ELITE_ID) ||
      there.some((a) => live(a.facilityBilling) ||
          a.facilityRequested === true ||
          (a.packageId === ELITE_ID &&
              !(a.billing && a.billing.status === 'lapsed')));
  const keep = blocked ? -1 : athletes.findIndex((a) =>
    a.facilityRequested === true && ADD_ON_PACKAGES.includes(a.packageId));
  return athletes.map((a, i) =>
    Object.assign({}, a, {facilityRequested: i === keep}));
}

module.exports = {ADD_ON_PACKAGES, householdFacility, oneFacilityRequest};
