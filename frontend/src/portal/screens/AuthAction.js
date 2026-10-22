import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  onAuthStateChanged,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { auth } from '../../firebase';
import { color, font, tint } from '../tokens';
import Button, { Spinner } from '../components/Button';
import Field from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import { SR_ONLY } from '../components/DayMarks';
import { AlertGlyph, Body, Tick } from '../components/Primitives';
import { createLoginError } from '../hooks/useAuthSession';
import { RESEND } from '../data/authCopy';
import { BrandHeader } from './SignIn';

/**
 * Email link page (/portal/auth/action) - public, signed in or signed out.
 *
 * Firebase Auth's own emails (verify your email, reset your password, undo
 * an email change) used to open Firebase's hosted page at
 * rypacad.firebaseapp.com/__/auth/action. That page runs on the API key
 * written into the link, so when the old browser key was deleted
 * (incident clean-up, 2026-10) every such link failed with "API key
 * expired". The email templates' custom action URL now points here.
 *
 * Firebase adds ?mode=&oobCode=&apiKey=&continueUrl=&lang= to the link.
 * apiKey (and lang) are never read: every call below goes through the
 * portal's own auth from src/firebase.js, so a link works with whatever key
 * this build carries. The one-time code is read once, then removed from the
 * address bar and from history.
 */

export const SIGN_IN_PATH = '/portal/signin';
const MIN_PASSWORD = 6;
const VERIFY_MODES = ['verifyEmail', 'verifyAndChangeEmail'];
const MODES = [...VERIFY_MODES, 'resetPassword', 'recoverEmail'];
// A code that fails for one of these reasons will not work on a second try.
const LINK_FAILURES = ['auth/expired-action-code', 'auth/invalid-action-code', 'auth/user-disabled', 'auth/user-not-found'];

/** The link's own parameters. apiKey and lang are deliberately not read. */
function readLink(params) {
  const mode = params.get('mode') || '';
  return {
    mode: MODES.includes(mode) ? mode : null,
    oobCode: params.get('oobCode') || '',
    continueUrl: params.get('continueUrl') || '',
  };
}

/**
 * Where Continue goes: the link's continueUrl only when it is a portal page
 * on this same origin, never anywhere else (no open redirect); otherwise
 * sign-in. Returned as a path, so it is a router navigation, not a page load.
 */
