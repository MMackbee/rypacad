'use strict';
// Family facility access (owner ruling 2026-09-30): createFamily and
// addAthletes keep at most one `facilityRequested` per household. The pure
// rule is facility.test.js; this is the handlers' wiring, over a stand-in
// Firestore (test/verify-family.js runs the same calls on the emulator).
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const family = require('./family');

/**
 * @param {!Object} docs `{'athletes/a1': {...}}`, written into by the fake.
 * @return {!Object} Firestore stand-in: doc refs, `where ==`, transactions.
 */
function fakeDb(docs) {
  let seq = 0;
  const ref = (path, id) => ({
    id, path,
    get: async () => ({exists: path in docs, data: () => docs[path]}),
    collection: (sub) => ({doc: (subId) => ref(`${path}/${sub}/${subId}`,
        subId)}),
  });
  const tx = {
    get: (target) => target.get(),
    set: (r, data) => {
      docs[r.path] = data;
    },
  };
  return {
    collection: (c) => ({
      doc: (id) => {
        const docId = id || `${c}-new-${++seq}`;
        return ref(`${c}/${docId}`, docId);
      },
      where: (field, op, value) => ({get: async () => ({
        docs: Object.entries(docs)
            .filter(([path, d]) => path.startsWith(`${c}/`) &&
                path.split('/').length === 2 && d[field] === value)
            .map(([path, d]) => ({id: path.slice(c.length + 1),
              data: () => d})),
      })}),
    }),
    runTransaction: (fn) => fn(tx),
  };
}
const NOW = new Date('2026-10-01T18:00:00Z');
const ctx = (uid, email) => ({auth: {uid, token: {email}}});
const kid = (name, packageId, facilityRequested) => ({name,
  dob: '2012-06-17', packageId, contractMinutes: null, handicap: null,
  loginEmail: null, facilityRequested});
const signUp = (athletes) => ({
  mode: 'parent',
  contact: {name: 'Nina Novak', email: 'nina@example.test',
    phone: '+15550199', relationship: 'Mother'},
  athletes, emergencyContact: null, medical: null,
  consents: {dataCollection: true, videoCapture: true, facilityAccess: true},
  signatureName: 'Nina Novak',
});
/**
 * @param {!Object} docs The fake's documents.
 * @param {!Array<string>} ids Athlete ids, in payload order.
 * @return {!Array<boolean>} Their stored `facilityRequested`.
 */
const stored = (docs, ids) => ids.map((id) =>
  docs[`athletes/${id}`].facilityRequested);

test('createFamily: a per-athlete bundle ticking every child stores one',
    async () => {
      const docs = {};
      const r = await family.createFamilyHandler(signUp([
        kid('Lena', 't-6', true), kid('Max', 't-12', true),
        kid('Sol', 't-16', true)]), ctx('u-nina', 'nina@example.test'),
      {db: fakeDb(docs), now: NOW});
      assert.deepEqual(stored(docs, r.athleteIds), [true, false, false]);
      // Nothing else about the athletes changed.
      assert.deepEqual(r.athleteIds.map((id) => docs[`athletes/${id}`].name),
          ['Lena', 'Max', 'Sol']);
    });

test('createFamily: an Elite athlete in the family stores none', async () => {
  const docs = {};
  const r = await family.createFamilyHandler(signUp([
    kid('Lena', 't-6', true), kid('Max', 'elite', false)]),
  ctx('u-nina', 'nina@example.test'), {db: fakeDb(docs), now: NOW});
  assert.deepEqual(stored(docs, r.athleteIds), [false, false]);
});

test('createFamily: the new bundle\'s one tick is kept as sent', async () => {
  const docs = {};
  const r = await family.createFamilyHandler(signUp([
    kid('Sol', 'single', false), kid('Lena', 't-6', true),
    kid('Max', 't-12', false)]), ctx('u-nina', 'nina@example.test'),
  {db: fakeDb(docs), now: NOW});
  assert.deepEqual(stored(docs, r.athleteIds), [false, true, false]);
});

const HOUSE = {
  'users/u-dana': {role: 'parent', householdId: 'whit',
    email: 'dana@example.test'},
  'households/whit': {guardian: {email: 'dana@example.test'}},
};
/**
 * @param {!Object} existing Athlete docs already in the household.
 * @param {!Array<!Object>} athletes The entries being added.
 * @return {!Promise<!Array<boolean>>} What was stored for the new ones.
 */
async function added(existing, athletes) {
  const docs = Object.assign({}, HOUSE, existing);
  const r = await family.addAthletesHandler({athletes, medical: null},
      ctx('u-dana', 'dana@example.test'), {db: fakeDb(docs), now: NOW});
  return stored(docs, r.athleteIds);
}

test('addAthletes: a household with no add-on and no Elite keeps one',
    async () => {
      const reese = {'athletes/reese': {householdId: 'whit',
        packageId: 't-6', billing: {status: 'active'}}};
      assert.deepEqual(await added(reese, [kid('Nico', 't-6', true),
        kid('Pia', 't-12', true)]), [true, false]);
      assert.deepEqual(await added({}, [kid('Nico', 't-6', true)]), [true]);
    });

test('addAthletes: the household already covered or asked stores none',
    async () => {
      const one = [kid('Nico', 't-6', true)];
      const at = (over) => ({'athletes/reese': Object.assign(
          {householdId: 'whit', packageId: 't-6',
            billing: {status: 'active'}}, over)});
      assert.deepEqual(await added(at({packageId: 'elite'}), one), [false]);
      assert.deepEqual(await added(at({facilityRequested: true}), one),
          [false]);
      assert.deepEqual(await added(
          at({facilityBilling: {status: 'active'}}), one), [false]);
      // Another family's Elite athlete is not this family's.
      assert.deepEqual(await added({'athletes/zed': {householdId: 'other',
        packageId: 'elite', billing: {status: 'active'}}}, one), [true]);
      // An Elite athlete in the entries being added.
      assert.deepEqual(await added({}, [kid('Nico', 't-6', true),
        kid('Max', 'elite', false)]), [false, false]);
    });

run();
