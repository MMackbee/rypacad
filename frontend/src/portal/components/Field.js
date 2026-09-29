import React from 'react';
import { color, font, radius } from '../tokens';
import { AlertGlyph } from './Primitives';

/**
 * Text field with the handoff validation pattern: inline, on blur, below the
 * field. The field border turns #FF4444 and a 14px circular "!" badge sits
 * beside the message.
 */
export default function Field({
  label,
  value,
  placeholder,
  error,
  hint,
  dimmed = false,
  type = 'text',
  trailing,
  onChange,
  onBlur,
  style,
}) {
  const borderColor = error ? color.error : dimmed ? color.rule : color.border;

  return (
    <div style={style}>
      {label ? (
        <div
          style={{
            font: `500 11px ${font.body}`,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: color.textSecondary,
            marginBottom: 7,
          }}
        >
          {label}
        </div>
      ) : null}

      <div
        style={{
          height: 52,
          background: dimmed ? color.dimmed : color.surface,
          border: `1px solid ${borderColor}`,
          borderRadius: radius.input,
          display: 'flex',
          alignItems: 'center',
          padding: '0 15px',
          gap: 10,
        }}
      >
        <input
          aria-label={label}
          type={type}
          value={value ?? ''}
          placeholder={placeholder}
          disabled={dimmed}
          onChange={(e) => onChange && onChange(e.target.value)}
          onBlur={onBlur}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            font: `400 15px ${font.body}`,
            color: dimmed ? color.mutedText : color.text,
          }}
        />
        {trailing}
      </div>

      {error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
          <AlertGlyph />
          <span style={{ font: `400 12px ${font.body}`, color: color.error }}>{error}</span>
        </div>
      ) : null}

      {hint && !error ? (
        <div
          style={{
            font: `400 11px/1.5 ${font.body}`,
            color: color.textTertiary,
            marginTop: 7,
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Select with the 8px CSS chevron the design uses (no icon set supplied yet).
 *
 * `options` accepts either plain strings (the existing callers — the value
 * shown IS the value stored, e.g. "Mother") or `{value, label}` objects
 * (Sprint 11 pin E's package pickers — a package id like 'g-8-3' needs to
 * store the id but display the catalogue name "8 + 3"). Both forms coexist
 * in the same array without a caller ever needing to normalize first.
 */
export function SelectField({ label, value, options = [], onChange, style }) {
  const normalized = options.map((o) => (typeof o === 'object' && o !== null ? o : { value: o, label: o }));
  return (
    <div style={style}>
      {label ? (
        <div
          style={{
            font: `500 11px ${font.body}`,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: color.textSecondary,
            marginBottom: 7,
          }}
        >
          {label}
        </div>
      ) : null}
      <div
        style={{
          height: 52,
          background: color.surface,
          border: `1px solid ${color.border}`,
          borderRadius: radius.input,
          display: 'flex',
          alignItems: 'center',
          padding: '0 15px',
        }}
      >
        <select
          aria-label={label}
          value={value ?? ''}
          onChange={(e) => onChange && onChange(e.target.value)}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            appearance: 'none',
            font: `400 15px ${font.body}`,
            color: value ? color.text : color.mutedText,
          }}
        >
          <option value="" disabled>
            Select
          </option>
          {normalized.map((o) => (
            <option key={o.value} value={o.value} style={{ background: color.surface }}>
              {o.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRight: `1.5px solid ${color.textTertiary}`,
            borderBottom: `1.5px solid ${color.textTertiary}`,
            transform: 'rotate(45deg)',
            marginBottom: 4,
            flex: 'none',
          }}
        />
      </div>
    </div>
  );
}
