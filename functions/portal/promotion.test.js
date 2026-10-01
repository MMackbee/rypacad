'use strict';
// Waitlist promotion and the sessions trigger (owner rulings 2026-10-01),
// over a stand-in Firestore; test/verify-lane.js and verify-notifications.js
// run the deployed trigger on the emulator.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const notify = require('./notify');
const promotion = require('./promotion');

const sent = [];
notify.sendNotice = async (args) => {
  sent.push(args);
  return {sent: true};
};

// Noon in Chicago on Tue, Nov 10 2026; the session is Thu, Nov 12.
const NOW = new Date('2026-11-10T18:00:00Z');
const BLOCK = 'Training, Thu, Nov 12 at 4:00 PM';
const T0 = Date.parse('2026-11-05T15:00:00Z');
const MIN = 60000;

const session = (over) => Object.assign({date: '2026-11-12',
  time: '4:00 PM', type: 'training', capacity: 2, booked: 2,
  status: 'scheduled'}, over);
const entry = (sessionId, athleteId, householdId, minutes, over) => ({
  [`waitlist/${sessionId}_${athleteId}`]: Object.assign({sessionId,
    athleteId, householdId, date: '2026-11-12', periodKey: '2026-11-01',
    joinedAt: new Date(T0 + minutes * MIN), createdBy: 'u-parent'}, over),
});
const booking = (athleteId, sessionId, over) => ({
  [`bookings/${athleteId}_${sessionId}`]: Object.assign({athleteId,
    sessionId, date: '2026-11-12', type: 'training', status: 'confirmed',
    periodKey: '2026-11-01', graceTokenId: null, chargedFrom: 'period'},
  over),
});
/**
 * @param {...!Object} extra Documents to add to the base world.
 * @return {!Object} The documents: three families, one full session `s1`
 *     whose two seats are held by `x1` and `x2`.
 */
function world(...extra) {
  sent.length = 0;
  return Object.assign({
    'packages/t-12': {kind: 'tokens', tokens: 12, windowDays: 30},
    'packages/elite': {kind: 'elite', tokens: null, windowDays: 45},
    'households/hart': {periodAnchorDay: 1},
    'households/lopez': {periodAnchorDay: 1},
    'households/reyes': {periodAnchorDay: 1},
    'athletes/sam': {name: 'Sam Hart', householdId: 'hart',
      packageId: 't-12'},
    'athletes/ava': {name: 'Ava Lopez', householdId: 'lopez',
      packageId: 'elite'},
    'athletes/kai': {name: 'Kai Reyes', householdId: 'reyes',
      packageId: 't-12'},
    'sessions/s1': session(),
  }, booking('x1', 's1'), booking('x2', 's1'), ...extra);
}
/**
 * What the app's own cancel does in one commit: the booking is cancelled
 * and the session's count goes down by one. Then the trigger runs.
 * @param {!Object} docs The documents.
 * @param {string} athleteId Whose booking of `s1` is cancelled.
 * @return {!Promise<null>} The trigger's result.
 */
function cancelSeat(docs, athleteId) {
  const before = docs['sessions/s1'];
  const key = `bookings/${athleteId}_s1`;
  docs[key] = Object.assign({}, docs[key], {status: 'cancelled'});
  docs['sessions/s1'] = Object.assign({}, before,
      {booked: before.booked - 1});
  return promotion.handleSessionUpdate(before, docs['sessions/s1'], 's1',
      {db: fakeDb(docs), now: NOW});
}
const clock = (now) => ({now, today: '2026-11-10'});
const bodies = (kind) => sent.filter((n) => n.kind === kind)
    .map((n) => n.body);

test('happy path: a cancelled seat books the waiting family', async () => {
  const docs = world(entry('s1', 'sam', 'hart', 0));
  await cancelSeat(docs, 'x1');
  const b = docs['bookings/sam_s1'];
  assert.deepEqual([b.status, b.chargedFrom, b.graceTokenId, b.periodKey,
    b.createdBy, b.promotedFromWaitlist, b.householdId, b.date, b.type],
  ['confirmed', 'period', null, '2026-11-01', 'system', true, 'hart',
    '2026-11-12', 'training']);
  assert.equal(docs['sessions/s1'].booked, 2);
  assert.equal('waitlist/s1_sam' in docs, false);
  assert.deepEqual(bodies('promoted'), [`A spot opened - Sam is now ` +
      `booked for ${BLOCK}. One token was used. You can cancel in the app ` +
      'until the day before.']);
  assert.equal(sent.length, 1);
});

