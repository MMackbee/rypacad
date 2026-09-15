import React, { useState } from 'react';
import { color, radius, tint } from '../tokens';
import Button from './Button';
import { Body, ScreenTitle } from './Primitives';

/**
 * The "keep it / cancel reservation" bottom sheet — Sprint 9's cancellation
 * pin (TEAM.md, "specialist 1-on-1s"), originally built local to
 * MySchedule.js. Sprint 11 pin F ("Family Reservations") reuses this exact
 * pattern for the same cancellable rule (confirmed && date > today), so it is
 * extracted here verbatim rather than duplicated — MySchedule.js now imports
 * it too, so the two screens can never drift on copy or behavior.
 *
 * Restates the session's own facts so the tap being confirmed is unambiguous,
 * and never closes itself on failure — a failed cancel leaves the booking
 * exactly as it was, sheet open, honest inline error.
 *
 * @param {string} summary  The one-line "Tue Nov 4 · 4:00 PM · Training block"
 *   restatement of what is being cancelled — the caller formats it, since
 *   MySchedule and Reservations compose the pieces slightly differently
 *   (Reservations rows carry an athlete name, MySchedule's don't).
 * @param {() => Promise<any>} onConfirm  Must reject with a human-readable
 *   `.message` on failure — this sheet renders it verbatim, never a generic
 *   "something went wrong".
 * @param {() => void} onClose  Fires from "Keep it" and the overlay tap.
 * @param {() => void} onCancelled  Fires after onConfirm resolves.
 */
export default function CancelSheet({ summary, onClose, onConfirm, onCancelled }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleCancel = async () => {
    setSaving(true);
    setError(null);
    try {
      await onConfirm();
      onCancelled();
    } catch (err) {
      setSaving(false);
      setError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The reservation could not be cancelled. Try again.'
      );
    }
  };

  return (
    <div
      onClick={saving ? undefined : onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: tint.overlay,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: color.surface,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`,
          padding: '20px 22px 26px',
        }}
      >
        <ScreenTitle size={19}>Cancel this reservation?</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          {summary}
        </Body>
        {error ? (
          <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
            {error}
          </Body>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <Button
            variant="dangerOutline"
            height={50}
            loading={saving}
            style={{ boxShadow: 'none' }}
            onClick={handleCancel}
          >
            {saving ? 'Cancelling' : 'Cancel reservation'}
          </Button>
          <Button variant="outline" height={50} disabled={saving} style={{ boxShadow: 'none' }} onClick={onClose}>
            Keep it
          </Button>
        </div>
      </div>
    </div>
  );
}
