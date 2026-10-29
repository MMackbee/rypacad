import React from 'react';
import { color, font, radius } from '../../tokens';

/**
 * The Note chip on a mental session row (spec 5.5), styled as the Roster's
 * note chip. It sits inside a tappable card, so the tap stops here and
 * never also opens attendance.
 */
export default function SessionNoteChip({ hasNote = false, onClick }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick();
      }}
      style={{
        background: '#161616',
        border: `1px solid ${color.rule}`,
        borderRadius: radius.badge,
        padding: '6px 10px',
        maxWidth: '100%',
        textAlign: 'left',
        font: `500 11px ${font.body}`,
        color: color.textTertiary,
        cursor: 'pointer',
      }}
    >
      {hasNote ? 'Edit note' : 'Note'}
    </button>
  );
}
