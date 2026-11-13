'use strict';
// The staffBookSession decision (staff booking tools, 2026-11-13): who may
// add, which session and athlete, the period on the Chicago clock, the
// charge in the family order, Free, and the full check last.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {REFUSALS, decideStaffBook, parseStaffBook} =
    require('./staff-book-decide');

// Noon in Chicago on Thu, Nov 12 2026.
const NOW = new Date('2026-11-12T18:00:00Z');
const T6 = {id: 't-6', kind: 'tokens', tokens: 6};
const SINGLE = {id: 'single', kind: 'single', tokens: 1};
const ELITE = {id: 'elite', kind: 'elite', tokens: null};
const PERIOD = {chargedFrom: 'period', graceTokenId: null};
const NOV = {periodKey: '2026-11-01', periodEnd: '2026-11-30'};
const DEC = {periodKey: '2026-12-01', periodEnd: '2026-12-31'};

const training = (id, date, over) => Object.assign({id, date,
  time: '4:00 PM', type: 'training', capacity: 12, booked: 3}, over);
const row = (sessionId, date, over) => Object.assign({
  id: `jordan_${sessionId}`, athleteId: 'jordan', sessionId,
  householdId: 'hh1', date, type: 'training', status: 'confirmed',
  periodKey: `${date.slice(0, 8)}01`, chargedFrom: 'period',
  graceTokenId: null}, over);
const rowsOn = (month, days) => days.map(
    (d) => row(`${month}-${d}`, `${month}-${d}`));
const NOV_FIVE = rowsOn('2026-11', ['02', '03', '04', '05', '06']);
const NOV_SIX = rowsOn('2026-11', ['02', '03', '04', '05', '06', '09']);
const S9 = training('s9', '2026-12-03', {time: '4:00 PM'});
const JORDAN = {id: 'jordan', name: 'Jordan Whitfield', householdId: 'hh1',
  packageId: 't-6', handicap: 4};

/**
 * @param {!Object=} over Top-level ctx fields to replace.
 * @return {!Object} A passing ctx: the owner adds Jordan (hh1, anchor 1,
 *     t-6) to Tue Nov 17 4:00 PM training `s2` (3 of 12 taken).
 */
function world(over) {
  return Object.assign({
    user: {role: 'owner'},
    athlete: JORDAN,
    household: {id: 'hh1', periodAnchorDay: 1},
    pkg: T6,
    session: training('s2', '2026-11-17'),
    existing: null,
    live: 3,
    tokenPeriod: null,
    periodBookings: [],
    graceSpends: [],
    waitlist: [],
    graceTokens: [],
    now: NOW,
    free: false,
    allowFull: false,
  }, over);
}
const decide = (over) => decideStaffBook(world(over));
const reason = (over) => decide(over).reason;
const ok = (over) => Object.assign({ok: true, comp: false, charge: PERIOD,
  period: NOV, taken: 3, capacity: 12, waitlistEntryId: null,
  rebooked: false, overrides: []}, over);
const athlete = (over) => ({athlete: Object.assign({}, JORDAN, over)});
const session = (over, date) => ({session: training('s2',
    date || '2026-11-17', over)});
const graceToken = (id, expiresAt) => ({id, athleteId: 'jordan', expiresAt});

test('a passing add', () => {
  assert.deepEqual(decide(), ok());
  assert.deepEqual(decide({user: {role: 'ops'}}), ok());
});

test('every refusal in table order', () => {
  for (const user of [null, {role: 'coach'}, {role: 'mental'},
    {role: 'parent', householdId: 'hh1'},
    {role: 'athlete', athleteId: 'jordan'}]) {
    assert.equal(reason({user}), 'not-staff', JSON.stringify(user));
  }
  assert.equal(reason({athlete: null}), 'athlete-missing');
  assert.equal(reason(athlete({householdId: undefined})), 'no-household');
  assert.equal(reason({household: null}), 'no-household');
  assert.equal(reason(athlete({test: true})), 'test-athlete');
  assert.equal(reason({household: {id: 'hh1', test: true}}),
      'test-athlete');
  assert.equal(reason({session: null}), 'session-missing');
  assert.equal(reason(session({date: undefined})), 'session-missing');
  for (const over of [{type: 'mental'}, {source: 'calendly'},
    {unresolved: true}]) {
    assert.equal(reason(session(over)), 'calendly', JSON.stringify(over));
  }
  assert.equal(reason(session({status: 'cancelled'})), 'session-cancelled');
  assert.equal(reason(session({hidden: true})), 'session-hidden');
  assert.equal(reason(session({bookable: false})), 'display-only');
  assert.equal(reason(session({}, '2026-10-27')), 'period-over');
  for (const status of ['confirmed', 'attended', 'noshow']) {
    assert.equal(reason({existing: row('s2', '2026-11-17', {status})}),
        'already-booked', status);
  }
  assert.deepEqual(decide({existing: row('s2', '2026-11-17',
      {status: 'cancelled'})}), ok({rebooked: true}));
  for (const over of [{pkg: null},
    athlete({billing: {status: 'pending'}}),
    athlete({billing: {status: 'active', oneTime: true}}),
    {household: {id: 'hh1', membership: {status: 'past_due'}}},
    {household: {id: 'hh1', membership: {status: 'lapsed'}}}]) {
    assert.equal(reason(over), 'not-paid', JSON.stringify(over));
  }
  assert.equal(reason({periodBookings: NOV_SIX}), 'no-tokens-left');
  assert.equal(reason({pkg: SINGLE}), 'no-session-token');
  assert.equal(reason(session({booked: 12})), 'full');
});

