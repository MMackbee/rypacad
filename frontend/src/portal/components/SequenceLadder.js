import React from 'react';
import { color, font, radius } from '../tokens';

/**
 * Sequence ladder - screen 10 (Billing), and any timed escalation.
 *
 * Flag 04 (handoff "Open Decisions"): Stripe retries a card three times across
 * ten days and then restricts booking. Four escalating states cannot all be
 * #FF4444 - a parent shown maximum alarm at retry 1 has learned to ignore it by
 * retry 3. So the ladder grades: caution -> amber-red -> red -> solid red, and
 * draws the ten-day sequence as rungs so the parent can see *where they are*
 * rather than infer it from a single banner colour.
 *
 * The amber-red mid value is `color.errorMid`, the one token this adds to the
 * brief. It is defined in tokens.js rather than inline here so it can be adopted
 * formally instead of living as a one-screen exception.
 */

/** Ordered escalation. Index maps to `step`. */
export const LADDER_TONES = [
  { key: 'scheduled', fg: color.textTertiary, bd: color.border, fill: 'transparent' },
  { key: 'retry1', fg: color.secondary, bd: color.secondary, fill: 'transparent' },
  { key: 'retry2', fg: color.errorMid, bd: color.errorMid, fill: 'transparent' },
  { key: 'retry3', fg: color.error, bd: color.error, fill: 'transparent' },
  { key: 'restricted', fg: '#000', bd: color.error, fill: color.error },
];

/**
 * @param {{label: string, detail?: string, step: number}[]} rungs
 * @param {number} current  Index of the rung the account is currently on.
 */
export default function SequenceLadder({ rungs = [], current = 0 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rungs.map((rung, i) => {
        const tone = LADDER_TONES[Math.min(rung.step, LADDER_TONES.length - 1)];
        const reached = i <= current;
        const isCurrent = i === current;
        const last = i === rungs.length - 1;

        return (
          <div key={rung.label} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: `2px solid ${reached ? tone.bd : color.rule}`,
                  background: reached ? tone.fill : 'transparent',
                  flex: 'none',
                }}
              />
              {last ? null : (
                <span
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: 22,
                    background: i < current ? tone.bd : color.rule,
                  }}
                />
              )}
            </div>

            <div style={{ paddingBottom: last ? 0 : 14, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  font: `${isCurrent ? 600 : 400} 13px ${font.body}`,
                  color: reached ? tone.fg : color.mutedText,
                }}
              >
                {rung.label}
              </div>
              {rung.detail ? (
                <div
                  style={{
                    font: `400 11px/1.5 ${font.body}`,
                    color: color.textTertiary,
                    marginTop: 2,
                  }}
                >
                  {rung.detail}
                </div>
              ) : null}
              {isCurrent ? (
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: 6,
                    font: `600 9px ${font.body}`,
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    color: tone.fg,
                    border: `1px solid ${tone.bd}`,
                    borderRadius: radius.badge,
                    padding: '3px 7px',
                  }}
                >
                  You are here
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
