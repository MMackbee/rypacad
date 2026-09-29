import React, { useState } from 'react';
import { color } from '../tokens';
import Button from './Button';
import { Body, Card, SectionLabel } from './Primitives';
import * as callables from '../hooks/callables';
import useAuthSession from '../hooks/useAuthSession';
import { auth } from '../../firebase';
import { RESEND, VERIFIED, VERIFY_TITLE, verifyBody } from '../data/authCopy';

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

export default function PayButton({ athleteId, product = 'tier', label = 'Pay now', height = 50, variant = 'primary', email = null, go, style }) {
  const { resendVerification } = useAuthSession();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(null); // null | { verify: true } | { error }
  const [resent, setResent] = useState(false);

  const run = async () => {
    setBusy(true);
    setState(null);
    try {
      await startCheckout({ athleteId, product, go });
    } catch (err) {
      if (err && err.reason === 'email-unverified') setState({ verify: true });
      else setState({ error: (err && err.message) || 'Checkout is unavailable right now. Try again in a minute.' });
    } finally {
      setBusy(false);
    }
  };
  // "I've verified": the function reads email_verified off the ID TOKEN, so
  // reload the user and force a fresh token (what checkInvite does) - the
  // session's refresh() alone keeps the stale claim and the card would loop.
  // Deliberately NOT the session refresh: on the Success receipt that flips
  // `provisioned` and RegistrationRoute would redirect mid-checkout.
  const verified = async () => {
    const fbUser = auth.currentUser;
    if (fbUser) {
      try { await fbUser.reload(); await fbUser.getIdToken(true); } catch (err) { /* offline: the retry below reports it */ }
    }
    await run();
  };
  const resend = async () => {
    try { if (resendVerification) await resendVerification(); setResent(true); } catch (err) { setState({ error: (err && err.message) || 'Could not resend. Try again in a minute.' }); }
  };

  if (state && state.verify) {
    return (
      <Card tone="yellow" large style={style}>
        <SectionLabel tone={color.secondary} style={{ marginBottom: 8 }}>{VERIFY_TITLE}</SectionLabel>
        <Body size={12}>{verifyBody(email || 'your email')}</Body>
        {resent ? <Body size={11} tone={color.primary} style={{ marginTop: 6 }}>Sent again.</Body> : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button variant="outline" height={44} onClick={resend} style={{ flex: 1, boxShadow: 'none' }}>{RESEND}</Button>
          <Button height={44} loading={busy} onClick={verified} style={{ flex: 1 }}>{VERIFIED}</Button>
        </div>
      </Card>
    );
  }
  return (
    <div style={style}>
      <Button variant={variant} height={height} loading={busy} onClick={run}>{busy ? 'Opening checkout' : label}</Button>
      {state && state.error ? <Body size={12} tone={color.error} style={{ marginTop: 8 }}>{state.error}</Body> : null}
    </div>
  );
}
