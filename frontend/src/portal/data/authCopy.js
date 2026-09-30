/**
 * Auth-flow copy (Sprint 20, contract 9.4/9.6) in one place: SignUp, SignIn,
 * NotProvisioned and the pay gate all render these strings, so they cannot
 * drift. Firebase's default verification template is sent by Firebase itself
 * from noreply@<authDomain> (spec 12.1: templates stay default), which is
 * why the sender is derived from the existing REACT_APP_FIREBASE_AUTH_DOMAIN
 * and not from the SMTP sender the functions use for notices.
 */
export const VERIFY_EMAIL_SENDER = `noreply@${process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'rypacad.firebaseapp.com'}`;
export const VERIFY_TITLE = 'Verify your email to finish';
export function verifyBody(email) {
  return `We sent a link to ${email} from ${VERIFY_EMAIL_SENDER}. Open it, then tap I've verified.`;
}
/**
 * The note a brand-new login carries from Create login onto the sign-up
 * form (owner, 2026-09-30: no Continue tap in between). `mailed` false = the
 * login exists but the email did not go (throttled or offline); Resend sits
 * on the verify card at pay time.
 */
export function verifySentNote({ email, mailed }) {
  return mailed
    ? { tone: 'green', title: 'Verification sent', body: `We sent a link to ${email} from ${VERIFY_EMAIL_SENDER}. You can finish sign-up now; verify before you pay.` }
    : { tone: 'yellow', title: 'Login created', body: `We could not send the verification email to ${email} yet. Finish sign-up now; when you pay, tap Resend on the verify card.` };
}
export const RESEND = 'Resend';
export const VERIFIED = "I've verified";
export const STRANGER_PARENT_CTA = "I'm a parent - start sign-up";
export const STRANGER_CHILD_CTA = 'My parent enrolled me';
export const STRANGER_CHILD_HINT = 'Use the email they entered, then tap Check again.';
export const CHECK_AGAIN = 'Check again';
export const LEGACY_CTA = 'Sign-up is now instant - start here';
export const ALREADY_CLAIMED = 'This login is already set up - sign in with it';
export const EMAIL_IN_USE = 'This email already has a login - sign in instead';
export const USE_PARENT_EMAIL = 'Use the email your parent entered.';
export const FAMILY_LINK_FAIL =
  'Ask your parent to allow sign-in for this app in Family Link, or create a password login below.';

/** Which NotProvisioned body renders (spec 3.2 + 2.4's legacy states). */
export function notProvisionedView({ claimState, legacyStatus }) {
  if (claimState === 'checking' || legacyStatus == null) return 'checking';
  if (claimState === 'needs-verification') return 'verify';
  if (claimState === 'already-claimed') return 'already-claimed';
  if (legacyStatus === 'pending' || legacyStatus === 'declined') return 'legacy';
  return 'stranger';
}
