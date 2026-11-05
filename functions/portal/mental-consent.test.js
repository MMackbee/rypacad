/**
 * The consent trigger bodies over a stand-in Firestore, with
 * notify.sendNotice replaced by a recorder (the sweep.test.js precedent).
 * test/verify-notifications.js STEP 8 runs the same bodies on the emulator.
 *   node portal/mental-consent.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const notify = require('./notify');
const MC = require('./mental-consent');
const {consentNeeded} = require('./consent-notices');

// The recorder: a kind_subjectKey it has seen answers duplicate, as the
// ledger does; `forced` answers every call with one value.
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
const base = () => ({
  'config/mentalConsent': {notices: true, enabledAt: '2026-11-05'},
  'households/hh': {name: 'Test family'},
  'athletes/ava': {name: 'Ava Test', dob: '2012-05-14', householdId: 'hh',
    loginEmail: 'ava@example.com'},
  // A claimed MINOR login: never addressed.
  'users/u-ava': {role: 'athlete', athleteId: 'ava', householdId: 'hh'},
  'loginInvites/ava@example.com': {status: 'claimed'},
  'athletes/max': {name: 'Max Test', dob: '2007-03-02', householdId: 'hh'},
});
const cal = (o = {}) => Object.assign({athleteId: 'ava', householdId: 'hh',
  type: 'mental', status: 'confirmed', date: '2026-11-12',
  attendee: 'athlete', createdBy: 'system', source: 'calendly',
  sessionId: 'cal-1'}, o);
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

test('readConsentConfig: missing is off; only notices === true is on',
    async () => {
      assert.deepEqual(await MC.readConsentConfig(fakeDb({})),
          {notices: false, enabledAt: null});
      assert.deepEqual(await MC.readConsentConfig(fakeDb(base())),
          {notices: true, enabledAt: '2026-11-05'});
      assert.deepEqual(await MC.readConsentConfig(fakeDb(
          {'config/mentalConsent': {notices: 'yes'}})),
      {notices: false, enabledAt: null});
    });

test('a minor\'s Calendly 1:1 asks the parents only', async () => {
  reset();
  const r = await MC.onMentalBookingCreated({booking: cal(),
    bookingId: 'ava_cal-1', store: fakeDb(base()), now: NOW});
  assert.equal(r, 'sent');
  assert.equal(sent.length, 1);
  const copy = consentNeeded({athlete: {name: 'Ava Test'}, date: '2026-11-12',
    attendee: 'athlete', status: 'unsigned', toAthlete: false});
  assert.deepEqual(pick(sent[0], ['kind', 'category', 'householdId',
    'athleteId', 'sessionId', 'bookingId', 'subjectKey', 'title', 'body']), {
    kind: 'consent-needed', category: 'schedule', householdId: 'hh',
    athleteId: null, sessionId: 'cal-1', bookingId: 'ava_cal-1',
    subjectKey: 'consent:ava:2026-11-12', title: copy.title, body: copy.body,
  });
});

test('audience: 18+ with a claimed invite is addressed alone', async () => {
  const docs = Object.assign(base(), {
    'athletes/max': {name: 'Max Test', dob: '2007-03-02', householdId: 'hh',
      loginEmail: 'max@example.com'},
    'loginInvites/max@example.com': {status: 'claimed'},
  });
  assert.deepEqual(await MC.consentAudience({store: fakeDb(docs),
    athleteId: 'max', athlete: docs['athletes/max'],
    household: {name: 'Test family'}, householdId: 'hh', now: NOW}),
  {householdId: null, athleteId: 'max', toAthlete: true});
});

test('audience: the self-created 18+ member is addressed alone', async () => {
  const docs = Object.assign(base(), {
    'households/hm': {createdBy: 'u-max2'},
    'users/u-max2': {role: 'athlete', athleteId: 'max2'},
    'athletes/max2': {dob: '2007-03-02', householdId: 'hm'},
  });
  assert.deepEqual(await MC.consentAudience({store: fakeDb(docs),
    athleteId: 'max2', athlete: docs['athletes/max2'],
    household: docs['households/hm'], householdId: 'hm', now: NOW}),
  {householdId: null, athleteId: 'max2', toAthlete: true});
});

test('audience: a provisioned 18+ login with no invite, an open invite, ' +
    'no login at all, and a claimed minor all go to the household',
async () => {
  const provisioned = Object.assign(base(),
      {'users/u-max': {role: 'athlete', athleteId: 'max'}});
  const open = Object.assign(base(), {
    'athletes/max': {name: 'Max Test', dob: '2007-03-02', householdId: 'hh',
      loginEmail: 'max@example.com'},
    'loginInvites/max@example.com': {status: 'open'},
  });
  for (const docs of [provisioned, open, base()]) {
    assert.deepEqual(await MC.consentAudience({store: fakeDb(docs),
      athleteId: 'max', athlete: docs['athletes/max'],
      household: docs['households/hh'], householdId: 'hh', now: NOW}),
    {householdId: 'hh', athleteId: null, toAthlete: false});
  }
  const docs = base();
  assert.deepEqual(await MC.consentAudience({store: fakeDb(docs),
    athleteId: 'ava', athlete: docs['athletes/ava'],
    household: docs['households/hh'], householdId: 'hh', now: NOW}),
  {householdId: 'hh', athleteId: null, toAthlete: false});
});

test('an 18+ athlete with a claimed login gets the ask on their own login',
    async () => {
      reset();
      const docs = Object.assign(base(), {
        'athletes/max': {name: 'Max Test', dob: '2007-03-02',
          householdId: 'hh', loginEmail: 'max@example.com'},
        'loginInvites/max@example.com': {status: 'claimed'},
      });
      assert.equal(await MC.onMentalBookingCreated({
        booking: cal({athleteId: 'max', sessionId: 'cal-9'}),
        bookingId: 'max_cal-9', store: fakeDb(docs), now: NOW}), 'sent');
      assert.deepEqual(pick(sent[0], ['householdId', 'athleteId', 'title']),
          {householdId: null, athleteId: 'max',
            title: 'Please sign Yannick\'s consent'});
    });

test('skipped, nothing sent', async () => {
  reset();
  const without = (key) => {
    const docs = base();
    delete docs[key];
    return docs;
  };
  const cases = [
    ['no switch doc', without('config/mentalConsent'), cal()],
    ['signed', Object.assign(base(), {'mentalConsents/ava':
      {adult: false, adultSignature: null}}), cal()],
    ['a test household', Object.assign(base(),
        {'households/hh': {test: true}}), cal()],
    ['no household doc', without('households/hh'), cal()],
    ['a training booking', base(), cal({type: 'training'})],
    ['a past date', base(), cal({date: '2026-10-21'})],
  ];
  for (const [label, docs, booking] of cases) {
    assert.equal(await MC.onMentalBookingCreated({booking,
      bookingId: 'b1', store: fakeDb(docs), now: NOW}), 'skipped', label);
  }
  assert.equal(sent.length, 0);
});

test('a booking of another type makes no read', async () => {
  const store = {collection: () => {
    throw new Error('read');
  }};
  assert.equal(await MC.onMentalBookingCreated({booking: cal({type: 'phil'}),
    bookingId: 'b1', store, now: NOW}), 'skipped');
  assert.equal(await MC.onMentalBookingCreated({booking: null,
    bookingId: 'b1', store, now: NOW}), 'skipped');
});

test('the ledger row exists', async () => {
  reset();
  forced = {duplicate: true, sent: false};
  assert.equal(await MC.onMentalBookingCreated({booking: cal(),
    bookingId: 'ava_cal-1', store: fakeDb(base()), now: NOW}), 'duplicate');
  forced = null;
});

// The consent-signed receipt (Task 5).
const snapOf = (record) => ({id: 'ava', data: () => record});
const ctxAva = {params: {athleteId: 'ava'}};

test('receipt: a portal minor record -> consent-signed to the parents, ' +
    'keyed on the athlete', async () => {
  reset();
  assert.equal(await MC.onConsentSignedHandler(
      snapOf({method: 'portal', adult: false, householdId: 'hh'}), ctxAva,
      {db: fakeDb(base()), now: NOW}), 'sent');
  assert.deepEqual(pick(sent[0], ['kind', 'category', 'householdId',
    'athleteId', 'subjectKey']), {kind: 'consent-signed',
    category: 'schedule', householdId: 'hh', athleteId: null,
    subjectKey: 'ava'});
  assert.ok(sent[0].body.includes('card in the portal.'));
});

test('receipt: paper sends nothing; the switch is not consulted',
    async () => {
      reset();
      const off = Object.assign(base(),
          {'config/mentalConsent': {notices: false}});
      assert.equal(await MC.onConsentSignedHandler(
          snapOf({method: 'paper', adult: false}), ctxAva,
          {db: fakeDb(off), now: NOW}), 'skipped');
      assert.equal(await MC.onConsentSignedHandler(
          snapOf({method: 'portal', adult: false}), ctxAva,
          {db: fakeDb(off), now: NOW}), 'sent');
    });

test('receipt: an 18+ signature on a claimed login goes to that login',
    async () => {
      reset();
      const docs = Object.assign(base(), {
        'athletes/max': {name: 'Max Test', dob: '2007-03-02',
          householdId: 'hh', loginEmail: 'max@example.com'},
        'loginInvites/max@example.com': {status: 'claimed'},
      });
      assert.equal(await MC.onConsentSignedHandler(
          {id: 'max', data: () => ({method: 'portal', adult: true})},
          {params: {athleteId: 'max'}}, {db: fakeDb(docs), now: NOW}),
      'sent');
      assert.deepEqual(pick(sent[0], ['householdId', 'athleteId', 'title',
        'subjectKey']), {householdId: null, athleteId: 'max',
        title: 'Your mental performance consent is signed',
        subjectKey: 'max'});
    });

run();
