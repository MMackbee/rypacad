'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const facility = require('./facility');

const ath = (id, over) => Object.assign({id, householdId: 'h1',
  packageId: 't-6', billing: {status: 'active'}}, over);
const NONE = {access: false, source: null, holderId: null, eliteId: null,
  eliteDueId: null};

test('household access: a live add-on on any athlete covers the family',
    () => {
      for (const status of ['active', 'past_due']) {
        assert.deepEqual(facility.householdFacility([ath('a'),
          ath('b', {facilityBilling: {status}})]),
        {access: true, source: 'add-on', holderId: 'b', eliteId: null,
          eliteDueId: null}, status);
      }
      for (const status of ['pending', 'lapsed', undefined]) {
        assert.deepEqual(facility.householdFacility([ath('a'),
          ath('b', {facilityBilling: {status}})]), NONE, String(status));
      }
      // A request, the door flag or the waiver alone is never access.
      assert.deepEqual(facility.householdFacility([ath('a',
          {facilityRequested: true, facilityAccess: true,
            facilityAccessConsent: {byUid: 'u'}})]), NONE);
    });

test('household access: a live Elite membership covers the family', () => {
  const elite = (billing) => ath('e', billing === undefined ?
      {packageId: 'elite', billing: undefined} : {packageId: 'elite', billing});
  const yes = {access: true, source: 'elite', holderId: null, eliteId: 'e',
    eliteDueId: null};
  // Active, past_due, or no billing map at all (a legacy athlete).
  assert.deepEqual(facility.householdFacility([ath('a'),
    elite({status: 'active'})]), yes);
  assert.deepEqual(facility.householdFacility([elite({status: 'past_due'})]),
      yes);
  assert.deepEqual(facility.householdFacility([elite(undefined)]), yes);
  // Never paid, or ended: Elite covers nobody. One still to pay is named
  // (`eliteDueId`), so the add-on is not sold to a family about to have it.
  assert.deepEqual(facility.householdFacility([ath('a'),
    elite({status: 'pending'})]), Object.assign({}, NONE, {eliteDueId: 'e'}));
  assert.deepEqual(facility.householdFacility([elite({status: 'lapsed'})]),
      NONE);
  // Both at once (the add-on bought before Elite): Elite is the source, the
  // holder is still named - Stripe keeps billing it until it is cancelled.
  assert.deepEqual(facility.householdFacility([
    ath('b', {facilityBilling: {status: 'active'}}),
    elite({status: 'active'})]),
  {access: true, source: 'elite', holderId: 'b', eliteId: 'e',
    eliteDueId: null});
});

test('household access: nothing to read is no access', () => {
  for (const empty of [[], null, undefined, [null, undefined, {}]]) {
    assert.deepEqual(facility.householdFacility(empty), NONE);
  }
});

const entry = (packageId, facilityRequested) => ({name: 'K', packageId,
  facilityRequested});
const flags = (list) => list.map((a) => a.facilityRequested);

test('one request per submission: the first ticked token package keeps it',
    () => {
      assert.deepEqual(flags(facility.oneFacilityRequest([
        entry('t-6', true), entry('t-12', true), entry('t-16', true)])),
      [true, false, false]);
      assert.deepEqual(flags(facility.oneFacilityRequest([
        entry('t-6', false), entry('t-12', true)])), [false, true]);
      // The single token never holds it; the next ticked token package does.
      assert.deepEqual(flags(facility.oneFacilityRequest([
        entry('single', true), entry('t-16', true)])), [false, true]);
      assert.deepEqual(flags(facility.oneFacilityRequest([
        entry('single', true)])), [false]);
      assert.deepEqual(flags(facility.oneFacilityRequest([
        entry('t-6', false), entry('t-6', undefined)])), [false, false]);
    });

test('one request per submission: Elite in the submission means none', () => {
  assert.deepEqual(flags(facility.oneFacilityRequest([
    entry('t-6', true), entry('elite', true)])), [false, false]);
  assert.deepEqual(flags(facility.oneFacilityRequest([
    entry('elite', false), entry('t-12', true)])), [false, false]);
});

test('one request per submission: the entries are copied, never edited',
    () => {
      const sent = [entry('t-6', true), entry('t-6', true)];
      const out = facility.oneFacilityRequest(sent);
      assert.deepEqual(flags(sent), [true, true]);
      assert.equal(out[0].name, 'K');
      assert.notEqual(out[1], sent[1]);
    });

test('add-athlete: the household already there decides too', () => {
  const add = (existing) => flags(facility.oneFacilityRequest(
      [entry('t-6', true)], existing));
  assert.deepEqual(add([]), [true]);
  assert.deepEqual(add([ath('a')]), [true]);
  // An Elite athlete (paid, or still to pay), a request, or a paid add-on.
  assert.deepEqual(add([ath('e', {packageId: 'elite'})]), [false]);
  assert.deepEqual(add([ath('e', {packageId: 'elite',
    billing: {status: 'pending'}})]), [false]);
  assert.deepEqual(add([ath('a', {facilityRequested: true})]), [false]);
  assert.deepEqual(add([ath('a', {facilityBilling: {status: 'active'}})]),
      [false]);
  assert.deepEqual(add([ath('a', {facilityBilling: {status: 'past_due'}})]),
      [false]);
  // An Elite membership that ended, or an add-on that ended, blocks nothing.
  assert.deepEqual(add([ath('e', {packageId: 'elite',
    billing: {status: 'lapsed'}})]), [true]);
  assert.deepEqual(add([ath('a', {facilityBilling: {status: 'lapsed'}})]),
      [true]);
});

run();