test('no same-day promotion: today\'s session is left alone', async () => {
  const docs = world(entry('s1', 'sam', 'hart', 0),
      {'sessions/s1': session({capacity: 3})});
  const db = fakeDb(docs);
  const onTheDay = {now: new Date('2026-11-12T18:00:00Z'),
    today: '2026-11-12'};
  const r = await promotion.promoteOneSeat('s1', onTheDay, db);
  assert.deepEqual([r.promoted, r.reason], [null, 'same-day-or-past']);
  assert.equal('waitlist/s1_sam' in docs, true);
  assert.equal('bookings/sam_s1' in docs, false);
  // The day before is still fine.
  const dayBefore = {now: new Date('2026-11-11T18:00:00Z'),
    today: '2026-11-11'};
  const ok = await promotion.promoteOneSeat('s1', dayBefore, db);
  assert.equal(ok.promoted.athleteId, 'sam');
});

test('Elite one-per-day: the candidate is removed and told, the next ' +
    'is booked', async () => {
  const docs = world(entry('s1', 'ava', 'lopez', 0),
      entry('s1', 'sam', 'hart', 5),
      booking('ava', 's2'));
  await cancelSeat(docs, 'x1');
  assert.equal('bookings/ava_s1' in docs, false);
  assert.equal('waitlist/s1_ava' in docs, false);
  assert.equal(docs['bookings/sam_s1'].status, 'confirmed');
  assert.deepEqual(bodies('waitlist-removed'), ['Ava was next on the ' +
      `waitlist for ${BLOCK} but could not be booked: Elite includes one ` +
      'training block a day and one is already booked that day.']);
  assert.deepEqual(sent.filter((n) => n.kind === 'waitlist-removed')
      .map((n) => n.category), ['schedule']);
  assert.equal(bodies('promoted').length, 1);
  // A different type that day does not trip the cap.
  const other = world(entry('s1', 'ava', 'lopez', 0),
      booking('ava', 's2', {type: 'tournament'}));
  await cancelSeat(other, 'x1');
  assert.equal(other['bookings/ava_s1'].chargedFrom, 'elite');
  assert.deepEqual(bodies('promoted'), [`A spot opened - Ava is now ` +
      `booked for ${BLOCK}. You can cancel in the app until the day ` +
      'before.']);
});

test('a failed check removes the entry and tells the family why',
    async () => {
      const docs = world(entry('s1', 'kai', 'reyes', 0),
          entry('s1', 'sam', 'hart', 5),
          {'households/reyes': {periodAnchorDay: 1,
            membership: {status: 'past_due'}}});
      await cancelSeat(docs, 'x1');
      assert.equal('waitlist/s1_kai' in docs, false);
      assert.equal('bookings/kai_s1' in docs, false);
      assert.equal(docs['bookings/sam_s1'].status, 'confirmed');
      const removed = sent.filter((n) => n.kind === 'waitlist-removed');
      assert.deepEqual(removed.map((n) => [n.householdId, n.athleteId,
        n.sessionId, n.subjectKey, n.title, n.body]), [['reyes', 'kai', 's1',
        `s1_kai_${T0}`, 'Removed from waitlist', 'Kai was next on the ' +
        `waitlist for ${BLOCK} but could not be booked: the membership ` +
        'payment is not up to date.']]);
      // A payment reason goes to the parents only, like every billing
      // notice: a child is not told the card failed.
      assert.equal(removed[0].category, 'billing');
    });

