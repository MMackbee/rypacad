import React, { useState } from 'react';
import { color } from '../tokens';
import Button from './Button';
import { Body } from './Primitives';
import VerifyEmailCard, { refreshIdToken, withVerifiedRetry } from './VerifyEmailCard';
import * as callables from '../hooks/callables';
import useAuthSession from '../hooks/useAuthSession';

/** D14 guard (20-frontend.md "Day-2 sequencing"): a partial callables export rejects plainly instead of throwing TypeError. */
function notWired(name) {
  return async () => {
    const err = new Error(`${name} is not available yet. Try again in a minute.`);
    err.reason = 'not-wired';
    throw err;
  };
}
const callCreateCheckoutSession = callables.callCreateCheckoutSession || notWired('createCheckoutSession');

/**
 * The one way the portal starts a Stripe Checkout Session (Sprint 20, spec
 * 4.2/4.5): createCheckoutSession -> the browser navigates to `url`. Stripe
 * returns the family to /portal/family?paid=<athleteId> (or /portal/home).
 * A password account that has not verified its email is refused by the
 * function (reason 'email-unverified'); this renders the verify state (9.4)
 * with Resend / I've verified and retries after a token refresh.
 */
export async function startCheckout({ athleteId, product = 'tier', go = (url) => window.location.assign(url) }) {
  const { url } = await callCreateCheckoutSession({ athleteId, product });
  go(url);
}

/**
 * One checkout attempt, plus ONE retry when the refusal is 'email-unverified'
 * but the account has verified since this tab's ID token was minted (UX
 * review P-04; VerifyEmailCard.js withVerifiedRetry). Only a second refusal
 * reaches the caller.
 */
async function checkoutWithFreshToken(args) {
  await withVerifiedRetry(() => startCheckout(args));
}

export default function PayButton({ athleteId, product = 'tier', label = 'Pay now', height = 50, variant = 'primary', email = null, go, style }) {
  const { resendVerification, user } = useAuthSession();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(null); // null | { verify: true } | { error }
  const [resent, setResent] = useState(false);

  const run = async () => {
    setBusy(true);
    setState(null);
    try {
      await checkoutWithFreshToken({ athleteId, product, go });
    } catch (err) {
      if (err && err.reason === 'email-unverified') setState({ verify: true });
      else setState({ error: (err && err.message) || 'Checkout is unavailable right now. Try again in a minute.' });
    } finally {
      setBusy(false);
    }
  };
  // "I've verified": a fresh ID token, then the checkout again (VerifyEmailCard.js refreshIdToken).
  const verified = async () => {
    await refreshIdToken();
    await run();
  };
  const resend = async () => {
    try { if (resendVerification) await resendVerification(); setResent(true); } catch (err) { setState({ error: (err && err.message) || 'Could not resend. Try again in a minute.' }); }
  };

  if (state && state.verify) {
    return (
      <VerifyEmailCard email={email || (user && user.email) || 'your email'} resent={resent} busy={busy} onResend={resend} onVerified={verified} />
    );
  }
  return (
    <div style={style}>
      <Button variant={variant} height={height} loading={busy} onClick={run}>{busy ? 'Opening checkout' : label}</Button>
      {state && state.error ? <Body size={12} tone={color.error} style={{ marginTop: 8 }}>{state.error}</Body> : null}
    </div>
  );
}
