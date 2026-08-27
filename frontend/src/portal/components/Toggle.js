import React from 'react';
import { color, font } from '../tokens';

/**
 * Toggle - screens 11 and 16. 42x25 with a 19px knob.
 *
 * The whole row is the tap target, not the 42px switch, which is why the
 * default export is a labelled row rather than a bare control.
 */
export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      onClick={() => onChange && onChange(!checked)}
      style={{
        width: 42,
        height: 25,
        flex: 'none',
        borderRadius: 999,
        border: 'none',
        padding: 3,
        background: checked ? color.primary : color.toggleOff,
        display: 'flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        alignItems: 'center',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: 19,
          height: 19,
          borderRadius: '50%',
          background: checked ? '#000' : color.mutedText,
          display: 'block',
        }}
      />
    </button>
  );
}

/** Labelled row wrapper - the row itself is the tap target, not the switch. */
export default function ToggleRow({ label, description, checked, onChange, style }) {
  return (
    <div
      onClick={() => onChange && onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '11px 0',
        cursor: 'pointer',
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `500 14px ${font.body}`, color: color.text }}>{label}</div>
        {description ? (
          <div
            style={{
              font: `400 11px/1.5 ${font.body}`,
              color: color.textTertiary,
              marginTop: 3,
            }}
          >
            {description}
          </div>
        ) : null}
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
