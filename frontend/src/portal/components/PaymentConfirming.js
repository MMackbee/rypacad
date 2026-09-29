import React, { useEffect, useState } from 'react';
import { color } from '../tokens';
import { Spinner } from './Button';
import { Banner } from './Primitives';
import { usePaymentConfirmation } from '../hooks/billing';
import { bookingOpen } from '../data/calendar';
import { CONFIRMING, CONFIRM_TIMEOUT, confirmedLine } from '../data/billingCopy';

/**
 * The `?paid=<athleteId>` return from Stripe (spec 4.2): the hook re-reads the
 * athlete every 5 s for 2 min; this keeps the last non-idle state on screen
 * after the hook strips the query, so "Payment received" does not vanish.
 */
export default function PaymentConfirming({ athleteId, style }) {
  const { state } = usePaymentConfirmation(athleteId ?? null);
  const [shown, setShown] = useState(null);
  useEffect(() => { if (state !== 'idle') setShown(state); }, [state]);
  const s = shown ?? (athleteId ? 'confirming' : null);
  if (!s) return null;
  if (s === 'confirmed') return <Banner tone="green" title="Payment received" style={style}>{confirmedLine(bookingOpen(Date.now()))}</Banner>;
  if (s === 'timeout') return <Banner tone="yellow" title="Still confirming" style={style}>{CONFIRM_TIMEOUT}</Banner>;
  return (
    <Banner tone="neutral" title="Payment" style={style}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Spinner size={14} track={color.rule} head={color.primary} /> {CONFIRMING}
      </span>
    </Banner>
  );
}
