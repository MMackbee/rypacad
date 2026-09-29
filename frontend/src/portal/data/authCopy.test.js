import { EMAIL_IN_USE, VERIFY_EMAIL_SENDER, notProvisionedView, verifyBody } from './authCopy';

test('verify copy names the sender (contract 9.4)', () => {
  expect(VERIFY_EMAIL_SENDER).toMatch(/^noreply@.+\.firebaseapp\.com$/);
  expect(verifyBody('kid@email.com')).toBe(`We sent a link to kid@email.com from ${VERIFY_EMAIL_SENDER}. Open it, then tap I've verified.`);
  expect(EMAIL_IN_USE).toBe('This email already has a login - sign in instead');
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
