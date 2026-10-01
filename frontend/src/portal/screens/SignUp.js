import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { color, font } from '../tokens';
import Button from '../components/Button';
import Field from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import { AlertGlyph, Banner, Body } from '../components/Primitives';
import useAuthSession from '../hooks/useAuthSession';
import { EMAIL_RE } from '../data/signup';
import { EMAIL_IN_USE, verifySentNote } from '../data/authCopy';
import { BrandHeader, LANDING_BY_ROLE } from './SignIn';

/**
 * 00 · Sign up (Sprint 20, spec 2.1 step 0) - public. Create a login (email
 * + password, or Google), then straight on to /portal/register - no Continue
 * tap (owner, 2026-09-30); the verification note rides along. Verification is
 * sent at once but is not required to finish sign-up (it is required to pay
 * and to claim a child login). A provisioned account lands on its home; an
 * invited child (claimState other than none) lands on NotProvisioned.
 */
export default function SignUp({ bare = false, onSignIn }) {
  const { user, provisioned, loading, error, signIn, createLogin, claimState } = useAuthSession();
  const navigate = useNavigate();
  // The launch email's link may carry the address (?email=..., owner
  // 2026-10-01): a well-formed one fills the field, anything else is ignored.
  // The parameter is then dropped from the address bar.
  const [params, setParams] = useSearchParams();
  const linked = (params.get('email') || '').trim();
  const [email, setEmail] = useState(EMAIL_RE.test(linked) ? linked : '');
  useEffect(() => {
    if (params.has('email')) setParams({}, { replace: true });
  }, [params, setParams]);
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState(null); // { message, inUse }
  const [sent, setSent] = useState(null); // { email, mailed } once the login exists

  // A login just created waits for the invite check, unless the account
  // itself failed to load: an invited child goes to the verify screen (which
  // claims the invite); a parent ('none'), a failed check or a hook without
  // claim support goes to the form.
  const checkingInvite = !error && (claimState === 'idle' || claimState === 'checking');
  const continuePath = ['needs-verification', 'claimed', 'already-claimed'].includes(claimState) ? '/portal/not-provisioned' : '/portal/register';

  useEffect(() => {
    // `creating`: Create login is still waiting on the verification email
    // while the new account's invite check may already have answered - the
    // effect below routes it, carrying the note (review 2026-09-30).
    if (!user || loading || sent || creating) return;
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
  }, [user, provisioned, loading, sent, creating, claimState, navigate]);

  // After Create login the effect above stands down (sent) and this one
  // moves on by itself the moment the invite check answers - the same gate
  // the Continue button below uses, so it can never route earlier than a tap
  // could. The form shows the verification note from navigation state.
  useEffect(() => {
    if (!sent || checkingInvite) return;
    // The verify screen says a link was sent; one that wasn't keeps the
    // yellow card here until the child taps Continue.
    if (!sent.mailed && continuePath !== '/portal/register') return;
    navigate(continuePath, { replace: true, state: { verifySent: sent } });
  }, [sent, checkingInvite, continuePath, navigate]);

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
  const note = sent ? verifySentNote(sent) : null;

  return (
    <PhoneFrame bare={bare}>
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <BrandHeader />
        {sent ? (
          <>
            <Banner tone={note.tone} title={note.title}>{note.body}</Banner>
            {/* Normally never tapped: the effect above moves on as soon as it
                enables. Kept so a stalled navigation still has a way forward. */}
            <Button style={{ marginTop: 14 }} disabled={checkingInvite} onClick={() => navigate(continuePath, { replace: true, state: { verifySent: sent } })}>
              {checkingInvite ? 'Checking your email...' : 'Continue to sign-up'}
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
