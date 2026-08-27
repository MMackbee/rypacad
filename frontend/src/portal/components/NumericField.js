import React from 'react';
import { color, font, radius } from '../tokens';

/**
 * Numeric field row - screen 14 (Diagnostic Capture).
 *
 * Spec: label at left, an 86x44 right-aligned input, then the unit in a fixed
 * 30px column *outside* the input. A coach entering nine readings in a row keeps
 * a single thumb path down the right edge of the screen; a unit inside the input
 * would break that alignment.
 */
export default function NumericField({ label, value, unit, onChange, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, ...style }}>
      <div style={{ flex: 1, font: `400 13px ${font.body}`, color: color.textSecondary }}>
        {label}
      </div>
      <input
        inputMode="decimal"
        value={value ?? ''}
        onChange={(e) => onChange && onChange(e.target.value)}
        style={{
          width: 86,
          height: 44,
          flex: 'none',
          background: color.track,
          border: `1px solid ${color.border}`,
          borderRadius: radius.input,
          font: `600 15px ${font.body}`,
          color: color.text,
          textAlign: 'right',
          padding: '0 10px',
          outline: 'none',
        }}
      />
      <div style={{ width: 30, flex: 'none', font: `400 11px ${font.body}`, color: color.mutedText }}>
        {unit}
      </div>
    </div>
  );
}
