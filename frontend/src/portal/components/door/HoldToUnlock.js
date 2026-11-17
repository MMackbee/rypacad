import React, { useEffect, useId, useRef, useState } from 'react';
import { color, font, tint } from '../../tokens';
import Button, { Spinner } from '../Button';

/** How long a finger stays on the button to unlock. */
export const HOLD_MS = 1000;
/** A click this soon after a finger left the button is that press's own click, not the keyboard path. */
const POINTER_CLICK_MS = 1500;

const SIZE = 136;
const STROKE = 6;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = Math.round(2 * Math.PI * R * 100) / 100;

const srOnly = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * Hold to unlock (docs/portal/plans/2026-11-17-door-button/00-spec.md 7): a
 * round button with a progress ring. A finger held for HOLD_MS fires
 * `onUnlock`; lifting it, the browser taking the touch (pointercancel) or
 * sliding off without capture cancels. No long-press menu, no text selection,
 * no page pan from the button. The keyboard and screen-reader path: a click
 * with no finger on the button (Enter, Space, a reader's activate) asks
 * "Unlock the door now?" with Unlock and Cancel, focus on the question;
 * choosing Unlock puts focus back on this button. `busy` (press to answer)
 * and `disabled` turn everything off; busy is aria-disabled rather than
 * disabled, so the button keeps keyboard focus through the wait (review
 * 2026-11-17 app-7: a disabled button drops focus to the page).
 *
 * @param {() => void} onUnlock
 * @param {boolean} [busy]  A press is in flight: "Unlocking" with a spinner.
 * @param {boolean} [disabled]
 */
export default function HoldToUnlock({ onUnlock, busy = false, disabled = false }) {
  const [holding, setHolding] = useState(false);
  const [asking, setAsking] = useState(false);
  const timer = useRef(null);
  const pointerDown = useRef(false);
  const lastPointerAt = useRef(-Infinity);
  const buttonRef = useRef(null);
  const hintId = useId();
  const off = busy || disabled;

  const stopHold = () => {
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!off) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    setAsking(false);
  }, [off]);

  const onPointerDown = (e) => {
    if (off || (typeof e.button === 'number' && e.button !== 0)) return;
    pointerDown.current = true;
    lastPointerAt.current = Date.now();
    try {
      if (e.currentTarget.setPointerCapture && e.pointerId != null) e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // No capture (an old browser, a synthetic event): sliding off cancels instead.
    }
    setAsking(false);
    setHolding(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onUnlock();
    }, HOLD_MS);
  };

  const onPointerEnd = () => {
    if (!pointerDown.current) return;
    pointerDown.current = false;
    lastPointerAt.current = Date.now();
    if (timer.current) stopHold();
  };

  const onClick = () => {
    if (off || pointerDown.current || Date.now() - lastPointerAt.current < POINTER_CLICK_MS) return;
    setAsking(true);
  };

  const closeQuestion = () => {
    setAsking(false);
    if (buttonRef.current) buttonRef.current.focus();
  };

  const label = busy ? 'Unlocking' : holding ? 'Keep holding' : 'Hold to unlock';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <button
        ref={buttonRef}
        type="button"
        data-door-hold=""
        disabled={disabled}
        aria-disabled={off ? 'true' : undefined}
        aria-describedby={hintId}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onClick={onClick}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: 'relative',
          width: SIZE,
          height: SIZE,
          flex: 'none',
          borderRadius: '50%',
          border: 'none',
          padding: 0,
          background: off ? color.dimmed : holding ? tint.greenStrong : tint.greenSoft,
          cursor: off ? 'default' : 'pointer',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <svg aria-hidden="true" width={SIZE} height={SIZE} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={color.rule} strokeWidth={STROKE} />
          <circle
            data-door-ring=""
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={off ? color.faintText : color.primary}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={holding ? 0 : CIRCUMFERENCE}
            style={{ transition: holding ? `stroke-dashoffset ${HOLD_MS}ms linear` : 'stroke-dashoffset 150ms ease-out' }}
          />
        </svg>
        <span
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: '0 18px',
            font: `600 15px/1.25 ${font.body}`,
            color: off ? color.disabledText : color.text,
          }}
        >
          {busy ? <Spinner track="rgba(255,255,255,.2)" head={color.primary} /> : null}
          {label}
        </span>
      </button>
      <span id={hintId} style={srOnly}>
        Hold for one second to unlock. With a keyboard or screen reader, press it and then confirm.
      </span>
      {asking && !off ? (
        <UnlockQuestion
          onUnlock={() => {
            setAsking(false);
            // The question's own Unlock button goes away: keep the place.
            if (buttonRef.current) buttonRef.current.focus();
            onUnlock();
          }}
          onCancel={closeQuestion}
        />
      ) : null}
    </div>
  );
}

/** "Unlock the door now?" - the keyboard and screen-reader path; focus lands on the question, Escape closes it. */
function UnlockQuestion({ onUnlock, onCancel }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (ref.current) ref.current.focus();
  }, []);
  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
      style={{ width: '100%', marginTop: 16, outline: 'none' }}
    >
      <div id={titleId} style={{ font: `600 14px ${font.body}`, color: color.text, textAlign: 'center' }}>
        Unlock the door now?
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <Button height={46} onClick={onUnlock} style={{ font: `600 15px ${font.body}` }}>
          Unlock
        </Button>
        <Button variant="outline" height={46} onClick={onCancel} style={{ boxShadow: 'none', font: `600 15px ${font.body}` }}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