test('a seat that fails later does not lose the notices already earned',
    async () => {
      // Two seats open. Kai fails a check and Sam is booked in the first
      // transaction; the second transaction throws.
      const docs = world(entry('s1', 'kai', 'reyes', 0),
          entry('s1', 'sam', 'hart', 5), entry('s1', 'ava', 'lopez', 9),
          {'households/reyes': {periodAnchorDay: 1,
            membership: {status: 'past_due'}}});
      const before = docs['sessions/s1'];
      docs['sessions/s1'] = session({capacity: 4});
      const db = fakeDb(docs);
      const commit = db.runTransaction;
      let calls = 0;
      db.runTransaction = (fn) => {
        calls += 1;
        return calls === 2 ?
            Promise.reject(new Error('contention')) : commit(fn);
      };
      await promotion.handleSessionUpdate(before, docs['sessions/s1'], 's1',
          {db, now: NOW});
      assert.equal(calls, 2);
      assert.equal(docs['bookings/sam_s1'].status, 'confirmed');
      assert.equal('waitlist/s1_ava' in docs, true);
      assert.deepEqual(sent.map((n) => [n.kind, n.athleteId]),
          [['promoted', 'sam'], ['waitlist-removed', 'kai']]);
    });

test('no tokens left, and a date outside the booking window', async () => {
  const docs = world(entry('s1', 'kai', 'reyes', 0),
      {'tokenPeriods/kai_2026-11-01': {granted: 0}});
  await cancelSeat(docs, 'x1');
  assert.deepEqual(bodies('waitlist-removed'), ['Kai was next on the ' +
      `waitlist for ${BLOCK} but could not be booked: no tokens are left ` +
      'for that period.']);
  // Dec 20 is past the 30-day window on Nov 10 (it ends Dec 10).
  const far = world(entry('s1', 'kai', 'reyes', 0, {date: '2026-12-20'}),
      {'sessions/s1': session({date: '2026-12-20', capacity: 3})});
  const r = await promotion.promoteOneSeat('s1', clock(NOW), fakeDb(far));
  assert.deepEqual(r.dropped.map((d) => d.reason), ['outside-window']);
  assert.equal('bookings/kai_s1' in far, false);
});

test('an entry whose athlete already holds the seat goes quietly',
    async () => {
      const docs = world(entry('s1', 'sam', 'hart', 0), booking('sam', 's1'),
          {'sessions/s1': session({capacity: 4, booked: 3})});
      const r = await promotion.fillOpenSeats('s1',
          {db: fakeDb(docs), now: NOW});
      assert.deepEqual(r, {promoted: 0, dropped: 1});
      assert.equal('waitlist/s1_sam' in docs, false);
      assert.equal(sent.length, 0);
    });

const GRACE = {'graceTokens/G': {athleteId: 'sam', householdId: 'hart',
  expiresAt: '2026-12-20', reason: 'session-cancelled'}};

test('an unspent bonus token goes first and pays', async () => {
  const docs = world(entry('s1', 'kai', 'reyes', 0),
      entry('s1', 'sam', 'hart', 5), GRACE);
  await cancelSeat(docs, 'x1');
  const b = docs['bookings/sam_s1'];
  assert.deepEqual([b.chargedFrom, b.graceTokenId], ['grace', 'G']);
  assert.equal('bookings/kai_s1' in docs, false);
});

test('a bonus token spent in another period is not spent twice',
    async () => {
      // G already paid for a Dec 2 booking, which is in the NEXT period.
      const spend = {'bookings/sam_dec': {athleteId: 'sam',
        sessionId: 'dec', date: '2026-12-02', type: 'training',
        status: 'confirmed', periodKey: '2026-12-01', graceTokenId: 'G',
        chargedFrom: 'grace'}};
      const docs = world(entry('s1', 'kai', 'reyes', 0),
          entry('s1', 'sam', 'hart', 5), GRACE, spend);
      await cancelSeat(docs, 'x1');
      // No priority: Kai joined first and gets the seat.
      assert.equal(docs['bookings/kai_s1'].status, 'confirmed');
      assert.equal('bookings/sam_s1' in docs, false);
      await cancelSeat(docs, 'x2');
      const b = docs['bookings/sam_s1'];
      assert.deepEqual([b.chargedFrom, b.graceTokenId], ['period', null]);
      // The other direction: spent on an October booking.
      const oct = world(entry('s1', 'sam', 'hart', 0), GRACE,
          {'bookings/sam_oct': Object.assign({}, spend['bookings/sam_dec'],
              {sessionId: 'oct', date: '2026-10-28',
                periodKey: '2026-10-01'})});
      await cancelSeat(oct, 'x1');
      assert.equal(oct['bookings/sam_s1'].chargedFrom, 'period');
      // A cancelled spend frees the token again.
      const freed = world(entry('s1', 'sam', 'hart', 0), GRACE,
          {'bookings/sam_dec': Object.assign({}, spend['bookings/sam_dec'],
              {status: 'cancelled'})});
      await cancelSeat(freed, 'x1');
      assert.equal(freed['bookings/sam_s1'].chargedFrom, 'grace');
    });

