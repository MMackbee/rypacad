import React from 'react';
import { color, font, radius, tint } from '../tokens';

/**
 * Session type chip. Part of the session card and never optional — the handoff
 * calls it out explicitly ("The type chip is not optional"), because tournament
 * and training blocks carry different expectations for a family and the chip is
 * the only thing that distinguishes them at a glance.
 */

const TYPES = {
  training: { label: 'Training', fg: color.textSecondary, bg: 'transparent', bd: color.border },
  tournament: { label: 'Tournament', fg: color.secondary, bg: tint.yellow, bd: tint.yellowBorder },
  cancelled: { label: 'Cancelled', fg: color.error, bg: tint.red, bd: tint.redBorder },
  makeup: { label: 'Makeup', fg: color.primary, bg: tint.green, bd: color.primary },
  diagnostic: { label: 'Diagnostic', fg: color.primary, bg: tint.green, bd: color.primary },
};

export default function TypeChip({ type = 'training', style }) {
  const t = TYPES[type] || TYPES.training;
  return (
    <span
      style={{
        font: `600 9px ${font.body}`,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        padding: '3px 7px',
        borderRadius: radius.badge,
        color: t.fg,
        background: t.bg,
        border: `1px solid ${t.bd}`,
        whiteSpace: 'nowrap',
        flex: 'none',
        ...style,
      }}
    >
      {t.label}
    </span>
  );
}
