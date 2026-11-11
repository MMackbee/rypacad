'use strict';
// The move decision (booking changes, 2026-11-11): every gate a fresh
// booking passes, the carry-or-charge order and the free comp, as one pure
// function over what portal/move.js reads in its transaction.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {REFUSALS, decideMove, isFreeComp} = require('./move-decide');

// Noon in Chicago on Tue, Nov 10 2026.
const NOW = new Date('2026-11-10T18:00:00Z');
const T6 = {kind: 'tokens', tokens: 6};
const SINGLE = {kind: 'single', tokens: 1};
const ELITE = {kind: 'elite', tokens: null};
const SINGLE_TOKEN = {id: 'single_cs_1', expiresAt: '2027-02-27',
  reason: 'single-purchase'};

const training = (id, date, time, over) => Object.assign({id, date,
  time: time || '4:00 PM', type: 'training', capacity: 12, booked: 3,
  status: 'scheduled'}, over);
const row = (sessionId, date, over) => Object.assign({
  id: `sam_${sessionId}`, athleteId: 'sam', sessionId, householdId: 'hart',
  date, type: 'training', status: 'confirmed',
  periodKey: `${date.slice(0, 8)}01`, chargedFrom: 'period',
  graceTokenId: null}, over);
const OLD = row('s1', '2026-11-12');
const sixIn = (month) => [10, 11, 12, 13, 14, 15].map(
    (d) => row(`${month}-${d}`, `${month}-${d}`));
const NOV_SIX = [OLD].concat(sixIn('2026-11').slice(0, 5));
const DEC_SIX = sixIn('2026-12');

/**
 * @param {!Object=} over Top-level ctx fields to replace.
 * @return {!Object} A whole move ctx: Sam (household hart, 6 tokens) moves
 *     his Thu Nov 12 4:00 PM training to Fri Nov 13 4:00 PM.
 */
function world(over) {
  return Object.assign({
    uid: 'u-parent',
    user: {role: 'parent', householdId: 'hart'},
    old: OLD,
    oldSession: training('s1', '2026-11-12'),
    target: training('s2', '2026-11-13'),
    targetBooking: null,
    targetLive: 3,
    athlete: {householdId: 'hart', packageId: 't-6', handicap: 4},
    household: {periodAnchorDay: 1},
    pkg: T6,
    tokenPeriod: null,
    periodBookings: [OLD],
    graceSpends: [],
    waitlist: [],
    graceTokens: [],
    now: NOW,
  }, over);
}
const refusal = (over) => decideMove(world(over)).reason;
const moved = (charge, period, over) => Object.assign({ok: true,
  comp: false, charge, period, taken: 3, waitlistEntryId: null}, over);
const PERIOD = {chargedFrom: 'period', graceTokenId: null};
const NOV = {periodKey: '2026-11-01', periodEnd: '2026-11-30'};
const DEC = {periodKey: '2026-12-01', periodEnd: '2026-12-31'};
const DEC_1 = training('s2', '2026-12-01');

test('moves within the period carrying the period token', () => {
  assert.deepEqual(decideMove(world()), moved(PERIOD, NOV));
  // The family keeps the token they picked: a spare bonus token is not
  // spent in its place (a fresh booking would take it first).
  assert.deepEqual(decideMove(world({
    graceTokens: [{id: 'g2', expiresAt: '2026-11-30'}]})), moved(PERIOD, NOV));
});

test('a full November still moves inside November ' +
    '(the old one counts as given back)', () => {
  assert.equal(NOV_SIX.length, 6);
  assert.deepEqual(decideMove(world({periodBookings: NOV_SIX})),
      moved(PERIOD, NOV));
});

test('a move into December spends December\'s token', () => {
  assert.deepEqual(decideMove(world({target: DEC_1, periodBookings: []})),
      moved(PERIOD, DEC));
  assert.equal(refusal({target: DEC_1, periodBookings: DEC_SIX}),
      'no-tokens-left');
});

const BONUS_OLD = row('s1', '2026-11-12',
    {chargedFrom: 'grace', graceTokenId: 'g1'});
const bonus = (over) => Object.assign({old: BONUS_OLD,
  periodBookings: [BONUS_OLD], graceSpends: [BONUS_OLD],
  graceTokens: [{id: 'g1', expiresAt: '2026-11-20'}]}, over);

test('a bonus token carries while it is valid on the new date', () => {
  assert.deepEqual(decideMove(world(bonus())),
      moved({chargedFrom: 'grace', graceTokenId: 'g1'}, NOV));
});

