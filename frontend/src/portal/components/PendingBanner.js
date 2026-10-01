import React from 'react';
import { color, font } from '../tokens';
import PayButton from './PayButton';
import { Body, Card, SectionLabel } from './Primitives';
import { PAY_NOW, PENDING_TITLE, facilityName, facilityPayLabel, facilityPendingTitle, facilityWaitingLine } from '../data/billingCopy';
import { SIBLING_DISCOUNT_NOTE, SIBLING_ORDER_NOTE, siblingPartialNote } from '../data/packages';
import { saleOpen, SINGLE_ASK_GUARDIAN_LINE, SINGLE_NOT_OPEN_LINE } from '../data/singleToken';

/**
 * One banner, one Pay now per athlete who needs a checkout - pending, or lapsed and re-subscribing (spec 4.4). `title` is the hub status title (the lapsed wording differs); renders nothing when nobody is listed.
 * `siblingDiscount` (the caller's siblingDiscountApplies over the whole family) adds the one-line note Stripe's price would otherwise contradict; a one-time single token is not a membership, so an all-single list never shows it.
 * `plan` (data/packages.js siblingPlan; owner 2026-10-01, "lesser value") replaces that single note with a line per row: 20% off this one, or the dollar figure when 20% of a cheaper paid membership comes off a dearer one; with nobody paid yet and several to pay, one line says how it works.
 * `renderRowExtra(athlete)` adds a line under a row's name (the family page's Change package link).
 * `facilityRows` (hooks/billing.js facilityPendingOf; owner 2026-09-30) is the FAMILY facility add-on ticked at sign-up - one row at most, for the athlete it bills on, and it names nobody: a 'pay' row gets the add-on's own Pay button;
 * a 'waiting' one (membership unpaid) is a line under that athlete's membership row, no button - the add-on checkout is refused until the membership is paid.
 * With only the 'pay' row left the card carries its own title, and never the hub's `title`/`body`, which then describe the membership, not an unpaid add-on.
 * `self` (the adult who is their own household) drops the word "family".
 * A single-token row (`perPurchase`) has no Pay button until single tokens go on sale (owner ruling 2026-10-01; data/singleToken.js saleOpen, the booking-open gate): the row says when instead.
 * `askGuardian` (an under-18 athlete's own login; owner ruling 2026-10-01, data/singleToken.js ownLoginMayBuy is false): from the gate on, a single-token row reads who buys it instead of Pay now. A monthly row keeps its Pay now.
 */
export default function PendingBanner({ pendingAthletes, facilityRows = null, body, title = null, email = null, siblingDiscount = false, plan = null, renderRowExtra = null, self = false, askGuardian = false, style }) {
  const tier = pendingAthletes || [];
  const planOf = (a) => (plan && !a.perPurchase ? plan[a.athleteId] : null) || null;
  const notYet = (a) => a.perPurchase === true && !saleOpen();
  const guardianBuys = (a) => askGuardian && a.perPurchase === true && !notYet(a);
  // An all-single list's body already says when (billingHub.js statusFor): never twice.
  const bodySaysWhen = Boolean(body) && body.includes(SINGLE_NOT_OPEN_LINE);
  const waiting = new Set((facilityRows || []).filter((r) => r.state === 'waiting').map((r) => r.athleteId));
  const pay = (facilityRows || []).filter((r) => r.state === 'pay');
  if (tier.length === 0 && pay.length === 0) return null;
  return (
    <Card tone="yellow" large style={style}>
      <SectionLabel tone={color.secondary}>{tier.length ? title || PENDING_TITLE : facilityPendingTitle(self)}</SectionLabel>
      {tier.length > 0 && body ? <Body size={12} style={{ marginTop: 8 }}>{body}</Body> : null}
      {!plan && siblingDiscount && tier.some((a) => !a.perPurchase) ? (
        <Body size={12} style={{ marginTop: 8 }}>{SIBLING_DISCOUNT_NOTE}</Body>
      ) : null}
      {plan && tier.filter((a) => planOf(a)).length > 1 && tier.every((a) => !planOf(a) || planOf(a).state === 'full') ? (
        <Body size={12} style={{ marginTop: 8 }}>{SIBLING_ORDER_NOTE}</Body>
      ) : null}
      {tier.map((a) => (
        <div key={a.athleteId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1, minWidth: 0, font: `600 13px ${font.body}`, color: color.text }}>
            {a.name}
            {renderRowExtra ? renderRowExtra(a) : null}
            {waiting.has(a.athleteId) ? <Body size={11} tone={color.textTertiary} style={{ marginTop: 3 }}>{facilityWaitingLine(self)}</Body> : null}
            {planOf(a)?.state === 'discount' ? <Body size={11} style={{ marginTop: 3 }}>{SIBLING_DISCOUNT_NOTE}</Body> : null}
            {planOf(a)?.state === 'partial' ? <Body size={11} style={{ marginTop: 3 }}>{siblingPartialNote(planOf(a).amount)}</Body> : null}
            {notYet(a) && !bodySaysWhen ? <Body size={11} tone={color.textTertiary} style={{ marginTop: 3 }}>{SINGLE_NOT_OPEN_LINE}</Body> : null}
            {guardianBuys(a) ? <Body size={12} style={{ marginTop: 3 }}>{SINGLE_ASK_GUARDIAN_LINE}</Body> : null}
          </div>
          {notYet(a) || guardianBuys(a) ? null : (
            <PayButton athleteId={a.athleteId} product="tier" label={PAY_NOW} height={44} email={email} style={{ width: 132, flex: 'none' }} />
          )}
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
