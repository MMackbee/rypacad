import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../tokens';
import Button from '../components/Button';
import Field from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import { AlertGlyph, Banner, Body } from '../components/Primitives';
import useAuthSession from '../hooks/useAuthSession';
import { EMAIL_RE } from '../data/signup';
import { EMAIL_IN_USE, VERIFY_EMAIL_SENDER } from '../data/authCopy';
import { BrandHeader, LANDING_BY_ROLE } from './SignIn';

/**
 * 00 · Sign up (Sprint 20, spec 2.1 step 0) - public. Create a login (email
 * + password, or Google), then continue to /portal/register. Verification is
 * sent at once but is not required to finish sign-up (it is required to pay
 * and to claim a child login). A provisioned account lands on its home; an
 * invited child (claimState other than none) lands on NotProvisioned.
 */
export default function SignUp({ bare = false, onSignIn }) {
  const { user, provisioned, loading, error, signIn, createLogin, claimState } = useAuthSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState(null); // { message, inUse }
  const [sent, setSent] = useState(null); // the email the link went to

  useEffect(() => {
    if (!user || loading || sent) return;
    if (provisioned) {
      navigate(user.specialistId ? '/portal/my-sessions' : LANDING_BY_ROLE[user.role] ?? '/portal/not-provisioned', { replace: true });
      return;
    }
    // 'idle' = the claim check has not started yet (the auth emission is still
    // resolving); wait for it like 'checking' - an invited child must never be
    // routed into the household form. null/undefined = a hook without claim
    // support (routing Task 9 not merged yet): behave as 'none'.
    if (claimState === 'checking' || claimState === 'idle') return;
    navigate(claimState === 'none' || claimState == null ? '/portal/register' : '/portal/not-provisioned', { replace: true });
  }, [user, provisioned, loading, sent, claimState, navigate]);

  const canSubmit = EMAIL_RE.test(email.trim()) && password.length >= 6 && !creating && !loading;
  const submit = async () => {
    if (!canSubmit) return;
    setCreating(true);
    setFailure(null);
    try {
      const res = await createLogin(email.trim(), password);
      // sent false: the login exists but the mail did not go (throttled or
      // offline) - say so; Resend sits on the verify card at pay time.
      setSent({ email: email.trim(), mailed: !res || res.sent !== false });
    } catch (err) {
      const inUse = err && err.reason === 'email-in-use';
      setFailure({ inUse, message: inUse ? EMAIL_IN_USE : (err && err.message) || 'The login could not be created. Try again.' });
    } finally {
      setCreating(false);
    }
  };
  const goSignIn = () => (onSignIn ? onSignIn() : navigate('/portal/signin'));

  return (
    <PhoneFrame bare={bare}>
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <BrandHeader />
        {sent ? (
          <>
            {sent.mailed ? (
              <Banner tone="green" title="Verification sent">
                We sent a link to {sent.email} from {VERIFY_EMAIL_SENDER}. You can finish sign-up now; verify before you pay.
              </Banner>
            ) : (
              <Banner tone="yellow" title="Login created">
                We could not send the verification email to {sent.email} yet. Finish sign-up now; when you pay, tap Resend on the verify card.
              </Banner>
            )}
            <Button style={{ marginTop: 14 }} onClick={() => navigate('/portal/register', { replace: true })}>
              Continue to sign-up
            </Button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}>
              <Field label="Email" type="email" value={email} onChange={setEmail} dimmed={creating} />
              <Field label="Password" type="password" value={password} onChange={setPassword} dimmed={creating} hint="At least 6 characters." />
            </div>
            {failure || error ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                <AlertGlyph />
                <span style={{ font: `400 12px ${font.body}`, color: color.error }}>
                  {failure ? failure.message : error.message}
                  {failure && failure.inUse ? (
                    <> <button type="button" onClick={goSignIn} style={{ background: 'none', border: 'none', padding: 0, font: `600 12px ${font.body}`, color: color.primary, cursor: 'pointer' }}>Sign in</button></>
                  ) : null}
                </span>
              </div>
            ) : null}
            <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 13 }}>
              <Button loading={creating} disabled={!canSubmit} onClick={submit}>{creating ? 'Creating login' : 'Create login'}</Button>
              <Button variant="outline" disabled={creating || loading} onClick={() => signIn()} style={{ boxShadow: 'none' }}>Continue with Google</Button>
            </div>
          </>
        )}
        <div style={{ flex: 1, minHeight: 20 }} />
        <Body size={13} style={{ textAlign: 'center', paddingTop: 20 }}>
          Already have a login?{' '}
          <button type="button" onClick={goSignIn} style={{ background: 'none', border: 'none', padding: 0, font: `600 13px ${font.body}`, color: color.primary, cursor: 'pointer' }}>Sign in</button>
        </Body>
      </div>
    </PhoneFrame>
  );
}
