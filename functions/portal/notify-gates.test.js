'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {shouldNoticeBookingCreated} = require('./notify-gates');

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

run();
