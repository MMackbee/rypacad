/** Why the Calendly button is hidden (spec 6.1: paid, open, a token left or Elite, cadence not hit). PURE. A single-token athlete with none left is told to buy one ('no-session-token'). */
export function calendlyBlockReason({ billingStatus, bookingOpen, tokens, capReached }) {
  const billing = billingStatus ?? 'active';
  if (billing === 'pending') return 'billing-pending';
  if (billing !== 'active') return 'membership-inactive';
  if (!bookingOpen) return 'booking-not-open';
  if (capReached) return 'cap-reached';
  if (tokens && !tokens.unlimited && tokens.left === 0 && !(tokens.grace && tokens.grace.length)) return tokens.perPurchase ? 'no-session-token' : 'no-tokens-left';
  return null;
}

/** Whose name/email Calendly prefills: the person walking in (contract 3.4). */
export function attendeeContact({ attendee, athlete, guardian }) {
  if (attendee === 'parent') return { name: guardian?.name ?? '', email: guardian?.email ?? '' };
  return { name: athlete?.name ?? '', email: athlete?.loginEmail || guardian?.email || '' };
}
