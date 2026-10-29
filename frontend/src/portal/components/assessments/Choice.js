import React from 'react';
import { color, font, radius } from '../../tokens';

/**
 * Mutually exclusive answers (Pass / Not tested, Right / Left, Speed /
 * Distance). Every option is a real button whose aria-label carries the
 * question - "Ava readiness: Pass" - so a station with four athletes on
 * screen has one unambiguous control per answer. `clearable`: tapping the
 * chosen answer again clears it.
 */
export default function Choice({ label, value, options, onChange, clearable = false, disabled = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ font: `500 11px ${font.body}`, color: color.textSecondary }}>{label}</div>
      <div role="group" aria-label={label} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(([key, text]) => {
          const on = key === value;
          return (
            <button
              key={String(key)}
              type="button"
              aria-pressed={on}
              aria-label={`${label}: ${text}`}
              disabled={disabled}
              onClick={() => onChange(on && clearable ? null : key)}
              style={{
                minHeight: 40,
                padding: '0 14px',
                borderRadius: radius.pill,
                border: `1px solid ${on ? color.primary : color.controlBorder}`,
                background: on ? color.primary : 'transparent',
                color: on ? '#000' : color.textSecondary,
                font: `${on ? 600 : 500} 13px ${font.body}`,
                cursor: disabled ? 'default' : 'pointer',
              }}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