export function safeContinuePath(continueUrl) {
  if (!continueUrl) return SIGN_IN_PATH;
  let url;
  try {
    url = new URL(continueUrl);
  } catch (err) {
    return SIGN_IN_PATH;
  }
  if (url.origin !== window.location.origin) return SIGN_IN_PATH;
  if (url.pathname !== '/portal' && !url.pathname.startsWith('/portal/')) return SIGN_IN_PATH;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Resolves once auth has restored any saved session (firebase 9 has no authStateReady). */
function authReady() {
  return new Promise((resolve) => {
    let fired = false;
    let unsubscribe = null;
    unsubscribe = onAuthStateChanged(auth, () => {
      fired = true;
      if (unsubscribe) unsubscribe();
      resolve();
    });
    if (fired && unsubscribe) unsubscribe();
  });
}

/**
 * A verified email reaches this browser's session only after a reload and a
 * fresh ID token (checkout and claimInvite read the token's email_verified):
 * the same two steps NotProvisioned's "I've verified" runs. Never fatal - the
 * link has already worked, and the next sign-in picks the change up anyway.
 */
async function refreshSignedInUser() {
  try {
    await authReady();
    const user = auth.currentUser;
    if (!user) return;
    await user.reload();
    await user.getIdToken(true);
  } catch (err) {
    // See above: the email is verified either way.
  }
}

/** Runs the link's step and resolves to the next view. Never rejects. */
async function runAction(mode, oobCode) {
  try {
    if (VERIFY_MODES.includes(mode)) {
      await applyActionCode(auth, oobCode);
      await refreshSignedInUser();
      return { kind: 'verified' };
    }
    if (mode === 'resetPassword') {
      return { kind: 'reset', email: await verifyPasswordResetCode(auth, oobCode) };
    }
    // recoverEmail: read the address being restored before the code is spent.
    const info = await checkActionCode(auth, oobCode);
    await applyActionCode(auth, oobCode);
    return { kind: 'recovered', email: (info && info.data && info.data.email) || null };
  } catch (err) {
    return { kind: 'failed', code: (err && err.code) || null };
  }
}

const FAILURES = {
  'auth/expired-action-code': { title: 'This link has expired', body: 'Links in these emails only work for a limited time.' },
  'auth/invalid-action-code': { title: 'This link no longer works', body: 'It has already been used, or it was not copied in full.' },
  'auth/user-disabled': { title: 'This login is turned off', body: 'Contact RYP Academy and we will sort it out.', final: true },
  'auth/user-not-found': { title: 'Login not found', body: 'We could not find the login this link is for. Contact RYP Academy for help.', final: true },
  'auth/network-request-failed': { title: 'No connection', body: 'Check your connection, then try again.', retry: true },
};
const FAILED = { title: 'Something went wrong', body: 'This link did not work.' };

/** How to get a working link, after one failed. */
const NEXT_STEP = {
  verifyEmail: `To get a new link, sign in and tap ${RESEND}.`,
  // The portal has no change-email screen; these links come from the academy.
  verifyAndChangeEmail: 'Sign in with your current email. To change it, contact RYP Academy.',
  resetPassword: 'To get a new link, go to sign in, enter your email and tap Forgot password.',
  recoverEmail: 'If your sign-in email was changed without your say-so, contact RYP Academy.',
};

const VERIFIED = {
  verifyEmail: { title: 'Email verified', body: 'Thanks - your email is confirmed.' },
  verifyAndChangeEmail: { title: 'Email updated', body: 'Your new email is confirmed. Use it next time you sign in.' },
};

/** Title, body and an optional second line for each view. */
function viewCopy(view, mode) {
  switch (view.kind) {
    case 'loading':
      return { title: 'Checking your link', body: 'One moment.' };
    case 'invalid':
      return { title: 'This link is not complete', body: 'Open the link in your email again. If it still does not work, sign in to get a new one.' };
    case 'verified':
      return VERIFIED[mode] || VERIFIED.verifyEmail;
    case 'reset':
      return { title: 'Choose a new password', body: view.email ? `For ${view.email}.` : 'For your RYP Academy login.' };
    case 'reset-done':
      return { title: 'Password changed', body: 'Sign in with your new password.' };
    case 'recovered':
      return {
        title: 'Email restored',
        body: view.email ? `Your sign-in email is back to ${view.email}.` : 'Your sign-in email has been changed back.',
        note: 'To keep your account safe, change your password too: on the sign-in screen, enter this email and tap Forgot password.',
      };
    default: {
      const failure = FAILURES[view.code] || FAILED;
      return {
        title: failure.title,
        body: failure.body,
        note: failure.final || failure.retry ? null : NEXT_STEP[mode] || null,
        retry: Boolean(failure.retry),
        failed: true,
      };
    }
  }
}

/**
 * @param {boolean} [bare] Fill the viewport (the route) rather than the
 *   review bezel.
 */
export default function AuthAction({ bare = false }) {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Read once: the address bar is cleaned below and the code is single-use.
  const [link] = useState(() => readLink(params));
  const valid = Boolean(link.mode && link.oobCode);
  const [view, setView] = useState(valid ? { kind: 'loading' } : { kind: 'invalid' });
  const [attempt, setAttempt] = useState(0);
  const run = useRef(null);
  const heading = useRef(null);

  // Keep the one-time code (and the key Firebase appends) out of the address
  // bar and history, so it is not left on a shared phone or pasted onward.
  // The router never reads the query again, so its stale copy is harmless.
  useEffect(() => {
    const clean = link.mode ? `${pathname}?mode=${encodeURIComponent(link.mode)}` : pathname;
    try {
      window.history.replaceState(window.history.state, '', clean);
    } catch (err) {
      // An address bar that cannot be rewritten still shows the page.
    }
    // Mount only: the link is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One call per attempt. StrictMode runs this effect twice on mount, and a
  // second applyActionCode fails with invalid-action-code (the code is spent),
  // so both runs share the first run's promise.
  useEffect(() => {
    if (!valid) return undefined;
    if (!run.current || run.current.attempt !== attempt) {
      run.current = { attempt, done: runAction(link.mode, link.oobCode) };
    }
    let current = true;
    run.current.done.then((next) => {
      if (current) setView(next);
    });
    return () => {
      current = false;
    };
  }, [valid, link, attempt]);

  // Each new state's heading takes focus, so a screen reader starts there.
  useEffect(() => {
    if (heading.current) heading.current.focus();
  }, [view]);

  const copy = viewCopy(view, link.mode);
  const announcement = `${copy.title}. ${[copy.body, copy.note].filter(Boolean).join(' ')}`;
  const goSignIn = () => navigate(SIGN_IN_PATH, { replace: true });
  const retry = () => {
    setView({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  let actions = null;
  if (view.kind === 'invalid') {
    actions = <Button onClick={goSignIn}>Go to sign in</Button>;
  } else if (view.kind === 'verified') {
    actions = <Button onClick={() => navigate(safeContinuePath(link.continueUrl), { replace: true })}>Continue</Button>;
  } else if (view.kind === 'reset') {
    actions = (
      <ResetForm
        oobCode={link.oobCode}
        onDone={() => setView({ kind: 'reset-done' })}
        onLinkFailed={(code) => setView({ kind: 'failed', code })}
      />
    );
  } else if (view.kind === 'reset-done' || view.kind === 'recovered') {
    actions = <Button onClick={goSignIn}>Sign in</Button>;
  } else if (view.kind === 'failed') {
    actions = copy.retry ? (
      <>
        <Button onClick={retry}>Try again</Button>
        <Button variant="outline" onClick={goSignIn} style={{ boxShadow: 'none' }}>Go to sign in</Button>
      </>
    ) : (
      <Button onClick={goSignIn}>Go to sign in</Button>
    );
  }

  return (
    <PhoneFrame bare={bare}>
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <BrandHeader />

        {/* Every state change is read out; the heading also takes focus. */}
        <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
          {announcement}
        </div>

        {/* Keyed by state: a new heading per state, so focus truly moves. */}
        <div key={view.kind} style={{ textAlign: 'center', marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <StateMark view={view} failed={copy.failed} />
          <h1
            ref={heading}
            tabIndex={-1}
            style={{ font: `700 22px ${font.head}`, letterSpacing: '.01em', color: color.text, margin: '0 0 10px', outline: 'none' }}
          >
            {copy.title}
          </h1>
          <Body size={13} style={{ overflowWrap: 'anywhere' }}>{copy.body}</Body>
          {copy.note ? <Body size={13} style={{ marginTop: 10 }}>{copy.note}</Body> : null}
        </div>

        {actions ? <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>{actions}</div> : null}
      </div>
    </PhoneFrame>
  );
}

/** A spinner while the link is checked, a tick on success, a "!" on failure. */
function StateMark({ view, failed }) {
  const ring = { width: 56, height: 56, borderRadius: '50%', display: 'grid', placeItems: 'center', marginBottom: 18 };
  if (view.kind === 'loading') {
    return (
      <div style={ring}>
        <Spinner size={28} track="rgba(255,255,255,.18)" head={color.primary} />
      </div>
    );
  }
  if (['verified', 'reset-done', 'recovered'].includes(view.kind)) {
    return (
      <div style={{ ...ring, background: tint.green, border: `2px solid ${color.primary}` }}>
        <Tick size={22} color={color.primary} thickness={3} />
      </div>
    );
  }
  if (failed || view.kind === 'invalid') {
    return (
      <div style={ring}>
        <AlertGlyph size={44} />
      </div>
    );
  }
  return null;
}

/**
 * New password + confirm. Checked here first (6 characters, the same floor
 * as Create login, and the two match) so a typo never spends the code; a
 * link that fails on save moves the page to its failed state.
 */
function ResetForm({ oobCode, onDone, onLinkFailed }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    const next = {};
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (confirm !== password) next.confirm = 'The two passwords do not match.';
    setErrors(next);
    setFailure(null);
    if (next.password || next.confirm) return;
    setSaving(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      onDone();
    } catch (err) {
      const code = err && err.code;
      setSaving(false);
      if (code === 'auth/weak-password') setErrors({ password: createLoginError(err).message });
      else if (LINK_FAILURES.includes(code)) onLinkFailed(code);
      else if (code === 'auth/network-request-failed') setFailure('Could not connect. Check your connection, then tap Save password again.');
      else setFailure('Your password was not saved. Try again.');
    }
  };

  const spoken = [errors.password, errors.confirm, failure].filter(Boolean).join(' ');

  return (
    <>
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      >
        <Field
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          dimmed={saving}
          error={errors.password}
          hint={`At least ${MIN_PASSWORD} characters.`}
        />
        <Field label="Confirm password" type="password" value={confirm} onChange={setConfirm} dimmed={saving} error={errors.confirm} />
      </div>
      {failure ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertGlyph />
          <span style={{ font: `400 12px ${font.body}`, color: color.error }}>{failure}</span>
        </div>
      ) : null}
      <Button loading={saving} onClick={submit} style={{ marginTop: 12 }}>
        {saving ? 'Saving' : 'Save password'}
      </Button>
      <div role="alert" style={SR_ONLY}>
        {spoken}
      </div>
    </>
  );
}
