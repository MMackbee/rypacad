import React, { useRef, useState } from 'react';
import { color, radius, tint } from '../tokens';
import Button from './Button';
import { Body, ScreenTitle } from './Primitives';
import { seriesOffer, seriesSummary } from '../hooks/cancelSeries';

/**
 * `keepFirst` only: how long after the sheet opens a confirm tap is still the
 * double tap that opened it. Well under the time it takes to read the question.
 */
export const SETTLE_MS = 500;

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
 * Cancel a series (tester Mike, 2026-09-30): when the booking has later
 * weeks (`laterWeeks`, hooks/cancelSeries.js) the sheet offers "Cancel just
 * this one" (the same single cancel) beside "Cancel this and N later weeks",
 * and a series run ends in ONE summary here - how many were cancelled, any
 * that were not and why - instead of closing. With no later weeks (and for
 * Roster, which passes neither prop) the sheet is exactly as before.
 *
 * Deleting a scholarship application (owner, 2026-10-01) is the same
 * confirm step again - AdminScholarships.js - with two more overridables.
 * `busyLabel` because that write is not a cancellation. `keepFirst` because
 * its Delete button can sit just above the tab bar, where this sheet's upper
 * button lands when it opens: with the keep button on top, the second tap of
 * a double tap closes the sheet instead of confirming, and the keep button
 * is first in the tab order and takes the focus, so Enter or Space on a
 * freshly opened sheet keeps too. Where the buttons land is layout, though,
 * and nothing pins it, so `keepFirst` does not rest on it alone: a confirm
 * tap in the sheet's first half second (SETTLE_MS) is taken for the tail of
 * the tap that opened it and does nothing - a delete cannot be confirmed
 * before the question has been on screen. Passing neither leaves the sheet
 * as it was.
 *
 * @param {string} title  Defaults to the member-cancel wording.
 * @param {React.ReactNode} summary  The one-line "Tue Nov 4 · 4:00 PM ·
 *   Training block" restatement of what is being cancelled — the caller
 *   formats it, since MySchedule/Reservations/Roster compose the pieces
 *   differently (Reservations rows carry an athlete name; Roster's own
 *   cancel-session sheet states a booking + grace-token count instead).
 * @param {string} [confirmLabel]  Defaults to "Cancel reservation".
 * @param {string} [busyLabel]  The confirm button while onConfirm runs.
 *   Defaults to "Cancelling".
 * @param {string} [keepLabel]  Defaults to "Keep it".
 * @param {boolean} [keepFirst]  The keep button above the confirm button(s)
 *   and focused when the sheet opens, and no confirm taken in the sheet's
 *   first half second. Defaults to false: keep last, no focus moved, a
 *   confirm taken at once.
 * @param {() => Promise<any>} onConfirm  Must reject with a human-readable
 *   `.message` on failure — this sheet renders it verbatim, never a generic
 *   "something went wrong".
 * @param {() => void} onClose  Fires from the keep button and the overlay tap.
 * @param {() => void} onCancelled  Fires after onConfirm resolves, and from
 *   "Done" on the series summary.
 * @param {Array<{date: string}>} [laterWeeks]  laterWeeks() for this booking.
 * @param {() => Promise<object>} [onConfirmSeries]  Runs cancelSeries() for
 *   the booking and its later weeks; resolves with its result.
 */
export default function CancelSheet({
  title = 'Cancel this reservation?',
  summary,
  confirmLabel = 'Cancel reservation',
  busyLabel = 'Cancelling',
  keepLabel = 'Keep it',
  keepFirst = false,
  laterWeeks,
  onClose,
  onConfirm,
  onConfirmSeries,
  onCancelled,
}) {
  // false, or which button is working: 'one' | 'series'.
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // cancelSeries' result once a series run changed anything or finished.
  const [result, setResult] = useState(null);
  // When the sheet opened. Only keepFirst reads it.
  const openedAt = useRef(Date.now());
  const offer = onConfirmSeries ? seriesOffer(laterWeeks) : null;
  const done = result ? seriesSummary(result) : null;

  const handleSeries = async () => {
    setSaving('series');
    setError(null);
    try {
      const run = await onConfirmSeries();
      setSaving(false);
      // Stopped before anything was cancelled: nothing changed, so the choice
      // stays up with the reason, the same as a failed single cancel.
      if (run.stopped && run.cancelled.length === 0) setError(run.stopped.message);
      else setResult(run);
    } catch (err) {
      setSaving(false);
      setError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The reservations could not be cancelled. Try again.'
      );
    }
  };

  const handleCancel = async () => {
    // keepFirst: too soon after opening to be an answer. (A clock set back while the sheet is open is not "too soon".)
    const sinceOpened = Date.now() - openedAt.current;
    if (keepFirst && sinceOpened >= 0 && sinceOpened < SETTLE_MS) return;
    setSaving('one');
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

  const keep = (
    <Button variant="outline" height={50} disabled={Boolean(saving)} autoFocus={keepFirst} style={{ boxShadow: 'none' }} onClick={onClose}>
      {keepLabel}
    </Button>
  );

  return (
    <div
      onClick={saving ? undefined : done ? onCancelled : onClose}
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
        <ScreenTitle size={19}>{done ? done.title : title}</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          {summary}
        </Body>
        {done ? (
          done.lines.map((line) => (
            <Body key={line} size={12} style={{ marginTop: 8 }}>
              {line}
            </Body>
          ))
        ) : offer ? (
          <Body size={12} style={{ marginTop: 8 }}>
            {offer.note}
          </Body>
        ) : null}
        {error ? (
          <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
            {error}
          </Body>
        ) : null}
        {done ? (
          <div style={{ marginTop: 16 }}>
            <Button variant="outline" height={50} style={{ boxShadow: 'none' }} onClick={onCancelled}>
              Done
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {keepFirst ? keep : null}
            <Button
              variant="dangerOutline"
              height={50}
              loading={saving === 'one'}
              disabled={saving === 'series'}
              style={{ boxShadow: 'none' }}
              onClick={handleCancel}
            >
              {saving === 'one' ? busyLabel : offer ? 'Cancel just this one' : confirmLabel}
            </Button>
            {offer ? (
              <Button
                variant="dangerOutline"
                height={50}
                loading={saving === 'series'}
                disabled={saving === 'one'}
                style={{ boxShadow: 'none' }}
                onClick={handleSeries}
              >
                {saving === 'series' ? 'Cancelling' : offer.confirmLabel}
              </Button>
            ) : null}
            {keepFirst ? null : keep}
          </div>
        )}
      </div>
    </div>
  );
}
