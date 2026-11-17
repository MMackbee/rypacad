import React, { useEffect, useRef, useState } from 'react';
import { color, font } from '../tokens';
import Button from './Button';
import { Body } from './Primitives';
import VerifyEmailCard, { refreshIdToken, withVerifiedRetry } from './VerifyEmailCard';
import useAuthSession from '../hooks/useAuthSession';
import { bump } from '../hooks/invalidate';
import { openBillingPortal, portalErrorLine } from '../hooks/billingPortal';
import { targetLabel } from '../data/billingPortal';
import { MANAGE_BILLING, OPENING_STRIPE, PORTAL_FALLBACK_LINK } from '../data/billingCopy';

/**
 * Manage billing in Stripe (owner 2026-11-17: parents said the button was
 * broken), on the Billing screen's Card & invoices card and as the past-due
 * hero's Update payment method (review F7). A tap asks the server for a
 * Stripe customer portal session (hooks/billingPortal.js) and this tab goes
 * there, signed in - no email to type, no sign-in link to wait for.
 *
 * "Opening Stripe" while it waits (aria-busy, and said in a status region).
 * Once Stripe's url is followed the button stays busy until the page leaves;
 * if it does not leave, or comes back, the button comes back too (review
 * UX-1): a back-forward cache restore, the page visible or focused again
 * (the installed app shows Stripe over itself), each also reloading Billing
 * (bump('billing')) so it shows what changed in Stripe; else LEAVE_TIMEOUT_MS
 * after the tap (a stopped load). Gone before Stripe answers (another tab
 * tapped), nothing navigates (review UX-5).
 *
 * A failure says so under the button and, when the build carries the old
 * sign-in link (REACT_APP_STRIPE_PORTAL_URL, `fallbackUrl`), offers it as a
 * text link - opened from the tap itself, so no popup blocker stops it. An
 * email not verified yet gets PayButton's verify card (review SEC-1).
 * `athleteId` names whose Stripe customer to open when the family's billing
 * sits on several. `practice` (the onboarding walkthrough) never calls.
 */
export const LEAVE_TIMEOUT_MS = 10000;

/** Visually hidden, still read aloud (components/DayMarks.js SR_ONLY). */
const SR_ONLY = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

export default function ManageBillingButton({
  athleteId = null,
  label = MANAGE_BILLING,
  variant = 'outline',
  height = 42,
  fallbackUrl = null,
  practice = false,
  go,
  style,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [verify, setVerify] = useState(false);
  const mounted = useRef(true);
  const away = useRef(false); // Stripe's url was followed and the page has not come back
  const timer = useRef(null);

  useEffect(() => {
    mounted.current = true;
    const back = (event) => {
      if (event.type === 'visibilitychange' && document.visibilityState !== 'visible') return;
      if (event.type === 'pageshow' && !event.persisted) return; // a fresh load, never a return
      if (away.current) {
        away.current = false;
        clearTimeout(timer.current);
        setBusy(false);
        bump('billing');
      } else if (event.type === 'pageshow') {
        setBusy(false);
      }
    };
    window.addEventListener('pageshow', back);
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      window.removeEventListener('pageshow', back);
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, []);

  const follow = (url) => {
    if (!mounted.current) return;
    away.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (mounted.current) setBusy(false);
    }, LEAVE_TIMEOUT_MS);
    (go || ((to) => window.location.assign(to)))(url);
  };

  const open = async () => {
    setBusy(true);
    setError(null);
    setVerify(false);
    try {
      await withVerifiedRetry(() => openBillingPortal({ practice, athleteId, go: follow }));
    } catch (err) {
      if (!mounted.current) return;
      if (err && err.reason === 'email-unverified') setVerify(true);
      else setError(portalErrorLine(err));
      setBusy(false);
    }
  };
  const verified = async () => {
    await refreshIdToken();
    await open();
  };
  const resendFailed = (err) => {
    setVerify(false);
    setError((err && err.message) || 'Could not resend. Try again in a minute.');
  };
  const fallback = typeof fallbackUrl === 'string' && fallbackUrl.startsWith('https://') ? fallbackUrl : null;

  return (
    <div style={{ marginTop: 12, ...style }}>
      {verify ? (
        <PortalVerify busy={busy} onVerified={verified} onResendFailed={resendFailed} />
      ) : (
        <Button variant={variant} height={height} style={{ boxShadow: 'none' }} loading={busy} aria-busy={busy} onClick={open}>
          {busy ? OPENING_STRIPE : label}
        </Button>
      )}
      <span role="status" style={SR_ONLY}>
        {busy ? OPENING_STRIPE : ''}
      </span>
      {error ? (
        <div role="alert">
          <Body size={12} tone={color.error} style={{ marginTop: 8 }}>
            {error}
          </Body>
        </div>
      ) : null}
      {error && fallback ? (
        <a
          href={fallback}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, font: `500 13px ${font.body}`, color: color.primary }}
        >
          {PORTAL_FALLBACK_LINK}
        </a>
      ) : null}
    </div>
  );
}

/** The verify card, with the signed-in session's resend (mounted only when it shows). */
function PortalVerify({ busy, onVerified, onResendFailed }) {
  const { resendVerification, user } = useAuthSession();
  const [resent, setResent] = useState(false);
  const resend = async () => {
    try {
      if (resendVerification) await resendVerification();
      setResent(true);
    } catch (err) {
      onResendFailed(err);
    }
  };
  return <VerifyEmailCard email={(user && user.email) || 'your email'} resent={resent} busy={busy} onResend={resend} onVerified={onVerified} />;
}

/**
 * One button per Stripe customer the payer can open (data/billingPortal.js
 * portalTargets): the family's one, or - billing on several customers - one
 * per customer, named for its athletes ("Manage billing in Stripe for Ava").
 */
export function ManageBillingButtons({ targets, label = MANAGE_BILLING, ...rest }) {
  return targets.map((target) => (
    <ManageBillingButton key={target.athleteId ?? 'family'} athleteId={target.athleteId} label={targetLabel(label, target)} {...rest} />
  ));
}