test('real seat count: a lowered counter cannot force a promotion',
    async () => {
      // Both seats are really held; someone set the counter to 1 by hand.
      const docs = world(entry('s1', 'sam', 'hart', 0));
      const before = docs['sessions/s1'];
      docs['sessions/s1'] = session({booked: 1});
      await promotion.handleSessionUpdate(before, docs['sessions/s1'], 's1',
          {db: fakeDb(docs), now: NOW});
      assert.equal('bookings/sam_s1' in docs, false);
      assert.equal('waitlist/s1_sam' in docs, true);
      assert.equal(docs['sessions/s1'].booked, 2, 'true count written back');
      assert.equal(sent.length, 0);
    });

test('real seat count: the larger of the counter and the bookings wins',
    async () => {
      // The counter says full though only one booking is live: trusted.
      const high = world(entry('s1', 'sam', 'hart', 0),
          booking('x2', 's1', {status: 'cancelled'}));
      const r = await promotion.promoteOneSeat('s1', clock(NOW),
          fakeDb(high));
      assert.deepEqual([r.promoted, r.reason], [null, 'full']);
      assert.equal(high['sessions/s1'].booked, 2);
      // The counter is low but a seat is really free: promote, and write
      // the true count.
      const low = world(entry('s1', 'sam', 'hart', 0),
          {'sessions/s1': session({capacity: 3, booked: 0})});
      const ok = await promotion.promoteOneSeat('s1', clock(NOW),
          fakeDb(low));
      assert.equal(ok.promoted.athleteId, 'sam');
      assert.equal(low['sessions/s1'].booked, 3);
    });

test('seatOpened: a cancel, a raised capacity, or an un-cancel', () => {
  const s = (over) => session(over);
  const opened = promotion.seatOpened;
  assert.equal(opened(s({booked: 2}), s({booked: 1})), true);
  assert.equal(opened(s({capacity: 2}), s({capacity: 3})), true);
  assert.equal(opened(s({status: 'cancelled', booked: 1}),
      s({booked: 1})), true);
  // A session with no status field is scheduled (the generator's shape).
  assert.equal(opened({capacity: 2, booked: 2}, {capacity: 2, booked: 1}),
      true);
  // No seat free, a booking made, a promotion's own write, a cancel.
  assert.equal(opened(s({capacity: 1, booked: 2}), s({booked: 2})), false);
  assert.equal(opened(s({booked: 1}), s({booked: 2})), false);
  assert.equal(opened(s({booked: 1}), s({booked: 1, label: 'x'})), false);
  assert.equal(opened(s({booked: 2}), s({booked: 1, status: 'cancelled'})),
      false);
  assert.equal(opened(s({capacity: 3, booked: 1}),
      s({capacity: 2, booked: 1})), false);
});

test('raised capacity fills every new seat in order', async () => {
  const docs = world(entry('s1', 'kai', 'reyes', 0),
      entry('s1', 'sam', 'hart', 5), entry('s1', 'ava', 'lopez', 9));
  const before = docs['sessions/s1'];
  docs['sessions/s1'] = session({capacity: 4});
  await promotion.handleSessionUpdate(before, docs['sessions/s1'], 's1',
      {db: fakeDb(docs), now: NOW});
  assert.equal(docs['bookings/kai_s1'].status, 'confirmed');
  assert.equal(docs['bookings/sam_s1'].status, 'confirmed');
  assert.equal('bookings/ava_s1' in docs, false);
  assert.equal('waitlist/s1_ava' in docs, true);
  assert.equal(docs['sessions/s1'].booked, 4);
  assert.deepEqual(sent.map((n) => [n.kind, n.athleteId]),
      [['promoted', 'kai'], ['promoted', 'sam']]);
});

