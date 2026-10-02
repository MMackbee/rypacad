import React from 'react';
import { color, font } from '../tokens';
import StatusBadge from './StatusBadge';
import { reservedTag } from '../data/reserved';

/**
 * The handicap-reserved block's tag (owner ruling 2026-10-02), drawn once so
 * Book a Session and the staff lists cannot drift. The words and the rule are
 * data/reserved.js's - reservedTag(session) is null on an open session, and
 * then nothing here renders at all.
 */

/**
 * "Handicap 5 or better" beside the type chip, in that chip's size. A
 * status, never a control: an outline tint (StatusBadge), not a fill.
 *
 * @param {string|null} tag  reservedTag(session) - callers pass it, as they
 *   pass the age group, so the card never guesses from a split time.
 */
export function ReservedChip({ tag, style }) {
  if (!tag) return null;
  return (
    <StatusBadge tone="yellow" style={{ padding: '3px 7px', ...style }}>
      {tag}
    </StatusBadge>
  );
}

/**
 * Under the admin's block-fill bars: the week's reserved blocks, one row
 * each - a bar is a whole day, so the tag cannot ride on it. Rows are
 * useAdminDashboard's `reservedBlocks` ({ sessionId, day, time, maxHandicap,
 * booked, capacity }); none this week renders nothing.
 */
export function ReservedBlocks({ blocks, style }) {
  if (!blocks.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {blocks.map((b) => (
        <div key={b.sessionId} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ font: `500 12px ${font.body}`, color: color.textSecondary }}>
            {b.day} {b.time}
          </span>
          <ReservedChip tag={reservedTag(b)} />
          <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
            {b.booked} of {b.capacity} booked
          </span>
        </div>
      ))}
    </div>
  );
}
