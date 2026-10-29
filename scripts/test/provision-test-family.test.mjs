import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEST_ATHLETES, TEST_HOUSEHOLD_ID, chicagoToday, loginRefusal, main, parseArgs, planTestFamily, refusal } from '../provision-test-family.mjs';
import { commit, docName, fsDecode, fsFields, getDoc, resolveTarget } from '../lib/firestore-rest.mjs';

const EMAIL = 'makel+testparent@rypgolf.com';
const TODAY = '2026-10-15';
const quiet = { log: () => {}, error: () => {} };
const yearsOn = (dob, today) => {
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};
const ours = () => Object.fromEntries(planTestFamily({ parentUid: 'u-test', parentEmail: EMAIL, todayISO: TODAY }).map((d) => [d.path, structuredClone(d.data)]));

/** A stand-in for production: docs by path, subcollection ids, one login; every commit kept and applied. */
function fakeIo({ docs = {}, subs = {}, login = { localId: 'u-test', email: EMAIL } } = {}) {
  const commits = [];
  const pathOf = (name) => name.split('/documents/')[1];
  const io = {
    label: 'fake production',
    lookupLogin: async () => login,
    readDoc: async (collection, id) => docs[`${collection}/${id}`] ?? null,
    listIds: async (parent, collectionId) => subs[`${parent}/${collectionId}`] ?? [],
    commitWrites: async (writes) => {
      commits.push(writes);
      for (const w of writes) {
        if (w.delete) delete docs[pathOf(w.delete)];
        else if (w.updateMask) docs[pathOf(w.update.name)].consents.research = null;
        else docs[pathOf(w.update.name)] = fsDecode(w.update.fields);
      }
    },
  };
  return { io, docs, commits };
}
const run = (argv, fake, extra = {}) => main(argv, { ...quiet, ...extra, io: fake.io, todayISO: TODAY });

test('parseArgs: the parent login and exactly one of --dry-run | --yes; --reset needs no login', () => {
  assert.ok(parseArgs(['--parent-email', EMAIL]).error);
  assert.ok(parseArgs(['--parent-email', EMAIL, '--dry-run', '--yes']).error);
  assert.ok(parseArgs(['--dry-run']).error);
  assert.ok(parseArgs(['--parent-email', 'not-an-email', '--yes']).error);
  assert.ok(parseArgs(['--parent-email', EMAIL, '--yes', '--force']).error);
  assert.deepEqual(parseArgs(['--prod', '--parent-email', ' Makel+TestParent@RYPgolf.com ', '--dry-run', '--no-adult']),
    { prod: true, parentEmail: EMAIL, dryRun: true, yes: false, adult: false, reset: false });
  assert.deepEqual(parseArgs(['--reset', '--yes']), { prod: false, parentEmail: null, dryRun: false, yes: true, adult: true, reset: true });
});

test('the signature date defaults to the academy date in Chicago, never the UTC date (plan addendum 5)', async () => {
  assert.equal(chicagoToday(new Date('2026-11-04T00:30:00Z')), '2026-11-03'); // 6:30 PM in Chicago
  assert.equal(chicagoToday(new Date('2026-11-04T12:00:00Z')), '2026-11-04');
  const fake = fakeIo();
  assert.equal(await main(['--parent-email', EMAIL, '--yes'], { ...quiet, io: fake.io }), 0);
  assert.equal(fake.docs['athletes/ryp-test-ava'].consents.signature.date, chicagoToday());
});

test('the plan: one household marked test, two test athletes (under 18, 18+) with no package, no billing and research unanswered, and the parent login', () => {
  const docs = planTestFamily({ parentUid: 'u-test', parentEmail: EMAIL, todayISO: TODAY });
  assert.deepEqual(docs.map((d) => d.path), [`households/${TEST_HOUSEHOLD_ID}`, 'athletes/ryp-test-ava', 'athletes/ryp-test-max', 'users/u-test']);
  const [household, ava, max, user] = docs.map((d) => d.data);
  assert.deepEqual([household.name, household.test, 'signup' in household], ['RYP Test Family', true, false]);
  assert.deepEqual([household.stripeCustomerId, household.stripeSubscriptionId, household.stripeCustomerIds], [null, null, []]);
  for (const a of [ava, max]) {
    assert.deepEqual([a.test, a.householdId, a.packageId, 'billing' in a], [true, TEST_HOUSEHOLD_ID, null, false]);
    assert.deepEqual(a.consents, { dataCollection: true, videoCapture: true, mediaRelease: false, research: null, signature: { name: 'RYP Test Parent', date: TODAY } });
  }
  assert.ok(yearsOn(ava.dob, TODAY) < 18 && yearsOn(ava.dob, '2027-07-31') < 18, 'Ava stays under 18 all season');
  assert.ok(yearsOn(max.dob, TODAY) >= 18, 'Max is 18+');
  assert.deepEqual([user.role, user.householdId, user.athleteId, user.email, user.staff], ['parent', TEST_HOUSEHOLD_ID, null, EMAIL, false]);
  assert.deepEqual(planTestFamily({ parentUid: 'u-test', parentEmail: EMAIL, todayISO: TODAY, adult: false }).map((d) => d.path),
    [`households/${TEST_HOUSEHOLD_ID}`, 'athletes/ryp-test-ava', 'users/u-test']);
  assert.deepEqual(TEST_ATHLETES.map((a) => a.id), ['ryp-test-ava', 'ryp-test-max']);
});

