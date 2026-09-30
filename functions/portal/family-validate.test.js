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
  // The current live payload has no facilityRequested: not asked.
  assert.deepEqual(p.athletes[0], {name: 'Jordan', dob: '2012-06-17',
    packageId: 't-12', contractMinutes: 45, handicap: 12,
    loginEmail: 'jordan@email.com', facilityRequested: false});
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
  refuses(Object.assign(base(), {emergencyContact: {name: 'Bo'}}),
      'emergency-contact-incomplete');
  // After the athletes, before the consents.
  refuses(Object.assign(base(), {athletes: [], emergencyContact: {phone: '5'}}),
      'athlete-count');
  refuses(Object.assign(base(), {emergencyContact: {phone: '5'},
    signatureName: ''}), 'emergency-contact-incomplete');
  refuses(Object.assign(base(), {consents: {dataCollection: true,
    videoCapture: false}}), 'consents-required');
  refuses(Object.assign(base(), {signatureName: ''}), 'consents-required');
});

test('facilityRequested: a boolean or absent; anything else refused', () => {
  const athletesOf = (...flags) => v.validateFamilyPayload(Object.assign(base(),
      {athletes: flags.map((f, i) => kid({name: `K${i}`, loginEmail: null,
        facilityRequested: f}))}), {todayISO: TODAY}).athletes
      .map((a) => a.facilityRequested);
  assert.deepEqual(athletesOf(true, false, undefined), [true, false, false]);
  for (const junk of [null, 'true', 1, 0, {}, []]) {
    refuses(Object.assign(base(), {athletes: [kid({facilityRequested: junk})]}),
        'facility-requested-invalid');
  }
  // Last in the entry's order: an earlier refusal still wins.
  refuses(Object.assign(base(), {athletes: [kid({handicap: 55,
    facilityRequested: 'yes'})]}), 'handicap-range');
  // The validator keeps the tick on Elite; createFamily's athleteDoc drops it.
  assert.equal(v.validateFamilyPayload(Object.assign(base(), {athletes:
    [kid({packageId: 'elite', facilityRequested: true})]}), {todayISO: TODAY})
      .athletes[0].facilityRequested, true);
});

test('addAthletes payload: facilityRequested passes through, absent == false',
    () => {
      const opts = {todayISO: TODAY, guardianEmail: 'dana@email.com'};
      const p = v.validateAddAthletesPayload({athletes: [
        kid({facilityRequested: true}),
        kid({name: 'Reese', loginEmail: null})]}, opts);
      assert.deepEqual(p.athletes.map((a) => a.facilityRequested),
          [true, false]);
      assert.throws(() => v.validateAddAthletesPayload(
          {athletes: [kid({facilityRequested: 'on'})]}, opts),
      (e) => e.reason === 'facility-requested-invalid');
    });

test('addAthletes payload: guardian email from the household', () => {
  const p = v.validateAddAthletesPayload({athletes: [kid()], medical: ' x '},
      {todayISO: TODAY, guardianEmail: 'Dana@Email.com'});
  assert.deepEqual([p.athletes.length, p.medical, p.emergencyContact],
      [1, 'x', null]);
  assert.throws(() => v.validateAddAthletesPayload(
      {athletes: [kid({loginEmail: 'dana@email.com'})]},
      {todayISO: TODAY, guardianEmail: 'Dana@Email.com'}),
  (e) => e.reason === 'child-email-is-guardian');
  const withContact = v.validateAddAthletesPayload({athletes: [kid()],
    emergencyContact: {name: ' Gran ', phone: '555', relationship: ''}},
  {todayISO: TODAY, guardianEmail: 'dana@email.com'});
  assert.deepEqual(withContact.emergencyContact,
      {name: 'Gran', phone: '555', relationship: null});
  assert.throws(() => v.validateAddAthletesPayload({athletes: [kid()],
    emergencyContact: {relationship: 'Aunt'}},
  {todayISO: TODAY, guardianEmail: 'dana@email.com'}),
  (e) => e.reason === 'emergency-contact-incomplete');
});

test('emergency contact: the structured form, trimmed and capped', () => {
  const p = v.validateFamilyPayload(Object.assign(base(), {emergencyContact:
    {name: ' Bo Novak ', phone: ' +1 555 0100 ', relationship: ' Uncle '}}),
  {todayISO: TODAY});
  assert.deepEqual(p.emergencyContact,
      {name: 'Bo Novak', phone: '+1 555 0100', relationship: 'Uncle'});
  const n = v.normalizeEmergencyContact;
  assert.deepEqual(n({name: 'Bo', phone: '555', relationship: null}),
      {name: 'Bo', phone: '555', relationship: null});
  assert.equal(n({name: 'Bo', phone: '5'.repeat(40)}).phone.length, 32);
  assert.equal(n({name: ' ', phone: '', relationship: ''}), null);
  assert.equal(n(null), null);
  assert.equal(n(undefined), null);
});

test('emergency contact: the old string form is never refused', () => {
  const n = v.normalizeEmergencyContact;
  assert.deepEqual(n(' Uncle Bo 555 '),
      {name: 'Uncle Bo 555', phone: null, relationship: null});
  assert.equal(n(''), null);
  assert.equal(n('   '), null);
});

test('emergency contact: half-filled or the wrong type is refused', () => {
  const refused = (raw) => assert.throws(() => v.normalizeEmergencyContact(raw),
      (e) => e instanceof v.ValidationError &&
        e.reason === 'emergency-contact-incomplete' &&
        e.code === 'invalid-argument', JSON.stringify(raw));
  refused({name: 'Bo'});
  refused({phone: '555'});
  refused({relationship: 'Uncle'});
  refused({name: 'Bo', phone: 555});
  refused(42);
  refused(true);
  refused(['Bo', '555']);
});

test('storedEmergencyContact reads any household value without throwing',
    () => {
      const s = v.storedEmergencyContact;
      assert.deepEqual(s('Uncle Bo 555'),
          {name: 'Uncle Bo 555', phone: null, relationship: null});
      assert.deepEqual(s({name: 'Bo', phone: '555', relationship: 'Uncle'}),
          {name: 'Bo', phone: '555', relationship: 'Uncle'});
      assert.deepEqual(s({name: 'Bo', phone: 7}),
          {name: 'Bo', phone: null, relationship: null});
      for (const junk of [null, undefined, '', '  ', 42, true, [], ['Bo'],
        {}, {name: ' ', phone: ''}, {relationship: 'Uncle'}]) {
        assert.equal(s(junk), null, JSON.stringify(junk));
      }
    });

run();
