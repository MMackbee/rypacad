import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font, radius, tint } from '../tokens';
import Button from '../components/Button';
import Field from '../components/Field';
import MediaPlaceholder from '../components/MediaPlaceholder';
import logoWhite from '../assets/ryp-academy-logo-white.png';
import PhoneFrame from '../components/PhoneFrame';
import { AlertGlyph, Body, Card, SectionLabel } from '../components/Primitives';
import useAuthSession from '../hooks/useAuthSession';
import { U13_HELPER } from '../data/signup';
import { EMAIL_IN_USE, FAMILY_LINK_FAIL, USE_PARENT_EMAIL, verifyBody } from '../data/authCopy';

/**
 * 01 · Sign In - public.
 *
 * Two modes, split on the `variant` prop:
 *
 * - variant passed (review harness): the four designed demo states - Default,
 *   Loading, Invalid credentials, Account locked - exactly as the handoff drew
 *   them, driven by the hook's demo state machine. Never touches live auth.
 * - no variant (the /portal/signin route): runs on the real auth seam
 *   (useAuthSession(), TEAM.md "Sprint 4 pins"). The designed email/password
 *   form is live (signInWithEmail — accounts are created out-of-band, there
 *   is no self-serve sign-up), and Continue with Google runs the popup for
 *   Google-account families.
 *
 * First impression for a parent who just received the enrollment email.
 *
 * @param {'idle'|'loading'|'invalid'|'locked'} [variant] Demo state; omit to
 *   run on the real seam.
 * @param {(user: object) => void} [onSignedIn] Live mode only: called with the
 *   provisioned user instead of the default role-based navigation.
 */
export default function SignIn({ variant, ...rest }) {
  if (variant != null) return <DemoSignIn variant={variant} {...rest} />;
  return <LiveSignIn {...rest} />;
}

/**
 * Where each provisioned role lands after sign-in (TEAM.md, Sprint 4 pins).
 * Exported so the routing lane's guard can share one mapping.
 */
export const LANDING_BY_ROLE = {
  athlete: '/portal/home',
  parent: '/portal/family',
  coach: '/portal/coach',
  // Sprint 20: admin is ops/owner only; Yannick lands on his sessions.
  mental: '/portal/my-sessions',
  ops: '/portal/admin',
  owner: '/portal/admin',
};

/* ------------------------------------------------------------------------- *
 * Live mode - the /portal/signin route.
 * ------------------------------------------------------------------------- */

