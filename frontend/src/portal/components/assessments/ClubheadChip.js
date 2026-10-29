import React from 'react';
import { color, font, radius } from '../../tokens';

/**
 * The golf coach's way in to clubhead entry (spec 5: "golf coaches see a
 * 'Clubhead speed' entry on an athlete with an open window in their
 * session roster"). Nothing without an open window; once golf is in it
 * reads "entered" and still opens, to correct.
 */
export default function ClubheadChip({ entry, name, onOpen }) {
  if (!entry) return null;
  const done = Boolean(entry.golfDate);
  return (
    <button
      type="button"
      aria-label={`Clubhead speed: ${name}`}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      style={{
        marginTop: 6,
        minHeight: 36,
        padding: '0 12px',
        borderRadius: radius.pill,
        border: `1px solid ${done ? color.controlBorder : color.primary}`,
        background: 'transparent',
        color: done ? color.textSecondary : color.primary,
        font: `600 12px ${font.body}`,
        cursor: 'pointer',
      }}
    >
      {done ? 'Clubhead speed · entered' : 'Clubhead speed'}
    </button>
  );
}
