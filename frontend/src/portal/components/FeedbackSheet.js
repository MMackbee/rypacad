import React, { useEffect, useId, useRef, useState } from 'react';
import { color, font, radius, tint } from '../tokens';
import Button from './Button';
import { Body } from './Primitives';
import ToggleRow from './Toggle';
import { BARE_MAX_WIDTH } from './PhoneFrame';
import { FEEDBACK_NOTE_MAX, FEEDBACK_UI_ATTR, canSendFeedback, sendErrorMessage } from '../hooks/feedback';

export const NOTE_LABEL = 'What happened, or what would you like to change?';
export const NO_SHOT = 'The screenshot could not be taken, so only your note will be sent.';
const UI = { [FEEDBACK_UI_ATTR]: '' };
const FOCUSABLE = 'button, textarea, input, select, [href], [tabindex]:not([tabindex="-1"])';

/** Tab and Shift+Tab stay inside the dialog while it is open. */
function trapFocus(e, container) {
  if (!container) return;
  const items = Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => !el.disabled);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === container)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * The Feedback panel (owner-approved design, 2026-10-15): CancelSheet's
 * bottom-sheet idiom - the same overlay tint, surface, top radius and
 * stacked 50px buttons - but `position: fixed`, because it opens from the
 * Feedback button outside every screen's frame, and a real modal dialog
 * (focus moves in, Tab stays in, Escape closes, focus returns to the
 * button).
 *
 * The screenshot was taken before this opened, so the panel is never in
 * it. "Include screenshot" starts on; turned off, the preview dims and
 * nothing of it is sent. Send needs a note or an included screenshot.
 * Like CancelSheet it never closes itself on failure: the error shows
 * under the note and Send tries again. A tap on the dimmed page closes it
 * only while the note is empty, so a stray tap never throws away what was
 * typed.
 *
 * @param {{dataUrl: string, width: number, height: number} | null} shot
 * @param {() => void} onClose  Cancel, Escape, or the overlay tap.
 * @param {(note: string, includeShot: boolean) => Promise<any>} onSend
 *   Rejects with the function's own message on failure.
 * @param {() => void} onSent  After onSend resolves.
 */
export default function FeedbackSheet({ shot, onClose, onSend, onSent }) {
  const [note, setNote] = useState('');
  const [includeShot, setIncludeShot] = useState(Boolean(shot));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const dialogRef = useRef(null);
  const id = useId();
  const titleId = `${id}-title`;
  const noteId = `${id}-note`;

  useEffect(() => {
    if (dialogRef.current) dialogRef.current.focus();
  }, []);

  const ready = canSendFeedback(note, includeShot, shot);
  const dismiss = () => {
    if (!sending) onClose();
  };

  const handleSend = async () => {
    if (!ready || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(note, includeShot && Boolean(shot));
    } catch (err) {
      setSending(false);
      setError(sendErrorMessage(err));
      return;
    }
    onSent();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      dismiss();
    } else if (e.key === 'Tab') {
      trapFocus(e, dialogRef.current);
    }
  };

  return (
    <div
      {...UI}
      onClick={note.trim() ? undefined : dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: tint.overlay,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: BARE_MAX_WIDTH,
          maxHeight: '92vh',
          overflowY: 'auto',
          boxSizing: 'border-box',
          background: color.surface,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`,
          padding: '20px 22px calc(26px + env(safe-area-inset-bottom, 0px))',
          outline: 'none',
        }}
      >
        <h2 id={titleId} style={{ font: `700 19px ${font.head}`, letterSpacing: '.01em', color: color.text, margin: 0 }}>
          Send feedback
        </h2>
        <Body size={12} style={{ marginTop: 8 }}>
          It goes to the RYP team with your name, this page and your device.
        </Body>

        {shot ? (
          <img
            src={shot.dataUrl}
            alt="Screenshot of the page you were on"
            style={{
              display: 'block',
              width: '100%',
              maxHeight: 190,
              objectFit: 'contain',
              marginTop: 14,
              background: color.track,
              border: `1px solid ${color.border}`,
              borderRadius: radius.input,
              boxSizing: 'border-box',
              opacity: includeShot ? 1 : 0.3,
            }}
          />
        ) : (
          <Body size={12} tone={color.secondary} style={{ marginTop: 12 }}>
            {NO_SHOT}
          </Body>
        )}

        <label
          htmlFor={noteId}
          style={{ display: 'block', marginTop: 16, marginBottom: 7, font: `500 13px ${font.body}`, color: color.textSecondary }}
        >
          {NOTE_LABEL}
        </label>
        <textarea
          id={noteId}
          rows={4}
          value={note}
          maxLength={FEEDBACK_NOTE_MAX}
          disabled={sending}
          onChange={(e) => setNote(e.target.value)}
          style={{
            width: '100%',
            height: 96,
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
        {note.length > FEEDBACK_NOTE_MAX - 200 ? (
          <Body size={11} tone={color.textTertiary} style={{ marginTop: 4 }}>
            {FEEDBACK_NOTE_MAX - note.length} characters left
          </Body>
        ) : null}

        {shot ? (
          <ToggleRow
            label="Include screenshot"
            checked={includeShot}
            onChange={(on) => {
              if (!sending) setIncludeShot(on);
            }}
            style={{ marginTop: 4 }}
          />
        ) : null}

        {error ? (
          <div role="alert">
            <Body size={12} tone={color.error} style={{ marginTop: 8 }}>
              {error}
            </Body>
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <Button height={50} loading={sending} disabled={!ready} style={{ boxShadow: 'none' }} onClick={handleSend}>
            {sending ? 'Sending' : 'Send'}
          </Button>
          <Button variant="outline" height={50} disabled={sending} style={{ boxShadow: 'none' }} onClick={dismiss}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
