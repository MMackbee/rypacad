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
 * Sprint 13 (contract v2.1): Roster.js's staff-only "Cancel session" action
 * (pin E) reuses this same sheet for its confirm step — the copy differs
 * (title, confirm label, and a richer summary stating the blast radius:
 * bookings cancelled, grace tokens minted) but the never-close-on-failure/
 * honest-inline-error behavior is identical, so `title`/`confirmLabel`/
 * `keepLabel` are now overridable rather than duplicating the sheet.
 *
 * @param {string} title  Defaults to the member-cancel wording.
 * @param {React.ReactNode} summary  The one-line "Tue Nov 4 · 4:00 PM ·
 *   Training block" restatement of what is being cancelled — the caller
 *   formats it, since MySchedule/Reservations/Roster compose the pieces
 *   differently (Reservations rows carry an athlete name; Roster's own
 *   cancel-session sheet states a booking + grace-token count instead).
 * @param {string} [confirmLabel]  Defaults to "Cancel reservation".
 * @param {string} [keepLabel]  Defaults to "Keep it".
 * @param {() => Promise<any>} onConfirm  Must reject with a human-readable
 *   `.message` on failure — this sheet renders it verbatim, never a generic
 *   "something went wrong".
 * @param {() => void} onClose  Fires from the keep button and the overlay tap.
 * @param {() => void} onCancelled  Fires after onConfirm resolves.
 */
export default function CancelSheet({
  title = 'Cancel this reservation?',
  summary,
  confirmLabel = 'Cancel reservation',
  keepLabel = 'Keep it',
  onClose,
  onConfirm,
  onCancelled,
}) {
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
        <ScreenTitle size={19}>{title}</ScreenTitle>
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
            {saving ? 'Cancelling' : confirmLabel}
          </Button>
          <Button variant="outline" height={50} disabled={saving} style={{ boxShadow: 'none' }} onClick={onClose}>
            {keepLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
