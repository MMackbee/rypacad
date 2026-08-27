import React from 'react';
import { color, font, radius, tint } from '../tokens';

/**
 * Status badge — appears on every screen.
 *
 * Spec: 9px semibold, .06em tracking, 4x8 padding, 5px radius.
 *
 * Flag 02 (handoff "Open Decisions"): green is assigned to both primary actions
 * and to success/on-track states, and on screen 07 they sit inches apart — a
 * green progress bar next to a green button reads as tappable. The scaffold's
 * rule is "solid green fill means tap; green outline or tint means status".
 *
 * That rule is enforced here rather than left to convention: this component has
 * no filled variant and cannot be made to render one. A solid green fill is
 * reachable only through <Button> and <CapacityPill>, both of which are tappable.
 * Do not add a `filled` prop.
 */

const TONES = {
  green: { fg: color.primary, bg: tint.green, bd: color.primary },
  yellow: { fg: color.secondary, bg: tint.yellow, bd: tint.yellowBorder },
  red: { fg: color.error, bg: tint.red, bd: tint.redBorder },
  neutral: { fg: color.textSecondary, bg: 'transparent', bd: color.border },
  muted: { fg: color.disabledText, bg: 'transparent', bd: color.ruleFaint },
};

/**
 * @param {'green'|'yellow'|'red'|'neutral'|'muted'} tone
 * @param {boolean} dashed  Absent / pending states use a dashed outline.
 */
export default function StatusBadge({ tone = 'neutral', dashed = false, children, style }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        font: `600 9px ${font.body}`,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        padding: '4px 8px',
        borderRadius: radius.badge,
        color: t.fg,
        background: dashed ? 'transparent' : t.bg,
        border: `1px ${dashed ? 'dashed' : 'solid'} ${t.bd}`,
        whiteSpace: 'nowrap',
        flex: 'none',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * Capacity pill on the booking slot list (05). This one *is* solid-filled when
 * available, because tapping it books the slot — which is exactly the
 * distinction flag 02 asks the build to hold.
 *
 * @param {'available'|'full'|'capped'} state
 */
export function CapacityPill({ state, children }) {
  const styles = {
    available: { background: color.primary, color: '#000', border: `1px solid ${color.primary}` },
    full: { background: tint.red, color: color.error, border: `1px solid ${tint.redBorder}` },
    capped: { background: 'transparent', color: color.mutedText, border: `1px solid ${color.ruleFaint}` },
  }[state] || {};

  return (
    <span
      style={{
        font: `600 9px ${font.body}`,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        padding: '4px 8px',
        borderRadius: radius.badge,
        whiteSpace: 'nowrap',
        flex: 'none',
        ...styles,
      }}
    >
      {children}
    </span>
  );
}
