import React, { useEffect, useRef, useState } from 'react';
import { color, font, radius } from '../../tokens';
import { parseText, parseTrial, rangeLabel } from '../../data/assessmentInput';

const inputStyle = (invalid, width) => ({
  width,
  height: 44,
  boxSizing: 'border-box',
  background: color.track,
  border: `1px solid ${invalid ? color.error : color.border}`,
  borderRadius: radius.input,
  font: `600 16px ${font.body}`, // 16px: no iOS zoom on focus
  color: color.text,
  padding: '0 10px',
  outline: 'none',
});

/**
 * One typed trial (spec 5: "Every entry saves as typed"). The text stays as
 * the coach typed it; on blur or Enter it is parsed - a comma decimal is a
 * decimal point, a unit or any other character is refused - and checked
 * against the range firestore.rules enforces. A refusal shows under the field
 * and is NEVER sent, so a typo cannot fail the section's save and drop the
 * trials typed beside it. A valid value reaches `onCommit` only when it
 * differs from the stored one.
 */
export default function TrialInput({ label, value, rangeKey, onCommit, disabled = false, width = 84 }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const [error, setError] = useState(null);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(value == null ? '' : String(value));
  }, [value]);

  const commit = () => {
    editing.current = false;
    const parsed = parseTrial(text, rangeKey);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    if (parsed.value !== (value ?? null)) onCommit(parsed.value);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width }}>
      <input
        aria-label={label}
        aria-invalid={error ? 'true' : undefined}
        inputMode="decimal"
        placeholder={rangeLabel(rangeKey)}
        value={text}
        disabled={disabled}
        onFocus={() => { editing.current = true; }}
        onChange={(e) => { editing.current = true; setText(e.target.value); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ ...inputStyle(Boolean(error), '100%'), textAlign: 'right' }}
      />
      {error ? <span role="alert" style={{ font: `400 11px/1.3 ${font.body}`, color: color.error }}>{error}</span> : null}
    </div>
  );
}

/** Typed text (device id, driver, golf volume): trimmed, capped at `max`, committed on blur; blank is null. */
export function TextEntry({ label, value, max = 40, onCommit, disabled = false }) {
  const [text, setText] = useState(value ?? '');
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(value ?? '');
  }, [value]);
  const commit = () => {
    editing.current = false;
    const next = parseText(text, max);
    if (next !== (value ?? null)) onCommit(next);
  };
  return (
    <input
      aria-label={label}
      value={text}
      maxLength={max}
      disabled={disabled}
      onFocus={() => { editing.current = true; }}
      onChange={(e) => { editing.current = true; setText(e.target.value); }}
      onBlur={commit}
      style={inputStyle(false, '100%')}
    />
  );
}
