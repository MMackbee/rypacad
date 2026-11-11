'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {memberCancelKey, shouldNoticeBookingCreated, shouldNoticeMemberCancel,
  shouldNoticeConsentNeeded, shouldNoticeMoveReconfirm} =
    require('./notify-gates');

const booking = (over = {}) => Object.assign({athleteId: 'a1',
  sessionId: 's1', status: 'confirmed', createdBy: 'u-parent'}, over);

test('a single confirmed booking gets the notice', () => {
  assert.equal(shouldNoticeBookingCreated(booking()), true);
});

test('a Repeat weekly copy does not (owner report 2026-09-30)', () => {
  assert.equal(shouldNoticeBookingCreated(booking({createdVia: 'repeat'})),
      false);
});

test('a waitlist promotion does not - it sends promoted itself', () => {
  assert.equal(shouldNoticeBookingCreated(
      booking({promotedFromWaitlist: true, createdBy: 'system'})), false);
  assert.equal(shouldNoticeBookingCreated(booking({createdBy: 'system'})),
      false);
  assert.equal(shouldNoticeBookingCreated(
      booking({promotedFromWaitlist: true})), false);
});

test('only confirmed; a missing body never throws', () => {
  assert.equal(shouldNoticeBookingCreated(booking({status: 'cancelled'})),
      false);
  assert.equal(shouldNoticeBookingCreated(null), false);
  assert.equal(shouldNoticeBookingCreated(undefined), false);
});

const cancelled = (over = {}) => booking(Object.assign({status: 'cancelled',
  cancelledBy: 'u-parent', cancelReason: 'member'}, over));

test('a single family cancel gets its receipt', () => {
  assert.equal(shouldNoticeMemberCancel(cancelled()), true);
});

test('one week of a series cancel does not (tester Mike 2026-09-30)', () => {
  assert.equal(shouldNoticeMemberCancel(cancelled({cancelledVia: 'series'})),
      false);
});

test('only the series marker silences it; a Repeat weekly copy that is ' +
    'cancelled on its own still gets the receipt', () => {
  assert.equal(shouldNoticeMemberCancel(cancelled({cancelledVia: 'bulk'})),
      true);
  assert.equal(shouldNoticeMemberCancel(cancelled({cancelledVia: null})),
      true);
  assert.equal(shouldNoticeMemberCancel(cancelled({createdVia: 'repeat'})),
      true);
});

test('never a family receipt for another kind of cancel; a missing body ' +
    'never throws', () => {
  assert.equal(shouldNoticeMemberCancel(
      cancelled({cancelReason: 'session-cancelled'})), false);
  assert.equal(shouldNoticeMemberCancel(cancelled({cancelReason: 'lapsed'})),
      false);
  assert.equal(shouldNoticeMemberCancel(booking({cancelReason: 'member'})),
      false);
  assert.equal(shouldNoticeMemberCancel(null), false);
  assert.equal(shouldNoticeMemberCancel(undefined), false);
});

// Booking changes (2026-11-11): a move is silent on the old row and a
// confirmation on the new one; every cancel gets its own receipt.
const ts = (n) => ({toMillis: () => n});

test('a move: the moved-away row gets no receipt; a created row is ' +
    'confirmed', () => {
  assert.equal(shouldNoticeMemberCancel({status: 'cancelled',
    cancelReason: 'moved'}), false);
  assert.equal(shouldNoticeBookingCreated({status: 'confirmed',
    createdBy: 'u1', createdVia: 'move'}), true);
});

test('shouldNoticeMoveReconfirm: a move onto a row cancelled earlier', () => {
  const before = {status: 'cancelled', createdAt: ts(1)};
  const after = {status: 'confirmed', createdVia: 'move', createdAt: ts(2)};
  const withOver = (row, over) => Object.assign({}, row, over);
  assert.equal(shouldNoticeMoveReconfirm(before, after), true);
  assert.equal(shouldNoticeMoveReconfirm({status: 'cancelled'}, after), true);
  // A client re-book of a row that once came from a move keeps createdAt.
  assert.equal(shouldNoticeMoveReconfirm(before,
      withOver(after, {createdAt: ts(1)})), false);
  assert.equal(shouldNoticeMoveReconfirm(before,
      withOver(after, {createdVia: undefined})), false);
  assert.equal(shouldNoticeMoveReconfirm(before,
      withOver(after, {createdAt: null})), false);
  assert.equal(shouldNoticeMoveReconfirm(
      withOver(before, {status: 'confirmed'}), after), false);
  assert.equal(shouldNoticeMoveReconfirm(null, null), false);
});

