import React from 'react';
import { format, isSameDay } from 'date-fns';
import { color } from '../../tokens';
import { Body } from '../Primitives';

/**
 * The note editor's one save line (spec 5.3). `state` comes from
 * useMentalNote through the editor: idle | saving | saved | slow (still
 * saving after SLOW_SAVE_MS) | error. A failed save says so plainly and
 * keeps the text; the editor sends it again on its next autosave tick. A
 * save from an earlier day (a stored note reopened) shows its date.
 */
export default function SaveState({ state, savedAt }) {
  let text;
  let tone = color.textTertiary;
  if (state === 'saving') text = 'Saving…';
  else if (state === 'saved') {
    text = savedAt ? `Saved · ${format(savedAt, isSameDay(savedAt, Date.now()) ? 'H:mm' : 'MMM d, H:mm')}` : 'Saved';
  } else if (state === 'slow') {
    text = 'Not saved yet — still trying';
    tone = color.errorMid;
  } else if (state === 'error') {
    text = 'Not saved. Check your connection; it keeps trying while this page is open.';
    tone = color.errorMid;
  } else text = 'Not saved yet';
  return (
    <Body size={11} tone={tone} style={{ minHeight: 17 }}>
      <span role="status" aria-live="polite">{text}</span>
    </Body>
  );
}
