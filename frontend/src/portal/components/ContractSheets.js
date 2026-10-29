import React, { useEffect, useState } from 'react';
import { color, font, radius, tint } from '../tokens';
import Button from './Button';
import NumericField from './NumericField';
import { Body, ScreenTitle } from './Primitives';
import { todayISO } from '../data/calendar';

/**
 * The Commitment Contract's two bottom sheets, moved out of
 * screens/CommitmentContract.js (2026-10-28) so the parent's contract card
 * on AthleteDetail (components/ParentContractCard.js) opens the same sheets
 * the athlete's own screen does: DaySheet for a tapped day (remove an entry,
 * or add a late one) and LogSheet for the real minutes practiced.
 */

/** Read-only grid: a past day opens this rather than toggling in place. */
/** '2026-08-14' -> 'August 14', via the platform, not hand math. */
function sheetTitle(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export function DaySheet({ day, onClose, onAddLate, onRemove }) {
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(null);
  const logged = day.state === 'logged';
  // A day that hasn't happened cannot take a "late" entry — the rules would
  // technically accept the write (any date is loggable), but logging future
  // practice is a fiction this sheet won't offer.
  const future = day.iso > todayISO();
  const interactive = logged ? Boolean(onRemove) : Boolean(onAddLate) && !future;

  const handleAction = async () => {
    if (!interactive) return onClose();
    if (!logged) return onAddLate(day.iso);
    setRemoving(true);
    setRemoveError(null);
    try {
      await onRemove(day.iso);
      onClose();
    } catch (err) {
      setRemoving(false);
      setRemoveError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The entry could not be removed. Try again.'
      );
    }
  };

  return (
    <div
      data-portal-overlay=""
      onClick={removing ? undefined : onClose}
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
        <ScreenTitle size={19}>{sheetTitle(day.iso)}</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          {logged
            ? 'Logged. Tap below to remove this entry if it was recorded by mistake.'
            : future
            ? 'This day has not happened yet — log it once it has.'
            : 'Not logged. A late entry is allowed until the month closes.'}
        </Body>
        {removeError ? (
          <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
            {removeError}
          </Body>
        ) : null}
        <Button
          variant={logged ? 'outline' : future ? 'outline' : 'primary'}
          height={50}
          loading={removing}
          onClick={handleAction}
          style={{ marginTop: 16, boxShadow: 'none' }}
        >
          {logged ? 'Remove entry' : future ? 'Close' : 'Add late entry'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Sprint 5 pin: variable practice logging. The contract tier is a minimum,
 * not a unit — this sheet captures the real minutes practiced, two ways: a
 * running timer (no typing) or a manual entry (for a session already run
 * elsewhere). Whichever mode is showing when Save is tapped is what gets
 * logged; switching modes does not combine them.
 */
export function LogSheet({ contractMinutes, forDate, onClose, onSave }) {
  // A late entry (forDate in the past) is a session already run elsewhere —
  // the running timer makes no sense for it, so the sheet opens straight in
  // manual mode and the mode toggle is hidden.
  const late = Boolean(forDate) && forDate !== todayISO();
  const [mode, setMode] = useState(late ? 'manual' : 'timer');
  const [running, setRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [manualMinutes, setManualMinutes] = useState('');

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const timerMinutes = Math.floor(elapsedSec / 60);
  const mm = String(timerMinutes).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');

  const manualValue = Math.max(0, Math.round(Number(manualMinutes) || 0));
  const minutesToSave = mode === 'timer' ? timerMinutes : manualValue;
  const canSave = minutesToSave > 0;

  return (
    <div
      data-portal-overlay=""
      onClick={onClose}
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
        <ScreenTitle size={19}>{late ? `Log practice · ${sheetTitle(forDate)}` : 'Log practice'}</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          {contractMinutes
            ? `${contractMinutes} min a day is the contract minimum, not a unit — log the real time practiced.`
            : 'Log the real time practiced.'}
        </Body>

        <div
          style={{
            display: late ? 'none' : 'flex',
            marginTop: 16,
            background: color.dimmed,
            border: `1px solid ${color.border}`,
            borderRadius: radius.control,
            padding: 3,
          }}
        >
          {[['timer', 'Timer'], ['manual', 'Enter minutes']].map(([key, label]) => {
            const on = key === mode;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                style={{
                  flex: 1,
                  height: 36,
                  border: 'none',
                  borderRadius: radius.pill,
                  background: on ? color.primary : 'transparent',
                  font: `${on ? 600 : 500} 13px ${font.body}`,
                  color: on ? '#000' : color.textTertiary,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {mode === 'timer' ? (
          <div style={{ textAlign: 'center', marginTop: 22 }}>
            <div style={{ font: `700 44px ${font.head}`, color: color.text, letterSpacing: '.04em' }}>
              {mm}:{ss}
            </div>
            <Button
              variant={running ? 'dangerOutline' : 'primary'}
              height={50}
              style={{ marginTop: 16, boxShadow: 'none' }}
              onClick={() => setRunning((r) => !r)}
            >
              {running ? 'Stop' : elapsedSec > 0 ? 'Resume' : 'Start'}
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            <NumericField
              label="Minutes practiced"
              unit="min"
              value={manualMinutes}
              onChange={setManualMinutes}
            />
          </div>
        )}

        <Button height={54} disabled={!canSave} style={{ marginTop: 22 }} onClick={() => onSave(minutesToSave)}>
          {canSave ? `Save · ${minutesToSave} min` : 'Save'}
        </Button>
      </div>
    </div>
  );
}
