import React, { useCallback, useEffect, useRef, useState } from 'react';
import { color, font, radius } from '../../tokens';
import Button from '../Button';
import { Body } from '../Primitives';
import SaveState from './SaveState';
import { NOTE_MAX } from '../../data/mentalNotes';

/**
 * Yannick's note editor (spec 5.3). The editor owns the text: `initialBody`
 * is read once, at mount, and never written back into state, so a save that
 * resolves (new `saveState`, `savedAt`, even a new `initialBody`) never
 * replaces what is being typed (Review Focus 5). The screen keys this
 * component on the note's route params, never on the loaded entry.
 *
 * Saves on blur when the text changed, and every `autosaveMs` while dirty
 * (one interval, started on the first edit). `onSave` is never called with
 * the body it was last called with. Delete confirms inline, no
 * window.confirm.
 */
export default function NoteEditor({
  initialBody = '',
  saveState = 'idle',
  savedAt = null,
  onSave,
  onDelete,
  canDelete = false,
  autosaveMs = 10000,
}) {
  const [body, setBody] = useState(initialBody);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const bodyRef = useRef(initialBody);
  const last = useRef(initialBody);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; });

  // Refs only, so the one interval below always commits the current text.
  const commit = useCallback(() => {
    if (bodyRef.current === last.current) return;
    last.current = bodyRef.current;
    if (onSaveRef.current) onSaveRef.current(bodyRef.current);
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const id = setInterval(commit, autosaveMs);
    return () => clearInterval(id);
  }, [dirty, autosaveMs, commit]);

  const change = (e) => {
    const next = e.target.value;
    bodyRef.current = next;
    setBody(next);
    if (!dirty) setDirty(true);
  };

  const left = NOTE_MAX - body.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        aria-label="Note"
        value={body}
        maxLength={NOTE_MAX}
        onChange={change}
        onBlur={commit}
        style={{
          width: '100%',
          minHeight: '55vh',
          background: color.track,
          border: `1px solid ${color.rule}`,
          borderRadius: radius.input,
          padding: 11,
          font: `400 16px ${font.body}`, // 16px: no iOS zoom on focus
          color: color.text,
          resize: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SaveState state={saveState} savedAt={savedAt} />
        </div>
        {left < 500 ? (
          <Body size={11} tone={color.textTertiary} style={{ flex: 'none' }}>
            {left} characters left
          </Body>
        ) : null}
      </div>
      {canDelete && onDelete ? (
        confirming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Body size={13} tone={color.text} style={{ flex: 1 }}>Delete this note? </Body>
            <Button
              variant="danger"
              height={44}
              style={{ width: 'auto', font: `600 14px ${font.body}` }}
              onClick={() => { setConfirming(false); onDelete(); }}
            >
              Yes, delete
            </Button>
            <Button variant="outline" height={44} style={{ width: 'auto', font: `600 14px ${font.body}` }} onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            style={{
              alignSelf: 'flex-start',
              background: 'none',
              border: 'none',
              padding: 0,
              minHeight: 44,
              font: `500 13px ${font.body}`,
              color: color.error,
              cursor: 'pointer',
            }}
          >
            Delete note
          </button>
        )
      ) : null}
    </div>
  );
}
