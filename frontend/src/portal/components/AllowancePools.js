import React from 'react';
import { color, font, radius } from '../tokens';

/**
 * The two-pool allowance display — screens 03, 04, 05, 08.
 *
 * Every package sells training sessions and tournament entries as two separate
 * monthly entitlements that do not substitute for each other. An athlete can
 * have training left with no tournament entries remaining, so a balance is
 * always two numbers. Showing one total is the bug this component exists to
 * prevent.
 *
 * Deliberately not built on <ProgressMeter>: that component's colour scale means
 * "on track / behind / no data" for contract completion and is documented as
 * never red. Consumption of an allowance is a different meaning — a spent pool
 * is a hard stop on booking — so it gets its own bar rather than overloading
 * one whose semantics do not apply.
 */

const POOLS = [
  { key: 'training', label: 'Training', noun: 'training sessions' },
  { key: 'tournaments', label: 'Tournaments', noun: 'tournament entries' },
];

/** Exhausted reads as a stop, matching the handoff's red "limit reached" tone. */
function toneFor(pool) {
  if (pool.left === 0) return color.error;
  if (pool.left === 1) return color.secondary;
  return color.primary;
}

/**
 * @param {object} allowance  From makeAllowance() in ../data/packages.
 * @param {boolean} compact   One line, for a dense card (08).
 */
export default function AllowancePools({ allowance, compact = false, style }) {
  if (!allowance) return null;

  if (compact) {
    return (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', ...style }}>
        {POOLS.map(({ key, label }) => {
          const pool = allowance[key];
          return (
            <span key={key} style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
              <span style={{ font: `600 12px ${font.body}`, color: toneFor(pool) }}>
                {pool.left}
              </span>{' '}
              {label.toLowerCase()} left
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11, ...style }}>
      {POOLS.map(({ key, label }) => {
        const pool = allowance[key];
        const tone = toneFor(pool);
        const pct = pool.limit ? (pool.used / pool.limit) * 100 : 0;

        return (
          <div key={key}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
              <span
                style={{
                  font: `500 11px ${font.body}`,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: color.textSecondary,
                  flex: 1,
                }}
              >
                {label}
              </span>
              <span style={{ font: `600 12px ${font.body}`, color: tone }}>
                {pool.left === 0 ? 'None left' : `${pool.left} left`}
              </span>
              <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
                {pool.used} of {pool.limit} used
              </span>
            </div>
            <div style={{ height: 6, background: color.track, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: 3 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The line a slot shows before the athlete commits: which pool it spends, and
 * what is left in that pool. The handoff update is explicit that this has to be
 * visible at the point of decision rather than discovered at submit.
 */
export function SpendNote({ pool, allowance }) {
  if (!allowance || !pool) return null;
  const p = allowance[pool];
  const noun = pool === 'tournaments' ? 'tournament entry' : 'training session';
  const tone = p.left === 0 ? color.error : color.textTertiary;

  return (
    <span
      style={{
        display: 'inline-block',
        marginTop: 6,
        font: `500 10px ${font.body}`,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
        color: tone,
        border: `1px solid ${p.left === 0 ? color.error : color.ruleFaint}`,
        borderRadius: radius.badge,
        padding: '3px 7px',
      }}
    >
      {p.left === 0
        ? `No ${pool === 'tournaments' ? 'tournament entries' : 'training sessions'} left`
        : `Spends 1 ${noun} · ${p.left} left`}
    </span>
  );
}
