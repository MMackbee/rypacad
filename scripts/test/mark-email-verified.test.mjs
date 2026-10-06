import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, authTarget, summarize, decide, lookup, nextStep, main } from '../mark-email-verified.mjs';

test('parseArgs: an email and exactly one of --dry-run | --yes', () => {
  assert.ok(parseArgs(['--email', 'a@b.co']).error);
  assert.ok(parseArgs(['--email', 'a@b.co', '--dry-run', '--yes']).error);
  assert.ok(parseArgs(['--dry-run']).error);
  assert.ok(parseArgs(['--email', 'not-an-email', '--yes']).error);
  assert.ok(parseArgs(['--email']).error);
  assert.ok(parseArgs(['--email', 'a@b.co', '--yes', '--force']).error);
  assert.deepEqual(parseArgs(['--prod', '--email', ' Keith@Example.COM ', '--dry-run']),
    { prod: true, email: 'keith@example.com', dryRun: true, yes: false });
});

test('authTarget: production with --prod, otherwise only a local Auth emulator', async () => {
  const prod = await authTarget({ prod: true, token: async () => 'tok' });
  assert.equal(prod.base, 'https://identitytoolkit.googleapis.com/v1/projects/rypacad');
  assert.equal(prod.auth, 'Bearer tok');
  assert.ok((await authTarget({ prod: false, env: {} })).error);
  assert.ok((await authTarget({ prod: false, env: { FIREBASE_AUTH_EMULATOR_HOST: 'auth.example.com:9099' } })).error);
  const local = await authTarget({ prod: false, env: { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' } });
  assert.equal(local.base, 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/rypacad');
});

test('summarize never carries the password hash or salt', () => {
  const s = summarize({
    localId: 'u1', email: 'a@b.co', emailVerified: false, passwordHash: 'HASH', salt: 'SALT',
    providerUserInfo: [{ providerId: 'password' }], createdAt: '1790000000000',
  });
  assert.equal(JSON.stringify(s).includes('HASH'), false);
  assert.equal(JSON.stringify(s).includes('SALT'), false);
  assert.deepEqual(s.providers, ['password']);
  assert.equal(s.lastSignIn, 'never');
});

test('decide: refuse a missing or disabled login, skip a verified one', () => {
  assert.equal(decide(null).action, 'refuse');
  assert.equal(decide({ disabled: true, emailVerified: false }).action, 'refuse');
  assert.equal(decide({ emailVerified: true }).action, 'none');
  assert.equal(decide({ emailVerified: false }).action, 'verify');
  assert.equal(decide({}).action, 'verify');
});

test('nextStep names the button that fits the login', () => {
  assert.match(nextStep('parent'), /yellow card/);
  assert.match(nextStep(null), /finishes sign-up/);
  assert.match(nextStep('athlete'), /I've verified/);
  assert.match(nextStep(undefined), /No sign-out needed/);
});

test('lookup refuses an email that more than one login has', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ users: [
    { localId: 'a', email: 'dup@example.test' }, { localId: 'b', email: 'DUP@example.test' },
  ] }), { status: 200 });
  try {
    await assert.rejects(lookup({ base: 'http://x', auth: 'Bearer owner', label: 't' }, 'dup@example.test'), /More than one login/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// End to end against a real Auth emulator; skipped unless one is running, e.g.
//   npx firebase-tools emulators:exec --only auth --project rypacad "npm run test:scripts"
const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
test('against the Auth emulator: dry run writes nothing, --yes verifies only that login', { skip: !emulator }, async () => {
  const signUp = async (email) => {
    const res = await fetch(`http://${emulator}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'emulator-only-pw', returnSecureToken: true }),
    });
    assert.equal(res.status, 200);
  };
  const stamp = String(process.hrtime.bigint());
  const parent = `parent-${stamp}@example.test`;
  const bystander = `bystander-${stamp}@example.test`;
  await signUp(parent);
  await signUp(bystander);
  const target = await authTarget({ prod: false });
  const before = await lookup(target, parent);

  assert.equal(await main(['--email', parent, '--dry-run']), 0);
  assert.equal((await lookup(target, parent)).emailVerified, false);

  assert.equal(await main(['--email', parent.toUpperCase(), '--yes']), 0);
  const after = await lookup(target, parent);
  assert.equal(after.emailVerified, true);
  assert.equal(after.localId, before.localId);
  assert.equal(after.passwordHash, before.passwordHash);
  assert.deepEqual(after.providerUserInfo, before.providerUserInfo);
  assert.equal((await lookup(target, bystander)).emailVerified, false);

  assert.equal(await main(['--email', parent, '--yes']), 0); // already verified: no-op
  assert.equal(await main(['--email', `nobody-${stamp}@example.test`, '--dry-run']), 1);
});
