import React, { useEffect, useRef, useState } from 'react';
import { TOUCH_MIN, color, font, radius } from '../../tokens';
import { Body, Tick } from '../Primitives';
import { ERR } from '../../hooks/live';
import {
  INTAKE_LABEL, INTAKE_LOAD_ERROR, INTAKE_SAVE_ERROR, INTAKE_UNDO_LATE, MARK_NOT_DONE, intakeDoneLine, intakeUndo,
} from '../../data/combine';

const pill = (tone) => ({
  minHeight: TOUCH_MIN,
  padding: '0 14px',
  borderRadius: radius.pill,
  border: `1px solid ${tone}`,
  background: 'transparent',
  color: tone,
  font: `600 12px ${font.body}`,
  cursor: 'pointer',
});

/**
 * "Parallax intake swings" on a training session's attendance row (spec 3):
 * one tick per athlete, kept on every later session.
 *
 * role="checkbox" with the round 26 px tick drawn inside a 44 px target (the
 * old contract board's check-in toggle; Checkbox.js is 26 px with no disabled).
 * `milestone` undefined renders nothing (or the load error), so a row never
 * reads "not done" before its read lands. Undo is for whoever ticked it,
 * inside ten minutes; the owner clears any tick behind an inline confirm.
 * `label` and `loadErrorText` default to the Parallax words; the athlete
 * roster passes the fitness assessment's (hq card 14).
 * `readOnly` (the roster as ops sees it) turns the mark into status text: the
 * label, then the done line or "not done", no button and nothing to Tab to.
 * The attendance screen never passes it. While a tick, undo or clear saves,
 * the control is dimmed and aria-busy (no spinner). After the owner's Clear or
 * Keep, focus returns to the tick.
 * Who may do what is data/combine.js; `now` is re-read at tap time, so a
 * screen left open past the ten minutes says why instead of failing.
 */
export default function ParallaxTick({
  name, milestone, viewer, canTick, onTick, onUndo, loadError = false, now = Date.now,
  label = INTAKE_LABEL, loadErrorText = INTAKE_LOAD_ERROR, readOnly = false,
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [refocus, setRefocus] = useState(false);
  const tickRef = useRef(null);

  const ticked = Boolean(milestone);
  const enabled = Boolean(canTick) && !busy && (!ticked || intakeUndo(milestone, viewer, now()) != null);

  // After Clear or Keep the confirm (and the button the finger was on) is gone: put focus back on the tick once it can take it.
  useEffect(() => {
    if (refocus && enabled && tickRef.current) {
      tickRef.current.focus();
      setRefocus(false);
    }
  }, [refocus, enabled]);

  if (milestone === undefined) {
    return loadError ? <Body size={11} tone={color.error}>{loadErrorText}</Body> : null;
  }

  if (readOnly) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            width: 26,
            height: 26,
            flex: 'none',
            borderRadius: radius.pill,
            boxSizing: 'border-box',
            background: ticked ? color.primary : 'transparent',
            color: color.faintText,
            font: `400 14px/1 ${font.body}`,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {ticked ? <Tick size={11} /> : '–'}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ font: `600 12px ${font.body}`, color: color.text }}>{label}</span>
          <span style={{ font: `400 11px ${font.body}`, color: color.textSecondary, marginTop: 2 }}>
            {ticked ? intakeDoneLine(milestone) : MARK_NOT_DONE}
          </span>
        </span>
      </div>
    );
  }

  const run = async (write, failCopy) => {
    setBusy(true);
    setProblem(null);
    try {
      await write();
      setConfirming(false);
      setRefocus(true);
    } catch (err) {
      setProblem(failCopy(err));
    }
    setBusy(false);
  };
  const tickFailed = () => INTAKE_SAVE_ERROR;
  const undoFailed = (err) => (err && err.code === ERR.PERMISSION ? INTAKE_UNDO_LATE : INTAKE_SAVE_ERROR);

  const onClick = (e) => {
    e.stopPropagation();
    if (!ticked) {
      run(onTick, tickFailed);
      return;
    }
    const kind = intakeUndo(milestone, viewer, now());
    if (kind === 'undo') run(onUndo, undoFailed);
    else if (kind === 'owner-clear') {
      setProblem(null);
      setConfirming(true);
    } else setProblem(INTAKE_UNDO_LATE);
  };

  return (
    <div>
      <button
        ref={tickRef}
        type="button"
        role="checkbox"
        aria-checked={ticked}
        aria-label={`${label}: ${name}`}
        aria-busy={busy ? 'true' : undefined}
        disabled={!enabled}
        onClick={onClick}
        style={{
          minHeight: TOUCH_MIN,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 0,
          border: 'none',
          background: 'transparent',
          textAlign: 'left',
          cursor: enabled ? 'pointer' : 'default',
          opacity: busy ? 0.55 : undefined,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 26,
            height: 26,
            flex: 'none',
            borderRadius: radius.pill,
            boxSizing: 'border-box',
            background: ticked ? color.primary : 'transparent',
            border: ticked ? 'none' : `1.5px solid ${color.faintText}`,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {ticked ? <Tick size={11} /> : null}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ font: `600 12px ${font.body}`, color: color.text }}>{label}</span>
          {ticked ? (
            <span style={{ font: `400 11px ${font.body}`, color: color.textSecondary, marginTop: 2 }}>
              {intakeDoneLine(milestone)}
            </span>
          ) : null}
        </span>
      </button>
      {confirming ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Body size={12} tone={color.text}>{`Clear ${label} for ${name}?`}</Body>
          <button
            type="button"
            aria-label={`Clear ${label}: ${name}`}
            disabled={busy}
            onClick={(e) => { e.stopPropagation(); run(onUndo, undoFailed); }}
            style={pill(color.error)}
          >
            Clear
          </button>
          <button
            type="button"
            aria-label={`Keep ${label}: ${name}`}
            onClick={(e) => { e.stopPropagation(); setConfirming(false); setRefocus(true); }}
            style={pill(color.textSecondary)}
          >
            Keep
          </button>
        </div>
      ) : null}
      {problem ? <div role="alert"><Body size={11} tone={color.error}>{problem}</Body></div> : null}
    </div>
  );
}