function LiveSignIn({ bare = false, onStartEnrollment, onSignedIn }) {
  const auth = useAuthSession();
  const { user, provisioned, loading, error, signIn, signInWithEmail, createLogin } = auth;
  /**
   * Sprint 10 pin I: "Forgot password" wired to a real
   * sendPasswordResetEmail. FALLBACK FLAG: useAuthSession has no
   * requestPasswordReset(email) export in this worktree yet (confirmed via
   * grep of hooks/useAuthSession.js) - the routing lane owns adding it to
   * both useAuthSession and live.js. Defaults to a local echo that resolves
   * successfully without sending anything, so the sent/error UI is fully
   * wired and reviewable without a crash until it lands.
   */
  const requestPasswordReset = auth.requestPasswordReset || (async () => {});
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetStatus, setResetStatus] = useState(null); // null | 'sending' | 'sent' | error string
  const [lastAction, setLastAction] = useState(null);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setResetStatus('Enter your email above first.');
      return;
    }
    setResetStatus('sending');
    try {
      await requestPasswordReset(email.trim());
      setResetStatus('sent');
    } catch (err) {
      setResetStatus(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The reset email could not be sent. Try again.'
      );
    }
  };

  const canSubmit = email.trim() !== '' && password !== '' && !loading;
  const submitEmail = () => {
    if (!canSubmit) return;
    setLastAction('email');
    signInWithEmail(email.trim(), password);
  };

  // Navigation is an effect of the seam reporting a signed-in user - not a
  // click handler - so a session restored on mount routes the same way a
  // fresh popup does. An unknown role has no landing, which is the same
  // honest dead-end as no role at all.
  useEffect(() => {
    if (!user) return;
    if (!provisioned) {
      navigate('/portal/not-provisioned', { replace: true });
      return;
    }
    if (onSignedIn) {
      onSignedIn(user);
      return;
    }
    // v1.7.1: a specialist account (users.specialistId — Yannick, Phil)
    // lands on their own My Sessions view; PortalRoutes.landingFor applies
    // the same override on the index redirect.
    navigate(
      user.specialistId ? '/portal/my-sessions' : LANDING_BY_ROLE[user.role] ?? '/portal/not-provisioned',
      { replace: true }
    );
  }, [user, provisioned, onSignedIn, navigate]);

  return (
    <PhoneFrame bare={bare}>
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <BrandHeader />

        {/* The designed form, live. Enter submits from either field; accounts
            are provisioned out-of-band, so there is no sign-up path here. */}
        <div
          style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitEmail();
          }}
        >
          <Field label="Email" type="email" value={email} onChange={setEmail} dimmed={loading} />
          <Field
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            dimmed={loading}
            trailing={
              password ? (
                // Sprint 10 pin I: a real, keyboard-reachable button - was a
                // bare <span onClick>, invisible to Tab and Enter/Space.
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    font: `500 13px ${font.body}`,
                    color: color.primary,
                    cursor: 'pointer',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              ) : null
            }
          />

          {/*
            Sprint 10 pin I: a real link, not the demo's decorative span -
            calls the pinned requestPasswordReset(email) and shows a real
            sent/error state right below it.
          */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetStatus === 'sending'}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                font: `500 13px ${font.body}`,
                color: color.primary,
                cursor: 'pointer',
              }}
            >
              Forgot password
            </button>
          </div>
          {resetStatus ? (
            <div
              style={{
                textAlign: 'right',
                font: `400 12px ${font.body}`,
                color: resetStatus === 'sent' ? color.primary : resetStatus === 'sending' ? color.textTertiary : color.error,
                marginTop: -6,
              }}
            >
              {resetStatus === 'sent'
                ? `Reset email sent to ${email.trim()}.`
                : resetStatus === 'sending'
                ? 'Sending…'
                : resetStatus}
            </div>
          ) : null}
        </div>

        {error ? (
          // The designed invalid treatment, carrying the seam's message.
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <AlertGlyph />
            <span style={{ font: `400 12px ${font.body}`, color: color.error }}>
              {error.message || "Sign-in didn't complete — try again."}
            </span>
          </div>
        ) : null}
        {error && lastAction === 'google' ? (
          <Body size={12} style={{ marginTop: 8 }}>{FAMILY_LINK_FAIL}</Body>
        ) : null}

        <div
          style={{
            flex: 'none',
            marginTop: 26,
            display: 'flex',
            flexDirection: 'column',
            gap: 13,
          }}
        >
          {/* Sign in submits the email form and stays disabled until both
              fields have something - a disabled button explains itself better
              than an error for an empty form. Google runs the popup. */}
          <Button loading={loading} disabled={!canSubmit} onClick={submitEmail}>
            {loading ? 'Signing in' : 'Sign in'}
          </Button>

          <OrDivider />

          <Button
            variant="outline"
            disabled={loading}
            onClick={() => { setLastAction('google'); signIn(); }}
            style={{ boxShadow: 'none' }}
          >
            <GoogleButtonLabel />
          </Button>
          {typeof createLogin === 'function' ? <CreateLoginSection createLogin={createLogin} disabled={loading} /> : null}
        </div>

        <div style={{ flex: 1, minHeight: 20 }} />

        <EnrollmentFooter onStartEnrollment={onStartEnrollment} />
      </div>
    </PhoneFrame>
  );
}

/**
 * Sprint 20 (spec 3.1): a child claiming the login their parent entered, or
 * anyone who prefers a password. The same createLogin the SignUp screen uses;
 * success lands via onAuthStateChanged like every other sign-in here.
 */
function CreateLoginSection({ createLogin, disabled }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [sent, setSent] = useState(null);
  const canSubmit = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 6 && !busy && !disabled;
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setFailure(null);
    try {
      await createLogin(email.trim(), password);
      setSent(email.trim());
    } catch (err) {
      setFailure(err && err.reason === 'email-in-use' ? EMAIL_IN_USE : (err && err.message) || 'The login could not be created. Try again.');
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <Button variant="outline" disabled={disabled} onClick={() => setOpen(true)} style={{ boxShadow: 'none' }}>
        Create a login
      </Button>
    );
  }
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 10 }}>Create a login</SectionLabel>
      <Body size={12} style={{ marginBottom: 12 }}>{USE_PARENT_EMAIL} {U13_HELPER}</Body>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="New login email" type="email" value={email} onChange={setEmail} />
        <Field label="New password" type="password" value={password} onChange={setPassword} />
      </div>
      {failure ? <Body size={12} tone={color.error} style={{ marginTop: 10 }}>{failure}</Body> : null}
      {sent ? <Body size={12} tone={color.primary} style={{ marginTop: 10 }}>{verifyBody(sent)}</Body> : null}
      <Button height={46} loading={busy} disabled={!canSubmit} onClick={submit} style={{ marginTop: 12 }}>
        {busy ? 'Creating login' : 'Create login'}
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------------------- *
 * Demo mode - the harness's four designed states, unchanged.
 * ------------------------------------------------------------------------- */

