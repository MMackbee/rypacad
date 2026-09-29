import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../tokens';
import * as hooks from '../hooks';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import { Banner, Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import useAuthSession from '../hooks/useAuthSession';
import { BrandHeader, LANDING_BY_ROLE } from './SignIn';
import { ALREADY_CLAIMED, CHECK_AGAIN, LEGACY_CTA, RESEND, STRANGER_CHILD_CTA, STRANGER_CHILD_HINT, STRANGER_PARENT_CTA, VERIFIED, VERIFY_TITLE, notProvisionedView, verifyBody } from '../data/authCopy';

/**
 * Sprint 10 pin A (TEAM.md, contract v1.8 §A): see Registration.js's own
 * doc comment for the full fallback rationale - useEnrollment() does not
 * exist anywhere in this worktree's hooks/index.js yet. Shared shape here:
 * { data: { status: 'none'|'pending'|'declined'|'approved', request } |
 * null, loading, error, submit(request) }.
 */
function useEnrollmentFallback() {
  return {
    data: { status: 'none', request: null },
    loading: false,
    error: null,
    submit: async (request) => ({ ...request, status: 'pending', simulated: true }),
  };
}
const useEnrollment = hooks.useEnrollment || useEnrollmentFallback;

/**
 * Not provisioned - signed in, no portal role (Sprint 20, spec 3.2 + 2.4).
 *
 * Four live states, chosen by notProvisionedView() from useAuthSession's
 * claimState and the legacy enrollment status: `verify` (an invited child
 * whose password account is not verified yet - Resend / I've verified),
 * `already-claimed` (the invite was used by another login), `legacy` (one of
 * the two historical pending/declined enrollmentRequests - sign-up is
 * instant now, so the only action is to start it), and `stranger` (no
 * invite: a parent starts sign-up, a child re-checks with the email the
 * parent entered). A provisioned account landing here is sent home.
 *
 * Same real/demo split as SignIn: `variant` renders a fixed demo state.
 *
 * @param {'verify'|'stranger'|'already-claimed'|'pending'|'declined'} [variant]
 *   Demo state; omit to run on the real seam. ('none'/'default' -> stranger.)
 * @param {() => void} [onStartEnrollment]  The parent CTA and the legacy CTA
 *   both navigate to /portal/register (RegistrationRoute redirects a
 *   provisioned account). Hidden without it.
 */
export default function NotProvisioned({ variant, ...rest }) {
  if (variant != null) return <DemoNotProvisioned variant={variant} {...rest} />;
  return <LiveNotProvisioned {...rest} />;
}

function LiveNotProvisioned({ bare = false, onStartEnrollment }) {
  const { user, provisioned, signOut, claimState, checkInvite, resendVerification } = useAuthSession();
  const enrollment = useEnrollment();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  // A claim that succeeded (or any provisioned account landing here) goes home.
  useEffect(() => {
    if (provisioned && user) navigate(user.specialistId ? '/portal/my-sessions' : LANDING_BY_ROLE[user.role] ?? '/portal/not-provisioned', { replace: true });
  }, [provisioned, user, navigate]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try { await signOut(); navigate('/portal/signin', { replace: true }); } catch (e) { setSigningOut(false); }
  };
  return (
    <NotProvisionedBody
      bare={bare}
      email={user?.email ?? null}
      view={notProvisionedView({ claimState, legacyStatus: enrollment.loading ? null : enrollment.data?.status ?? 'none' })}
      onStartEnrollment={onStartEnrollment}
      onCheckAgain={checkInvite}
      onResend={resendVerification}
      onSignOut={handleSignOut}
      signingOut={signingOut}
    />
  );
}

function DemoNotProvisioned({ bare = false, variant = 'stranger' }) {
  const view = variant === 'pending' || variant === 'declined'
    ? 'legacy'
    : ['verify', 'already-claimed', 'stranger'].includes(variant) ? variant : 'stranger';
  return (
    <NotProvisionedBody
      bare={bare}
      email="dana@email.com"
      view={view}
      onStartEnrollment={() => {}}
      onCheckAgain={async () => view === 'verify' ? 'needs-verification' : 'none'}
      onResend={async () => ({ sent: true })}
      onSignOut={() => {}}
      signingOut={false}
    />
  );
}

/** Title + body per view (contract 9.4). `checking` shares the stranger copy while the claim runs. */
const VIEW_COPY = {
  verify: { title: VERIFY_TITLE, body: (email) => verifyBody(email || 'your email') },
  'already-claimed': { title: 'Already set up', body: () => ALREADY_CLAIMED },
  legacy: { title: 'Sign-up changed', body: () => 'Approval is no longer needed - sign-up creates the account instantly.' },
  stranger: {
    title: 'Account not linked yet',
    body: () => "You're signed in, but this login isn't linked to an academy family or staff role yet.",
  },
  checking: {
    title: 'Account not linked yet',
    body: () => "You're signed in, but this login isn't linked to an academy family or staff role yet.",
  },
};

function NotProvisionedBody({ bare, email, view, onStartEnrollment, onCheckAgain, onResend, onSignOut, signingOut }) {
  const copy = VIEW_COPY[view] || VIEW_COPY.stranger;
  return (
    <PhoneFrame bare={bare}>
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <BrandHeader />

        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <ScreenTitle size={22} style={{ marginBottom: 10 }}>
            {copy.title}
          </ScreenTitle>
          <Body size={13}>{copy.body(email)}</Body>
        </div>

        <Card style={{ marginBottom: 14 }}>
          <SectionLabel style={{ marginBottom: 7 }}>Signed in as</SectionLabel>
          {/* Seam data can be null on first render - unset shows as unset. */}
          <div style={{ font: `500 14px ${font.body}`, color: email ? color.text : color.mutedText }}>
            {email ?? '—'}
          </div>
        </Card>

        {view === 'checking' ? (
          <Card>
            <Body size={12}>Checking your account…</Body>
          </Card>
        ) : view === 'verify' ? (
          <VerifyState onResend={onResend} onVerified={onCheckAgain} />
        ) : view === 'already-claimed' ? (
          <Banner tone="yellow" title="Already set up">{ALREADY_CLAIMED}</Banner>
        ) : view === 'legacy' ? (
          onStartEnrollment ? <Button onClick={onStartEnrollment}>{LEGACY_CTA}</Button> : null
        ) : (
          <StrangerState onStartEnrollment={onStartEnrollment} onCheckAgain={onCheckAgain} />
        )}

        <div style={{ flex: 1, minHeight: 24 }} />

        <Button variant="outline" disabled={signingOut} onClick={onSignOut} style={{ flex: 'none' }}>
          {signingOut ? 'Signing out' : 'Sign out'}
        </Button>
      </div>
    </PhoneFrame>
  );
}

/** Spec 3.2: Resend, and I've verified (the caller reloads the user + token before re-checking). */
function VerifyState({ onResend, onVerified }) {
  const [busy, setBusy] = useState(null); // 'resend' | 'verify'
  const [note, setNote] = useState(null);
  const run = async (kind, fn) => {
    setBusy(kind);
    setNote(null);
    try {
      const out = fn ? await fn() : null;
      if (kind === 'resend') setNote('Sent again.');
      else if (out === 'needs-verification') setNote("Not verified yet - open the link in the email, then tap I've verified.");
    } catch (err) {
      setNote((err && err.message) || 'That did not work. Try again in a minute.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card large>
      {note ? <Body size={12} style={{ marginBottom: 10 }}>{note}</Body> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="outline" height={46} loading={busy === 'resend'} onClick={() => run('resend', onResend)} style={{ flex: 1, boxShadow: 'none' }}>
          {RESEND}
        </Button>
        <Button height={46} loading={busy === 'verify'} onClick={() => run('verify', onVerified)} style={{ flex: 1 }}>
          {VERIFIED}
        </Button>
      </div>
    </Card>
  );
}

/** Spec 3.2: two CTAs - a parent starts sign-up; a child re-runs the claim without signing out. */
function StrangerState({ onStartEnrollment, onCheckAgain }) {
  const [child, setChild] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const check = async () => {
    setBusy(true);
    setNote(null);
    try {
      const out = onCheckAgain ? await onCheckAgain() : 'none';
      if (out === 'none') setNote('No invite for this email yet. Check the email your parent entered, or ask them to add your login.');
    } catch (err) {
      setNote((err && err.message) || 'Could not check. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {onStartEnrollment ? <Button onClick={onStartEnrollment}>{STRANGER_PARENT_CTA}</Button> : null}
      <Button variant="outline" onClick={() => setChild(true)} style={{ boxShadow: 'none' }}>
        {STRANGER_CHILD_CTA}
      </Button>
      {child ? (
        <Card large>
          <Body size={12}>{STRANGER_CHILD_HINT}</Body>
          {note ? <Body size={12} tone={color.secondary} style={{ marginTop: 8 }}>{note}</Body> : null}
          <Button height={46} loading={busy} onClick={check} style={{ marginTop: 12 }}>
            {CHECK_AGAIN}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
