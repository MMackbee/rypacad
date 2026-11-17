'use strict';
// unlockDoor's coalesce (spec 5.2 step 5; review 2026-11-17 server-2 and
// server-3): a press soon after a CONFIRMED open answers "Already unlocked"
// with no second POST - but only while the door can still be open (the
// open time, at most 10 s), and never onto an open Alta has not answered
// yet. An Alta failure gives the open back. Alta is door-test-kit's
// stand-in and Firestore is fake-firestore's map.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {CONFIG, NOW, fakeAlta, familyDocs, later, press, unlock} =
    require('./door-test-kit');

const FAR = {lat: 44.95, lng: -93.4, accuracy: 10};
const EVENT = 'doorEvents/u-dana_press-0001';
const SECOND = 'doorEvents/u-dana_press-0002';
const LIMITS = 'doorLimits/u-dana';
const T0 = NOW.getTime();

/**
 * @param {number} openSeconds The door's open time.
 * @param {!Object=} over More docs.
 * @return {!Object} The family's docs with that open time.
 */
const withSeconds = (openSeconds, over) => familyDocs(Object.assign({
  'doorConfig/main': Object.assign({}, CONFIG, {openSeconds})}, over));

/** An open reserved at T0 that Alta has not answered (phone A). */
const PENDING = {
  [EVENT]: {uid: 'u-dana', outcome: 'pending', reason: null, atMs: T0,
    nonce: 'another-invocation'},
  [LIMITS]: {callsAtMs: [T0], opensAtMs: [T0], lastOpenedAtMs: T0,
    updatedAtMs: T0},
};

// ---- the window: the open time, at most 10 s --------------------------------

test('a press within the open time is coalesced: no second POST', async () => {
  const docs = familyDocs();
  const alta = fakeAlta();
  await press(unlock('press-0001'), {docs, alta});
  const second = await press(unlock('press-0002'),
      {docs, alta, now: later(4999)});
  assert.deepEqual(second.result, {outcome: 'coalesced', openSeconds: 5});
  assert.equal(alta.calls.length, 1);
  assert.equal(docs[SECOND].outcome, 'coalesced');
  assert.deepEqual(docs[LIMITS].opensAtMs, [T0]);
  const third = await press(unlock('press-0003'),
      {docs, alta, now: later(5000)});
  assert.equal(third.result.outcome, 'opened');
  assert.equal(alta.calls.length, 2);
});

test('"Hold again" after the countdown opens the door again', async () => {
  // server-2: the answer comes about 1 s after the press, the app counts
  // the 5 s open time down and then says "Didn't open? Hold again."; that
  // press lands about 8 s after the first, and the door has locked again.
  for (const at of [6000, 8000, 9999]) {
    const docs = familyDocs();
    const alta = fakeAlta();
    await press(unlock('press-0001'), {docs, alta});
    const again = await press(unlock('press-0002'),
        {docs, alta, now: later(at)});
    assert.deepEqual(again.result, {outcome: 'opened', openSeconds: 5},
        String(at));
    assert.equal(alta.calls.length, 2, String(at));
  }
});

test('the window follows the open time and never passes 10 s', async () => {
  for (const [secs, inside, outside] of [[1, 999, 1000], [3, 2999, 3000],
    [10, 9999, 10000], [30, 9999, 10000]]) {
    const docs = withSeconds(secs);
    const alta = fakeAlta();
    await press(unlock('press-0001'), {docs, alta});
    const a = await press(unlock('press-0002'),
        {docs, alta, now: later(inside)});
    assert.equal(a.result.outcome, 'coalesced', `${secs} s at ${inside}`);
    const b = await press(unlock('press-0003'),
        {docs, alta, now: later(outside)});
    assert.equal(b.result.outcome, 'opened', `${secs} s at ${outside}`);
    assert.equal(alta.calls.length, 2, `${secs} s`);
  }
});

test('a 180 s open time still coalesces only within 10 s', async () => {
  // Minutes of open time (Alta's Entry open duration) never stretch the
  // window: a press 10 s on is a real open again, and harmless.
  const docs = withSeconds(180);
  const alta = fakeAlta();
  const first = await press(unlock('press-0001'), {docs, alta});
  assert.deepEqual(first.result, {outcome: 'opened', openSeconds: 180});
  const a = await press(unlock('press-0002'), {docs, alta, now: later(9999)});
  assert.deepEqual(a.result, {outcome: 'coalesced', openSeconds: 180});
  const b = await press(unlock('press-0003'),
      {docs, alta, now: later(10000)});
  assert.deepEqual(b.result, {outcome: 'opened', openSeconds: 180});
  assert.equal(alta.calls.length, 2);
});

test('a refusal is never coalesced', async () => {
  const docs = familyDocs();
  await press(unlock('press-0001'), {docs});
  const r = await press(unlock('press-0002', FAR), {docs, now: later(3000)});
  assert.equal(r.error.details.reason, 'too-far');
});

test('a test household\'s second press in the window is coalesced too',
    async () => {
      const docs = familyDocs({'households/hh': {name: 'Hart family',
        test: true}});
      await press(unlock('press-0001'), {docs});
      const r = await press(unlock('press-0002'), {docs, now: later(2000)});
      assert.deepEqual(r.result, {outcome: 'coalesced', openSeconds: 5});
      assert.equal(r.calls.length, 0);
    });

// ---- only onto a confirmed open (server-3) ----------------------------------

