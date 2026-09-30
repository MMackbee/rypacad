/**
 * The ONE source of Stripe price ids (spec 4.1), keyed by STRIPE_MODE. The
 * JSON lives at functions/config/stripe-catalogue.json because
 * `firebase deploy` packages only this folder (contract 6.5, decision D3);
 * scripts/write-packages.mjs reads the same file.
 */
'use strict';

/** The add-on's key in the JSON (no `packages` doc). @const {string} */
const FACILITY_KEY = 'facility-access';

/** @return {!Object} `{test: {...}, live: {...}}`. */
function loadCatalogue() {
  return require('../config/stripe-catalogue.json');
}

/** @return {string} `'live'` only when STRIPE_MODE is exactly 'live'. */
function stripeMode() {
  return process.env.STRIPE_MODE === 'live' ? 'live' : 'test';
}

/**
 * @param {string} key A package id or FACILITY_KEY.
 * @param {!Object=} cat The catalogue (injectable for tests).
 * @return {?string} The Stripe price id for the current mode, or null.
 */
function priceIdFor(key, cat) {
  const map = (cat || loadCatalogue())[stripeMode()] || {};
  return map[key] || null;
}

/**
 * @param {?string} priceId A Stripe price id.
 * @param {!Object=} cat The catalogue (injectable for tests).
 * @return {?string} The package id it maps to in the current mode; the
 *     facility price maps to null (it is not a package).
 */
function packageIdForPrice(priceId, cat) {
  if (!priceId) return null;
  const map = (cat || loadCatalogue())[stripeMode()] || {};
  for (const [k, v] of Object.entries(map)) {
    if (v && v === priceId && k !== FACILITY_KEY) return k;
  }
  return null;
}

/**
 * Price ids a key USED to have in the current mode, still accepted by the
 * webhook after a price rotation (a Checkout opened before the swap can
 * complete after it). The optional top-level block is
 * `{retired: {test: {single: [...]}, live: {single: [...]}}}` - kept out of
 * the mode blocks because scripts/write-packages.mjs refuses any mode key
 * that is not a package.
 * @param {string} key A package id (today only 'single').
 * @param {!Object=} cat The catalogue (injectable for tests).
 * @return {!Array<string>} The retired ids, or [] when none are listed.
 */
function retiredPriceIdsFor(key, cat) {
  const retired = (cat || loadCatalogue()).retired;
  const list = retired && retired[stripeMode()] &&
      retired[stripeMode()][key];
  return Array.isArray(list) ?
      list.filter((id) => typeof id === 'string' && id !== '') : [];
}

module.exports = {
  FACILITY_KEY, loadCatalogue, packageIdForPrice, priceIdFor,
  retiredPriceIdsFor, stripeMode,
};
