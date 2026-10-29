/**
 * The Monday check-in reminder (spec 4.4, 8) with the stand-in Firestore.
 *   node portal/contract-checkins.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const cc = require('./contract-checkins');

const HH = {householdId: 'hh', packageId: 't-6'};
const ath = (id, name, dob, extra) =>
  Object.assign({id, name, dob}, HH, extra);
const base = () => ({
  'config/contract': {enabled: true, enabledAt: '2026-11-03'},
  'households/hh': {name: 'Whitfield family'},
  'households/hh-test': {name: 'RYP Test Family', test: true},
  'households/hh-due': {
    name: 'Late family', membership: {status: 'past_due'},
  },
  'users/mental': {role: 'mental', email: 'yannick@example.com'},
  'users/owner': {role: 'owner', email: 'owner@example.com'},
  'athletes/a': Object.assign({name: 'Ava', dob: '2012-01-01'}, HH),
  'athletes/b': Object.assign({name: 'Ben', dob: '2012-01-01'}, HH),
  'athletes/c': Object.assign({name: 'Cal', dob: '2017-09-09'}, HH),
  'athletes/d': Object.assign(
      {name: 'Dee', dob: '2012-01-01', createdAt: '2026-11-20'}, HH),
  'athletes/t': {name: 'Test Kid', dob: '2012-01-01', householdId: 'hh-test'},
  'athletes/p': {
    name: 'Pat', dob: '2012-01-01', householdId: 'hh-due', packageId: 't-6',
  },
  'athletes/u': Object.assign(
      {name: 'Uma', dob: '2012-01-01', billing: {status: 'pending'}}, HH),
  'contractCheckins/b_2026-11-09': {
    athleteId: 'b', weekStart: '2026-11-09', checkedIn: true, by: 'mental',
    at: '2026-11-12',
  },
  'contractCheckins/c_2026-11-09': {
    athleteId: 'c', weekStart: '2026-11-09', checkedIn: true, by: 'mental',
    at: '2026-11-10',
  },
});
const pick = (docs, prefix) => Object.entries(docs)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => Object.assign({id: k.slice(prefix.length)}, v));

test('overdueAthletes: the client cases plus the membership and ' +
    'test-family gates', () => {
  // never -> 22 days, 13 -> not, 15 -> overdue, createdAt counts; the test
  // family, a past_due household and pending billing are off the contract.
  const docs = base();
  const athletes = pick(docs, 'athletes/');
  const households = {};
  for (const h of pick(docs, 'households/')) households[h.id] = h;
  const checkins = pick(docs, 'contractCheckins/');
  const rows = cc.overdueAthletes({
    athletes, households, checkins, today: '2026-11-25',
    enabledAt: '2026-11-03',
  });
  assert.deepEqual(rows, [
    {athleteId: 'a', name: 'Ava', age: 14, lastCheckin: null, daysSince: 22},
    {athleteId: 'c', name: 'Cal', age: 9, lastCheckin: '2026-11-10',
      daysSince: 15},
  ]);
  assert.equal(cc.OVERDUE_DAYS, 14);
  const ava = [ath('a', 'Ava', '2012-01-01')];
  // 14 days exactly is not overdue; 15 is.
  assert.deepEqual(cc.overdueAthletes({
    athletes: ava, households, checkins: [], today: '2026-11-17',
    enabledAt: '2026-11-03',
  }), []);
  assert.equal(cc.overdueAthletes({
    athletes: ava, households, checkins: [], today: '2026-11-18',
    enabledAt: '2026-11-03',
  })[0].daysSince, 15);
  // No enabledAt: a never-checked-in athlete is never overdue.
  assert.deepEqual(cc.overdueAthletes({
    athletes: ava, households, checkins: [], today: '2026-11-25',
    enabledAt: null,
  }), []);
});

test('dateOf: a Timestamp is its America/Chicago date (an evening tap ' +
    'stays on its own day)', () => {
  assert.equal(cc.dateOf('2026-11-12'), '2026-11-12');
  assert.equal(cc.dateOf('2026-11-12T19:30:00.000Z'), '2026-11-12');
  // 01:00Z on Nov 11 is 7 PM Chicago on Nov 10 - the client reads it the
  // same way (contractBoard.test.js).
  const ts = {toMillis: () => Date.UTC(2026, 10, 11, 1)};
  assert.equal(cc.dateOf(ts), '2026-11-10');
  assert.equal(cc.dateOf(new Date(Date.UTC(2026, 10, 11, 23))), '2026-11-11');
  assert.equal(cc.dateOf(null), null);
  assert.equal(cc.dateOf(42), null);
  assert.equal(cc.lastCheckinFor('x', [
    {athleteId: 'x', weekStart: '2026-11-09', checkedIn: true, at: ts},
  ]), '2026-11-10');
});

test('the rule text matches the client module (CHANGE ONE, ' +
    'CHANGE BOTH)', () => {
  const src = fs.readFileSync(path.join(__dirname,
      '../../frontend/src/portal/data/contractBoard.js'), 'utf8');
  assert.match(src, /export const OVERDUE_DAYS = 14;/);
  assert.match(src, /daysSince > OVERDUE_DAYS/);
  // The on-contract gate: the client's onContract must read the same three
  // tests as lib.membershipAllowsBooking plus the test-household skip.
  assert.match(src, /export function onContract\(/);
  assert.match(src, /household\.test === true/);
  assert.match(src, /status === 'past_due' \|\| status === 'lapsed'/);
  assert.match(src, /billing\.oneTime === true/);
  assert.match(src, /billing\.status === 'active'/);
});

test('reminderEmail names each athlete', () => {
  const mail = cc.reminderEmail([
    {athleteId: 'a', name: 'Ava', age: 14, lastCheckin: null, daysSince: 22},
    {athleteId: 'c', name: 'Cal', age: 9, lastCheckin: '2026-11-10',
      daysSince: 15},
  ], '2026-11-30');
  assert.equal(mail.subject, 'Contract check-ins due · 2 athletes');
  assert.equal(mail.text, [
    'Due for a check-in as of 2026-11-30:', '',
    '- Ava (age 14): never checked in, 22 days',
    '- Cal (age 9): last check-in 2026-11-10, 15 days', '',
    'Open the board: https://portal.rypacademy.com/portal/mental/contract',
  ].join('\n'));
  const one = cc.reminderEmail([
    {name: 'Ava', age: null, lastCheckin: null, daysSince: 15},
  ], '2026-11-30');
  assert.equal(one.subject, 'Contract check-ins due · 1 athlete');
});

test('remindMentalCheckins: one email naming the overdue athletes',
    async () => {
      const mails = [];
      const sendEmail = async (m) => {
        mails.push(m);
        return {status: 'sent'};
      };
      const out = await cc.remindMentalCheckins({
        db: fakeDb(base()), sendEmail, today: '2026-11-25',
      });
      assert.deepEqual(out, {
        status: 'sent', overdue: 2, to: 'yannick@example.com',
      });
      assert.equal(mails.length, 1);
      assert.equal(mails[0].to, 'yannick@example.com');
      assert.equal(mails[0].kind, 'mental-checkins');
      assert.match(mails[0].text,
          /- Ava \(age 14\): never checked in, 22 days/);
      assert.match(mails[0].text, /- Cal \(age 9\)/);
      assert.doesNotMatch(mails[0].text, /Test Kid|Pat|Uma|Ben|Dee/);
    });

test('remindMentalCheckins: zero overdue sends nothing', async () => {
  const mails = [];
  const docs = base();
  const checkedIn = (id) => ({
    athleteId: id, weekStart: '2026-11-16', checkedIn: true, by: 'mental',
    at: '2026-11-18',
  });
  docs['contractCheckins/a_2026-11-16'] = checkedIn('a');
  docs['contractCheckins/c_2026-11-16'] = checkedIn('c');
  const out = await cc.remindMentalCheckins({
    db: fakeDb(docs), sendEmail: async (m) => mails.push(m),
    today: '2026-11-25',
  });
  assert.deepEqual(out, {
    status: 'none', overdue: 0, to: 'yannick@example.com',
  });
  assert.equal(mails.length, 0);
});

test('remindMentalCheckins: the switch off sends nothing; no mental email ' +
    'skips', async () => {
  const mails = [];
  const send = async (m) => mails.push(m);
  const remind = (docs) => cc.remindMentalCheckins({
    db: fakeDb(docs), sendEmail: send, today: '2026-11-25',
  });
  const off = base();
  off['config/contract'] = {enabled: false, enabledAt: null};
  assert.deepEqual(await remind(off), {status: 'off', overdue: 0, to: null});
  const missing = base();
  delete missing['config/contract'];
  assert.equal((await remind(missing)).status, 'off');
  const noEmail = base();
  noEmail['users/mental'] = {role: 'mental', email: null};
  assert.deepEqual(await remind(noEmail), {
    status: 'skipped', overdue: 2, to: null,
  });
  assert.equal(mails.length, 0);
});

run();
