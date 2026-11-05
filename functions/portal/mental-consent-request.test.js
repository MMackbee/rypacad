/**
 * Yannick's "Send a reminder" callable over a stand-in Firestore, with
 * notify.sendNotice replaced by the recorder mental-consent.test.js uses.
 *   node portal/mental-consent-request.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const notify = require('./notify');
const {requestMentalConsentHandler} = require('./mental-consent-request');

const sent = [];
const seen = new Set();
let forced = null;
notify.sendNotice = async (args) => {
  if (forced) return forced;
  const id = `${args.kind}_${args.subjectKey}`;
  if (seen.has(id)) return {id, duplicate: true, sent: false};
  seen.add(id);
  sent.push(args);
  return {id, duplicate: false, sent: true};
};
/** Clears the recorder before a case. */
function reset() {
  sent.length = 0;
  seen.clear();
  forced = null;
}

// 9 AM in Chicago, Thu Nov 5 2026.
const NOW = new Date('2026-11-05T15:00:00Z');
const ctx = {auth: {uid: 'u-yannick'}};
const base = () => ({
  'config/mentalConsent': {notices: true, enabledAt: '2026-11-05'},
  'households/hh': {name: 'Test family'},
  'athletes/ava': {name: 'Ava Test', dob: '2012-05-14', householdId: 'hh',
    loginEmail: 'ava@example.com'},
  'users/u-ava': {role: 'athlete', athleteId: 'ava', householdId: 'hh'},
  'loginInvites/ava@example.com': {status: 'claimed'},
  'athletes/max': {name: 'Max Test', dob: '2007-03-02', householdId: 'hh'},
  'users/u-yannick': {role: 'mental'},
});
const call = (docs, data = {athleteId: 'ava'}, c = ctx) =>
  requestMentalConsentHandler(data, c, {db: fakeDb(docs), now: NOW});
/**
 * The base world with some docs replaced and some removed.
 * @param {!Object} over Docs to set; an undefined value removes the doc.
 * @return {!Object} The docs.
 */
function world(over) {
  const docs = Object.assign(base(), over);
  for (const k of Object.keys(docs)) if (docs[k] === undefined) delete docs[k];
  return docs;
}

test('refusals, in order, each an HttpsError and nothing sent', async () => {
  reset();
  const rows = [
    ['signed out', base(), {athleteId: 'ava'}, {}, 'unauthenticated', null],
    ['not Yannick', world({'users/u-yannick': {role: 'ops'}}),
      {athleteId: 'ava'}, ctx, 'permission-denied', 'not-mental'],
    ['no athlete id', base(), {}, ctx, 'invalid-argument', 'no-athlete'],
    ['the switch off', world({'config/mentalConsent': {notices: false}}),
      {athleteId: 'ava'}, ctx, 'failed-precondition', 'disabled'],
    ['an unknown athlete', base(), {athleteId: 'nobody'}, ctx, 'not-found',
      'no-athlete'],
    ['no household doc', world({'households/hh': undefined}),
      {athleteId: 'ava'}, ctx, 'failed-precondition', 'no-household'],
    ['a test household', world({'households/hh': {test: true}}),
      {athleteId: 'ava'}, ctx, 'failed-precondition', 'test-household'],
    ['already signed', world({'mentalConsents/ava':
      {adult: false, adultSignature: null}}), {athleteId: 'ava'}, ctx,
    'failed-precondition', 'already-signed'],
    ['no dob', world({'athletes/ava': {name: 'Ava Test', householdId: 'hh'}}),
      {athleteId: 'ava'}, ctx, 'failed-precondition', 'no-dob'],
  ];
  for (const [label, docs, data, c, code, reason] of rows) {
    await assert.rejects(call(docs, data, c), (err) => {
      assert.equal(err.code, code, label);
      if (reason) {
        assert.equal(err.details && err.details.reason, reason, label);
      }
      return true;
    }, label);
  }
  forced = {duplicate: false, sent: false, error: 'boom'};
  await assert.rejects(call(base()), (err) => {
    assert.equal(err.code, 'unavailable');
    assert.equal(err.details.reason, 'send-failed');
    return true;
  });
  forced = null;
  assert.equal(sent.length, 0);
});

test('sends under asked-<today>, naming the next confirmed 1:1', async () => {
  reset();
  const docs = Object.assign(base(), {
    'bookings/a1': {athleteId: 'ava', type: 'mental', status: 'confirmed',
      date: '2026-11-19'},
    'bookings/a2': {athleteId: 'ava', type: 'mental', status: 'cancelled',
      date: '2026-11-08'},
    'bookings/a3': {athleteId: 'ava', type: 'mental', status: 'attended',
      date: '2026-10-29'},
    'bookings/a4': {athleteId: 'ava', type: 'mental', status: 'confirmed',
      date: '2026-11-12'},
  });
  assert.deepEqual(await call(docs), {status: 'sent'});
  assert.deepEqual([sent[0].kind, sent[0].subjectKey],
      ['consent-needed', 'consent:ava:asked-2026-11-05']);
  assert.ok(sent[0].body.includes('on Thu, Nov 12'));
  assert.deepEqual([sent[0].householdId, sent[0].athleteId, sent[0].bookingId],
      ['hh', null, 'a4']);
});

test('no 1:1 ahead: the copy names the next session without a date',
    async () => {
      reset();
      assert.deepEqual(await call(base()), {status: 'sent'});
      assert.ok(sent[0].body.startsWith('Before Ava\'s next session'));
    });

test('a consent-needed row created today is a duplicate; one created ' +
    'yesterday for a session today is not', async () => {
  reset();
  const at = (iso) => ({toMillis: () => Date.parse(iso)});
  const row = (key, iso) => ({[`notifications/consent-needed_${key}`]:
    {kind: 'consent-needed', subjectKey: key, createdAt: at(iso)}});
  assert.deepEqual(await call(Object.assign(base(),
      row('consent:ava:2026-11-12', '2026-11-05T14:00:00Z'))),
  {status: 'duplicate'});
  assert.equal(sent.length, 0);
  assert.deepEqual(await call(Object.assign(base(),
      row('consent:ava:2026-11-05', '2026-11-04T20:00:00Z'))),
  {status: 'sent'});
  assert.equal(sent[0].subjectKey, 'consent:ava:asked-2026-11-05');
});

test('another athlete\'s row and a reminder row never block', async () => {
  reset();
  const at = {toMillis: () => Date.parse('2026-11-05T14:00:00Z')};
  assert.deepEqual(await call(Object.assign(base(), {
    'notifications/consent-needed_consent:ava2:2026-11-12':
      {kind: 'consent-needed', subjectKey: 'consent:ava2:2026-11-12',
        createdAt: at},
    'notifications/consent-reminder_consent-reminder:ava:2026-11-06':
      {kind: 'consent-reminder', subjectKey: 'consent-reminder:ava:2026-11-06',
        createdAt: at},
  })), {status: 'sent'});
});

test('the ledger answers duplicate', async () => {
  reset();
  forced = {duplicate: true, sent: false};
  assert.deepEqual(await call(base()), {status: 'duplicate'});
  forced = null;
});

run();
