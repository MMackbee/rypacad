import React, { useState } from 'react';
import { color, font, radius, tint } from '../../tokens';
import Button from '../Button';
import { Body, ScreenTitle } from '../Primitives';
import { nextPatch, validVersionLabel } from '../../data/assessmentSettings';

/** Why a new protocol version label cannot be used, or null. */
export function versionProblem(label, current) {
  if (!validVersionLabel(label)) return 'A version label looks like v1.2.1.';
  if (label === current) return `Use a new label, like ${nextPatch(current)}.`;
  return null;
}

/**
 * The protocol says any procedure change increments the version (spec
 * 4.6): saving one asks for the new label, the next patch suggested
 * (v1.2 -> v1.2.1). Results run under the old label are then flagged
 * cross-version, never silently compared. It never closes on failure.
 * The overlay carries data-portal-overlay so the Feedback button steps
 * aside while the sheet is open (hooks/feedback.js).
 */
export default function VersionSheet({ current, saving, error, onSave, onClose }) {
  const [label, setLabel] = useState(nextPatch(current));
  const problem = versionProblem(label.trim(), current);
  return (
    <div data-portal-overlay="" onClick={saving ? undefined : onClose} style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: color.surface, borderTop: `1px solid ${color.border}`, borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`, padding: '20px 22px 26px' }}>
        <ScreenTitle size={19}>New protocol version</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          This changes the procedure. The protocol says any procedure change increments the version, so results from here on are kept apart from {current} results.
        </Body>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, font: `500 11px ${font.body}`, color: color.textSecondary }}>
          Version label
          <input aria-label="New protocol version" value={label} maxLength={16} onChange={(e) => setLabel(e.target.value)}
            style={{ height: 44, background: color.track, border: `1px solid ${problem ? color.error : color.border}`, borderRadius: radius.input, color: color.text, font: `500 16px ${font.body}`, padding: '0 10px' }} />
        </label>
        {problem ? <Body size={12} tone={color.error} style={{ marginTop: 6 }}>{problem}</Body> : null}
        {error ? <Body size={12} tone={color.error} style={{ marginTop: 6 }}>{error}</Body> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <Button height={50} loading={saving} disabled={Boolean(problem)} onClick={() => onSave(label.trim())}>Save as {label.trim()}</Button>
          <Button variant="outline" height={50} disabled={saving} style={{ boxShadow: 'none' }} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
