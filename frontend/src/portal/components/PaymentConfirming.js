import React, { useEffect, useState } from 'react';
import { color } from '../tokens';
import { Spinner } from './Button';
import { Banner } from './Primitives';
import WhatsNextCard from './WhatsNextCard';
import { usePaymentConfirmation } from '../hooks/billing';
import { bookingOpen } from '../data/calendar';
import { packageById } from '../data/packages';
import { CONFIRMING, CONFIRM_TIMEOUT, confirmedLine } from '../data/billingCopy';
import { singleConfirmedLine } from '../data/singleToken';

/**
 * The `?paid=<athleteId>` return from Stripe (spec 4.2): the hook re-reads the
 * athlete every 5 s for 2 min; this keeps the last non-idle state on screen
 * after the hook strips the query, so "Payment received" does not vanish.
 * `whatsNext` ({ athlete, product, self, selfManaged, facilityDue, onBook, onSeason }) adds the
 * "What's next" card under it once confirmed (owner decision 2026-09-30).
 * A single-token return also carries `cs` and `single` (`&cs=...&single=1`):
 * it confirms on graceTokens/single_{cs} and says the token is ready.
 */
export default function PaymentConfirming({ athleteId, cs = null, single = false, style, whatsNext }) {
  const { state, packageId } = usePaymentConfirmation(athleteId ?? null, { cs: cs ?? null, single: Boolean(single) });
  const [shown, setShown] = useState(null);
  useEffect(() => { if (state !== 'idle') setShown(state); }, [state]);
  const s = shown ?? (athleteId ? 'confirming' : null);
  if (!s) return null;
  // The PAID package decides the line: Elite books at once, before Oct 10 too
  // (ruling 0.6) - the emailed notice says the same.
  const open = bookingOpen(Date.now(), packageId ? packageById(packageId) : null);
  if (s === 'confirmed') {
    return (
      <>
        <Banner tone="green" title="Payment received" style={style}>{single ? singleConfirmedLine(open) : confirmedLine(open)}</Banner>
        {whatsNext ? <WhatsNextCard {...whatsNext} packageId={packageId ?? whatsNext.athlete?.packageId ?? null} /> : null}
      </>
    );
  }
  if (s === 'timeout') return <Banner tone="yellow" title="Still confirming" style={style}>{CONFIRM_TIMEOUT}</Banner>;
  return (
    <Banner tone="neutral" title="Payment" style={style}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Spinner size={14} track={color.rule} head={color.primary} /> {CONFIRMING}
      </span>
    </Banner>
  );
}
