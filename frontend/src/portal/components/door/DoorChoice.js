import React from 'react';
import { color, font, radius } from '../../tokens';

/**
 * One choice of a few, the house segmented control (components/Segmented.js)
 * as a labelled radio group whose options can be off: the Facility door
 * screen's Who can unlock (Everyone waits for the academy location) and
 * reach. Each option is a button with role="radio" and aria-checked.
 *
 * @param {string} label  The group's name for a screen reader.
 * @param {{id: *, text: string, disabled?: boolean}[]} options
 * @param {*} value  The checked option's id.
 * @param {(id) => void} onChange  Not called for the checked option or an off one.
 */
export default function DoorChoice({ label, options, value, onChange, style }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{
        background: color.track,
        border: `1px solid ${color.border}`,
        borderRadius: radius.control,
        padding: 3,
        display: 'flex',
        ...style,
      }}
    >
      {options.map(({ id, text, disabled = false }) => {
        const on = id === value;
        return (
          <button
            key={String(id)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => {
              if (!on && !disabled) onChange(id);
            }}
            style={{
              flex: 1,
              minWidth: 0,
              height: 40,
              border: 'none',
              borderRadius: radius.pill,
              background: on ? color.primary : 'transparent',
              font: `${on ? 600 : 500} 13px ${font.body}`,
              color: on ? '#000' : disabled ? color.faintText : color.textSecondary,
              cursor: on || disabled ? 'default' : 'pointer',
              padding: '0 4px',
            }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
