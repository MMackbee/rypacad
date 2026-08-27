import React from 'react';
import { color, font, radius, tint } from '../tokens';

/**
 * Day grid cell - screens 07 (Commitment Contract) and 09 (Athlete Detail).
 *
 * Four states, and "closed" is not the same as "open but not logged": a holiday
 * closure must never count against a contract, and showing it as a missed day
 * is the fastest way to generate a support text.
 *
 * @param {'logged'|'open'|'closed'|'future'} state
 */
export default function DayGridCell({ state = 'open', day, size = 38 }) {
  const states = {
    logged: { background: color.primary, border: `1px solid ${color.primary}`, color: '#000' },
    open: { background: 'transparent', border: `1px solid ${color.controlBorder}`, color: color.textSecondary },
    closed: { background: color.dimmed, border: `1px dashed ${color.rule}`, color: color.faintText },
    future: { background: 'transparent', border: `1px solid ${color.rowRule}`, color: color.mutedText },
  };

  return (
    <div
      title={state}
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        display: 'grid',
        placeItems: 'center',
        font: `600 12px ${font.body}`,
        ...states[state],
      }}
    >
      {day}
    </div>
  );
}

/** Month grid. Read-only on 07 - a past day opens a sheet rather than toggling. */
export function DayGrid({ days = [], onSelectDay }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
      {days.map((d) => (
        <div key={d.day} onClick={() => onSelectDay && onSelectDay(d)}>
          <DayGridCell state={d.state} day={d.day} />
        </div>
      ))}
    </div>
  );
}

/** Legend, so "closed" reading as "missed" is impossible on first look. */
export function DayGridLegend() {
  const items = [
    ['logged', 'Logged'],
    ['open', 'Not logged'],
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

/** Tint export kept so callers can match a sheet header to a cell state. */
export const DAY_TINTS = { logged: tint.green, closed: tint.red };
