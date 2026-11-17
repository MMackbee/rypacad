import React from 'react';
import { color } from '../tokens';
import Button from './Button';
import { Body, Card, SectionLabel } from './Primitives';
import { auth } from '../../firebase';
import { RESEND, VERIFIED, VERIFY_TITLE, verifyBody } from '../data/authCopy';

/**
 * The verify-your-email step (Sprint 20, contract 9.4) that a server's
 * 'email-unverified' refusal leads to: createCheckoutSession (PayButton) and
 * openBillingPortal (ManageBillingButton, review 2026-11-17 SEC-1) both
 * refuse a password login whose inbox is not proven. Moved here from
 * PayButton so the two show the same card and retry the same way.
 */

/**
 * One attempt, plus ONE retry when the refusal is 'email-unverified' but the
 * account has verified since this tab's ID token was minted (UX review P-04:
 * the parent verifies in the mail app's tab, comes back, and the old token
 * still says unverified). Reload + forced token refresh - the same pair
 * "I've verified" uses, never the session refresh. Only a second refusal
 * reaches the caller.
 */
export async function withVerifiedRetry(attempt) {
  try {
    return await attempt();
  } catch (err) {
    const fbUser = auth.currentUser;
    if (!err || err.reason !== 'email-unverified' || !fbUser) throw err;
    try {
      await fbUser.reload();
      if (!fbUser.emailVerified) throw err;
      await fbUser.getIdToken(true);
    } catch (refreshErr) {
      throw err; // offline or still unverified: the verify card, as before
    }
    return attempt();
  }
}

/**
 * "I've verified": the functions read email_verified off the ID TOKEN, so
 * reload the user and force a fresh token (what checkInvite does) - the
 * session's refresh() alone keeps the stale claim and the card would loop.
 * Deliberately NOT the session refresh: on the Success receipt that flips
 * `provisioned` and RegistrationRoute would redirect mid-checkout.
 */
export async function refreshIdToken() {
  const fbUser = auth.currentUser;
  if (fbUser) {
    try { await fbUser.reload(); await fbUser.getIdToken(true); } catch (err) { /* offline: the retry after it reports it */ }
  }
}

/**
 * The card. Full width whatever the caller's button slot is (the family page
 * and Billing size the Pay button to 132px; the card would wrap word by
 * word). The callers' rows wrap, so the card drops under the athlete's name.
 */
export default function VerifyEmailCard({ email, resent = false, busy = false, onResend, onVerified }) {
  return (
    <Card tone="yellow" large style={{ flex: '1 1 100%', width: '100%' }}>
      <SectionLabel tone={color.secondary} style={{ marginBottom: 8 }}>{VERIFY_TITLE}</SectionLabel>
      <Body size={12}>{verifyBody(email)}</Body>
      {resent ? <Body size={11} tone={color.primary} style={{ marginTop: 6 }}>Sent again.</Body> : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button variant="outline" height={44} onClick={onResend} style={{ flex: 1, boxShadow: 'none' }}>{RESEND}</Button>
        <Button height={44} loading={busy} onClick={onVerified} style={{ flex: 1 }}>{VERIFIED}</Button>
      </div>
    </Card>
  );
}
