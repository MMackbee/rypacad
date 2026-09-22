import React from 'react';
import { color, font, radius, tint } from '../tokens';

/**
 * The suggested age group for a training block (owner ruling, 2026-09-22).
 *
 * A HINT, not a rule: booking is not age-gated anywhere, any athlete may book
 * any block, and the group never changes what a booking costs. The copy says
 * "suggested" out loud in the tooltip and in the legend beside the list, so a
 * parent is never left thinking their kid was turned away from a block.
 *
 * Colour is deliberately redundant. The chip always prints "13+" or "U13", so
 * the meaning survives colour blindness, a greyscale screenshot and sunlight;
 * the hue is there to make the two groups separable at a glance while scanning
 * a day's blocks. Sizes match TypeChip, which it sits beside.
 *
 * Renders nothing when `group` is null - which is what `ageGroupFor()` returns
 * for tournaments, specialist sessions, Friday and Saturday, and any block the
 * owner has not mapped. An unmapped block shows no hint rather than a guess.
 */

const STYLES = {
  older: { fg: color.ageOlder, bg: tint.ageOlder, bd: tint.ageOlderBorder },
  younger: { fg: color.ageYounger, bg: tint.ageYounger, bd: tint.ageYoungerBorder },
};

export default function AgeGroupChip({ group, style }) {
  if (!group) return null;
  const s = STYLES[group.id];
  if (!s) return null;

  return (
    <span
      title={`Suggested for ${group.label.toLowerCase()} — any athlete may book any block`}
      style={{
        font: `600 9px ${font.body}`,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        padding: '3px 7px',
        borderRadius: radius.badge,
        color: s.fg,
        background: s.bg,
        border: `1px solid ${s.bd}`,
        whiteSpace: 'nowrap',
        flex: 'none',
        ...style,
      }}
    >
      {group.short}
    </span>
  );
}

/**
 * The one-line key that sits above a day's blocks, so the colours are
 * explained where a family is actually choosing rather than in a help page.
 */
export function AgeGroupLegend({ style }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        font: `400 11px ${font.body}`,
        color: color.textTertiary,
        ...style,
      }}
    >
      <AgeGroupChip group={{ id: 'older', label: '13 & up', short: '13+' }} />
      <span>13 &amp; up</span>
      <AgeGroupChip group={{ id: 'younger', label: 'Under 13', short: 'U13' }} />
      <span>Under 13</span>
      <span style={{ color: color.mutedText }}>· suggested only, any block can be booked</span>
    </div>
  );
}