test('refusal: anything under the test ids that is not the test family stops the run', () => {
  const docs = planTestFamily({ parentUid: 'u-test', parentEmail: EMAIL, todayISO: TODAY });
  assert.equal(refusal(docs, {}), null);
  assert.equal(refusal(docs, ours()), null);
  assert.match(refusal(docs, { [`households/${TEST_HOUSEHOLD_ID}`]: { name: 'Kim family' } }), /not marked test: true/);
  assert.match(refusal(docs, { 'athletes/ryp-test-ava': { name: 'Ava Kim', householdId: 'kim' } }), /not a test-family athlete/);
  assert.match(refusal(docs, { 'athletes/ryp-test-ava': { householdId: TEST_HOUSEHOLD_ID } }), /not a test-family athlete/);
  assert.match(refusal(docs, { 'users/u-test': { role: 'parent', householdId: 'kim' } }), /already has a portal record/);
  assert.match(refusal(docs, { 'users/u-test': { role: 'owner', householdId: null } }), /already has a portal record/);
  assert.match(loginRefusal(null), /Sign in once at https:\/\/rypacad\.ryptest\.com/);
  assert.match(loginRefusal({ localId: 'u', disabled: true }), /disabled/);
  assert.equal(loginRefusal({ localId: 'u' }), null);
});

test('--dry-run reads and prints the plan, and writes nothing', async () => {
  const fake = fakeIo();
  const lines = [];
  assert.equal(await run(['--parent-email', EMAIL, '--dry-run'], fake, { log: (l) => lines.push(l) }), 0);
  assert.equal(fake.commits.length, 0);
  assert.ok(lines.some((l) => /create\s+households\/ryp-test-family/.test(l)));
  assert.ok(lines.some((l) => /create\s+users\/u-test/.test(l)));
  assert.ok(lines.includes('Would create 4 docs. Run again with --yes instead of --dry-run.'));
});

test('--yes creates every doc under exists:false in one commit; a re-run changes nothing', async () => {
  const fake = fakeIo();
  assert.equal(await run(['--parent-email', EMAIL, '--yes'], fake), 0);
  assert.equal(fake.commits.length, 1);
  assert.equal(fake.commits[0].length, 4);
  assert.ok(fake.commits[0].every((w) => w.update && w.currentDocument.exists === false));
  assert.ok(fake.commits[0].every((w) => /\/documents\/(households|athletes|users)\/[^/]+$/.test(w.update.name)));
  assert.equal(fake.docs[`households/${TEST_HOUSEHOLD_ID}`].test, true);
  fake.docs['athletes/ryp-test-ava'].consents.research = { value: false, assent: false }; // the parent answered at staging
  const lines = [];
  assert.equal(await run(['--parent-email', EMAIL, '--yes'], fake, { log: (l) => lines.push(l) }), 0);
  assert.equal(fake.commits.length, 1);
  assert.ok(lines.includes('Nothing to do: RYP Test Family is already there.'));
  assert.deepEqual(fake.docs['athletes/ryp-test-ava'].consents.research, { value: false, assent: false });
});

test('a missing piece is created alone; what is there stays as it is', async () => {
  const docs = ours();
  delete docs['athletes/ryp-test-max'];
  const fake = fakeIo({ docs });
  assert.equal(await run(['--parent-email', EMAIL, '--yes'], fake), 0);
  assert.deepEqual(fake.commits[0].map((w) => w.update.name.split('/documents/')[1]), ['athletes/ryp-test-max']);
});

test('refused before any write: a real household under the test id, a login that is another family\'s, no login', async () => {
  for (const fake of [
    fakeIo({ docs: { [`households/${TEST_HOUSEHOLD_ID}`]: { name: 'Kim family' } } }),
    fakeIo({ docs: { 'users/u-test': { role: 'parent', householdId: 'kim' } } }),
    fakeIo({ login: null }),
  ]) {
    assert.equal(await run(['--parent-email', EMAIL, '--yes'], fake), 1);
    assert.equal(fake.commits.length, 0);
  }
});

