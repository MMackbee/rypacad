/**
 * Yannick via Calendly (Sprint 20, spec 6.1). The portal builds ONE link per
 * athlete and opens it in a new tab; Calendly's webhook (functions lane)
 * writes the session, the booking and the token spend back. No URL in the
 * env means the in-app slot list stays, so seed/emulator keep working.
 * PURE: no React, no Firebase.
 */
export const CALENDLY_MENTAL_URL = process.env.REACT_APP_CALENDLY_MENTAL_URL || null;
export const CALENDLY_MENTAL_ELITE_URL = process.env.REACT_APP_CALENDLY_MENTAL_ELITE_URL || null;

/** Elite gets the 45-day event type when one exists, else the standard link. */
export function calendlyUrlFor(pkg) {
  return (pkg?.kind === 'elite' && CALENDLY_MENTAL_ELITE_URL) || CALENDLY_MENTAL_URL;
}

/**
 * The prefilled link. `name`/`email` are the ATTENDEE's (the guardian's when
 * "A parent" is picked, else the athlete's login email or the guardian's);
 * `a1` is Calendly's first invitee question (athlete name); utm_content /
 * utm_campaign carry the ids the webhook resolves the booking by.
 */
export function calendlyLinkFor({ url, athleteId, athleteName, householdId, name, email }) {
  if (!url) return null;
  const q = new URLSearchParams({
    name: name ?? '',
    email: email ?? '',
    a1: athleteName ?? '',
    utm_source: 'ryp-portal',
    utm_medium: 'portal',
    utm_content: athleteId ?? '',
    utm_campaign: householdId ?? '',
  });
  return `${url}${url.includes('?') ? '&' : '?'}${q}`;
}

export const CALENDLY_NOTE =
  "Yannick's confirmation, reminders and cancellations come from Calendly. The session appears on My Schedule within a minute and spends one token.";
