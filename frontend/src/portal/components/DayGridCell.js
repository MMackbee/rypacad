import React from 'react';
import { color, font } from '../tokens';

/**
 * Day grid cell — screens 07 (Commitment Contract) and 09 (Athlete Detail).
 *
 * Five states, and the distinctions between them are load-bearing:
 *
 *   - `missed` is a contract day that went unlogged, and reads as a real miss
 *   - `closed` is a day the Academy was shut. It must never look like a miss —
 *     a closure is not counted against an athlete, and showing it as one is the
 *     fastest way to generate a support text
 *   - `weekend` is not a contract day at all, so it recedes furthest
 *
 * Weekend and closure cells are deliberately recessive so the eye reads only
 * contract days.
 */

const STATES = {
  logged: {
    background: color.primary,
    border: `1px solid ${color.primary}`,
    color: '#000',
    fontWeight: 600,
  },
  missed: {
    background: 'rgba(255,68,68,.1)',
    border: '1px solid rgba(255,68,68,.45)',
    color: color.error,
    fontWeight: 500,
  },
  open: {
    background: color.dimmed,
    border: `1px solid ${color.ruleFaint}`,
    color: color.textTertiary,
    fontWeight: 500,
  },
  closed: {
    background: 'repeating-linear-gradient(45deg,#141414 0 3px,#1f1f1f 3px 6px)',
    border: `1px solid ${color.ruleFaint}`,
    color: color.faintText,
    fontWeight: 500,
  },
  weekend: {
    background: 'transparent',
    border: '1px solid #1c1c1c',
    color: '#3a3a3a',
    fontWeight: 500,
  },
};

export default function DayGridCell({ state = 'open', day, size, onClick }) {
  const s = STATES[state] || STATES.open;

  return (
    <div
      onClick={onClick}
      title={state}
      style={{
        ...(size ? { width: size, height: size } : { aspectRatio: '1' }),
        borderRadius: 6,
        display: 'grid',
        placeItems: 'center',
        font: `${s.fontWeight} 10px ${font.body}`,
        background: s.background,
        border: s.border,
        color: s.color,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {day}
    </div>
  );
}

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Monday-first month grid.
 *
 * Read-only by design: tapping a past day opens a sheet rather than editing
 * inline, so a mis-tap while walking cannot silently change a record.
 */
export function DayGrid({ days = [], onSelectDay }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 5 }}>
        {WEEKDAY_LETTERS.map((letter, i) => (
          <div
            key={`${letter}-${i}`}
            style={{
              textAlign: 'center',
              font: `500 10px ${font.body}`,
              color: i >= 5 ? '#4a4a4a' : color.textTertiary,
            }}
          >
            {letter}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
        {days.map((d) => (
          <DayGridCell
            key={d.day}
            state={d.state}
            day={d.day}
            onClick={
              onSelectDay && (d.state === 'missed' || d.state === 'logged')
                ? () => onSelectDay(d)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

/** Legend, so "closed" reading as "missed" is impossible on first look. */
export function DayGridLegend() {
  const items = [
    ['logged', 'Logged'],
    ['missed', 'Missed'],
    ['closed', 'Academy closed'],
  ];
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {items.map(([state, label]) => (
        <div key={state} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <DayGridCell state={state} size={14} />
          <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
