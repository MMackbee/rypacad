/* Sprint 20 createFamily / addAthletes / claimInvite harness - runs against
 * the ISOLATED emulator (firestore 8082, config firebase.functions-lane.json).
 * It WIPES and reseeds that instance; never point it at 8080.
 *   cd functions && npx firebase-tools emulators:start --only firestore,functions --project rypacad --config ../firebase.functions-lane.json
 *   node test/verify-family.js   (from functions/)
 * The handlers run in THIS process with a fabricated callable context, so no
 * Auth emulator and no HTTP: every refusal in contract 1.2-1.4 is asserted
 * on `err.code` and `err.details.reason`. */
'use strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082';
process.env.GCLOUD_PROJECT = 'rypacad';

const admin = require('firebase-admin');
const family = require('../portal/family.js');

admin.initializeApp({projectId: 'rypacad'});
const db = admin.firestore();

let failures = 0;
const log = (...a) => console.log(...a);
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { log(`    PASS  ${label} = ${a}`); }
  else { failures++; log(`    FAIL  ${label}\n          expected ${e}\n          actual   ${a}`); }
}
async function refused(label, promise, code, reason) {
  try {
    await promise;
    failures++; log(`    FAIL  ${label}: resolved instead of ${code}/${reason}`);
  } catch (e) {
    check(label, [e.code, e.details && e.details.reason], [code, reason]);
  }
}
async function get(col, id) {
  const s = await db.collection(col).doc(id).get();
  return s.exists ? s.data() : null;
}
async function exists(col, id) {
  return (await db.collection(col).doc(id).get()).exists;
}
async function wipe() {
  for (const c of ['households', 'athletes', 'packages', 'users', 'loginInvites']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}
const ctx = (uid, email, verified = true, provider = 'password') => ({
  auth: {uid, token: {email, email_verified: verified, firebase: {sign_in_provider: provider}}}});
const NOW = new Date('2026-10-01T18:00:00Z');
const deps = {db, now: NOW};
const kid = (over) => Object.assign({name: 'Lena Novak', dob: '2012-06-17', packageId: 't-6',
  contractMinutes: null, handicap: 20, loginEmail: null}, over);
const payload = (over) => Object.assign({
  mode: 'parent',
  contact: {name: 'Nina Novak', email: 'nina@example.test', phone: '+15550199', relationship: 'Mother'},
  // Both tick the facility add-on: it is a family add-on and Elite covers the family (owner ruling 2026-09-30), so with Max on Elite nobody keeps it.
  athletes: [kid({loginEmail: 'Kid@Example.test', facilityRequested: true}), kid({name: 'Max Novak', dob: '2010-02-02', packageId: 'elite', contractMinutes: 45, handicap: null, facilityRequested: true})],
  emergencyContact: {name: ' Uncle Bo ', phone: '+15550100', relationship: 'Uncle'},
  medical: 'Peanut allergy',
  consents: {dataCollection: true, videoCapture: true, mediaRelease: true, facilityAccess: true},
  signatureName: 'Nina Novak',
}, over);

async function seed() {
  await wipe();
  const B = db.batch();
  const set = (c, id, d) => B.set(db.collection(c).doc(id), d);
  set('households', 'whitfield', {name: 'Whitfield family', guardian: {name: 'Dana', email: 'dana@example.test', phone: null}, emergencyContact: null});
  // A pre-split household: its emergency contact is still one string.
  set('households', 'okafor', {name: 'Okafor family', guardian: {name: 'Ada', email: 'ada@example.test', phone: null}, emergencyContact: 'Uncle Bo +15550100'});
  set('users', 'u-ada', {role: 'parent', householdId: 'okafor', email: 'ada@example.test'});
  set('athletes', 'reese', {name: 'Reese', householdId: 'whitfield', packageId: 't-6', loginEmail: 'reese@example.test'});
  set('users', 'u-dana', {role: 'parent', householdId: 'whitfield', email: 'dana@example.test'});
  set('users', 'u-jordan', {role: 'athlete', athleteId: 'jordan', householdId: 'whitfield', email: 'jordan@example.test'});
  set('loginInvites', 'reese@example.test', {email: 'reese@example.test', householdId: 'whitfield', athleteId: 'reese', athleteName: 'Reese', requestedBy: 'guardian', createdBy: 'u-dana', createdAt: new Date(), status: 'open', claimedBy: null, claimedAt: null});
  set('loginInvites', 'ghost@example.test', {email: 'ghost@example.test', householdId: 'whitfield', athleteId: 'nobody', athleteName: 'Ghost', requestedBy: 'guardian', createdBy: 'u-dana', createdAt: new Date(), status: 'open', claimedBy: null, claimedAt: null});
  set('loginInvites', 'done@example.test', {email: 'done@example.test', householdId: 'whitfield', athleteId: 'reese', athleteName: 'Reese', requestedBy: 'guardian', createdBy: 'u-dana', createdAt: new Date(), status: 'claimed', claimedBy: 'u-old', claimedAt: new Date()});
  await B.commit();
}

async function main() {
  log('\n=== Sprint 20 family callables (isolated emulator, in-process) ===');
  await seed();

  log('STEP 1  createFamily happy path (parent, two athletes, one child login)');
  const r1 = await family.createFamilyHandler(payload(), ctx('u-nina', 'nina@example.test'), deps);
  check('athleteIds count', r1.athleteIds.length, 2);
  const hh = await get('households', r1.householdId);
  check('household', [hh.name, hh.guardian, hh.stripeCustomerId, hh.stripeSubscriptionId, hh.stripeCustomerIds, hh.createdBy, hh.emergencyContact, hh.signup.by, hh.signup.source, hh.signup.mode, !!hh.signup.at],
      ['Novak family', {name: 'Nina Novak', email: 'nina@example.test', phone: '+15550199', relationship: 'Mother'}, null, null, [], 'u-nina', {name: 'Uncle Bo', phone: '+15550100', relationship: 'Uncle'}, 'u-nina', 'self', 'parent', true]);
  const [lenaId, maxId] = r1.athleteIds;
  const lena = await get('athletes', lenaId);
  check('lena athlete doc', [lena.name, lena.dob, lena.householdId, lena.packageId, lena.contractMinutes, lena.coachId, lena.facilityAccess, lena.handicap, lena.loginEmail, lena.billing.status, lena.billing.subscriptionId, !!lena.billing.updatedAt, !!lena.updatedAt, lena.facilityAccessConsent.byUid],
      ['Lena Novak', '2012-06-17', r1.householdId, 't-6', null, null, false, 20, 'kid@example.test', 'pending', null, true, true, 'u-nina']);
  check('lena billing shape', Object.keys(lena.billing).sort(), ['checkoutSessionId', 'customerId', 'priceId', 'status', 'subscriptionId', 'updatedAt']);
  const max = await get('athletes', maxId);
  check('max handicap null, no loginEmail', [max.handicap, max.loginEmail], [null, null]);
  check('facilityRequested: an Elite athlete in the family means nobody keeps it, never access', [lena.facilityRequested, max.facilityRequested, lena.facilityAccess, max.facilityAccess], [false, false, false, false]);
  check('contractStart: Chicago today with a contract, absent without', [max.contractMinutes, max.contractStart, 'contractStart' in lena], [45, '2026-10-01', false]);
  const med = (await db.collection('athletes').doc(lenaId).collection('private').doc('medical').get()).data();
  check('private/medical on every athlete', [med.emergencyContact, med.medicalNotes, await (async () => (await db.collection('athletes').doc(maxId).collection('private').doc('medical').get()).exists)()], [{name: 'Uncle Bo', phone: '+15550100', relationship: 'Uncle'}, 'Peanut allergy', true]);
  check('users/u-nina', await get('users', 'u-nina'), {role: 'parent', householdId: r1.householdId, athleteId: null, staff: false, specialistId: null, displayName: 'Nina Novak', email: 'nina@example.test', phone: '+15550199'});
  const inv = await get('loginInvites', 'kid@example.test');
  check('loginInvites/kid@example.test', [inv.email, inv.householdId, inv.athleteId, inv.athleteName, inv.requestedBy, inv.createdBy, inv.status, inv.claimedBy, inv.claimedAt, !!inv.createdAt],
      ['kid@example.test', r1.householdId, lenaId, 'Lena Novak', 'guardian', 'u-nina', 'open', null, null, true]);

  log('\nSTEP 2  createFamily refusals (contract 1.2 order)');
  await refused('signed-out', family.createFamilyHandler(payload(), {auth: null}, deps), 'unauthenticated', 'signed-out');
  await refused('already-provisioned', family.createFamilyHandler(payload(), ctx('u-nina', 'nina@example.test'), deps), 'already-exists', 'already-provisioned');
  await refused('invite-open (caller email has an open invite, any case)', family.createFamilyHandler(payload(), ctx('u-reese', 'Reese@Example.test'), deps), 'failed-precondition', 'invite-open');
  await refused('invalid-mode', family.createFamilyHandler(payload({mode: 'coach'}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'invalid-mode');
  await refused('contact-required', family.createFamilyHandler(payload({contact: {name: 'X', email: 'x@x.test', phone: ''}}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'contact-required');
  await refused('contact-required (malformed guardian email)', family.createFamilyHandler(payload({contact: {name: 'X', email: 'dana@', phone: '+15550100'}}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'contact-required');
  await refused('athlete-count', family.createFamilyHandler(payload({athletes: []}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'athlete-count');
  await refused('athlete-under-18', family.createFamilyHandler(payload({mode: 'athlete', athletes: [kid({dob: '2008-10-02'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'athlete-under-18');
  await refused('dob-invalid', family.createFamilyHandler(payload({athletes: [kid({dob: '2026-12-25'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'dob-invalid');
  await refused('unknown-package', family.createFamilyHandler(payload({athletes: [kid({packageId: 't-20'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'unknown-package');
  await refused('contract-tier', family.createFamilyHandler(payload({athletes: [kid({contractMinutes: 95})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'contract-tier');
  await refused('handicap-range', family.createFamilyHandler(payload({athletes: [kid({handicap: 55})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'handicap-range');
  await refused('child-email-invalid', family.createFamilyHandler(payload({athletes: [kid({loginEmail: 'nope'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'child-email-invalid');
  await refused('child-email-is-guardian', family.createFamilyHandler(payload({athletes: [kid({loginEmail: 'NINA@example.test'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'child-email-is-guardian');
  await refused('child-email-duplicate (within the payload)', family.createFamilyHandler(payload({athletes: [kid({loginEmail: 'a@b.test'}), kid({name: 'B', loginEmail: 'A@b.test'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'child-email-duplicate');
  await refused('child-email-duplicate (existing open invite)', family.createFamilyHandler(payload({athletes: [kid({loginEmail: 'kid@example.test'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'child-email-duplicate');
  await refused('child-email-duplicate (existing CLAIMED invite - the email is a login already)', family.createFamilyHandler(payload({athletes: [kid({loginEmail: 'done@example.test'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'child-email-duplicate');
  await refused('facility-requested-invalid (not a boolean)', family.createFamilyHandler(payload({athletes: [kid({facilityRequested: 'yes'})]}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'facility-requested-invalid');
  await refused('emergency-contact-incomplete (a name, no mobile)', family.createFamilyHandler(payload({emergencyContact: {name: 'Uncle Bo', phone: ' ', relationship: null}}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'emergency-contact-incomplete');
  await refused('consents-required', family.createFamilyHandler(payload({consents: {dataCollection: true, videoCapture: false}}), ctx('u-x1', 'x1@example.test'), deps), 'invalid-argument', 'consents-required');
  check('no stray household from a refused call', (await db.collection('households').get()).size, 3);
  check('no users doc for u-x1', await exists('users', 'u-x1'), false);

  log('\nSTEP 3  createFamily athlete mode (18+, self), from a pre-split bundle (string emergency contact)');
  const r3 = await family.createFamilyHandler(payload({mode: 'athlete', contact: {name: 'Sam Reyes', email: 'sam@example.test', phone: '+15550111', relationship: null},
    athletes: [kid({name: 'Sam Reyes', dob: '2000-01-01', packageId: 't-12', loginEmail: 'ignored@example.test'})], emergencyContact: ' Aunt May 555 '}), ctx('u-sam', 'sam@example.test', true, 'google.com'), deps);
  check('users/u-sam is the athlete', await get('users', 'u-sam'), {role: 'athlete', householdId: r3.householdId, athleteId: r3.athleteIds[0], staff: false, specialistId: null, displayName: 'Sam Reyes', email: 'sam@example.test', phone: '+15550111'});
  check('athlete mode: loginEmail null, relationship null, signup.mode', [(await get('athletes', r3.athleteIds[0])).loginEmail, (await get('households', r3.householdId)).guardian.relationship, (await get('households', r3.householdId)).signup.mode], [null, null, 'athlete']);
  check('no invite written in athlete mode', await exists('loginInvites', 'ignored@example.test'), false);
  check('the live payload (no facilityRequested) still writes false', (await get('athletes', r3.athleteIds[0])).facilityRequested, false);
  const oldForm = {name: 'Aunt May 555', phone: null, relationship: null};
  check('old string contact: household + medical doc hold it as the name', [(await get('households', r3.householdId)).emergencyContact, (await db.collection('athletes').doc(r3.athleteIds[0]).collection('private').doc('medical').get()).data().emergencyContact], [oldForm, oldForm]);

  log('\nSTEP 3b  createFamily: a mobile over 32 characters');
  const longPhone = '+1 (612) 555-0148 ext. 1234567890 x';
  const r3b = await family.createFamilyHandler(payload({contact: {name: 'Lou Long', email: 'lou@example.test', phone: longPhone, relationship: 'Father'}, athletes: [kid({name: 'Kit Long'})]}), ctx('u-lou', 'lou@example.test'), deps);
  check('users.phone cut to 32, household keeps the full string', [(await get('users', 'u-lou')).phone, (await get('households', r3b.householdId)).guardian.phone], [longPhone.slice(0, 32), longPhone]);

  log('\nSTEP 4  addAthletes');
  const r4 = await family.addAthletesHandler({athletes: [kid({name: 'Nico', dob: '2015-05-05', contractMinutes: 20, loginEmail: 'nico@example.test', facilityRequested: true})], medical: null}, ctx('u-dana', 'dana@example.test'), deps);
  check('lands in me().householdId', r4.householdId, 'whitfield');
  const nico = await get('athletes', r4.athleteIds[0]);
  check('nico doc (link mode keeps the add-on request; no waiver in this flow)', [nico.householdId, nico.billing.status, nico.loginEmail, nico.facilityAccessConsent, nico.contractMinutes, nico.contractStart, nico.facilityRequested, nico.facilityAccess], ['whitfield', 'pending', 'nico@example.test', null, 20, '2026-10-01', true, false]);
  check('nico invite open', (await get('loginInvites', 'nico@example.test')).status, 'open');
  check('no medical doc when nothing to record', (await db.collection('athletes').doc(r4.athleteIds[0]).collection('private').doc('medical').get()).exists, false);
  const r4b = await family.addAthletesHandler({athletes: [kid({name: 'Pia', dob: '2016-06-06'})], emergencyContact: {name: 'Gran', phone: '+15550122', relationship: 'Grandparent'}, medical: null}, ctx('u-dana', 'dana@example.test'), deps);
  check('typed contact: on the new medical doc, household untouched', [(await db.collection('athletes').doc(r4b.athleteIds[0]).collection('private').doc('medical').get()).data().emergencyContact, (await get('households', 'whitfield')).emergencyContact, 'contractStart' in (await get('athletes', r4b.athleteIds[0]))], [{name: 'Gran', phone: '+15550122', relationship: 'Grandparent'}, null, false]);
  check('no facilityRequested sent (live link payload): false', (await get('athletes', r4b.athleteIds[0])).facilityRequested, false);
  const r4c = await family.addAthletesHandler({athletes: [kid({name: 'Obi Okafor', dob: '2013-03-03'})], medical: null}, ctx('u-ada', 'ada@example.test'), deps);
  check('no contact typed: falls back to the household\'s old string', (await db.collection('athletes').doc(r4c.athleteIds[0]).collection('private').doc('medical').get()).data().emergencyContact, {name: 'Uncle Bo +15550100', phone: null, relationship: null});
  await refused('not-parent (athlete account)', family.addAthletesHandler({athletes: [kid()]}, ctx('u-jordan', 'jordan@example.test'), deps), 'permission-denied', 'not-parent');
  await refused('not-parent (no users doc)', family.addAthletesHandler({athletes: [kid()]}, ctx('u-x2', 'x2@example.test'), deps), 'permission-denied', 'not-parent');
  await refused('child-email-is-guardian (household guardian)', family.addAthletesHandler({athletes: [kid({loginEmail: 'dana@example.test'})]}, ctx('u-dana', 'dana@example.test'), deps), 'invalid-argument', 'child-email-is-guardian');
  await refused('child-email-duplicate (open invite elsewhere)', family.addAthletesHandler({athletes: [kid({loginEmail: 'kid@example.test'})]}, ctx('u-dana', 'dana@example.test'), deps), 'invalid-argument', 'child-email-duplicate');

  log('\nSTEP 5  claimInvite states');
  check('none (stranger)', await family.claimInviteHandler({}, ctx('u-str', 'stranger@example.test'), deps), {state: 'none', householdId: null, athleteId: null});
  check('needs-verification (open, unverified) writes nothing', [await family.claimInviteHandler({}, ctx('u-kid', 'KID@example.test', false), deps), await exists('users', 'u-kid')], [{state: 'needs-verification', householdId: null, athleteId: null}, false]);
  check('claimed (open, verified)', await family.claimInviteHandler({}, ctx('u-kid', 'KID@example.test', true), deps), {state: 'claimed', householdId: r1.householdId, athleteId: lenaId});
  check('users/u-kid', await get('users', 'u-kid'), {role: 'athlete', athleteId: lenaId, householdId: r1.householdId, staff: false, specialistId: null, displayName: 'Lena Novak', email: 'kid@example.test'});
  const claimed = await get('loginInvites', 'kid@example.test');
  check('invite flipped', [claimed.status, claimed.claimedBy, !!claimed.claimedAt], ['claimed', 'u-kid', true]);
  check('already-claimed (second uid, same email)', await family.claimInviteHandler({}, ctx('u-kid2', 'kid@example.test', true), deps), {state: 'already-claimed', householdId: null, athleteId: null});
  check('already-claimed (seeded)', (await family.claimInviteHandler({}, ctx('u-d', 'done@example.test', true), deps)).state, 'already-claimed');
  check('orphaned: none + status flip', [(await family.claimInviteHandler({}, ctx('u-g', 'ghost@example.test', true), deps)).state, (await get('loginInvites', 'ghost@example.test')).status], ['none', 'orphaned']);
  check('orphaned invite stays none afterwards', (await family.claimInviteHandler({}, ctx('u-g', 'ghost@example.test', true), deps)).state, 'none');
  await refused('no-email (emulator custom token)', family.claimInviteHandler({}, {auth: {uid: 'u-anon', token: {}}}, deps), 'failed-precondition', 'no-email');
  await refused('signed-out', family.claimInviteHandler({}, {}, deps), 'unauthenticated', 'signed-out');

  log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
