/**
 * Where the phone is, against where the academy is: the "you need to be at
 * the academy" check behind the door button (spec 5.1,
 * docs/portal/plans/2026-11-17-door-button/00-spec.md). Pure.
 *
 * A location is `{lat, lng, accuracy}` in degrees and metres, as the
 * browser's Geolocation API reports it. Nothing here keeps coordinates: the
 * reach answer carries only the distance, rounded to 10 m, and the reported
 * accuracy, the two numbers `doorEvents` may store.
 */
'use strict';

/** The IUGG mean earth radius. @const {number} */
const EARTH_RADIUS_M = 6371008.8;
/** The reported accuracy counts toward reach up to this much. */
const MAX_ACCURACY_ALLOWANCE_M = 150;
/** `doorConfig/main.radiusM` when absent (spec 4). @const {number} */
const DEFAULT_RADIUS_M = 200;
const RADIUS_MIN = 50;
const RADIUS_MAX = 1000;

const rad = (deg) => deg * Math.PI / 180;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * The great-circle distance between two points (haversine).
 * @param {{lat: number, lng: number}} a A point.
 * @param {{lat: number, lng: number}} b Another.
 * @return {number} Metres.
 */
function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The caller's location, checked: finite lat in [-90, 90], lng in
 * [-180, 180] and a finite accuracy of at least 0.
 * @param {*} loc The payload's `location`.
 * @return {?{lat: number, lng: number, accuracy: number}} A clean copy, or
 *     null when anything is missing or out of range.
 */
function validLocation(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const {lat, lng, accuracy} = loc;
  if (!finite(lat) || lat < -90 || lat > 90) return null;
  if (!finite(lng) || lng < -180 || lng > 180) return null;
  if (!finite(accuracy) || accuracy < 0) return null;
  return {lat, lng, accuracy};
}

/**
 * The academy's reach radius: `radiusM` when it is a whole number in
 * 50..1000 (the range firestore.rules allows), else the 200 m default.
 * @param {?Object} config `doorConfig/main`.
 * @return {number} Metres.
 */
function radiusOf(config) {
  const r = config && config.radiusM;
  return Number.isInteger(r) && r >= RADIUS_MIN && r <= RADIUS_MAX ?
      r : DEFAULT_RADIUS_M;
}

/**
 * Whether the phone is at the academy: its distance is at most the radius
 * plus its reported accuracy, the accuracy counting up to 150 m. The check
 * uses the exact distance; the answer carries it rounded to 10 m.
 * @param {*} loc The caller's location.
 * @param {!Object} config `doorConfig/main` with finite `lat` and `lng`.
 * @return {{ok: boolean, distanceM: ?number, accuracyM: ?number}} The
 *     answer; both numbers null when the location is not valid.
 */
function reach(loc, config) {
  const here = validLocation(loc);
  if (!here) return {ok: false, distanceM: null, accuracyM: null};
  const d = distanceM(here, {lat: config.lat, lng: config.lng});
  const allowance = Math.min(Math.max(here.accuracy, 0),
      MAX_ACCURACY_ALLOWANCE_M);
  return {
    ok: d <= radiusOf(config) + allowance,
    distanceM: Math.round(d / 10) * 10,
    accuracyM: Math.round(here.accuracy),
  };
}

module.exports = {
  DEFAULT_RADIUS_M, EARTH_RADIUS_M, MAX_ACCURACY_ALLOWANCE_M, distanceM,
  radiusOf, reach, validLocation,
};
