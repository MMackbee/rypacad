import React, { useEffect, useState } from 'react';
import { color, font } from '../tokens';
import Button from './Button';
import { Body } from './Primitives';
import { openBillingPortal, portalErrorLine } from '../hooks/billingPortal';
import { MANAGE_BILLING, OPENING_STRIPE, PORTAL_FALLBACK_LINK } from '../data/billingCopy';

/**
 * Manage billing in Stripe on the Billing screen's Card & invoices card
 * (owner 2026-11-17: parents said the button was broken). A tap asks the
 * server for a Stripe customer portal session (hooks/billingPortal.js) and
 * this tab goes there, signed in - no email to type, no sign-in link to
 * wait for. The button reads "Opening Stripe" until the page leaves (a
 * page restored from the back-forward cache gets its label back).
 *
 * A failure says so under the button and, when the build carries the old
 * sign-in link (REACT_APP_STRIPE_PORTAL_URL, `fallbackUrl`), offers it as a
 * text link - opened from the tap itself, so no popup blocker stops it.
 * `practice` (the onboarding walkthrough) never calls the server.
 */
export default function ManageBillingButton({ fallbackUrl = null, practice = false, go }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    const restored = (event) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, []);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      await openBillingPortal({ practice, go });
    } catch (err) {
      setError(portalErrorLine(err));
      setBusy(false);
    }
  };
  const fallback = typeof fallbackUrl === 'string' && fallbackUrl.startsWith('https://') ? fallbackUrl : null;

  return (
    <div style={{ marginTop: 12 }}>
      <Button variant="outline" height={42} style={{ boxShadow: 'none' }} loading={busy} onClick={open}>
        {busy ? OPENING_STRIPE : MANAGE_BILLING}
      </Button>
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