test('a cancelled session set back to scheduled fills its free seat',
    async () => {
      const docs = world(entry('s1', 'sam', 'hart', 0),
          booking('x2', 's1', {status: 'cancelled'}),
          {'sessions/s1': session({booked: 1})});
      await promotion.handleSessionUpdate(
          session({booked: 1, status: 'cancelled'}), docs['sessions/s1'],
          's1', {db: fakeDb(docs), now: NOW});
      assert.equal(docs['bookings/sam_s1'].status, 'confirmed');
      assert.equal(docs['sessions/s1'].booked, 2);
    });

test('the academy cancels a session: its waitlist is closed, each ' +
    'family told once', async () => {
  const docs = world(entry('s1', 'sam', 'hart', 0),
      entry('s1', 'ava', 'lopez', 5), entry('s9', 'kai', 'reyes', 0));
  const before = docs['sessions/s1'];
  docs['sessions/s1'] = session({status: 'cancelled'});
  const db = fakeDb(docs);
  await promotion.handleSessionUpdate(before, docs['sessions/s1'], 's1',
      {db, now: NOW});
  assert.deepEqual(Object.keys(docs).filter((k) =>
    k.startsWith('waitlist/')), ['waitlist/s9_kai']);
  assert.deepEqual(Object.keys(docs).filter((k) =>
    k.startsWith('graceTokens/')), []);
  assert.equal('bookings/sam_s1' in docs, false);
  assert.deepEqual(sent.map((n) => [n.kind, n.title, n.athleteId,
    n.householdId, n.subjectKey, n.body]), [
    ['session-cancelled', 'Session cancelled', 'sam', 'hart',
      `s1_sam_waitlist_${T0}`, `${BLOCK} was cancelled by the academy. ` +
      'Sam was on its waitlist; the token held for it is free to use ' +
      'again.'],
    ['session-cancelled', 'Session cancelled', 'ava', 'lopez',
      `s1_ava_waitlist_${T0 + 5 * MIN}`, `${BLOCK} was cancelled by the ` +
      'academy. Ava was on its waitlist.'],
  ]);
  // A redelivered trigger finds nothing left.
  await promotion.handleSessionUpdate(before, docs['sessions/s1'], 's1',
      {db, now: NOW});
  assert.equal(sent.length, 2);
});

test('a late cancel event for a session that is scheduled again closes ' +
    'nothing', async () => {
  // Triggers are at-least-once and unordered: the stored session decides.
  const docs = world(entry('s1', 'sam', 'hart', 0));
  await promotion.handleSessionUpdate(session(),
      session({status: 'cancelled'}), 's1', {db: fakeDb(docs), now: NOW});
  assert.equal('waitlist/s1_sam' in docs, true);
  assert.equal(sent.length, 0);
});

test('a Calendly appointment its invitee cancelled is not "the academy"',
    async () => {
      const docs = world(entry('s1', 'sam', 'hart', 0));
      const before = docs['sessions/s1'];
      docs['sessions/s1'] = session({status: 'cancelled', booked: 0,
        source: 'calendly'});
      await promotion.handleSessionUpdate(before, docs['sessions/s1'], 's1',
          {db: fakeDb(docs), now: NOW});
      assert.equal('waitlist/s1_sam' in docs, false);
      assert.deepEqual(sent.map((n) => [n.kind, n.subjectKey, n.body]), [
        ['waitlist-expired', `s1_sam_waitlist_${T0}`,
          `The waitlist for ${BLOCK} closed without a ` +
            'spot for Sam. The token held for it is free to use again.'],
      ]);
    });

test('a second promotion into the same session sends its own notice',
    async () => {
      const docs = world(entry('s1', 'sam', 'hart', 0));
      await cancelSeat(docs, 'x1');
      // Sam cancels, the seat is taken, Sam rejoins and is promoted again.
      docs['bookings/sam_s1'] = Object.assign({}, docs['bookings/sam_s1'],
          {status: 'cancelled'});
      Object.assign(docs, booking('x3', 's1'), entry('s1', 'sam', 'hart',
          24 * 60));
      await cancelSeat(docs, 'x3');
      assert.equal(docs['bookings/sam_s1'].status, 'confirmed');
      const keys = sent.filter((n) => n.kind === 'promoted')
          .map((n) => n.subjectKey);
      assert.deepEqual(keys, [`sam_s1_${T0}`,
        `sam_s1_${T0 + 24 * 60 * MIN}`]);
      assert.deepEqual(sent.map((n) => n.bookingId), ['sam_s1', 'sam_s1']);
    });

