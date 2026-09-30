/**
 * Pure checks for the notification jobs' helpers.
 *   node portal/jobs.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const jobs = require('./jobs');

test('graceNoticeKey: a bonus token keys on its own doc id', () => {
  assert.equal(jobs.graceNoticeKey('grace-w3', {athleteId: 'wren',
    expiresAt: '2026-11-11', reason: 'session-cancelled'}), 'grace-w3');
  assert.equal(jobs.graceNoticeKey('s1_wren_waitlist', {athleteId: 'wren',
    expiresAt: '2026-11-11', reason: 'waitlist-expired'}),
  's1_wren_waitlist');
  assert.equal(jobs.graceNoticeKey('legacy', null), 'legacy');
});

test('graceNoticeKey: single tokens share one key per athlete and day',
    () => {
      const a = jobs.graceNoticeKey('single_cs_a', {athleteId: 'sol',
        expiresAt: '2027-02-27', reason: 'single-purchase'});
      const b = jobs.graceNoticeKey('single_cs_b', {athleteId: 'sol',
        expiresAt: '2027-02-27', reason: 'single-purchase'});
      assert.equal(a, 'sol_single_2027-02-27');
      assert.equal(a, b);
      assert.notEqual(jobs.graceNoticeKey('single_cs_c', {athleteId: 'max',
        expiresAt: '2027-02-27', reason: 'single-purchase'}), a);
    });

test('addDays: UTC-noon arithmetic across a month end', () => {
  assert.equal(jobs.addDays('2027-02-20', 7), '2027-02-27');
  assert.equal(jobs.addDays('2026-10-28', 7), '2026-11-04');
});

run();
