/**
 * Manage billing in Stripe, the client half (owner 2026-11-17; the server
 * half is functions/portal/billing-portal.js). openBillingPortal asks the
 * openBillingPortal callable for a Stripe customer portal session for the
 * signed-in payer's own household and sends THIS tab to its url - the
 * family is signed straight in, no email and no sign-in link. Same tab on
 * purpose: window.open after an await is a blocked popup on iOS Safari and
 * in the installed app. Stripe sends them back to /portal/billing.
 *
 * Seed and practice modes never call: the practice check short-circuits
 * before isLive(), the onboarding invariant (hooks/index.js header), as
 * hooks/door.js does. The answer is followed only when it is an https url.
 */
import { ERR, LiveDataError, isLive } from './live';
import { callOpenBillingPortal } from './callables';
import { PORTAL_ERROR_LINE } from '../data/billingCopy';

/** Where Stripe sends the family back (the server allowlists it too). */
export const BILLING_RETURN_PATH = '/portal/billing';

/** Refusals whose own words the family reads; anything else reads PORTAL_ERROR_LINE. */
const WORDED = ['not-live', 'not-payer', 'no-customer', 'rate-limited', 'portal-not-set-up'];

/**
 * Opens the household's Stripe customer portal in this tab. Resolves with
 * the url once `go` has it; rejects with a LiveDataError whose `reason` is
 * the server's (or 'not-live' / 'bad-answer' from here) and nothing is
 * opened.
 * @param {{ practice?: boolean, go?: (url: string) => void }} [options]
 */
export async function openBillingPortal({ practice = false, go = (url) => window.location.assign(url) } = {}) {
  if (practice || !isLive()) {
    throw new LiveDataError(ERR.INVALID, 'Stripe opens only in the live app.', null, 'not-live');
  }
  const data = await callOpenBillingPortal({ returnPath: BILLING_RETURN_PATH });
  const url = typeof data?.url === 'string' ? data.url : '';
  if (!url.startsWith('https://')) {
    throw new LiveDataError(ERR.UNKNOWN, PORTAL_ERROR_LINE, null, 'bad-answer');
  }
  go(url);
  return url;
}

/** The line under the button for a failed open: the server's words for a refusal it words, else the plain line. */
export function portalErrorLine(err) {
  if (err && WORDED.includes(err.reason) && err.message) return String(err.message);
  return PORTAL_ERROR_LINE;
}
