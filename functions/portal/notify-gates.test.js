'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {shouldNoticeBookingCreated, shouldNoticeMemberCancel} =
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

run();
