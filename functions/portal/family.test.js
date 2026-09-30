'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const family = require('./family');

const TODAY = '2026-10-01';
const payload = (over) => Object.assign({
  mode: 'parent',
  contact: {name: 'Nina Novak', email: 'nina@example.test',
    phone: '+15550199', relationship: 'Mother'},
}, over);
const athlete = (over) => Object.assign({name: 'Lena', dob: '2012-06-17',
  packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null},
over);

test('users doc: parent mode carries the sign-up mobile after email', () => {
  assert.deepEqual(family.userDocFor(payload(), 'hh1', ['a1', 'a2']), {
    role: 'parent', householdId: 'hh1', athleteId: null, staff: false,
    specialistId: null, displayName: 'Nina Novak',
    email: 'nina@example.test', phone: '+15550199',
  });
});

test('users doc: an 18+ athlete is their own login, with their mobile', () => {
  const doc = family.userDocFor(payload({mode: 'athlete',
    contact: {name: 'Sam Reyes', email: 'sam@example.test',
      phone: '+15550111', relationship: null}}), 'hh2', ['a9']);
  assert.deepEqual([doc.role, doc.athleteId, doc.phone],
      ['athlete', 'a9', '+15550111']);
});

test('users doc: the phone is cut to the 32 characters the rule allows',
    () => {
      const long = '+1 (612) 555-0148 ext. 1234567890 x';
      const doc = family.userDocFor(payload({contact: {name: 'N',
        email: 'n@x.test', phone: long, relationship: null}}), 'h', []);
      assert.equal(doc.phone, long.slice(0, 32));
      assert.equal(doc.phone.length, 32);
    });

test('athlete doc: contractStart only when a contract was picked', () => {
  const picked = family.athleteDoc(athlete({contractMinutes: 45}), 'hh1',
      'u1', false, TODAY);
  assert.deepEqual([picked.contractMinutes, picked.contractStart],
      [45, TODAY]);
  const none = family.athleteDoc(athlete(), 'hh1', 'u1', false, TODAY);
  assert.equal(none.contractMinutes, null);
  assert.equal('contractStart' in none, false);
});

test('medical doc: all three contact fields, or null with nothing to say',
    () => {
      const med = family.medicalDoc({name: 'Bo', phone: '555',
        relationship: 'Uncle'}, null);
      assert.deepEqual([med.emergencyContact, med.medicalNotes],
          [{name: 'Bo', phone: '555', relationship: 'Uncle'}, null]);
      const noteOnly = family.medicalDoc(null, 'Peanut allergy');
      assert.deepEqual([noteOnly.emergencyContact, noteOnly.medicalNotes],
          [{name: null, phone: null, relationship: null}, 'Peanut allergy']);
      assert.equal(family.medicalDoc(null, null), null);
    });

run();
