'use strict';
// door-geo: the distance and reach checks behind the door button's
// "you need to be at the academy" (spec 5.1). Pure; no Firestore.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {EARTH_RADIUS_M, MAX_ACCURACY_ALLOWANCE_M, distanceM, reach,
  validLocation} = require('./door-geo');

// An invented spot near Minneapolis; offsets below are along the meridian,
// where one degree of latitude is EARTH_RADIUS_M * PI / 180 metres.
const ACADEMY = {lat: 44.9, lng: -93.4};
const M_PER_DEG = EARTH_RADIUS_M * Math.PI / 180;
const north = (m) => ({lat: ACADEMY.lat + m / M_PER_DEG, lng: ACADEMY.lng});

test('the earth radius is the IUGG mean, 6371008.8 m', () => {
  assert.equal(EARTH_RADIUS_M, 6371008.8);
});

test('distanceM: the same point is 0 m', () => {
  assert.equal(distanceM(ACADEMY, ACADEMY), 0);
});

test('distanceM: 250 m due north reads 250 m', () => {
  assert.ok(Math.abs(distanceM(ACADEMY, north(250)) - 250) < 0.01);
});

test('distanceM: one degree of longitude on the equator', () => {
  const d = distanceM({lat: 0, lng: 0}, {lat: 0, lng: 1});
  assert.ok(Math.abs(d - M_PER_DEG) < 0.01);
});

test('distanceM is symmetric', () => {
  const a = {lat: 44.95, lng: -93.1};
  assert.equal(distanceM(ACADEMY, a), distanceM(a, ACADEMY));
});

test('validLocation keeps lat, lng and accuracy', () => {
  assert.deepEqual(validLocation({lat: 44.9, lng: -93.4, accuracy: 12.5}),
      {lat: 44.9, lng: -93.4, accuracy: 12.5});
});

test('validLocation drops any other field', () => {
  assert.deepEqual(validLocation({lat: 1, lng: 2, accuracy: 3, altitude: 9}),
      {lat: 1, lng: 2, accuracy: 3});
});

test('validLocation accepts the edges of the globe and accuracy 0', () => {
  assert.ok(validLocation({lat: 90, lng: 180, accuracy: 0}));
  assert.ok(validLocation({lat: -90, lng: -180, accuracy: 0}));
});

test('validLocation refuses anything else with null', () => {
  for (const bad of [
    null, undefined, 'here', 42, [],
    {lng: -93.4, accuracy: 10},
    {lat: 44.9, accuracy: 10},
    {lat: 44.9, lng: -93.4},
    {lat: 90.0001, lng: 0, accuracy: 1},
    {lat: -90.0001, lng: 0, accuracy: 1},
    {lat: 0, lng: 180.0001, accuracy: 1},
    {lat: 0, lng: -180.0001, accuracy: 1},
    {lat: 0, lng: 0, accuracy: -1},
    {lat: NaN, lng: 0, accuracy: 1},
    {lat: 0, lng: Infinity, accuracy: 1},
    {lat: 0, lng: 0, accuracy: Infinity},
    {lat: '44.9', lng: '-93.4', accuracy: '10'},
  ]) {
    assert.equal(validLocation(bad), null, JSON.stringify(bad));
  }
});

test('reach: inside the radius is ok', () => {
  const r = reach(Object.assign(north(120), {accuracy: 10}),
      Object.assign({radiusM: 200}, ACADEMY));
  assert.equal(r.ok, true);
  assert.equal(r.distanceM, 120);
  assert.equal(r.accuracyM, 10);
});

test('reach: the distance is rounded to 10 m, the accuracy to 1 m', () => {
  const r = reach(Object.assign(north(123.4), {accuracy: 8.6}),
      Object.assign({radiusM: 200}, ACADEMY));
  assert.equal(r.distanceM, 120);
  assert.equal(r.accuracyM, 9);
});

test('reach: radius plus the reported accuracy still reaches', () => {
  // 300 m out, radius 200, accuracy 120: 300 <= 320.
  const r = reach(Object.assign(north(300), {accuracy: 120}),
      Object.assign({radiusM: 200}, ACADEMY));
  assert.equal(r.ok, true);
});

test('reach: the accuracy allowance stops at 150 m', () => {
  // 360 m out, radius 200, accuracy 400: allowance 150, 360 > 350.
  const far = reach(Object.assign(north(360), {accuracy: 400}),
      Object.assign({radiusM: 200}, ACADEMY));
  assert.equal(far.ok, false);
  assert.equal(far.distanceM, 360);
  assert.equal(far.accuracyM, 400);
  // 349 m out with the same accuracy reaches.
  const near = reach(Object.assign(north(349), {accuracy: 400}),
      Object.assign({radiusM: 200}, ACADEMY));
  assert.equal(near.ok, true);
  assert.equal(MAX_ACCURACY_ALLOWANCE_M, 150);
});

test('reach: exactly on the edge reaches', () => {
  const r = reach(Object.assign(north(199.999), {accuracy: 0}),
      Object.assign({radiusM: 200}, ACADEMY));
  assert.equal(r.ok, true);
});

test('reach: just past the edge with a perfect fix does not', () => {
  const r = reach(Object.assign(north(200.5), {accuracy: 0}),
      Object.assign({radiusM: 200}, ACADEMY));
  assert.equal(r.ok, false);
});

test('reach: no radiusM means the 200 m default', () => {
  assert.equal(reach(Object.assign(north(190), {accuracy: 0}), ACADEMY).ok,
      true);
  assert.equal(reach(Object.assign(north(210), {accuracy: 0}), ACADEMY).ok,
      false);
});

test('reach: a stored radius outside 50..1000 or not whole means 200', () => {
  for (const radiusM of [5000, 10, 250.5, '500', null]) {
    const cfg = Object.assign({radiusM}, ACADEMY);
    assert.equal(reach(Object.assign(north(210), {accuracy: 0}), cfg).ok,
        false, String(radiusM));
  }
});

test('reach: a wider radius reaches further', () => {
  const r = reach(Object.assign(north(480), {accuracy: 0}),
      Object.assign({radiusM: 500}, ACADEMY));
  assert.equal(r.ok, true);
});

test('reach: an invalid location never reaches', () => {
  const r = reach({lat: 999, lng: 0, accuracy: 1},
      Object.assign({radiusM: 200}, ACADEMY));
  assert.deepEqual(r, {ok: false, distanceM: null, accuracyM: null});
});

run();