test('the first failing check wins', () => {
  assert.equal(reason(Object.assign(athlete({test: true}),
      session({booked: 12}))), 'test-athlete');
  assert.equal(reason(Object.assign({periodBookings: NOV_SIX},
      session({booked: 12}))), 'no-tokens-left');
  assert.equal(reason(Object.assign({pkg: null}, session({booked: 12}))),
      'not-paid');
});

test('full: refused with the count, allowed when asked', () => {
  assert.deepEqual(decide(session({booked: 12})),
      {ok: false, reason: 'full', details: {taken: 12, capacity: 12}});
  assert.deepEqual(decide({live: 12}),
      {ok: false, reason: 'full', details: {taken: 12, capacity: 12}});
  assert.deepEqual(decide({live: 12, allowFull: true}),
      ok({taken: 12, overrides: ['full']}));
  assert.deepEqual(decide(Object.assign({allowFull: true},
      session({booked: 13}))), ok({taken: 13, overrides: ['full']}));
});

test('the charge order', () => {
  assert.deepEqual(decide({graceTokens: [graceToken('g-dec', '2026-12-05'),
    graceToken('g-nov', '2026-11-20')]}),
  ok({charge: {chargedFrom: 'grace', graceTokenId: 'g-nov'}}));
  // A bonus token that ends before the session is skipped for the period.
  assert.deepEqual(decide({graceTokens: [graceToken('g1', '2026-11-15')]}),
      ok());
  assert.deepEqual(decide({pkg: ELITE}),
      ok({charge: {chargedFrom: 'elite', graceTokenId: null}}));
  const single = (over) => Object.assign({pkg: SINGLE,
    athlete: Object.assign({}, JORDAN, {packageId: 'single'})}, over);
  assert.deepEqual(decide(single({graceTokens: [
    graceToken('single_cs1', '2027-02-27')]})),
  ok({charge: {chargedFrom: 'grace', graceTokenId: 'single_cs1'}}));
  assert.equal(reason(single()), 'no-session-token');
  assert.deepEqual(decide(single({tokenPeriod: {granted: 1}})), ok());
  assert.equal(reason({periodBookings: NOV_SIX}), 'no-tokens-left');
});

test('a next-period session spends a next-period token', () => {
  const dec = (rows) => decide({session: S9, tokenPeriod: {granted: 6},
    periodBookings: rows});
  assert.equal(dec(rowsOn('2026-12',
      ['01', '02', '04', '07', '08', '09'])).reason, 'no-tokens-left');
  assert.deepEqual(dec(rowsOn('2026-12', ['01', '02', '04', '07', '08'])),
      ok({period: DEC}));
});

test('period edges', () => {
  const nov30 = training('s30', '2026-11-30');
  assert.deepEqual(decide({session: nov30,
    now: new Date('2026-12-01T05:30:00Z')}), ok({overrides: ['started']}));
  assert.equal(reason({session: nov30,
    now: new Date('2026-12-01T06:30:00Z')}), 'period-over');
  const anchored = (date) => decide({session: training('sx', date),
    household: {id: 'hh1', periodAnchorDay: 15}});
  assert.deepEqual(anchored('2026-11-16'), ok({period: {
    periodKey: '2026-11-15', periodEnd: '2026-12-14'}}));
  // Oct 15 - Nov 14 is still open on Nov 12, though Oct 27 is long past.
  assert.deepEqual(anchored('2026-10-27'), ok({period: {
    periodKey: '2026-10-15', periodEnd: '2026-11-14'},
  overrides: ['started']}));
  assert.equal(anchored('2026-10-14').reason, 'period-over');
});