// --- single token (owner rulings 2026-09-29/30) ----------------------------
// The promotion order (pin F) under the single token: a purchased token
// earns no priority.

const TOKENS = [
  {id: 'single_cs_1', reason: 'single-purchase', expiresAt: '2027-02-27'},
  {id: 's9_ada_cancelled', reason: 'session-cancelled',
    expiresAt: '2026-12-01'},
  {id: 'no-expiry', reason: 'session-cancelled'},
];
const grace = (id) => ({chargedFrom: 'grace', graceTokenId: id,
  reason: null});

test('candidateGraceExpiry: a purchased single token earns no priority',
    () => {
      assert.equal(promotion.candidateGraceExpiry(grace('single_cs_1'),
          TOKENS), null);
    });

test('candidateGraceExpiry: a bonus token keys on ITS expiry', () => {
  assert.equal(promotion.candidateGraceExpiry(grace('s9_ada_cancelled'),
      TOKENS), '2026-12-01');
  assert.equal(promotion.candidateGraceExpiry(grace('no-expiry'), TOKENS),
      '9999-12-31');
});

test('candidateGraceExpiry: period, elite and no charge are null', () => {
  const none = {graceTokenId: null, reason: null};
  assert.equal(promotion.candidateGraceExpiry(
      Object.assign({chargedFrom: 'period'}, none), TOKENS), null);
  assert.equal(promotion.candidateGraceExpiry(
      Object.assign({chargedFrom: 'elite'}, none), TOKENS), null);
  assert.equal(promotion.candidateGraceExpiry(null, TOKENS), null);
});

test('orderCandidates: bonus holder first, single-purchase by joinedAt',
    () => {
      const cand = (id, joinedAt, charge) => ({
        entry: {id, joinedAt: new Date(joinedAt)}, ok: true,
        graceExpiry: promotion.candidateGraceExpiry(charge, TOKENS),
      });
      const period = {chargedFrom: 'period', graceTokenId: null};
      const plain = cand('plain', '2026-11-01T10:00:00Z', period);
      const single = cand('single', '2026-11-01T11:00:00Z',
          grace('single_cs_1'));
      const bonus = cand('bonus', '2026-11-01T12:00:00Z',
          grace('s9_ada_cancelled'));
      const order = promotion.orderCandidates([single, plain, bonus])
          .map((c) => c.entry.id);
      assert.deepEqual(order, ['bonus', 'plain', 'single']);
      const early = cand('early-single', '2026-11-01T09:00:00Z',
          grace('single_cs_1'));
      assert.deepEqual(promotion.orderCandidates([plain, early, bonus])
          .map((c) => c.entry.id), ['bonus', 'early-single', 'plain']);
    });

// A single-token family in the same world: Sol books only with purchased
// tokens (`graceTokens/single_{cs}`, good through the season's last day).
const SOL = {
  'packages/single': {kind: 'single', tokens: 1, windowDays: 30},
  'households/novak': {periodAnchorDay: 1},
  'athletes/sol': {name: 'Sol Novak', householdId: 'novak',
    packageId: 'single', billing: {status: 'active', oneTime: true}},
};
const token = (cs) => ({[`graceTokens/single_${cs}`]: {athleteId: 'sol',
  householdId: 'novak', expiresAt: '2027-02-27', reason: 'single-purchase',
  sourceSessionId: null}});

