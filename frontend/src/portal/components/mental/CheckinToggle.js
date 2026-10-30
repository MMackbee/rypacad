import React from 'react';
import { color, radius } from '../../tokens';
import { Tick } from '../Primitives';

/**
 * The board's per-week "Checked in" tick box (Yannick, 2026-10-30: a tick
 * box, not a switch). role="checkbox" with the round 26 px tick of
 * components/Checkbox.js drawn inside a 44 px button, the touch floor the
 * bare 26 px Checkbox sits under. The bare control, not a row wrapper
 * (ToggleRow's precedent): the row would fire onChange twice per tap.
 */
export default function CheckinToggle({ checked, onChange, name, disabled = false }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={Boolean(checked)}
      aria-label={`Checked in · ${name}`}
      disabled={disabled}
      onClick={() => onChange && onChange(!checked)}
      style={{
        width: 44,
        height: 44,
        flex: 'none',
        border: 'none',
        padding: 0,
        background: 'transparent',
        display: 'grid',
        placeItems: 'center',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 26,
          height: 26,
          borderRadius: radius.pill,
          boxSizing: 'border-box',
          background: checked ? color.primary : 'transparent',
          border: checked ? 'none' : `1.5px solid ${color.faintText}`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {checked ? <Tick size={11} /> : null}
      </span>
    </button>
  );
}
