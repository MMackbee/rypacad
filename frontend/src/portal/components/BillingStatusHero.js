import React from 'react';
import { color, font, radius } from '../tokens';
import { ManageBillingButtons } from './ManageBillingButton';
import PayButton from './PayButton';
import StatusBadge from './StatusBadge';
import { Body, ScreenTitle, SectionLabel } from './Primitives';
import { PAY_NOW } from '../data/billingCopy';
import { saleOpen, SINGLE_NOT_OPEN_LINE } from '../data/singleToken';

const SURFACES = {
  default: { background: color.surface, border: color.border },
  yellow: { background: 'rgba(244,238,25,.06)', border: color.secondary },
  red: { background: 'rgba(255,68,68,.07)', border: color.error },
};

/** A fieldset that only holds its controls: no border, no box of its own. */
const BARE = { border: 0, margin: 0, padding: 0, minWidth: 0 };

/**
 * The Billing screen's hero: the membership's standing - Stripe's status,
 * the contract's copy, dates only when recorded. Sprint 20 (spec 4.4): the
 * `pending` branch lists one Pay now per unpaid athlete
 * (createCheckoutSession) instead of the card portal CTA - there is no card
 * to update before the first checkout. A single-token athlete
 * (`perPurchase`) gets the line saying when instead of a button until single
 * tokens go on sale (owner ruling 2026-10-01).
 *
 * Past due or lapsed, the payer's Update payment method signs them straight
 * into Stripe (ManageBillingButtons, review 2026-11-17 F7/UX-2), one button
 * per Stripe customer (`targets`); with none the hero says to contact the
 * academy.
 *
 * `held` (Billing.js: the hub is re-reading, its data maybe minutes old):
 * the Pay now buttons wait, since a checkout acts on who the hub says is
 * unpaid. Update payment method does not: it opens the family's own Stripe
 * portal session, which reads nothing from the hub - so the hero sits
 * outside Billing's held fieldset and holds only its Pay list.
 */
export default function BillingStatusHero({ status, targets = [], portalUrl, staff = false, held = false }) {
  if (!status) return null;
  const s = SURFACES[status.tone] || SURFACES.default;
  // Staff read the standing; only the payer updates the card or pays.
  const cta = staff ? null : status.cta;
  const pendingAthletes = status.status === 'pending' ? status.pendingAthletes ?? [] : [];
  return (
    <div style={{ background: s.background, border: `1px solid ${s.border}`, borderRadius: radius.cardLarge, padding: 17 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SectionLabel style={{ flex: 1 }}>Membership</SectionLabel>
        <StatusBadge tone={status.badge.tone}>{status.badge.label}</StatusBadge>
      </div>
      <ScreenTitle size={20} style={{ marginTop: 12 }}>
        {status.title}
      </ScreenTitle>
      <Body size={13} style={{ marginTop: 10 }}>
        {status.body}
      </Body>
      {cta && status.status === 'pending' ? (
        <fieldset disabled={held} aria-busy={held || undefined} style={BARE}>
          {pendingAthletes.map((a) => (
            <div key={a.athleteId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <div style={{ flex: 1, minWidth: 0, font: `600 13px ${font.body}`, color: color.text }}>
                {a.name}
                {a.perPurchase && !saleOpen() ? <Body size={11} tone={color.textTertiary} style={{ marginTop: 3 }}>{SINGLE_NOT_OPEN_LINE}</Body> : null}
              </div>
              {a.perPurchase && !saleOpen() ? null : (
                <PayButton athleteId={a.athleteId} product="tier" label={PAY_NOW} height={44} style={{ width: 132, flex: 'none' }} />
              )}
            </div>
          ))}
        </fieldset>
      ) : cta ? (
        targets.length ? (
          <ManageBillingButtons
            targets={targets}
            label={cta}
            variant={status.tone === 'red' ? 'danger' : 'caution'}
            height={50}
            fallbackUrl={portalUrl}
            style={{ marginTop: 15 }}
          />
        ) : (
          <Body size={12} tone={color.textSecondary} style={{ marginTop: 12 }}>
            To update your card, contact the academy. Booking reopens the same day the invoice clears.
          </Body>
        )
      ) : null}
    </div>
  );
}