test('Free on every package', () => {
  const FREE = ok({comp: true});
  for (const over of [{}, {pkg: ELITE}, {pkg: SINGLE}, {pkg: null},
    athlete({billing: {status: 'pending'}}),
    {household: {id: 'hh1', membership: {status: 'lapsed'}}},
    {periodBookings: NOV_SIX}]) {
    assert.deepEqual(decide(Object.assign({free: true}, over)), FREE,
        JSON.stringify(over));
  }
});

test('waitlist', () => {
  const entry = (sessionId, date) => ({id: `${sessionId}_jordan`,
    sessionId, athleteId: 'jordan', householdId: 'hh1', date,
    periodKey: '2026-11-01'});
  // The only single token is held by the entry on this very session.
  assert.deepEqual(decide({pkg: SINGLE,
    athlete: Object.assign({}, JORDAN, {packageId: 'single'}),
    graceTokens: [graceToken('single_cs1', '2027-02-27')],
    waitlist: [entry('s2', '2026-11-17')]}),
  ok({charge: {chargedFrom: 'grace', graceTokenId: 'single_cs1'},
    waitlistEntryId: 's2_jordan'}));
  assert.equal(reason({periodBookings: NOV_FIVE,
    waitlist: [entry('s5', '2026-11-19')]}), 'no-tokens-left');
  assert.deepEqual(decide({periodBookings: NOV_FIVE,
    waitlist: [entry('s2', '2026-11-17')]}),
  ok({waitlistEntryId: 's2_jordan'}));
  // Free still deletes the entry.
  assert.deepEqual(decide({free: true,
    waitlist: [entry('s2', '2026-11-17')]}),
  ok({comp: true, waitlistEntryId: 's2_jordan'}));
});

test('overrides reported', () => {
  assert.deepEqual(decide(session({time: '11:00 AM'}, '2026-11-12'))
      .overrides, ['started']);
  assert.deepEqual(decide(session({}, '2026-11-10')).overrides,
      ['started']);
  assert.deepEqual(decide(session({}, '2027-01-05')).overrides,
      ['outside-window']);
  assert.deepEqual(decide(session({maxHandicap: 3})).overrides,
      ['handicap-reserved']);
  assert.deepEqual(decide({pkg: ELITE,
    periodBookings: [row('s7', '2026-11-17', {chargedFrom: 'elite'})]})
      .overrides, ['one-per-day']);
});

test('parseStaffBook', () => {
  assert.deepEqual(parseStaffBook({athleteId: 'jordan', sessionId: 's2'}),
      {athleteId: 'jordan', sessionId: 's2', free: false, allowFull: false});
  assert.deepEqual(parseStaffBook({athleteId: 'jordan', sessionId: 's2',
    free: true, allowFull: true}),
  {athleteId: 'jordan', sessionId: 's2', free: true, allowFull: true});
  for (const data of [null, undefined, 'jordan', [],
    {sessionId: 's2'}, {athleteId: 'jordan'},
    {athleteId: 'a/b', sessionId: 's2'},
    {athleteId: '__x__', sessionId: 's2'},
    {athleteId: 'jordan', sessionId: '.'},
    {athleteId: 'x'.repeat(201), sessionId: 's2'},
    {athleteId: 'jordan', sessionId: 's2', free: 'yes'},
    {athleteId: 'jordan', sessionId: 's2', free: null},
    {athleteId: 'jordan', sessionId: 's2', allowFull: 1}]) {
    assert.equal(parseStaffBook(data), null, JSON.stringify(data));
  }
  assert.deepEqual(parseStaffBook({athleteId: 'jordan', sessionId: 's2',
    householdId: 'hh2'}),
  {athleteId: 'jordan', sessionId: 's2', free: false, allowFull: false});
});

test('REFUSALS: the codes', () => {
  const PRE = 'failed-precondition';
  const expected = {
    'signed-out': 'unauthenticated',
    'bad-request': 'invalid-argument',
    'not-staff': 'permission-denied',
    'athlete-missing': 'not-found',
  };
  for (const r of ['no-household', 'test-athlete', 'session-missing',
    'calendly', 'session-cancelled', 'session-hidden', 'display-only',
    'period-over', 'already-booked', 'not-paid', 'no-tokens-left',
    'no-session-token', 'full']) {
    expected[r] = PRE;
  }
  assert.deepEqual(Object.keys(REFUSALS).sort(),
      Object.keys(expected).sort());
  assert.equal(Object.keys(REFUSALS).length, 17);
  for (const [r, code] of Object.entries(expected)) {
    assert.equal(REFUSALS[r].code, code, r);
    assert.ok(REFUSALS[r].message.length > 0, r);
    assert.doesNotMatch(REFUSALS[r].message, /Jordan|Riley|Casey/, r);
  }
});

run();
