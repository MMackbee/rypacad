import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, pickAthlete, refusal, buildWrites, main } from '../link-subscription.mjs';
import { resolveTarget, commit, docName, fsFields, getDoc } from '../lib/firestore-rest.mjs';

const ARGS = ['--email', 'Ben@Example.com', '--subscription', 'sub_1U6zXED16IMJzfAP', '--customer', 'cus_V7Dz10QWvSDT97', '--price', 'price_1O49h5D16IMJzfAP'];

test('parseArgs: ids validated, exactly one of --dry-run | --yes', () => {
  assert.ok(parseArgs(ARGS).error);
  assert.ok(parseArgs([...ARGS, '--dry-run', '--yes']).error);
  assert.ok(parseArgs(['--email', 'a@b.co', '--subscription', 'nope', '--customer', 'cus_12345678', '--price', 'price_12345678', '--yes']).error);
  const ok = parseArgs([...ARGS, '--prod', '--dry-run']);
  assert.equal(ok.email, 'ben@example.com');
  assert.equal(ok.prod, true);
});

test('pickAthlete: the only unpaid athlete, or the one named', () => {
  const a = [{ name: 'Ava Schmidt', billing: { status: 'pending' } }, { name: 'Max Schmidt', billing: { status: 'active' } }];
  assert.equal(pickAthlete(a).athlete.name, 'Ava Schmidt');
  assert.equal(pickAthlete(a, 'max').athlete.name, 'Max Schmidt');
  assert.ok(pickAthlete([...a, { name: 'Zoe', billing: { status: 'pending' } }]).error);
});

test('refusal: only an unpaid token-package athlete whose subscription is free', () => {
  const pkg = { kind: 'tokens', tokens: 4 };
  const ath = { name: 'Ava', packageId: 't-4', billing: { status: 'pending' } };
  assert.equal(refusal({ athlete: ath, pkg, holders: [] }), null);
  assert.match(refusal({ athlete: { ...ath, billing: { status: 'active' } }, pkg, holders: [] }), /not unpaid/);
  assert.match(refusal({ athlete: ath, pkg: { kind: 'elite' }, holders: [] }), /not a token package/);
  assert.match(refusal({ athlete: ath, pkg, holders: [{ id: 'x' }] }), /already on athlete x/);
});

test('buildWrites: billing fields masked, server time, precondition; anchor only when missing', () => {
  const args = parseArgs([...ARGS, '--yes']);
  const w = buildWrites({ athlete: { id: 'a1' }, household: { id: 'h1' }, args, updateTime: 'T' });
  assert.equal(w.length, 2);
  assert.ok(w[0].updateMask.fieldPaths.every((f) => f.startsWith('billing.')));
  assert.deepEqual(w[0].currentDocument, { updateTime: 'T' });
  assert.equal(buildWrites({ athlete: { id: 'a1' }, household: { id: 'h1', periodAnchorDay: 1 }, args, updateTime: 'T' }).length, 1);
});

// Against a real Firestore emulator; skipped unless one is running, e.g.
//   npx firebase-tools emulators:exec --only firestore --project rypacad "node --test scripts/test/link-subscription.test.mjs"
test('against the emulator: dry run writes nothing, --yes links only billing, a re-run refuses', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const t = await resolveTarget({ prod: false });
  const stamp = String(process.hrtime.bigint());
  const hh = `hh-${stamp}`, ath = `ath-${stamp}`, email = `ben-${stamp}@example.test`;
  await commit(t, [
    { update: { name: docName('packages', 't-4'), fields: fsFields({ name: '4 tokens', kind: 'tokens', tokens: 4, windowDays: 30 }) } },
    { update: { name: docName('households', hh), fields: fsFields({ name: 'Schmidt family' }) } },
    { update: { name: docName('users', `u-${stamp}`), fields: fsFields({ role: 'parent', householdId: hh, email }) } },
    { update: { name: docName('athletes', ath), fields: fsFields({ name: 'Ava Schmidt', householdId: hh, packageId: 't-4', handicap: 9, billing: { status: 'pending', customerId: null, subscriptionId: null, priceId: null, checkoutSessionId: null } }) } },
  ]);
  const run = (mode) => main(['--email', email, '--subscription', `sub_${stamp.slice(-10)}AB`, '--customer', 'cus_V7Dz10QWvSDT97', '--price', 'price_1O49h5D16IMJzfAPaIyITCeH', mode]);
  assert.equal(await run('--dry-run'), 0);
  assert.equal((await getDoc(t, 'athletes', ath)).billing.status, 'pending');
  assert.equal(await run('--yes'), 0);
  const after = await getDoc(t, 'athletes', ath);
  assert.equal(after.billing.status, 'active');
  assert.equal(after.billing.subscriptionId, `sub_${stamp.slice(-10)}AB`);
  assert.equal(after.billing.linkedBy, 'link-subscription');
  assert.ok(after.billing.updatedAt);
  assert.equal(after.handicap, 9);
  assert.equal(after.packageId, 't-4');
  assert.equal((await getDoc(t, 'households', hh)).periodAnchorDay, 1);
  assert.equal(await run('--yes'), 1); // no longer unpaid
});
