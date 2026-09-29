'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const v = require('./family-validate');

const TODAY = '2026-10-01';
const kid = (over) => Object.assign({name: 'Jordan', dob: '2012-06-17',
  packageId: 't-12', contractMinutes: 45, handicap: 12,
  loginEmail: ' Jordan@Email.com '}, over);
const base = () => ({
  mode: 'parent',
  contact: {name: ' Dana Whitfield ', email: 'dana@email.com',
    phone: '(612) 555-0148', relationship: 'Mother'},
  athletes: [kid(), kid({name: 'Reese', dob: '2014-03-02', packageId: 't-6',
    contractMinutes: null, handicap: null, loginEmail: null})],
  emergencyContact: '  ',
  medical: 'Peanut allergy',
  consents: {dataCollection: true, videoCapture: true, mediaRelease: false,
    facilityAccess: true},
  signatureName: 'Dana Whitfield',
});

/**
 * @param {!Object} payload The body.
 * @param {string} reason The expected `reason`.
 * @param {string=} code The expected HttpsError code.
 */
function refuses(payload, reason, code) {
  assert.throws(() => v.validateFamilyPayload(payload, {todayISO: TODAY}),
      (e) => e instanceof v.ValidationError && e.reason === reason &&
        e.code === (code || 'invalid-argument'), reason);
}

test('happy path normalizes: trims, lower-cases child email, nulls', () => {
  const p = v.validateFamilyPayload(base(), {todayISO: TODAY});
  assert.deepEqual(p.contact, {name: 'Dana Whitfield', email: 'dana@email.com',
    phone: '(612) 555-0148', relationship: 'Mother'});
  assert.deepEqual(p.athletes[0], {name: 'Jordan', dob: '2012-06-17',
    packageId: 't-12', contractMinutes: 45, handicap: 12,
    loginEmail: 'jordan@email.com'});
  assert.deepEqual(p.athletes[1].loginEmail, null);
  assert.deepEqual([p.emergencyContact, p.medical, p.signatureName],
      [null, 'Peanut allergy', 'Dana Whitfield']);
  assert.deepEqual(p.consents, {dataCollection: true, videoCapture: true,
    mediaRelease: false, facilityAccess: true});
});

test('athlete mode: exactly one adult, loginEmail forced null', () => {
  const adult = Object.assign(base(), {mode: 'athlete',
    athletes: [kid({dob: '2000-01-01', loginEmail: 'me@x.com'})]});
  const p = v.validateFamilyPayload(adult, {todayISO: TODAY});
  assert.equal(p.contact.relationship, null);
  assert.equal(p.athletes[0].loginEmail, null);
  refuses(Object.assign(base(), {mode: 'athlete'}), 'athlete-count');
  refuses(Object.assign(base(), {mode: 'athlete',
    athletes: [kid({dob: '2008-10-02'})]}), 'athlete-under-18');
  const p2 = v.validateFamilyPayload(Object.assign(base(), {mode: 'athlete',
    athletes: [kid({dob: '2008-10-01'})]}), {todayISO: TODAY});
  assert.equal(p2.athletes[0].dob, '2008-10-01');
});

test('every refusal, in the contract order', () => {
  refuses(Object.assign(base(), {mode: 'staff'}), 'invalid-mode');
  refuses(Object.assign(base(), {contact: {name: 'x', email: '', phone: 'y'}}),
      'contact-required');
  refuses(Object.assign(base(),
      {contact: {name: 'x', email: 'dana@', phone: 'y'}}), 'contact-required');
  refuses(Object.assign(base(), {athletes: []}), 'athlete-count');
  refuses(Object.assign(base(), {athletes: [kid({name: ' '})]}),
      'athlete-name-required');
  refuses(Object.assign(base(), {athletes: [kid({dob: '2027-01-01'})]}),
      'dob-invalid');
  refuses(Object.assign(base(), {athletes: [kid({dob: '2012-13-45'})]}),
      'dob-invalid');
  refuses(Object.assign(base(), {athletes: [kid({packageId: 't-20'})]}),
      'unknown-package');
  refuses(Object.assign(base(), {athletes: [kid({contractMinutes: 95})]}),
      'contract-tier');
  refuses(Object.assign(base(), {athletes: [kid({handicap: 55})]}),
      'handicap-range');
  refuses(Object.assign(base(), {athletes: [kid({handicap: 12.5})]}),
      'handicap-range');
  refuses(Object.assign(base(), {athletes: [kid({loginEmail: 'nope'})]}),
      'child-email-invalid');
  refuses(Object.assign(base(),
      {athletes: [kid({loginEmail: 'DANA@email.com'})]}),
  'child-email-is-guardian');
  refuses(Object.assign(base(), {athletes: [kid(), kid({name: 'B',
    loginEmail: 'JORDAN@email.com'})]}), 'child-email-duplicate');
  refuses(Object.assign(base(), {consents: {dataCollection: true,
    videoCapture: false}}), 'consents-required');
  refuses(Object.assign(base(), {signatureName: ''}), 'consents-required');
});

test('addAthletes payload: guardian email from the household', () => {
  const p = v.validateAddAthletesPayload({athletes: [kid()], medical: ' x '},
      {todayISO: TODAY, guardianEmail: 'Dana@Email.com'});
  assert.deepEqual([p.athletes.length, p.medical], [1, 'x']);
  assert.throws(() => v.validateAddAthletesPayload(
      {athletes: [kid({loginEmail: 'dana@email.com'})]},
      {todayISO: TODAY, guardianEmail: 'Dana@Email.com'}),
  (e) => e.reason === 'child-email-is-guardian');
});

run();