function DemoSignIn({ variant = 'idle', bare = false, onStartEnrollment }) {
  const { authState, attemptsLeft } = useAuthSession({ variant });
  const [email, setEmail] = useState('dana@email.com');

  const loading = authState === 'loading';
  const invalid = authState === 'invalid';
  const locked = authState === 'locked';
  const dimPassword = loading || locked;

  return (
    <PhoneFrame bare={bare}>
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <BrandHeader />

        {locked ? (
          <div
            style={{
              flex: 'none',
              background: tint.redStrong,
              border: `1px solid ${color.error}`,
              borderRadius: 10,
              padding: 14,
              marginBottom: 20,
            }}
          >
            <div style={{ font: `600 13px ${font.body}`, color: color.error, marginBottom: 5 }}>
              Account locked
            </div>
            <Body size={12}>
              Five failed attempts. Locked for 30 minutes, or reset your password now.
            </Body>
          </div>
        ) : null}

        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Email" value={email} onChange={setEmail} dimmed={locked} />

          <div>
            <div
              style={{
                font: `500 11px ${font.body}`,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: color.textSecondary,
                marginBottom: 7,
              }}
            >
              Password
            </div>
            <div
              style={{
                height: 52,
                background: dimPassword ? color.dimmed : color.surface,
                border: `1px solid ${
                  invalid ? color.error : dimPassword ? color.rule : color.border
                }`,
                borderRadius: radius.input,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 15px',
                font: `400 15px ${font.body}`,
                color: dimPassword ? color.mutedText : color.text,
              }}
            >
              <span>••••••••</span>
              {/* The reveal affordance is hidden while the field is inert. */}
              {dimPassword ? null : (
                <span style={{ font: `500 13px ${font.body}`, color: color.primary }}>Show</span>
              )}
            </div>

            {invalid ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                <AlertGlyph />
                <span style={{ font: `400 12px ${font.body}`, color: color.error }}>
                  Email or password is incorrect. {attemptsLeft} attempts left.
                </span>
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ font: `500 13px ${font.body}`, color: color.primary, cursor: 'pointer' }}>
              Forgot password
            </span>
          </div>
        </div>

        <div
          style={{
            flex: 'none',
            marginTop: 26,
            display: 'flex',
            flexDirection: 'column',
            gap: 13,
          }}
        >
          {/*
            The locked state disables the button rather than hiding it. A greyed
            control the parent can see explains the wall better than a missing one.
          */}
          <Button loading={loading} disabled={locked}>
            {loading ? 'Signing in' : 'Sign in'}
          </Button>

          <OrDivider />

          <Button variant="outline" style={{ boxShadow: 'none' }}>
            <GoogleButtonLabel />
          </Button>
        </div>

        <div style={{ flex: 1, minHeight: 20 }} />

        <EnrollmentFooter onStartEnrollment={onStartEnrollment} />
      </div>
    </PhoneFrame>
  );
}

/* ------------------------------------------------------------------------- *
 * Shared pieces - identical markup in both modes.
 * ------------------------------------------------------------------------- */

/**
 * The academy's logo (owner-supplied, 2026-09-18: the white-on-transparent
 * version, made for the portal's black) and the tagline. It replaces the
 * dashed "RYP MARK" placeholder and the typed-out wordmark - the logo already
 * says RYP Academy. Exported for the other auth-flow screens.
 */
export function BrandHeader() {
  return (
    <div
      style={{
        flex: 'none',
        padding: '50px 0 38px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <img src={logoWhite} alt="RYP Academy" width={196} style={{ display: 'block', height: 'auto' }} />
      <div style={{ font: `400 13px ${font.body}`, color: color.textSecondary, textAlign: 'center' }}>
        Reach Your Potential
      </div>
    </div>
  );
}

function OrDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
      <div style={{ flex: 1, height: 1, background: color.border }} />
      <div
        style={{
          font: `400 11px ${font.body}`,
          color: color.textTertiary,
          letterSpacing: '.08em',
        }}
      >
        OR
      </div>
      <div style={{ flex: 1, height: 1, background: color.border }} />
    </div>
  );
}

function GoogleButtonLabel() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <MediaPlaceholder height={18} round style={{ width: 18 }} />
      <span style={{ font: `500 15px ${font.body}`, color: color.text }}>Continue with Google</span>
    </span>
  );
}

function EnrollmentFooter({ onStartEnrollment }) {
  return (
    <div
      style={{
        flex: 'none',
        textAlign: 'center',
        font: `400 13px ${font.body}`,
        color: color.textSecondary,
        paddingTop: 20,
      }}
    >
      New family?{' '}
      <span
        onClick={onStartEnrollment}
        style={{ color: color.primary, fontWeight: 600, cursor: 'pointer' }}
      >
        Start sign-up
      </span>
    </div>
  );
}
