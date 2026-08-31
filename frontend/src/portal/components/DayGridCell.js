import React from 'react';
import { color, font } from '../tokens';

/**
 * Day grid cell — screens 07 (Commitment Contract), 09 (Athlete Detail), and
 * the Book a Session month calendar.
 *
 * The distinctions between states are load-bearing:
 *
 *   - `missed` is a contract day that went unlogged, and reads as a real miss
 *   - `weekend` is not a contract day at all, so it recedes furthest
 *   - `available` marks a day with bookable sessions on the booking calendar
 *
 * Weekend cells are deliberately recessive so the eye reads only contract
 * days.
 *
 * Sprint 5 pin (TEAM.md): the `closed` state is removed entirely. Kids
 * practice outside the academy, so a closure is not a reason a contract day
 * cannot be logged — closures matter to session booking only, where a day
 * with no bookable sessions now reads as plain `open`, never `closed`.
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
  /** Book a Session's month calendar: a day with bookable sessions. */
  available: {
    background: 'rgba(0,175,81,.12)',
    border: `1px solid ${color.primary}`,
    color: color.text,
    fontWeight: 600,
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

/** Legend, so a missed day is never ambiguous with an ordinary open one. */
export function DayGridLegend() {
  const items = [
    ['logged', 'Logged'],
    ['missed', 'Missed'],
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