test('only a 2xx confirms an open', async () => {
  const ok = await press(unlock());
  assert.equal(ok.docs[LIMITS].lastConfirmedOpenAtMs, T0);
  const failed = await press(unlock(), {alta: fakeAlta({status: 500})});
  assert.equal(failed.docs[LIMITS].lastConfirmedOpenAtMs ?? null, null);
});

test('a press while an earlier open waits on Alta is in-progress, never ' +
    '"already unlocked"', async () => {
  // Two phones on one login: A pressed at T0 and Alta has not answered.
  const docs = familyDocs(PENDING);
  const r = await press(unlock('press-0002'), {docs, now: later(3000)});
  assert.equal(r.calls.length, 0);
  assert.equal(r.error.code, 'unavailable');
  assert.equal(r.error.details.reason, 'in-progress');
  assert.equal(docs[SECOND].outcome, 'denied');
  assert.equal(docs[SECOND].reason, 'in-progress');
  assert.deepEqual(docs[LIMITS].opensAtMs, [T0]);
  assert.deepEqual(docs[LIMITS].callsAtMs, [T0, T0 + 3000]);
  // B's press id again: the same answer, still no POST.
  const again = await press(unlock('press-0002'), {docs, now: later(3500)});
  assert.equal(again.error.details.reason, 'in-progress');
  assert.equal(again.calls.length, 0);
});

test('A\'s open confirmed meanwhile: B\'s next press is "already unlocked"',
    async () => {
      const docs = familyDocs(PENDING);
      docs[LIMITS].lastConfirmedOpenAtMs = T0;
      docs[EVENT].outcome = 'opened';
      const r = await press(unlock('press-0002'), {docs, now: later(3000)});
      assert.deepEqual(r.result, {outcome: 'coalesced', openSeconds: 5});
    });

test('an open that never answered stops blocking after the window',
    async () => {
      // The instance holding A died: its event stays pending for good.
      const docs = familyDocs(PENDING);
      const r = await press(unlock('press-0002'), {docs, now: later(5000)});
      assert.equal(r.result.outcome, 'opened');
      assert.equal(r.calls.length, 1);
      assert.equal(docs[LIMITS].lastConfirmedOpenAtMs, T0 + 5000);
    });

test('a transaction retried after its commit applied carries on to Alta',
    async () => {
      // The commit landed but its answer was lost, so runTransaction ran
      // the body again: it finds this invocation's own pending event.
      const docs = familyDocs();
      const alta = fakeAlta();
      const lostOnce = (db) => {
        let lost = true;
        return Object.assign({}, db, {runTransaction: async (fn) => {
          if (lost) {
            lost = false;
            await db.runTransaction(fn);
          }
          return db.runTransaction(fn);
        }});
      };
      const r = await press(unlock(), {docs, alta, db: lostOnce});
      assert.equal(r.error, null);
      assert.deepEqual(r.result, {outcome: 'opened', openSeconds: 5});
      assert.equal(alta.calls.length, 1);
      assert.equal(docs[EVENT].outcome, 'opened');
      assert.deepEqual(docs[LIMITS].callsAtMs, [T0]);
      assert.deepEqual(docs[LIMITS].opensAtMs, [T0]);
    });

test('the same press id from another invocation in the gap is in-progress',
    async () => {
      // A client retry raced the first call past the early read.
      const docs = familyDocs();
      const racedBy = (db) => Object.assign({}, db, {
        runTransaction: async (fn) => {
          docs[EVENT] = {uid: 'u-dana', outcome: 'pending', reason: null,
            atMs: T0, nonce: 'the-other-invocation'};
          return db.runTransaction(fn);
        }});
      const r = await press(unlock(), {docs, db: racedBy});
      assert.equal(r.calls.length, 0);
      assert.equal(r.error.details.reason, 'in-progress');
    });

// ---- an Alta failure gives the open slot back -------------------------------

test('Alta answers 500: alta-error, the event says so, the slot comes back',
    async () => {
      const docs = familyDocs();
      const r = await press(unlock(), {docs,
        alta: fakeAlta({status: 500})});
      assert.equal(r.error.code, 'unavailable');
      assert.equal(r.error.details.reason, 'alta-error');
      assert.equal(docs[EVENT].outcome, 'error');
      assert.equal(docs[EVENT].reason, 'alta-error');
      assert.equal(docs[EVENT].altaStatus, 500);
      assert.deepEqual(docs[LIMITS].opensAtMs, []);
      assert.equal(docs[LIMITS].lastOpenedAtMs, null);
      assert.deepEqual(docs[LIMITS].callsAtMs, [T0]);
      // Hold again two seconds later: a real open, not "already unlocked".
      const again = await press(unlock('press-0002'),
          {docs, now: later(2000)});
      assert.equal(again.result.outcome, 'opened');
    });

test('giving the slot back keeps an earlier open\'s coalesce', async () => {
  const docs = familyDocs();
  await press(unlock('press-0001'), {docs});
  // 11 s later the next open fails; the first open stays the last one.
  await press(unlock('press-0002'), {docs, now: later(11000),
    alta: fakeAlta({status: 503})});
  assert.deepEqual(docs[LIMITS].opensAtMs, [T0]);
  assert.equal(docs[LIMITS].lastOpenedAtMs, T0);
  assert.equal(docs[LIMITS].lastConfirmedOpenAtMs, T0);
});

run();
