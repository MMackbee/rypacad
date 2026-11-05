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

// Mental consent (2026-11-05): the day-before consent-reminder rides the
// 17:00 job, before the Calendly skip. notify.sendNotice is replaced by a
// recorder that answers duplicate for a kind_subjectKey it has seen.
const {fakeDb} = require('./fake-firestore');
const notify = require('./notify');
const sent = [];
const seen = new Set();
// Kinds whose send fails the way sendNotice reports it: no throw, sent false.
const failKinds = new Set();
notify.sendNotice = async (args) => {
  const id = `${args.kind}_${args.subjectKey}`;
  if (failKinds.has(args.kind)) {
    return {id, duplicate: false, sent: false, error: 'boom'};
  }
  if (seen.has(id)) return {id, duplicate: true, sent: false};
  seen.add(id);
  sent.push(args);
  return {id, duplicate: false, sent: true};
};
/** Clears the recorder before a case. */
function resetSent() {
  sent.length = 0;
  seen.clear();
  failKinds.clear();
}
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const consentBase = () => ({
  'config/mentalConsent': {notices: true, enabledAt: '2026-11-05'},
  'households/hh': {name: 'Test family'},
  'athletes/ava': {name: 'Ava Test', dob: '2012-05-14', householdId: 'hh',
    loginEmail: 'ava@example.com'},
  'users/u-ava': {role: 'athlete', athleteId: 'ava', householdId: 'hh'},
  'loginInvites/ava@example.com': {status: 'claimed'},
  'athletes/max': {name: 'Max Test', dob: '2007-03-02', householdId: 'hh'},
});
const booked = (athleteId, type, sessionId, extra) => Object.assign({
  athleteId, type, sessionId, date: '2026-11-06', status: 'confirmed',
  householdId: 'hh'}, extra);
const reminderDocs = () => Object.assign(consentBase(), {
  'athletes/jo': {name: 'Jo Test', dob: '2012-01-01', householdId: 'hh'},
  'mentalConsents/jo': {adult: false, adultSignature: null},
  'sessions/tr-1': {date: '2026-11-06', time: '3:00 PM', type: 'training'},
  'bookings/ava_cal-2': booked('ava', 'mental', 'cal-2',
      {source: 'calendly'}),
  'bookings/jo_cal-3': booked('jo', 'mental', 'cal-3', {source: 'calendly'}),
  'bookings/jo_tr-1': booked('jo', 'training', 'tr-1'),
});
// 5 PM in Chicago on Thu, Nov 5: tomorrow is Nov 6.
const EVENING = new Date('2026-11-05T23:00:00Z');
const SUMMARY = ['date', 'considered', 'sent', 'skipped', 'consent',
  'consentDuplicate', 'consentError'];

test('runSessionReminders: consent-reminder before the Calendly skip; a ' +
    'second run the same day sends nothing new', async () => {
  resetSent();
  const db = fakeDb(reminderDocs());
  const r = await jobs.runSessionReminders({now: EVENING, db});
  assert.deepEqual(pick(r, SUMMARY), {date: '2026-11-06', considered: 3,
    sent: 1, skipped: 2, consent: 1, consentDuplicate: 0, consentError: 0});
  assert.deepEqual(sent.map((s) => [s.kind, s.subjectKey]), [
    ['consent-reminder', 'consent-reminder:ava:2026-11-06'],
    ['reminder-24h', 'jo_tr-1'],
  ]);
  assert.deepEqual(pick(sent[0], ['householdId', 'athleteId', 'bookingId']),
      {householdId: 'hh', athleteId: null, bookingId: 'ava_cal-2'});
  const again = await jobs.runSessionReminders({now: EVENING, db});
  assert.deepEqual(pick(again, ['consent', 'consentDuplicate']),
      {consent: 0, consentDuplicate: 1});
  assert.equal(sent.filter((s) => s.kind === 'consent-reminder').length, 1);
});

test('runSessionReminders: a consent failure never costs a family its ' +
    'training reminder', async () => {
  resetSent();
  const db = fakeDb(reminderDocs());
  const collection = db.collection;
  db.collection = (name) => (name === 'mentalConsents' ?
      {doc: () => ({get: async () => {
        throw new Error('boom');
      }})} : collection(name));
  const r = await jobs.runSessionReminders({now: EVENING, db});
  assert.deepEqual(pick(r, ['sent', 'consent', 'consentError']),
      {sent: 1, consent: 0, consentError: 2});
  assert.deepEqual(sent.map((s) => s.kind), ['reminder-24h']);
});

test('runSessionReminders: a consent ask that could not be sent counts as ' +
    'an error, not sent; the family\'s reminder still goes', async () => {
  resetSent();
  failKinds.add('consent-reminder');
  const r = await jobs.runSessionReminders({now: EVENING,
    db: fakeDb(reminderDocs())});
  assert.deepEqual(pick(r, ['sent', 'consent', 'consentDuplicate',
    'consentError']), {sent: 1, consent: 0, consentDuplicate: 0,
    consentError: 1});
  assert.deepEqual(sent.map((s) => s.kind), ['reminder-24h']);
});

test('runSessionReminders: the switch off makes no consent read',
    async () => {
      resetSent();
      const db = fakeDb(Object.assign(reminderDocs(),
          {'config/mentalConsent': {notices: false}}));
      const collection = db.collection;
      let reads = 0;
      db.collection = (name) => {
        if (name === 'mentalConsents') reads += 1;
        return collection(name);
      };
      const r = await jobs.runSessionReminders({now: EVENING, db});
      assert.deepEqual([r.consent, reads], [0, 0]);
    });

run();
