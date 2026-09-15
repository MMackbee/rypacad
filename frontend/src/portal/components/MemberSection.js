import React from 'react';
import { color, font } from '../tokens';

/**
 * One household member's section header — Membership (D) and Reservations
 * (F), Sprint 11 pin. Both screens lay out "one section per household member,
 * in household order" and both need the exact same header treatment, so it is
 * shared here per the pin's own instruction ("Membership.js and Reservations.js
 * ... share via components/") rather than redrawn twice.
 *
 * Deliberately text-only, no avatar — neither screen's hook payload (useMembership,
 * useHouseholdReservations) carries an avatar image, and a placeholder circle
 * for every member would be visual noise repeated once per section for no
 * information gained.
 *
 * @param {string} name
 * @param {React.ReactNode} [trailing]  Right-aligned slot (Reservations has
 *   none today; Membership has none either — kept for the next caller rather
 *   than speculatively wired).
 */
export default function MemberSection({ name, trailing, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ font: `700 16px ${font.head}`, color: color.text, flex: 1, minWidth: 0 }}>
          {name}
        </span>
        {trailing}
      </div>
      {children}
    </div>
  );
}
