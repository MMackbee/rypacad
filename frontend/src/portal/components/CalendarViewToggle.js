import React from 'react';
import { color, font, radius } from '../tokens';

const OPTIONS = [
  ['month', 'Month'],
  ['week', 'Week'],
];

/**
 * The one Month/Week switch every calendar carries (owner request
 * 2026-09-30) - Segmented.js's look scaled down to sit in a card's header
 * row. About 120px wide, so it fits a 375px phone.
 *
 * Native buttons give Tab, Enter and Space for free; the active option is
 * exposed through aria-pressed, the CalendlyPanel precedent. The focus
 * outline is left to the browser. Tapping the active option does nothing.
 *
 * @param {'month'|'week'} value
 * @param {(view: 'month'|'week') => void} onChange
 */
export default function CalendarViewToggle({ value, onChange }) {
  return (
    <div
      role="group"
      aria-label="Calendar view"
      style={{
        display: 'inline-flex',
        border: `1px solid ${color.border}`,
        borderRadius: radius.control,
        padding: 2,
        background: color.surface,
      }}
    >
      {OPTIONS.map(([key, label]) => {
        const on = key === value;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (!on && onChange) onChange(key);
            }}
            style={{
              height: 32,
              padding: '0 12px',
              border: 'none',
              borderRadius: radius.pill,
              background: on ? color.primary : 'transparent',
              font: `${on ? 600 : 500} 12px ${font.body}`,
              color: on ? '#000' : color.textTertiary,
              cursor: on ? 'default' : 'pointer',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
