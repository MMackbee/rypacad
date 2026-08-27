import React from 'react';
import { color } from '../tokens';

/**
 * Progress meter — screens 03, 06, 07, 08, 09, 14, 15.
 *
 * Spec: track #111, radius half the height. Height carries the weight:
 * 6px inline, 8px in a card, 10px as a hero.
 *
 * Colour is derived from the value, never passed in: green >= 80, yellow 40-79,
 * grey < 40. There is deliberately no red — a low meter is an athlete who is
 * behind, not an error, and colouring it red reads as a system fault.
 */

export const SIZES = { inline: 6, card: 8, hero: 10, thin: 5 };

/** Exported so callers can colour a matching percentage label consistently. */
export function meterColor(pct) {
  if (pct == null) return color.mutedText;
  if (pct >= 80) return color.primary;
  if (pct >= 40) return color.secondary;
  return color.mutedText;
}

/**
 * @param {number|null} value  0-100, or null for "no data".
 * @param {'inline'|'card'|'hero'|'thin'} size
 */
export default function ProgressMeter({ value, size = 'card', style }) {
  const h = SIZES[size] || SIZES.card;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={value == null ? undefined : pct}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        height: h,
        background: color.track,
        borderRadius: h / 2,
        overflow: 'hidden',
        width: '100%',
        ...style,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: meterColor(value),
          borderRadius: h / 2,
        }}
      />
    </div>
  );
}
