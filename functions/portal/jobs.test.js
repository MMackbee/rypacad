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

const lib = require('./lib');
const paid = {billing: {status: 'active'}, packageId: 't-6'};

test('tokenReminderApplies: the Oct 24 run (October period) sends nothing',
    () => {
      // The 2026-10-24 09:00 run targets periods ending Oct 31: pre-season.
      const period = lib.periodFor('2026-10-24', 1);
      assert.equal(period.periodEnd, '2026-10-31');
      assert.equal(jobs.addDays('2026-10-24', jobs.EXPIRY_LEAD_DAYS),
          period.periodEnd);
      assert.equal(jobs.tokenReminderApplies({household: {}, athlete: paid,
        period}), false);
    });

test('tokenReminderApplies: a paid athlete in a season period is warned',
    () => {
      const period = lib.periodFor('2026-11-24', 1);
      assert.equal(period.periodEnd, '2026-11-30');
      assert.equal(jobs.tokenReminderApplies({household: {}, athlete: paid,
        period}), true);
      // No billing block at all is a pre-sprint athlete: active.
      assert.equal(jobs.tokenReminderApplies({household: {},
        athlete: {packageId: 't-6'}, period}), true);
    });

test('tokenReminderApplies: unpaid, lapsed and past-due athletes are skipped',
    () => {
      const period = lib.periodFor('2026-11-24', 1);
      for (const status of ['pending', 'lapsed', 'past_due']) {
        assert.equal(jobs.tokenReminderApplies({household: {},
          athlete: {packageId: 't-6', billing: {status}}, period}), false,
        status);
      }
      assert.equal(jobs.tokenReminderApplies({
        household: {membership: {status: 'past_due'}}, athlete: paid,
        period}), false);
      // A single-token buyer moved onto a package is unpaid until it is paid.
      assert.equal(jobs.tokenReminderApplies({household: {},
        athlete: {packageId: 't-4', billing: {status: 'active',
          oneTime: true}}, period}), false);
    });

test('tokenReminderApplies: a period ending on or after the season start',
    () => {
      assert.equal(jobs.tokenReminderApplies({household: {}, athlete: paid,
        period: {periodEnd: '2026-11-02'}}), false);
      assert.equal(jobs.tokenReminderApplies({household: {}, athlete: paid,
        period: {periodEnd: jobs.SEASON_START}}), true);
      assert.equal(jobs.tokenReminderApplies({household: {}, athlete: paid,
        period: null}), false);
    });

run();
