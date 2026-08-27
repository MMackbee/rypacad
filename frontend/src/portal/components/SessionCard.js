import React from 'react';
import { color, font, glow, radius, tint } from '../tokens';
import TypeChip from './TypeChip';

/**
 * Session card — screens 03, 04, 05, 08, 12.
 *
 * Spec: time gutter, 1px rule, then type chip -> name -> meta. The gutter and
 * rule heights shift slightly by screen (52/54/56px gutter, 36/44px rule), so
 * both are props; everything else is fixed.
 *
 * The type chip is not optional. A tournament and a training block carry
 * different expectations for a family, and the chip is the only thing that
 * separates them at a glance.
 */

const VARIANTS = {
  default: { background: color.surface, border: `1px solid ${color.border}` },
  live: {
    background: color.surface,
    border: `1px solid ${color.primary}`,
    boxShadow: glow.liveCard,
  },
  tournament: { background: color.surface, border: `1px solid ${tint.yellowBorder}` },
  cancelled: { background: color.surface, border: `1px solid ${color.border}`, opacity: 0.65 },
  full: { background: color.dimmed, border: `1px solid ${color.rule}` },
  closed: { background: color.dimmed, border: `1px solid ${color.ruleFaint}` },
};

/**
 * @param {string} time      "4:00"
 * @param {string} meridiem  "PM"
 * @param {'training'|'tournament'|'cancelled'|'makeup'|'diagnostic'} type
 * @param {string} name      Rotation name, e.g. "The Lab"
 * @param {string} meta      "Sim 2 · Luke"
 * @param {React.ReactNode} trailing  Status badge or capacity pill.
 * @param {React.ReactNode} footnote  Expanded note, separated by a rule.
 * @param {React.ReactNode} action    In-card control (12's "Start roster"),
 *                                    rendered below the row without a rule.
 * @param {React.ReactNode} spendNote Which allowance pool this slot spends (05).
 *                                    Sits under the meta line so the cost is
 *                                    visible before the athlete commits.
 */
export default function SessionCard({
  time,
  meridiem = 'PM',
  type = 'training',
  name,
  meta,
  variant = 'default',
  trailing,
  footnote,
  action,
  spendNote,
  gutter = 52,
  ruleHeight = 36,
  nameSize = 14,
  onClick,
  style,
}) {
  const v = VARIANTS[variant] || VARIANTS.default;
  const struck = variant === 'cancelled';

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: radius.card,
        padding: '14px 15px',
        ...v,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <div style={{ width: gutter, flex: 'none' }}>
          <div
            style={{
              font: `700 17px ${font.body}`,
              color: color.text,
              textDecoration: struck ? 'line-through' : 'none',
            }}
          >
            {time}
          </div>
          <div style={{ font: `400 10px ${font.body}`, color: color.textTertiary }}>
            {meridiem}
          </div>
        </div>

        <div
          style={{
            width: 1,
            height: ruleHeight,
            background: color.border,
            flex: 'none',
            marginRight: 13,
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <TypeChip type={type} style={{ marginBottom: 6 }} />
          <div
            style={{
              font: `600 ${nameSize}px ${font.body}`,
              color: color.text,
              textDecoration: struck ? 'line-through' : 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
          {meta ? (
            <div
              style={{
                font: `400 11px ${font.body}`,
                color: color.textTertiary,
                marginTop: 3,
              }}
            >
              {meta}
            </div>
          ) : null}
          {spendNote}
        </div>

        {trailing ? <div style={{ flex: 'none', marginLeft: 10 }}>{trailing}</div> : null}
      </div>

      {footnote ? (
        <div
          style={{
            borderTop: `1px solid ${color.rule}`,
            marginTop: 12,
            paddingTop: 11,
            font: `400 11px/1.5 ${font.body}`,
            color: color.textSecondary,
          }}
        >
          {footnote}
        </div>
      ) : null}

      {action ? <div style={{ marginTop: 13 }}>{action}</div> : null}
    </div>
  );
}
