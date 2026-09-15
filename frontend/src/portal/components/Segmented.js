import React from 'react';
import { color, font, radius } from '../tokens';

/**
 * Two-option segmented control — Upcoming/Past on My Schedule (04) and Family
 * Reservations (Sprint 11 pin F). Extracted verbatim from MySchedule.js's own
 * local `Segmented` (same markup, same behavior) so both screens share one
 * definition instead of two copies drifting apart — the same "share through
 * components/" instruction the Sprint 11 pin gives for Membership/Reservations
 * applies here too, since Reservations needs the identical control.
 *
 * @param {string} value  The active option's key.
 * @param {(key: string) => void} onChange
 * @param {[string, string][]} [options]  [key, label] pairs. Defaults to the
 *   Upcoming/Past pair every current caller uses.
 */
export default function Segmented({
  value,
  onChange,
  options = [
    ['upcoming', 'Upcoming'],
    ['past', 'Past'],
  ],
}) {
  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.control,
        padding: 3,
        display: 'flex',
      }}
    >
      {options.map(([key, label]) => {
        const on = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            style={{
              flex: 1,
              height: 38,
              border: 'none',
              borderRadius: radius.pill,
              background: on ? color.primary : 'transparent',
              font: `${on ? 600 : 500} 13px ${font.body}`,
              color: on ? '#000' : color.textTertiary,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
