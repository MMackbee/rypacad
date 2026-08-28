import React from 'react';
import { color, radius } from '../tokens';

/**
 * Loading skeletons — the list-load pattern for screens 03, 04, 05, 08.
 *
 * The handoff's spinner is a button-level treatment for an action the member
 * just took ("Signing in", "Reserving…"). A list that is still fetching is not
 * an action, so it never spins: it renders surface-colored shapes in the
 * geometry of the loaded layout, and nothing jumps when data lands.
 *
 * Deliberately static. The design's only motion is `@keyframes spin`, and a
 * shimmering placeholder would put more animation on screen than the loaded
 * portal ever shows.
 *
 * Two fills:
 * - default: `color.surface` (#1A1A1A) — a shape sitting on the black page,
 *   standing in for a card or a header line.
 * - raised: one step lighter — a shape sitting *on* a surface card, standing
 *   in for text or a chip.
 */
const RAISED = '#242424';

/**
 * @param {number|string} width   e.g. 96 or '62%'
 * @param {number} height
 * @param {number|string} r       Border radius. '50%' makes an avatar circle.
 * @param {'raised'|undefined} tone  'raised' when the bar sits on a surface card.
 */
export function SkeletonBar({ width = '100%', height = 12, r = 4, tone, style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        flex: 'none',
        borderRadius: r,
        background: tone === 'raised' ? RAISED : color.surface,
        ...style,
      }}
    />
  );
}

/**
 * Card-shaped skeleton: same radius and padding as <Card>, so a stack of these
 * holds the loaded screen's rhythm. The hairline is `color.rule` rather than
 * `color.border` — 1px either way, so the size is identical, but quieter,
 * because a skeleton should read as "not yet" rather than compete with content.
 *
 * Children are usually raised <SkeletonBar>s in the loaded card's line pattern;
 * a bare `height` works when the inside does not matter.
 */
export default function SkeletonCard({ large = false, height, children, style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        borderRadius: large ? radius.cardLarge : radius.card,
        padding: large ? 17 : 15,
        background: color.surface,
        border: `1px solid ${color.rule}`,
        height,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A loading stand-in matching <SessionCard>'s geometry — time gutter, 1px rule,
 * then chip / name / meta lines. Gutter and rule heights are props for the same
 * reason they are on the real card: 04 and 05 size them differently.
 */
export function SkeletonSessionCard({ gutter = 52, ruleHeight = 36, style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        borderRadius: radius.card,
        padding: '14px 15px',
        background: color.surface,
        border: `1px solid ${color.rule}`,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: gutter, flex: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <SkeletonBar tone="raised" width={34} height={15} />
          <SkeletonBar tone="raised" width={20} height={8} />
        </div>
        <div
          style={{
            width: 1,
            height: ruleHeight,
            background: color.rule,
            flex: 'none',
            marginRight: 13,
          }}
        />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonBar tone="raised" width={64} height={17} r={radius.badge} />
          <SkeletonBar tone="raised" width="62%" height={12} />
          <SkeletonBar tone="raised" width="38%" height={9} />
        </div>
      </div>
    </div>
  );
}
