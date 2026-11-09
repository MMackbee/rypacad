import React, { useEffect, useId } from 'react';
import { color, font, radius, tint } from '../../tokens';
import Button from '../Button';
import { Body } from '../Primitives';

/**
 * A consent confirm sheet: the athlete's "Stop recording?", Yannick's
 * reminder and withdrawal. One sentence (`text`, the question and what it
 * does, which names the dialog), the confirm and the cancel. The cancel
 * takes the focus when the sheet opens and Escape closes it (not while
 * busy). `cancelFirst` (the one-way withdrawals) puts the cancel above the
 * confirm, so the second tap of a double tap lands on it (CancelSheet's
 * keepFirst). The CancelSheet overlay idiom (absolute over the PhoneFrame),
 * data-portal-overlay included so the Feedback button steps aside while it
 * is open. `error` shows above the buttons and keeps the sheet open.
 */
export default function ConfirmSheet({ text, confirmLabel, cancelLabel = 'Cancel', busy = false, error = null, cancelFirst = false, onConfirm, onClose }) {
  const textId = useId();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  const cancel = (
    <Button variant="outline" height={46} disabled={busy} autoFocus onClick={onClose} style={{ boxShadow: 'none', font: `600 14px ${font.body}` }}>{cancelLabel}</Button>
  );
  return (
    <div
      data-portal-overlay=""
      onClick={busy ? undefined : onClose}
      style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 5 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={textId}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: color.surface, borderTop: `1px solid ${color.border}`, borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`, padding: '22px 22px 26px' }}
      >
        <div id={textId} style={{ font: `500 16px/1.45 ${font.body}`, color: color.text }}>{text}</div>
        {error ? <Body size={12} tone={color.error} style={{ marginTop: 10 }}>{error}</Body> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {cancelFirst ? cancel : null}
          <Button height={48} loading={busy} onClick={onConfirm} style={{ boxShadow: 'none' }}>{confirmLabel}</Button>
          {cancelFirst ? null : cancel}
        </div>
      </div>
    </div>
  );
}