test('memberCancelKey: one receipt per cancel', () => {
  assert.equal(memberCancelKey('b1', {}, {cancelledAt: ts(5)}), 'b1_5');
  assert.equal(memberCancelKey('b1', {}, {}), 'b1');
  // An older app's cancel of a row an older re-book left stamped.
  assert.equal(memberCancelKey('b1', {cancelledAt: ts(5)},
      {cancelledAt: ts(5)}), 'b1');
  assert.equal(memberCancelKey('b1', {cancelledAt: ts(5)},
      {cancelledAt: ts(9)}), 'b1_9');
  assert.equal(memberCancelKey('b1', null, null), 'b1');
});

// Mental consent (2026-11-05). 9 AM Chicago; NOW2 is 7 PM Nov 5 in Chicago
// and already Nov 6 in UTC (the 18th-birthday evening, Review Focus 5).
const NOW = new Date('2026-11-05T15:00:00Z');
const NOW2 = new Date('2026-11-06T01:00:00Z');
const SIGNED = {adult: false, adultSignature: null};
const BASE = {
  booking: {athleteId: 'ava', householdId: 'hh', type: 'mental',
    status: 'confirmed', date: '2026-11-12', createdBy: 'system',
    source: 'calendly'},
  athlete: {name: 'Ava Test', dob: '2012-05-14'},
  household: {},
  record: null,
  config: {notices: true},
  now: NOW,
};
/**
 * The gate's argument with one row's overrides: a booking or athlete object
 * merges into the base one (an undefined value drops the key), null
 * replaces it; every other key replaces.
 * @param {!Object} over The row.
 * @return {!Object} The argument.
 */
function gateArgs(over) {
  const merged = (key) => {
    if (!(key in over)) return Object.assign({}, BASE[key]);
    if (over[key] === null) return null;
    const out = Object.assign({}, BASE[key], over[key]);
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
  };
  return Object.assign({}, BASE, over,
      {booking: merged('booking'), athlete: merged('athlete')});
}

test('shouldNoticeConsentNeeded: the gate table', () => {
  const rows = [
    ['an unsigned minor, a Calendly 1:1 written by system', {}, true],
    ['an in-app 1:1', {booking: {createdBy: 'u-dana', source: undefined}},
      true],
    ['the switch off', {config: {notices: false}}, false],
    ['no switch doc', {config: null}, false],
    ['a training booking', {booking: {type: 'training'}}, false],
    ['a cancelled booking', {booking: {status: 'cancelled'}}, false],
    ['a test household', {household: {test: true}}, false],
    ['a test athlete', {athlete: {test: true}}, false],
    ['the household doc is missing', {household: null}, false],
    ['signed', {record: SIGNED}, false],
    ['needs-adult', {record: SIGNED, athlete: {dob: '2008-11-05'}}, true],
    ['no dob', {athlete: {dob: null}}, false],
    ['a replayed or comped booking for a past date',
      {booking: {date: '2026-11-04'}}, false],
    ['a booking for today', {booking: {date: '2026-11-05'}}, true],
    ['no athleteId on the booking', {booking: {athleteId: null}}, false],
    ['no athlete doc', {athlete: null}, false],
    ['no booking', {booking: null}, false],
    ['NOW2: still today in Chicago', {now: NOW2,
      booking: {date: '2026-11-05'}}, true],
    ['NOW2: 18 on the UTC date', {now: NOW2, record: SIGNED,
      athlete: {dob: '2008-11-06'}}, true],
    ['NOW2: 18 tomorrow on the UTC date', {now: NOW2, record: SIGNED,
      athlete: {dob: '2008-11-07'}}, false],
  ];
  for (const [label, over, want] of rows) {
    assert.equal(shouldNoticeConsentNeeded(gateArgs(over)), want, label);
  }
});

run();