test('a bonus token that ends before the new date falls back to a fresh ' +
    'charge', () => {
  assert.deepEqual(
      decideMove(world(bonus({target: DEC_1, periodBookings: []}))),
      moved(PERIOD, DEC));
  assert.equal(refusal(bonus({target: DEC_1, periodBookings: DEC_SIX})),
      'no-tokens-left');
});

const SINGLE_OLD = row('s1', '2026-11-12',
    {chargedFrom: 'grace', graceTokenId: 'single_cs_1'});
const single = (over) => Object.assign({pkg: SINGLE, old: SINGLE_OLD,
  periodBookings: [SINGLE_OLD], graceSpends: [SINGLE_OLD],
  graceTokens: [SINGLE_TOKEN]}, over);
const SINGLE_CHARGE = {chargedFrom: 'grace', graceTokenId: 'single_cs_1'};

test('a single token carries to any period', () => {
  assert.deepEqual(
      decideMove(world(single({target: DEC_1, periodBookings: []}))),
      moved(SINGLE_CHARGE, DEC));
  assert.equal(refusal(single({target: DEC_1, periodBookings: [],
    graceSpends: [], graceTokens: []})), 'no-session-token');
});

test('Elite stays Elite; one-per-day counts other bookings only', () => {
  const old = row('s1', '2026-11-12', {chargedFrom: 'elite'});
  const elite = (over) => Object.assign({pkg: ELITE, old,
    periodBookings: [old]}, over);
  const ELITE_CHARGE = {chargedFrom: 'elite', graceTokenId: null};
  assert.deepEqual(decideMove(world(elite())), moved(ELITE_CHARGE, NOV));
  assert.equal(refusal(elite({
    periodBookings: [old, row('s9', '2026-11-13')]})), 'one-per-day');
  assert.deepEqual(decideMove(world(elite({
    target: training('s2', '2026-11-12', '6:00 PM')}))),
  moved(ELITE_CHARGE, NOV));
});

test('a free comp stays comp and skips billing, freeze and tokens', () => {
  const old = row('s1', '2026-11-12', {comp: true});
  assert.deepEqual(decideMove(world({
    old,
    athlete: {householdId: 'hart', packageId: 't-6', handicap: 4,
      billing: {status: 'pending'}},
    household: {periodAnchorDay: 1, membership: {status: 'past_due'}},
    periodBookings: DEC_SIX,
    target: DEC_1,
  })), moved(PERIOD, DEC, {comp: true}));
});

test('an ex-comp row re-booked with a token is an ordinary booking', () => {
  const old = row('s1', '2026-11-12', {comp: true, chargedFrom: 'grace',
    graceTokenId: 'single_cs_1'});
  const exComp = (over) => single(Object.assign({old,
    periodBookings: [old], graceSpends: [old]}, over));
  assert.deepEqual(decideMove(world(exComp())), moved(SINGLE_CHARGE, NOV));
  assert.equal(refusal(exComp({athlete: {householdId: 'hart',
    packageId: 'single', billing: {status: 'pending'}}})),
  'membership-inactive');
  assert.deepEqual([{comp: true}, {comp: true, chargedFrom: 'period'},
    {comp: true, chargedFrom: 'elite'},
    {comp: true, chargedFrom: 'grace', graceTokenId: 'g'}].map(isFreeComp),
  [true, true, false, false]);
});

test('an unpaid or frozen ordinary booking is refused', () => {
  const athlete = (over) => ({athlete: Object.assign({householdId: 'hart',
    packageId: 't-6', handicap: 4}, over)});
  assert.equal(refusal(athlete({billing: {status: 'pending'}})),
      'membership-inactive');
  assert.equal(refusal({household: {periodAnchorDay: 1,
    membership: {status: 'past_due'}}}), 'membership-inactive');
  assert.equal(refusal(Object.assign(athlete({test: true}),
      {old: row('s1', '2026-11-12', {comp: true})})), 'membership-inactive');
  assert.equal(refusal({pkg: null}), 'membership-inactive');
});

test('an athlete\'s own login moves its own booking', () => {
  assert.deepEqual(decideMove(world({uid: 'u-sam',
    user: {role: 'athlete', athleteId: 'sam', householdId: 'hart'}})),
  moved(PERIOD, NOV));
});

