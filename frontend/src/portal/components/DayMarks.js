import React from 'react';
import { color, font, tint } from '../tokens';

/**
 * Booking-calendar day marks (owner ruling 2026-09-30): a tournament day in
 * yellow and a closed academy day in red, on Book a Session, Phil's booking
 * and the coach's Sessions tab, in both Month and Week. dayMarksFor
 * (data/calendarViews.js) derives them from sessions a hook already read;
 * this file is the one paint, copy and legend that WeekView, ContractCalendar
 * and the cards share, so the views cannot disagree.
 *
 * Colour is never the only signal: a tournament day carries a star and the
 * words "tournament day"; a closed day is struck through and says "Academy
 * closed" (title + screen-reader text); the legend names both. The yellow and
 * red are TypeChip's own tournament / cancelled pair. The Commitment Contract
 * never passes marks (Sprint 5: it has no closed state).
 */

/** Fill / outline / date colour per mark. Closed red on its fill over the card is ~4.6:1. */
export const MARK_PAINT = {
  tournament: { background: tint.yellow, borderColor: color.secondary, color: color.text },
  closed: { background: tint.redStrong, borderColor: tint.redBorder, color: color.error },
};

/** The screen-reader words that follow the date. */
export const MARK_SR_TEXT = { tournament: ', tournament day', closed: ', academy closed' };

export const CLOSED_TITLE = 'Academy closed';
export const TOURNAMENT_GLYPH = '★';

/** Visually hidden but still read aloud. */
export const SR_ONLY = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

function MarkChip({ mark }) {
  const p = MARK_PAINT[mark];
  return (
    <span
      aria-hidden="true"
      data-mark={mark}
      style={{
        width: 16,
        height: 16,
        flex: 'none',
        boxSizing: 'border-box',
        borderRadius: 4,
        display: 'grid',
        placeItems: 'center',
        background: p.background,
        border: `1px solid ${p.borderColor}`,
        color: p.color,
        font: `600 9px ${font.body}`,
        textDecoration: mark === 'closed' ? 'line-through' : 'none',
      }}
    >
      {mark === 'tournament' ? TOURNAMENT_GLYPH : '7'}
    </span>
  );
}

/**
 * The legend under a booking calendar, in both views. Always rendered (not
 * only when a mark is in view) so the card never jumps as the viewer pages.
 */
export function DayMarkLegend() {
  const items = [
    ['tournament', 'Tournament day'],
    ['closed', CLOSED_TITLE],
  ];
  return (
    <div className="ryp-day-mark-legend" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
      {items.map(([mark, label]) => (
        <div key={mark} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <MarkChip mark={mark} />
          <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
