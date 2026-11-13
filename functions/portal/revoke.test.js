'use strict';
// The downgrade trim (portal/revoke.js trimDowngrade) over a stand-in
// Firestore: next-period bookings beyond the new grant are cancelled
// newest first, counted as tokens are counted - a Free (comp) booking
// spends nothing, so it neither counts against the grant nor is trimmed
// (staff booking tools, 2026-11-13).

// A project id that is no real project and an emulator address nothing
// listens on: no case here can reach a real Firestore, and the cached
// admin instance revoke.js reads is pointed at the stand-in below.
process.env.GCLOUD_PROJECT = 'demo-revoke';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9';

const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const lib = require('./lib');
const notify = require('./notify');
const {trimDowngrade} = require('./revoke');

admin.initializeApp();
const docs = {};
const fs = admin.firestore();
fs.collection = (n) => fakeDb(docs).collection(n);
fs.getAll = (...r) => fakeDb(docs).getAll(...r);
fs.batch = () => fakeDb(docs).batch();

const sent = [];
notify.sendNotice = async (args) => {
  sent.push(args);
  return {sent: true};
};

// The period after the current one, from the real clock: the trim only
// ever touches future periods. Distinct days, so the newest-first sort
// never reaches its createTime tie-break (the stand-in has none).
const NEXT = lib.nextPeriod(lib.periodFor(lib.todayISO(), 1).periodKey, 1);
const day = (d) => `${NEXT.periodKey.slice(0, 8)}${String(d).padStart(2, '0')}`;
const HH = {id: 'hh1', data: {periodAnchorDay: 1}, ref: null};

/**
 * Reset the stand-in to Jordan's next-period bookings.
 * @param {!Array<!Object>} rows `{d, comp?}`: the day of the month and
 *     whether the booking is Free.
 */
function seed(rows) {
  sent.length = 0;
  for (const k of Object.keys(docs)) delete docs[k];
  for (const {d, comp} of rows) {
    const sessionId = `n${d}`;
    docs[`sessions/${sessionId}`] = {date: day(d), booked: 1, capacity: 12};
    docs[`bookings/jordan_${sessionId}`] = Object.assign({
      athleteId: 'jordan', sessionId, householdId: 'hh1', date: day(d),
      type: 'training', status: 'confirmed', periodKey: NEXT.periodKey,
      chargedFrom: 'period', graceTokenId: null}, comp ? {comp: true} : {});
  }
}
const status = (d) => docs[`bookings/jordan_n${d}`].status;

test('a Free booking neither counts against the new grant nor is trimmed',
    async () => {
      seed([{d: 2}, {d: 3}, {d: 4}, {d: 5, comp: true}]);
      const out = await trimDowngrade(HH,
          {tokens: 2, athleteIds: ['jordan']}, 'evt1');
      assert.equal(out.cancelled, 1);
      assert.deepEqual([2, 3, 4, 5].map(status),
          ['confirmed', 'confirmed', 'cancelled', 'confirmed']);
      assert.equal(docs['bookings/jordan_n4'].cancelReason, 'downgrade');
      assert.equal(docs['sessions/n4'].booked, 0);
      assert.deepEqual(sent.map((n) => n.kind), ['booking-revoked']);
    });

test('two paid and two Free under a grant of 2: nothing cancelled',
    async () => {
      seed([{d: 2}, {d: 3, comp: true}, {d: 4}, {d: 5, comp: true}]);
      const out = await trimDowngrade(HH,
          {tokens: 2, athleteIds: ['jordan']}, 'evt2');
      assert.equal(out.cancelled, 0);
      assert.deepEqual([2, 3, 4, 5].map(status), ['confirmed', 'confirmed',
        'confirmed', 'confirmed']);
      assert.deepEqual(sent, []);
    });

run();
