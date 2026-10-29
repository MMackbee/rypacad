import React from 'react';
import { format } from 'date-fns';
import { color } from '../../tokens';
import { Body } from '../Primitives';

/**
 * The note editor's one save line (spec 5.3). `state` comes from
 * useMentalNote: idle | saving | saved | slow (still saving after
 * SLOW_SAVE_MS) | error. A failed save says so plainly and keeps the text;
 * the editor retries on the next change.
 */
export default function SaveState({ state, savedAt }) {
  let text;
  let tone = color.textTertiary;
  if (state === 'saving') text = 'Saving…';
  else if (state === 'saved') text = savedAt ? `Saved · ${format(savedAt, 'H:mm')}` : 'Saved';
  else if (state === 'slow') {
    text = 'Not saved yet — still trying';
    tone = color.errorMid;
  } else if (state === 'error') {
    text = 'Not saved. Check your connection and keep typing; it retries on the next change.';
    tone = color.errorMid;
  } else text = 'Not saved yet';
  return (
    <Body size={11} tone={tone} style={{ minHeight: 17 }}>
      <span role="status" aria-live="polite">{text}</span>
    </Body>
  );
}
