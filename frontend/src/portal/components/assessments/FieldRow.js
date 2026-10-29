import React from 'react';
import { color, font } from '../../tokens';

/** A label at left and its input(s) at right - the station cards' one row shape. */
export default function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 140px', minWidth: 0, font: `400 13px ${font.body}`, color: color.textSecondary }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>{children}</div>
    </div>
  );
}