test('the old booking\'s own refusals', () => {
  assert.equal(refusal({old: null}), 'booking-missing');
  assert.equal(refusal({user: {role: 'parent', householdId: 'lopez'}}),
      'not-yours');
  assert.equal(refusal({user: {role: 'athlete', athleteId: 'ava',
    householdId: 'hart'}}), 'not-yours');
  assert.equal(refusal({user: null}), 'not-yours');
  const old = (over) => ({old: row('s1', '2026-11-12', over)});
  assert.equal(refusal(old({status: 'cancelled'})), 'not-confirmed');
  assert.equal(refusal(old({source: 'calendly'})), 'calendly-managed');
  assert.equal(refusal(old({type: 'mental'})), 'mental-no-move');
  assert.equal(refusal({target: training('s1', '2026-11-12')}),
      'same-session');
  assert.equal(refusal({oldSession: training('s1', '2026-11-10',
      '11:00 AM')}), 'already-started');
  assert.equal(refusal({oldSession: null}), 'session-missing');
});

test('the target\'s refusals', () => {
  const target = (over, date, time) => ({target: training('s2',
      date || '2026-11-13', time, over)});
  assert.equal(refusal({target: null}), 'session-missing');
  assert.equal(refusal(target({type: 'tournament'})), 'different-type');
  assert.equal(refusal(target({status: 'cancelled'})), 'session-cancelled');
  assert.equal(refusal(target({hidden: true})), 'session-hidden');
  assert.equal(refusal(target({bookable: false})), 'display-only');
  assert.equal(refusal(target({}, '2026-11-10', '11:00 AM')),
      'session-past');
  assert.equal(refusal(target({}, '2027-01-05')), 'outside-window');
  for (const status of ['confirmed', 'attended', 'noshow']) {
    assert.equal(refusal({targetBooking: row('s2', '2026-11-13', {status})}),
        'already-booked');
  }
  assert.equal(refusal(target({maxHandicap: 3})), 'handicap-reserved');
  assert.equal(refusal(Object.assign(target({maxHandicap: 5}),
      {athlete: {householdId: 'hart', packageId: 't-6'}})),
  'handicap-reserved');
  assert.equal(refusal(target({capacity: 3, booked: 3})), 'full');
  assert.equal(refusal(Object.assign(target({capacity: 3, booked: 1}),
      {targetLive: 3})), 'full');
  assert.equal(refusal(target({capacity: undefined})), 'full');
});

test('a target today with an unreadable time is open on its day', () => {
  assert.deepEqual(decideMove(world({
    target: training('s2', '2026-11-10', 'TBA')})), moved(PERIOD, NOV));
});

test('anchor 15: Nov 14 to Nov 16 crosses into the next period', () => {
  const old = row('s1', '2026-11-14', {periodKey: '2026-10-15'});
  const anchored = (periodBookings) => world({
    household: {periodAnchorDay: 15}, old, periodBookings,
    oldSession: training('s1', '2026-11-14'),
    target: training('s2', '2026-11-16'),
  });
  assert.deepEqual(decideMove(anchored([])), moved(PERIOD,
      {periodKey: '2026-11-15', periodEnd: '2026-12-14'}));
  const six = [16, 17, 18, 19, 20, 21].map((d) =>
    row(`n${d}`, `2026-11-${d}`, {periodKey: '2026-11-15'}));
  assert.equal(decideMove(anchored(six)).reason, 'no-tokens-left');
});

test('a waitlist entry on the target is left out of the count and ' +
    'returned for deletion', () => {
  const entry = {id: 's2_sam', sessionId: 's2', athleteId: 'sam',
    householdId: 'hart', date: '2026-11-13', periodKey: '2026-11-01'};
  assert.deepEqual(decideMove(world(single({waitlist: [entry]}))),
      moved(SINGLE_CHARGE, NOV, {waitlistEntryId: 's2_sam'}));
});

test('REFUSALS covers every reason with C2\'s code', () => {
  assert.deepEqual(Object.keys(REFUSALS).sort(), [
    'signed-out', 'bad-request', 'booking-missing', 'not-yours',
    'not-confirmed', 'calendly-managed', 'mental-no-move', 'same-session',
    'session-missing', 'already-started', 'different-type',
    'session-cancelled', 'session-hidden', 'display-only', 'session-past',
    'outside-window', 'already-booked', 'membership-inactive',
    'booking-not-open', 'handicap-reserved', 'full', 'one-per-day',
    'no-tokens-left', 'no-session-token',
  ].sort());
  assert.deepEqual(['signed-out', 'bad-request', 'booking-missing',
    'not-yours', 'full'].map((r) => REFUSALS[r].code), ['unauthenticated',
    'invalid-argument', 'not-found', 'permission-denied',
    'failed-precondition']);
  assert.equal(REFUSALS.full.message, 'That session just filled.');
  for (const r of Object.keys(REFUSALS)) {
    assert.ok(REFUSALS[r].message.length > 0, r);
  }
});

run();
