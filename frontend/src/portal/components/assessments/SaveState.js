import React from 'react';
import { color, font } from '../../tokens';

/** One entry's save state, as hooks/assessmentSaves.js tracks it. Nothing until the first save. */
export default function SaveState({ entry, onRetry }) {
  if (!entry) return null;
  const text = { font: `500 11px/1.4 ${font.body}` };
  if (entry.state === 'saving') return <span style={{ ...text, color: color.textTertiary }}>Saving…</span>;
  if (entry.state === 'saved') return <span style={{ ...text, color: color.primary }}>Saved</span>;
  if (entry.state === 'slow') return <span role="status" style={{ ...text, color: color.secondary }}>{entry.message}</span>;
  return (
    <span role="alert" style={{ ...text, color: color.error }}>
      {entry.message}{' '}
      <button type="button" onClick={onRetry} style={{ background: 'none', border: 'none', padding: 0, ...text, color: color.primary, cursor: 'pointer' }}>
        Try again
      </button>
    </span>
  );
}
