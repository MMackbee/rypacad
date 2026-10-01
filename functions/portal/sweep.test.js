'use strict';
// The 06:00 waitlist sweep (owner ruling 2026-10-01): an entry whose
// session date has passed is deleted and the family told once. Nothing is
// minted - the held token is simply free again. Runs over a stand-in
// Firestore; test/verify-sweep.js runs the same body on the emulator.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const notify = require('./notify');
const sweep = require('./sweep');

const sent = [];
notify.sendNotice = async (args) => {
  sent.push(args);
  return {sent: true};
};

// 06:00 in Chicago on Fri, Nov 13 2026.
const NOW = new Date('2026-11-13T12:00:00Z');
const BLOCK = 'Training, Thu, Nov 12 at 4:00 PM';

const JOINED = Date.parse('2026-11-05T15:00:00Z');

const session = (date) => ({date, time: '4:00 PM', type: 'training',
  capacity: 2, booked: 2});
const entry = (sessionId, athleteId, householdId, date) => ({
  [`waitlist/${sessionId}_${athleteId}`]: {sessionId, athleteId, householdId,
    date, periodKey: '2026-11-01', joinedAt: new Date(JOINED),
    createdBy: 'u-parent'},
});
/**
 * @param {...!Object} extra Documents to add to the base world.
 * @return {!Object} The documents.
 */
function world(...extra) {
  sent.length = 0;
  return Object.assign({
    'packages/t-12': {kind: 'tokens', tokens: 12},
    'packages/elite': {kind: 'elite', tokens: null},
    'athletes/sam': {name: 'Sam Hart', householdId: 'hart',
      packageId: 't-12'},
    'athletes/ava': {name: 'Ava Lopez', householdId: 'lopez',
      packageId: 'elite'},
    'sessions/s-12': session('2026-11-12'),
    'sessions/s-13': session('2026-11-13'),
    'sessions/s-20': session('2026-11-20'),
  }, ...extra);
}
const keys = (docs, prefix) =>
  Object.keys(docs).filter((k) => k.startsWith(prefix));

test('an expired entry is deleted, nothing is minted, the family is told',
    async () => {
      const docs = world(entry('s-12', 'sam', 'hart', '2026-11-12'));
      const r = await sweep.runWaitlistSweep({now: NOW, db: fakeDb(docs)});
      assert.deepEqual(r, {today: '2026-11-13', expired: 1, skipped: 0,
        notified: 1});
      assert.deepEqual(keys(docs, 'waitlist/'), []);
      assert.deepEqual(keys(docs, 'graceTokens/'), []);
      assert.equal(sent.length, 1);
      assert.deepEqual(sent[0], {
        kind: 'waitlist-expired',
        category: 'schedule',
        householdId: 'hart',
        athleteId: 'sam',
        sessionId: 's-12',
        // The join time is part of the key: a family that rejoins after a
        // close gets its own notice the second time.
        subjectKey: `s-12_sam_waitlist_${JOINED}`,
        title: 'Waitlist closed',
        body: `The waitlist for ${BLOCK} closed without a spot for Sam. ` +
            'The token held for it is free to use again.',
      });
    });

test('an Elite athlete gets no token sentence', async () => {
  const docs = world(entry('s-12', 'ava', 'lopez', '2026-11-12'));
  await sweep.runWaitlistSweep({now: NOW, db: fakeDb(docs)});
  assert.equal(sent[0].body,
      `The waitlist for ${BLOCK} closed without a spot for Ava.`);
  assert.equal(/token/i.test(sent[0].title + sent[0].body), false);
  assert.deepEqual(keys(docs, 'graceTokens/'), []);
});

test('today\'s and later entries are left for a later sweep', async () => {
  const docs = world(entry('s-13', 'sam', 'hart', '2026-11-13'),
      entry('s-20', 'sam', 'hart', '2026-11-20'));
  const r = await sweep.runWaitlistSweep({now: NOW, db: fakeDb(docs)});
  assert.equal(r.expired, 0);
  assert.equal(keys(docs, 'waitlist/').length, 2);
  assert.equal(sent.length, 0);
  // The day after the session, the entry still waiting on the day closes.
  const next = await sweep.runWaitlistSweep({
    now: new Date('2026-11-14T12:00:00Z'), db: fakeDb(docs)});
  assert.equal(next.expired, 1);
  assert.deepEqual(keys(docs, 'waitlist/'), ['waitlist/s-20_sam']);
});

test('a second run on the same day finds nothing', async () => {
  const docs = world(entry('s-12', 'sam', 'hart', '2026-11-12'));
  await sweep.runWaitlistSweep({now: NOW, db: fakeDb(docs)});
  const again = await sweep.runWaitlistSweep({now: NOW, db: fakeDb(docs)});
  assert.deepEqual(again, {today: '2026-11-13', expired: 0, skipped: 0,
    notified: 0});
  assert.equal(sent.length, 1);
});

test('an entry with no athlete is deleted and nobody is told', async () => {
  const docs = world({'waitlist/odd': {sessionId: 's-12',
    date: '2026-11-12'}});
  const r = await sweep.runWaitlistSweep({now: NOW, db: fakeDb(docs)});
  assert.deepEqual([r.expired, r.skipped, r.notified], [1, 1, 0]);
  assert.deepEqual(keys(docs, 'waitlist/'), []);
  assert.equal(sent.length, 0);
});

test('an athlete who held a seat is not told the waitlist closed on them',
    async () => {
      const docs = world(entry('s-12', 'sam', 'hart', '2026-11-12'),
          {'bookings/sam_s-12': {athleteId: 'sam', sessionId: 's-12',
            status: 'confirmed'}});
      const r = await sweep.runWaitlistSweep({now: NOW, db: fakeDb(docs)});
      assert.deepEqual([r.expired, r.skipped, r.notified], [1, 0, 0]);
      assert.deepEqual(keys(docs, 'waitlist/'), []);
      assert.equal(sent.length, 0);
    });

test('the bonus-token mint and its bookkeeping are gone', () => {
  assert.deepEqual(Object.keys(sweep), ['runWaitlistSweep']);
});

run();
