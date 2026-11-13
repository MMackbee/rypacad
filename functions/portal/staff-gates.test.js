'use strict';
// The pure staff booking helpers (staff booking tools, 2026-11-13): the
// period-over rule on the Chicago clock, the healed seat count, the
// handicap block, and every family limit staff skip, reported in one order.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {OVERRIDES, capacityOf, handicapBlocked, logStaffBooking,
  periodOver, staffOverrides, takenOf} = require('./staff-gates');

// Noon in Chicago on Thu, Nov 12 2026.
const NOW = new Date('2026-11-12T18:00:00Z');
const T6 = {kind: 'tokens', tokens: 6};
const ELITE = {kind: 'elite', tokens: null};

const training = (date, over) => Object.assign({id: 's2', date,
  time: '4:00 PM', type: 'training', capacity: 12, booked: 3}, over);
const overrides = (over) => staffOverrides(Object.assign({
  session: training('2026-11-17'),
  athlete: {handicap: 4},
  pkg: T6,
  bookings: [],
  taken: 3,
  allowFull: false,
  now: NOW,
}, over));

test('periodOver: the Chicago date and the household anchor', () => {
  // Nov 30, 11:30 PM in Chicago is already Dec 1 in UTC.
  assert.equal(periodOver('2026-11-30', 1,
      new Date('2026-12-01T05:30:00Z')), false);
  assert.equal(periodOver('2026-11-30', 1,
      new Date('2026-12-01T06:30:00Z')), true);
  const nov15 = new Date('2026-11-15T18:00:00Z');
  assert.equal(periodOver('2026-11-14', 15, nov15), true);
  assert.equal(periodOver('2026-11-15', 15, nov15), false);
});

test('takenOf heals a counter that reads low', () => {
  assert.equal(takenOf(5, {booked: 2}), 5);
  assert.equal(takenOf(1, {booked: 3}), 3);
  assert.equal(takenOf(0, {}), 0);
  assert.equal(capacityOf({}), 0);
  assert.equal(capacityOf({capacity: 12}), 12);
});

test('handicapBlocked', () => {
  assert.equal(handicapBlocked({maxHandicap: 5}, {handicap: 9}), true);
  assert.equal(handicapBlocked({maxHandicap: 5}, {}), true);
  assert.equal(handicapBlocked({maxHandicap: 5}, {handicap: 5}), false);
  assert.equal(handicapBlocked({}, {handicap: 9}), false);
});

test('staffOverrides: every skipped limit, in one order', () => {
  assert.deepEqual(OVERRIDES, ['started', 'outside-window',
    'handicap-reserved', 'one-per-day', 'full']);
  assert.deepEqual(overrides(), []);
  assert.deepEqual(overrides({session: training('2027-01-05')}),
      ['outside-window']);
  // Elite's window runs to Jan 31.
  assert.deepEqual(overrides({session: training('2027-01-05'),
    pkg: ELITE}), []);
  const today = training('2026-11-12', {time: '11:00 AM', maxHandicap: 5,
    capacity: 12});
  const sameDay = {id: 'jordan_s7', status: 'confirmed',
    date: '2026-11-12', type: 'training'};
  const all = {session: today, athlete: {handicap: 9}, pkg: ELITE,
    bookings: [sameDay], taken: 12, allowFull: true};
  assert.deepEqual(overrides(all),
      ['started', 'handicap-reserved', 'one-per-day', 'full']);
  assert.deepEqual(overrides(Object.assign({}, all, {
    bookings: [Object.assign({}, sameDay, {status: 'cancelled'})]})),
  ['started', 'handicap-reserved', 'full']);
  assert.deepEqual(overrides(Object.assign({}, all, {allowFull: false})),
      ['started', 'handicap-reserved', 'one-per-day']);
});

test('logStaffBooking writes one line', () => {
  const calls = [];
  const log = console.log;
  console.log = (...a) => calls.push(a);
  try {
    logStaffBooking({action: 'add', by: 'u-owner'});
  } finally {
    console.log = log;
  }
  assert.deepEqual(calls,
      [['staff booking', '{"action":"add","by":"u-owner"}']]);
});

run();