test('single token: promoted in joining order, the purchased token pays',
    async () => {
      const docs = world(SOL, token('cs_1'), entry('s1', 'sol', 'novak', 0),
          entry('s1', 'sam', 'hart', 5));
      await cancelSeat(docs, 'x1');
      const b = docs['bookings/sol_s1'];
      assert.deepEqual([b.status, b.chargedFrom, b.graceTokenId,
        b.promotedFromWaitlist, b.householdId],
      ['confirmed', 'grace', 'single_cs_1', true, 'novak']);
      assert.equal(docs['sessions/s1'].booked, 2);
      assert.equal('waitlist/s1_sol' in docs, false);
      assert.equal('bookings/sam_s1' in docs, false);
      assert.deepEqual(bodies('promoted'), [`A spot opened - Sol is now ` +
          `booked for ${BLOCK}. One token was used. You can cancel in the ` +
          'app until the day before.']);
      // No priority for a bought token: Kai joined first and goes first,
      // where a bonus token would have jumped the line.
      const later = world(SOL, token('cs_1'), entry('s1', 'kai', 'reyes', 0),
          entry('s1', 'sol', 'novak', 5));
      await cancelSeat(later, 'x1');
      assert.equal(later['bookings/kai_s1'].status, 'confirmed');
      assert.equal('bookings/sol_s1' in later, false);
      await cancelSeat(later, 'x2');
      assert.equal(later['bookings/sol_s1'].graceTokenId, 'single_cs_1');
    });

test('single token: no token to spend means removed, like a normal booking',
    async () => {
      const gone = async (...extra) => {
        const docs = world(SOL, entry('s1', 'sol', 'novak', 0),
            entry('s1', 'sam', 'hart', 5), ...extra);
        await cancelSeat(docs, 'x1');
        assert.equal('bookings/sol_s1' in docs, false);
        assert.equal('waitlist/s1_sol' in docs, false);
        assert.equal(docs['bookings/sam_s1'].status, 'confirmed');
        return sent.filter((n) => n.kind === 'waitlist-removed')
            .map((n) => [n.athleteId, n.category, n.body]);
      };
      const NO_TOKEN = ['sol', 'schedule', 'Sol was next on the waitlist ' +
          `for ${BLOCK} but could not be booked: no tokens are left for ` +
          'that period.'];
      // The package grants no period token: nothing bought, nothing to pay.
      assert.deepEqual(await gone(), [NO_TOKEN]);
      // The one token already paid for a booking in ANOTHER period.
      assert.deepEqual(await gone(token('cs_1'), {'bookings/sol_dec': {
        athleteId: 'sol', sessionId: 'dec', date: '2026-12-02',
        type: 'training', status: 'confirmed', periodKey: '2026-12-01',
        graceTokenId: 'single_cs_1', chargedFrom: 'grace'}}), [NO_TOKEN]);
      // A refunded token is voided, never deleted.
      assert.deepEqual(await gone({'graceTokens/single_cs_1': {
        athleteId: 'sol', householdId: 'novak', expiresAt: '2000-01-01',
        reason: 'single-purchase'}}), [NO_TOKEN]);
      // The one token is HELD by Sol's other waitlist entry.
      assert.deepEqual(await gone(token('cs_1'),
          entry('s9', 'sol', 'novak', -10, {date: '2026-11-19'})),
      [NO_TOKEN]);
      // A second token covers both entries.
      const two = world(SOL, token('cs_1'), token('cs_2'),
          entry('s1', 'sol', 'novak', 0),
          entry('s9', 'sol', 'novak', -10, {date: '2026-11-19'}));
      await cancelSeat(two, 'x1');
      assert.equal(two['bookings/sol_s1'].chargedFrom, 'grace');
      assert.equal('waitlist/s9_sol' in two, true);
    });

test('single token: a buyer moved to a monthly package and yet to pay',
    async () => {
      // billing.oneTime with a monthly packageId is payment-pending
      // (lib.membershipAllowsBooking): never promoted on the old token.
      const docs = world(SOL, token('cs_1'), entry('s1', 'sol', 'novak', 0),
          entry('s1', 'sam', 'hart', 5), {'athletes/sol': {
            name: 'Sol Novak', householdId: 'novak', packageId: 't-12',
            billing: {status: 'active', oneTime: true}}});
      await cancelSeat(docs, 'x1');
      assert.equal('bookings/sol_s1' in docs, false);
      assert.equal(docs['bookings/sam_s1'].status, 'confirmed');
      assert.deepEqual(sent.filter((n) => n.kind === 'waitlist-removed')
          .map((n) => [n.athleteId, n.category]), [['sol', 'billing']]);
    });

run();
