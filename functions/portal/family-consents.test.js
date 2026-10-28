'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const family = require('./family');
const v = require('./family-validate');

const NOW = new Date('2026-10-20T15:00:00Z');
const kid = (over) => Object.assign({name: 'Jordan', dob: '2012-06-17',
  packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null},
over);
const payload = (over) => Object.assign({
  mode: 'parent',
  contact: {name: 'Dana Whitfield', email: 'dana@example.test',
    phone: '(612) 555-0148', relationship: 'Mother'},
  athletes: [kid({research: {value: true, assent: true}}),
    kid({name: 'Reese', dob: '2014-03-02', research: {value: false,
      assent: false}})],
  consents: {dataCollection: true, videoCapture: true, mediaRelease: true,
    facilityAccess: false},
  signatureName: 'Dana Whitfield',
}, over);
const ctx = (uid, email) => ({auth: {uid, token: {email}}});

/**
 * @param {!Object} docs The fake store's map.
 * @return {!Array<!Object>} The athlete docs written, in id order.
 */
function athletes(docs) {
  return Object.keys(docs).filter((p) => /^athletes\/[^/]+$/.test(p))
      .sort().map((p) => docs[p]);
}

test('createFamily stores every consent, the signature and each research ' +
    'answer on the athletes', async () => {
  const docs = {};
  await family.createFamilyHandler(payload(), ctx('u1', 'dana@example.test'),
      {db: fakeDb(docs), now: NOW});
  const [jordan, reese] = athletes(docs);
  const stamp = jordan.consents.research.recordedAt;
  assert.deepEqual(jordan.consents, {dataCollection: true, videoCapture: true,
    mediaRelease: true, research: {value: true, assent: true,
      recordedAt: stamp, recordedBy: 'u1'},
    signature: {name: 'Dana Whitfield', date: '2026-10-20'}});
  assert.deepEqual(reese.consents.research.value, false);
  assert.deepEqual(reese.consents.research.assent, false);
  assert.equal(reese.consents.research.recordedBy, 'u1');
});

test('under 18, a yes without the assent box is recorded as no', async () => {
  const docs = {};
  await family.createFamilyHandler(payload({athletes: [kid({research:
    {value: true, assent: false}})]}), ctx('u2', 'dana@example.test'),
  {db: fakeDb(docs), now: NOW});
  assert.deepEqual([athletes(docs)[0].consents.research.value,
    athletes(docs)[0].consents.research.assent], [false, false]);
});

test('an 18+ athlete answers for themselves: assent is null', async () => {
  const docs = {};
  await family.createFamilyHandler(payload({mode: 'athlete',
    contact: {name: 'Sam Reyes', email: 'sam@example.test',
      phone: '+15550111'},
    athletes: [kid({name: 'Sam Reyes', dob: '2006-01-01',
      research: {value: true}})]}), ctx('u3', 'sam@example.test'),
  {db: fakeDb(docs), now: NOW});
  assert.deepEqual([athletes(docs)[0].consents.research.value,
    athletes(docs)[0].consents.research.assent], [true, null]);
});

test('a tab on the old bundle sends no research: stored as not asked',
    async () => {
      const docs = {};
      await family.createFamilyHandler(payload({athletes: [kid()]}),
          ctx('u4', 'dana@example.test'), {db: fakeDb(docs), now: NOW});
      assert.equal(athletes(docs)[0].consents.research, null);
      assert.equal(athletes(docs)[0].consents.dataCollection, true);
    });

test('addAthletes writes no consents: the one-time confirm asks', async () => {
  const docs = {
    'users/u5': {role: 'parent', householdId: 'hh5',
      email: 'dana@example.test'},
    'households/hh5': {guardian: {email: 'dana@example.test'}},
  };
  await family.addAthletesHandler({athletes: [kid({research: {value: true,
    assent: true}})]}, ctx('u5', 'dana@example.test'),
  {db: fakeDb(docs), now: NOW});
  assert.equal('consents' in athletes(docs)[0], false);
});

test('normalizeResearch: absent is null; anything but booleans is refused',
    () => {
      const opts = {dob: '2012-06-17', todayISO: '2026-10-20'};
      assert.equal(v.normalizeResearch(undefined, opts), null);
      assert.equal(v.normalizeResearch(null, opts), null);
      assert.deepEqual(v.normalizeResearch({value: true, assent: true}, opts),
          {value: true, assent: true});
      for (const junk of ['yes', true, [], {value: 'yes'},
        {value: true, assent: 'yes'}]) {
        assert.throws(() => v.normalizeResearch(junk, opts),
            (e) => e instanceof v.ValidationError &&
              e.reason === 'research-invalid', JSON.stringify(junk));
      }
    });

run();
