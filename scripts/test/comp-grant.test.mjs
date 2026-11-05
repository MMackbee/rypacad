import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, grantFields, grantWrite, main } from '../comp-grant.mjs';
import { resolveTarget, commit, docName, fsFields, getDoc } from '../lib/firestore-rest.mjs';

const TODAY = '2026-11-05';
const NOW = Date.parse('2026-11-06T02:00:00Z');
const p = (argv) => parseArgs(argv, { today: TODAY });
const BASE = ['--email', ' NOllhoff@Example.com '];

test('parseArgs: one of --dry-run | --yes, email lower-cased, defaults, --elite-only, --revoke alone', () => {
  assert.match(p(BASE).error, /exactly one/);
  assert.match(p([...BASE, '--dry-run', '--yes']).error, /exactly one/);
  const ok = p([...BASE, '--prod', '--dry-run']);
  assert.equal(ok.email, 'nollhoff@example.com');
  assert.equal(ok.until, '2027-02-27');
  assert.equal(ok.note, 'Owner comp (Makel, Mike, Luke): free through 2027-02-27, 2026-27 season');
  assert.equal(ok.packages, null);
  assert.equal(ok.revoke, false);
  assert.equal(ok.prod, true);
  assert.deepEqual(p([...BASE, '--elite-only', '--yes']).packages, ['elite']);
  assert.equal(p([...BASE, '--until', TODAY, '--yes']).until, TODAY);
  assert.match(p([...BASE, '--until', '2026-11-04', '--yes']).error, /today \(2026-11-05\) or later/);
  assert.match(p([...BASE, '--until', '2027-02-30', '--yes']).error, /real date/);
  assert.match(p([...BASE, '--note', ' ', '--yes']).error, /--note/);
  assert.match(p([...BASE, '--note', 'x'.repeat(201), '--yes']).error, /--note/);
  assert.match(p(['--email', 'nope', '--yes']).error, /--email/);
  assert.match(p([...BASE, '--email', 'b@c.co', '--yes']).error, /only once/);
  assert.match(p([...BASE, '--until', '--yes']).error, /needs a value/);
  assert.match(p([...BASE, '--bogus', '--yes']).error, /Unknown argument: --bogus/);
  assert.equal(p([...BASE, '--revoke', '--yes']).revoke, true);
  assert.match(p([...BASE, '--revoke', '--elite-only', '--yes']).error, /--revoke takes only --email/);
  assert.match(p([...BASE, '--revoke', '--until', '2027-01-01', '--yes']).error, /--revoke takes only --email/);
});

test('grantFields: the shape functions/portal/comp-grant.js reads', () => {
  const args = p([...BASE, '--yes']);
  assert.deepEqual(grantFields(args, 'u1'), { email: 'nollhoff@example.com', uid: 'u1', until: '2027-02-27', note: args.note, packages: null, revoked: false, createdBy: 'comp-grant' });
  assert.equal(grantFields(args, undefined).uid, null);
});

test('grantWrite: create must not exist, replace and revoke need the read updateTime, server times', () => {
  const args = p([...BASE, '--yes']);
  const create = grantWrite({ args, uid: 'u1', existing: { data: null, updateTime: null } });
  assert.match(create.update.name, /documents\/compGrants\/nollhoff@example\.com$/);
  assert.deepEqual(create.currentDocument, { exists: false });
  assert.deepEqual(create.updateTransforms, [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]);
  assert.equal(create.update.fields.revoked.booleanValue, false);
  const replace = grantWrite({ args, uid: 'u1', existing: { data: {}, updateTime: 't1' } });
  assert.deepEqual(replace.currentDocument, { updateTime: 't1' });
  const revoke = grantWrite({ args: p([...BASE, '--revoke', '--yes']), existing: { data: {}, updateTime: 't2' } });
  assert.deepEqual(revoke.updateMask, { fieldPaths: ['revoked'] });
  assert.deepEqual(revoke.currentDocument, { updateTime: 't2' });
  assert.deepEqual(revoke.updateTransforms, [{ fieldPath: 'revokedAt', setToServerValue: 'REQUEST_TIME' }]);
  assert.throws(() => grantWrite({ args: p([...BASE, '--revoke', '--yes']), existing: { data: null, updateTime: null } }), /No grant to revoke/);
});

