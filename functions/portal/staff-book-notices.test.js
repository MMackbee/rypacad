'use strict';
// What the booking triggers send for a staff add (staff booking tools,
// 2026-11-13): one "Session booked" per add, without the before-it-starts
// sentence once the session has started; a row written over a cancelled
// one is confirmed through the widened re-confirm gate, keyed by staff;
// and a family re-book of a cancelled staff row stays silent.

// index.js is loaded for the real triggers. A project id that is no real
// project and an emulator address nothing listens on: no case here can
// reach a real Firestore, and the triggers' own store is swapped for the
// stand-in below.
process.env.GCLOUD_PROJECT = 'demo-staff-book-notices';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9';

const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const lib = require('./lib');
const notify = require('./notify');
const index = require('../index');

const sent = [];
notify.sendNotice = async (args) => {
  sent.push(args);
  return {sent: true};
};

const docs = {};
admin.firestore().collection = (name) => fakeDb(docs).collection(name);

const ts = (n) => ({toMillis: () => n});
const BEFORE_IT_STARTS = /before it starts/;
// Always a month ahead of the real clock, so the case never ages.
const FUTURE = lib.todayISO(new Date(Date.now() + 30 * 864e5));

/**
 * Reset the stand-in: Jordan (hh1), a past Tue Nov 10 session `s0` and a
 * session `s2` a month ahead.
 */
function reset() {
  sent.length = 0;
  for (const k of Object.keys(docs)) delete docs[k];
  Object.assign(docs, {
    'athletes/jordan': {name: 'Jordan Whitfield', householdId: 'hh1',
      packageId: 't-6'},
    'sessions/s0': {date: '2026-11-10', time: '4:00 PM', type: 'training'},
    'sessions/s2': {date: FUTURE, time: '4:00 PM', type: 'training'},
  });
}
const row = (sessionId, over) => Object.assign({athleteId: 'jordan',
  sessionId, householdId: 'hh1', type: 'training', status: 'confirmed',
  periodKey: '2026-11-01', chargedFrom: 'period', graceTokenId: null,
  createdBy: 'u-owner', createdVia: 'staff'}, over);
const created = (bookingId, booking) => index.onBookingCreated.run(
    {data: () => booking}, {params: {bookingId}});
const updated = (bookingId, before, after) => index.onBookingCancelled.run({
  before: {exists: true, data: () => before},
  after: {exists: true, data: () => after}}, {params: {bookingId}});

test('a staff add of a past session: one Session booked without the ' +
    'before-it-starts sentence', async () => {
  reset();
  await created('jordan_s0', row('s0', {date: '2026-11-10'}));
  assert.deepEqual(sent.map((n) => [n.kind, n.subjectKey]),
      [['booking-confirmed', 'jordan_s0']]);
  assert.equal(sent[0].body, 'Jordan is booked: Training, Tue, Nov 10 at ' +
      '4:00 PM.');
  assert.doesNotMatch(sent[0].body, BEFORE_IT_STARTS);
});

test('a staff add of a future session keeps the sentence', async () => {
  reset();
  await created('jordan_s2', row('s2', {date: FUTURE}));
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, BEFORE_IT_STARTS);
});

test('a re-confirm over a cancelled row: one notice keyed by staff',
    async () => {
      reset();
      await updated('jordan_s2', {status: 'cancelled', createdAt: ts(1)},
          row('s2', {date: FUTURE, createdAt: ts(77)}));
      assert.deepEqual(sent.map((n) => [n.kind, n.subjectKey, n.bookingId]),
          [['booking-confirmed', 'jordan_s2_staff_77', 'jordan_s2']]);
      assert.match(sent[0].body, BEFORE_IT_STARTS);
    });

test('a family re-book of a cancelled staff row stays silent', async () => {
  reset();
  await updated('jordan_s2', {status: 'cancelled', createdAt: ts(1),
    createdVia: 'staff'}, row('s2', {date: FUTURE, createdAt: ts(1),
    createdBy: 'u-parent'}));
  assert.deepEqual(sent, []);
});

run();
