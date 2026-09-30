import { EMAIL_IN_USE, VERIFY_EMAIL_SENDER, notProvisionedView, verifyBody, verifySentNote } from './authCopy';

/** authCopy re-read under `env` (the sender is fixed at import), then the environment restored. */
function authCopyWith(env) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  const put = (vars) => Object.entries(vars).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  put(env);
  let mod;
  try {
    jest.isolateModules(() => { mod = require('./authCopy'); });
  } finally {
    put(saved);
  }
  return mod;
}

test('verify copy names the sender and where to look (contract 9.4)', () => {
  expect(verifyBody('kid@email.com')).toBe(
    `We sent a link to kid@email.com from ${VERIFY_EMAIL_SENDER}. Open it, then tap I've verified. Not in your inbox? Check Spam or Junk.`
  );
  expect(EMAIL_IN_USE).toBe('This email already has a login - sign in instead');
});

test("the sender is Firebase's noreply@<auth domain> unless the console sender is mirrored in", () => {
  const unset = { REACT_APP_VERIFY_EMAIL_SENDER: undefined };
  expect(authCopyWith({ ...unset, REACT_APP_FIREBASE_AUTH_DOMAIN: undefined }).VERIFY_EMAIL_SENDER).toBe('noreply@rypacad.firebaseapp.com');
  expect(authCopyWith({ ...unset, REACT_APP_FIREBASE_AUTH_DOMAIN: 'other.firebaseapp.com' }).VERIFY_EMAIL_SENDER).toBe('noreply@other.firebaseapp.com');
  expect(authCopyWith({ REACT_APP_VERIFY_EMAIL_SENDER: '   ' }).VERIFY_EMAIL_SENDER).toMatch(/^noreply@.+\.firebaseapp\.com$/);
  const custom = authCopyWith({ REACT_APP_VERIFY_EMAIL_SENDER: ' noreply@rypacademy.com ' });
  expect(custom.VERIFY_EMAIL_SENDER).toBe('noreply@rypacademy.com');
  expect(custom.verifyBody('kid@email.com')).toContain('from noreply@rypacademy.com. Open it');
  expect(custom.verifySentNote({ email: 'kid@email.com', mailed: true }).body).toContain('from noreply@rypacademy.com (check Spam');
});

test('the sent note carries the sender and the Spam hint; an unsent one is unchanged', () => {
  expect(verifySentNote({ email: 'dana@email.com', mailed: true })).toEqual({
    tone: 'green',
    title: 'Verification sent',
    body: `We sent a link to dana@email.com from ${VERIFY_EMAIL_SENDER} (check Spam if it's not in your inbox). You can finish sign-up now; verify before you pay.`,
  });
  expect(verifySentNote({ email: 'dana@email.com', mailed: false })).toEqual({
    tone: 'yellow',
    title: 'Login created',
    body: 'We could not send the verification email to dana@email.com yet. Finish sign-up now; when you pay, tap Resend on the verify card.',
  });
});

test('the claim-state table (spec 3.2)', () => {
  expect(notProvisionedView({ claimState: 'checking', legacyStatus: 'none' })).toBe('checking');
  expect(notProvisionedView({ claimState: 'none', legacyStatus: null })).toBe('checking');
  expect(notProvisionedView({ claimState: 'needs-verification', legacyStatus: 'none' })).toBe('verify');
  expect(notProvisionedView({ claimState: 'already-claimed', legacyStatus: 'none' })).toBe('already-claimed');
  expect(notProvisionedView({ claimState: 'none', legacyStatus: 'pending' })).toBe('legacy');
  expect(notProvisionedView({ claimState: 'none', legacyStatus: 'declined' })).toBe('legacy');
  expect(notProvisionedView({ claimState: 'none', legacyStatus: 'none' })).toBe('stranger');
  expect(notProvisionedView({ claimState: 'error', legacyStatus: 'none' })).toBe('stranger');
  expect(notProvisionedView({ claimState: 'idle', legacyStatus: 'none' })).toBe('stranger');
});