test('--reset: only the test athletes\' windows and profiles go and their research clears; never the settings, never a real household', async () => {
  const subs = { 'athletes/ryp-test-ava/assessments': ['2026-27-baseline'], 'athletes/ryp-test-ava/assessmentProfile': ['current'] };
  const answered = () => {
    const docs = ours();
    docs['athletes/ryp-test-ava'].consents.research = { value: true, assent: true };
    return docs;
  };
  const dry = fakeIo({ docs: answered(), subs });
  assert.equal(await run(['--reset', '--dry-run'], dry), 0);
  assert.equal(dry.commits.length, 0);
  const fake = fakeIo({ docs: answered(), subs });
  assert.equal(await run(['--reset', '--yes'], fake), 0);
  const [writes] = fake.commits;
  assert.deepEqual(writes.filter((w) => w.delete).map((w) => [w.delete.split('/documents/')[1], w.currentDocument.exists]),
    [['athletes/ryp-test-ava/assessments/2026-27-baseline', true], ['athletes/ryp-test-ava/assessmentProfile/current', true]]);
  assert.deepEqual(writes.filter((w) => w.update).map((w) => [w.update.name.split('/documents/')[1], w.updateMask.fieldPaths]),
    [['athletes/ryp-test-ava', ['consents.research']], ['athletes/ryp-test-max', ['consents.research']]]);
  assert.ok(writes.every((w) => !JSON.stringify(w).includes('assessmentSettings')));
  assert.equal(fake.docs['athletes/ryp-test-ava'].consents.research, null);
  const real = fakeIo({ docs: { [`households/${TEST_HOUSEHOLD_ID}`]: { name: 'Kim family' } } });
  assert.equal(await run(['--reset', '--yes'], real), 1);
  assert.equal(real.commits.length, 0);
});

// Against the local emulators; skipped unless both run, e.g.
//   npx firebase-tools emulators:exec --only firestore,auth --project rypacad "node --test scripts/test/provision-test-family.test.mjs"
const emulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
test('against the emulators: a real household is refused, the dry run writes nothing, --yes creates the family once, --reset clears it', { skip: !emulators }, async () => {
  const store = await resolveTarget({ prod: false });
  const email = `testparent-${process.hrtime.bigint()}@example.test`;
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'emulator-only-pw', returnSecureToken: true }),
  });
  assert.equal(res.status, 200);
  const uid = (await res.json()).localId;
  const WINDOW = 'athletes/ryp-test-ava/assessments/2026-27-baseline';
  const paths = [`households/${TEST_HOUSEHOLD_ID}`, 'athletes/ryp-test-ava', 'athletes/ryp-test-max', `users/${uid}`, WINDOW];
  const read = (p) => getDoc(store, p.slice(0, p.lastIndexOf('/')), p.slice(p.lastIndexOf('/') + 1));
  const clean = () => commit(store, paths.map((p) => ({ delete: docName(p.slice(0, p.lastIndexOf('/')), p.slice(p.lastIndexOf('/') + 1)) })));
  await clean();
  try {
    await commit(store, [{ update: { name: docName('households', TEST_HOUSEHOLD_ID), fields: fsFields({ name: 'Kim family' }) } }]);
    assert.equal(await main(['--parent-email', email, '--yes'], quiet), 1);
    assert.equal(await read('athletes/ryp-test-ava'), null);
    assert.equal((await read(`households/${TEST_HOUSEHOLD_ID}`)).name, 'Kim family');
    await clean();

    assert.equal(await main(['--parent-email', email, '--dry-run'], quiet), 0);
    assert.equal(await read(`households/${TEST_HOUSEHOLD_ID}`), null);

    assert.equal(await main(['--parent-email', email.toUpperCase(), '--yes'], quiet), 0);
    assert.equal((await read(`households/${TEST_HOUSEHOLD_ID}`)).test, true);
    assert.equal((await read('athletes/ryp-test-max')).test, true);
    const user = await read(`users/${uid}`);
    assert.deepEqual([user.role, user.householdId], ['parent', TEST_HOUSEHOLD_ID]);
    assert.equal(await main(['--parent-email', email, '--yes'], quiet), 0); // nothing to do

    await commit(store, [{ update: { name: docName('athletes/ryp-test-ava/assessments', '2026-27-baseline'), fields: fsFields({ athleteId: 'ryp-test-ava', kind: 'baseline' }) } }]);
    assert.equal(await main(['--reset', '--yes'], quiet), 0);
    assert.equal(await read(WINDOW), null);
    const ava = await read('athletes/ryp-test-ava');
    assert.deepEqual([ava.test, ava.consents.research, ava.consents.dataCollection], [true, null, true]);
  } finally {
    await clean();
  }
});
