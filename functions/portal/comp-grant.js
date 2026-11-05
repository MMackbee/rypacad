/**
 * Owner-set complimentary memberships, applied at sign-up (owner 2026-11-05:
 * the Ollhoff family - "make it so that the database is ready to comp
 * anything under his account", so nobody has to run a script after the
 * family signs up).
 *
 * `compGrants/{email}` (lower-cased login email) is written only by the
 * owner's scripts/comp-grant.mjs (Admin REST); the rules match no such
 * path, so no client can read or write it. createFamily and addAthletes
 * (family.js) read it inside their transaction: an athlete created on a
 * monthly package (token packages or Elite, never the one-time single
 * token) under a live grant gets the same billing map as
 * scripts/comp-membership.mjs writes - status 'active', every Stripe id
 * null, comp true - except `linkedBy: 'comp-grant'`. Everything downstream
 * then behaves as for that script: every booking gate passes, a checkout
 * is refused as already paid, no webhook can find the athlete, and nothing
 * ends the comp (compUntil is a record; the season-end work ends it).
 *
 * A grant is live when it is not revoked, `until` (Chicago 'YYYY-MM-DD') is
 * today or later, and its `uid` - when the login existed at grant time - is
 * the caller's. A grant with no uid (written before the login existed) needs
 * the caller's email verified, so nobody else can take it by signing up
 * with that address first (review 2026-11-05).
 */
'use strict';

const COLLECTION = 'compGrants';
const SINGLE = 'single';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The caller's live grant, or null. A transaction read: call it before
 * the transaction's first write.
 * @param {!Object} tx The transaction.
 * @param {!Object} store Firestore.
 * @param {{uid: string, email: ?string, emailVerified: (boolean|undefined),
 *     todayISO: string}} who The caller (token.email, token.email_verified).
 * @return {!Promise<?{email: string, until: string, note: ?string,
 *     packages: ?Array<string>}>} The grant, or null.
 */
async function readGrant(tx, store, who) {
  const email = typeof who.email === 'string' ? who.email.trim().toLowerCase() :
      '';
  if (!email) return null;
  const snap = await tx.get(store.collection(COLLECTION).doc(email));
  if (!snap.exists) return null;
  const g = snap.data() || {};
  if (g.revoked === true) return null;
  if (g.uid && g.uid !== who.uid) {
    // A recreated login: the owner re-runs scripts/comp-grant.mjs to rebind.
    console.warn(`comp grant for ${email} is bound to another login; ` +
        'not applied');
    return null;
  }
  if (!g.uid && who.emailVerified !== true) return null;
  if (typeof g.until !== 'string' || !DATE_RE.test(g.until) ||
      g.until < who.todayISO) {
    return null;
  }
  return {
    email,
    until: g.until,
    note: typeof g.note === 'string' && g.note ? g.note : null,
    packages: Array.isArray(g.packages) ? g.packages.slice() : null,
  };
}

/**
 * Whether a grant comps an athlete on this package.
 * @param {?Object} grant `readGrant`'s result.
 * @param {?string} packageId The athlete's package.
 * @return {boolean} True for a monthly package the grant names (or any
 *     monthly package when it names none).
 */
function covers(grant, packageId) {
  return Boolean(grant) && typeof packageId === 'string' &&
      packageId !== SINGLE &&
      (grant.packages === null || grant.packages.includes(packageId));
}

/**
 * The comped billing map (scripts/comp-membership.mjs's shape).
 * @param {!Object} grant `readGrant`'s result.
 * @param {*} at The write time (a server timestamp).
 * @return {!Object} The `billing` map.
 */
function compBilling(grant, at) {
  return {
    status: 'active', oneTime: false, customerId: null, subscriptionId: null,
    priceId: null, checkoutSessionId: null, comp: true,
    compUntil: grant.until, compNote: grant.note, linkedBy: 'comp-grant',
    updatedAt: at,
  };
}

module.exports = {COLLECTION, readGrant, covers, compBilling};
