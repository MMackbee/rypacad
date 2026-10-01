import React from 'react';
import { color, font } from '../tokens';
import PayButton from './PayButton';
import { Body, Card, SectionLabel } from './Primitives';
import { PAY_NOW, PENDING_TITLE, facilityName, facilityPayLabel, facilityPendingTitle, facilityWaitingLine } from '../data/billingCopy';
import { SIBLING_DISCOUNT_NOTE } from '../data/packages';

/**
 * One banner, one Pay now per athlete who needs a checkout - pending, or lapsed and re-subscribing (spec 4.4). `title` is the hub status title (the lapsed wording differs); renders nothing when nobody is listed.
 * `siblingDiscount` (the caller's siblingDiscountApplies over the whole family) adds the one-line note Stripe's price would otherwise contradict; a one-time single token is not a membership, so an all-single list never shows it.
 * `renderRowExtra(athlete)` adds a line under a row's name (the family page's Change package link).
 * `facilityRows` (hooks/billing.js facilityPendingOf; owner 2026-09-30) is the FAMILY facility add-on ticked at sign-up - one row at most, for the athlete it bills on, and it names nobody: a 'pay' row gets the add-on's own Pay button;
 * a 'waiting' one (membership unpaid) is a line under that athlete's membership row, no button - the add-on checkout is refused until the membership is paid.
 * With only the 'pay' row left the card carries its own title, and never the hub's `title`/`body`, which then describe the membership, not an unpaid add-on.
 * `self` (the adult who is their own household) drops the word "family".
 */
export default function PendingBanner({ pendingAthletes, facilityRows = null, body, title = null, email = null, siblingDiscount = false, renderRowExtra = null, self = false, style }) {
  const tier = pendingAthletes || [];
  const waiting = new Set((facilityRows || []).filter((r) => r.state === 'waiting').map((r) => r.athleteId));
  const pay = (facilityRows || []).filter((r) => r.state === 'pay');
  if (tier.length === 0 && pay.length === 0) return null;
  return (
    <Card tone="yellow" large style={style}>
      <SectionLabel tone={color.secondary}>{tier.length ? title || PENDING_TITLE : facilityPendingTitle(self)}</SectionLabel>
      {tier.length > 0 && body ? <Body size={12} style={{ marginTop: 8 }}>{body}</Body> : null}
      {siblingDiscount && tier.some((a) => !a.perPurchase) ? (
        <Body size={12} style={{ marginTop: 8 }}>{SIBLING_DISCOUNT_NOTE}</Body>
      ) : null}
      {tier.map((a) => (
        <div key={a.athleteId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1, minWidth: 0, font: `600 13px ${font.body}`, color: color.text }}>
            {a.name}
            {renderRowExtra ? renderRowExtra(a) : null}
            {waiting.has(a.athleteId) ? <Body size={11} tone={color.textTertiary} style={{ marginTop: 3 }}>{facilityWaitingLine(self)}</Body> : null}
          </div>
          <PayButton athleteId={a.athleteId} product="tier" label={PAY_NOW} height={44} email={email} style={{ width: 132, flex: 'none' }} />
        </div>
      ))}
      {pay.map((r) => (
        <div key={`facility-${r.athleteId}`} style={{ marginTop: 12 }}>
          {tier.length ? <div style={{ font: `600 13px ${font.body}`, color: color.text, marginBottom: 8 }}>{facilityName(self)}</div> : null}
          <PayButton athleteId={r.athleteId} product="facility" label={facilityPayLabel(self)} variant="secondary" height={44} email={email} />
        </div>
      ))}
    </Card>
  );
}