// Against a real Firestore emulator; skipped unless one is running, e.g.
//   npx firebase-tools emulators:exec --only firestore --project rypacad "node --test scripts/test/comp-grant.test.mjs"
test('against the emulator: dry run writes nothing; --yes creates the grant; a signed-up family has its unpaid Elite comped in the same commit; revoke', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const t = await resolveTarget({ prod: false });
  const stamp = String(process.hrtime.bigint());
  const login = (email) => (email.startsWith('fresh') ? null : { localId: `u-${email}`, emailVerified: false });
  const run = (email, ...rest) => main(['--email', email, ...rest], { nowMs: NOW, lookupLogin: async (e) => login(e) });

  // Not signed up yet.
  const fresh = `fresh-${stamp}@example.test`;
  assert.equal(await run(fresh, '--dry-run'), 0);
  assert.equal(await getDoc(t, 'compGrants', fresh), null);
  assert.equal(await run(fresh, '--yes'), 0);
  const g = await getDoc(t, 'compGrants', fresh);
  assert.deepEqual([g.email, g.uid, g.until, g.packages, g.revoked, g.createdBy, Boolean(g.createdAt)], [fresh, null, '2027-02-27', null, false, 'comp-grant', true]);
  assert.equal(await run(fresh, '--elite-only', '--yes'), 0); // replace
  assert.deepEqual((await getDoc(t, 'compGrants', fresh)).packages, ['elite']);

  // Already signed up: Abigail (Elite, unpaid) is comped now; Ben (8 sessions) is listed, untouched.
  const fam = `fam-${stamp}@example.test`;
  const hh = `hh-${stamp}`;
  const kid = (name, over = {}) => ({ name, householdId: hh, packageId: 'elite', dob: '2012-05-01', billing: { status: 'pending', customerId: null, subscriptionId: null, priceId: null, checkoutSessionId: null }, ...over });
  await commit(t, [
    { update: { name: docName('packages', 'elite'), fields: fsFields({ name: 'Elite', kind: 'elite', tokens: null }) } },
    { update: { name: docName('packages', 't-8'), fields: fsFields({ name: '8 sessions', kind: 'tokens', tokens: 8 }) } },
    { update: { name: docName('households', hh), fields: fsFields({ name: 'Fam family', stripeCustomerId: null, stripeCustomerIds: [] }) } },
    { update: { name: docName('users', `u-${stamp}`), fields: fsFields({ role: 'parent', householdId: hh, email: fam }) } },
    { update: { name: docName('athletes', `abigail-${stamp}`), fields: fsFields(kid('Abigail Fam')) } },
    { update: { name: docName('athletes', `ben-${stamp}`), fields: fsFields(kid('Ben Fam', { packageId: 't-8' })) } },
  ]);
  const benBefore = await getDoc(t, 'athletes', `ben-${stamp}`);
  assert.equal(await run(fam, '--dry-run'), 0);
  assert.equal((await getDoc(t, 'athletes', `abigail-${stamp}`)).billing.status, 'pending');
  assert.equal(await run(fam, '--yes'), 0);
  const abigail = await getDoc(t, 'athletes', `abigail-${stamp}`);
  assert.deepEqual([abigail.billing.status, abigail.billing.comp, abigail.billing.linkedBy, abigail.billing.subscriptionId], ['active', true, 'comp-membership', null]);
  assert.deepEqual(await getDoc(t, 'athletes', `ben-${stamp}`), benBefore);
  assert.equal((await getDoc(t, 'compGrants', fam)).uid, `u-${fam}`);

  // Revoke: the grant says so; Abigail stays comped; a second revoke refuses.
  assert.equal(await run(fam, '--revoke', '--yes'), 0);
  assert.equal((await getDoc(t, 'compGrants', fam)).revoked, true);
  assert.equal((await getDoc(t, 'athletes', `abigail-${stamp}`)).billing.comp, true);
  assert.equal(await run(fam, '--revoke', '--yes'), 1);
});
