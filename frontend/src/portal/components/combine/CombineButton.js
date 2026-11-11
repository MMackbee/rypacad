import React from 'react';
import { color, font, radius } from '../../tokens';

/**
 * The coach's way in to an athlete's Combine screen from a training
 * session's attendance row (spec 4, entry points). A pill like
 * assessments/ClubheadChip.js; the tap stays on the button.
 */
export default function CombineButton({ name, onOpen }) {
  return (
    <button
      type="button"
      aria-label={`Combine: ${name}`}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      style={{
        minHeight: 36,
        padding: '0 12px',
        borderRadius: radius.pill,
        border: `1px solid ${color.primary}`,
        background: 'transparent',
        color: color.primary,
        font: `600 12px ${font.body}`,
        cursor: 'pointer',
      }}
    >
      Combine
    </button>
  );
}
