import React, { useState } from 'react';
import { color, font, radius } from '../../tokens';
import { Body, Tick } from '../Primitives';
import { ERR } from '../../hooks/live';
import {
  INTAKE_LABEL, INTAKE_LOAD_ERROR, INTAKE_SAVE_ERROR, INTAKE_UNDO_LATE, intakeDoneLine, intakeUndo,
} from '../../data/combine';

const pill = (tone) => ({
  minHeight: 36,
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
 * mental/CheckinToggle.js precedent; Checkbox.js is 26 px with no disabled).
 * `milestone` undefined renders nothing (or the load error), so a row never
 * reads "not done" before its read lands. Undo is for whoever ticked it,
 * inside ten minutes; the owner clears any tick behind an inline confirm.
 * Who may do what is data/combine.js; `now` is re-read at tap time, so a
 * screen left open past the ten minutes says why instead of failing.
 */
export default function ParallaxTick({ name, milestone, viewer, canTick, onTick, onUndo, loadError = false, now = Date.now }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [confirming, setConfirming] = useState(false);

  if (milestone === undefined) {
    return loadError ? <Body size={11} tone={color.error}>{INTAKE_LOAD_ERROR}</Body> : null;
  }

  const ticked = Boolean(milestone);
  const enabled = Boolean(canTick) && !busy && (!ticked || intakeUndo(milestone, viewer, now()) != null);

  const run = async (write, failCopy) => {
    setBusy(true);
    setProblem(null);
    try {
      await write();
      setConfirming(false);
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
        type="button"
        role="checkbox"
        aria-checked={ticked}
        aria-label={`${INTAKE_LABEL}: ${name}`}
        disabled={!enabled}
        onClick={onClick}
        style={{
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 0,
          border: 'none',
          background: 'transparent',
          textAlign: 'left',
          cursor: enabled ? 'pointer' : 'default',
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
          <span style={{ font: `600 12px ${font.body}`, color: color.text }}>{INTAKE_LABEL}</span>
          {ticked ? (
            <span style={{ font: `400 11px ${font.body}`, color: color.textSecondary, marginTop: 2 }}>
              {intakeDoneLine(milestone)}
            </span>
          ) : null}
        </span>
      </button>
      {confirming ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Body size={12} tone={color.text}>{`Clear ${INTAKE_LABEL} for ${name}?`}</Body>
          <button
            type="button"
            aria-label={`Clear ${INTAKE_LABEL}: ${name}`}
            disabled={busy}
            onClick={(e) => { e.stopPropagation(); run(onUndo, undoFailed); }}
            style={pill(color.error)}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
            style={pill(color.textSecondary)}
          >
            Keep
          </button>
        </div>
      ) : null}
      {problem ? <Body size={11} tone={color.error}>{problem}</Body> : null}
    </div>
  );
}
