import React from 'react';
import { color, font, glow, radius, tint } from '../tokens';

/**
 * The only place a solid green fill is allowed alongside <CapacityPill>.
 * See the flag-02 note in StatusBadge.js — solid green means tappable.
 *
 * Loading follows the handoff's button-level pattern: the spinner replaces the
 * label region and the label becomes a present participle ("Signing in").
 */

const VARIANTS = {
  primary: {
    background: color.primary,
    border: `1px solid ${color.primary}`,
    color: '#000',
    boxShadow: glow.buttonPrimary,
  },
  /** Pinned CTAs on 07 and 13 sit above content and carry more elevation. */
  pinned: {
    background: color.primary,
    border: `1px solid ${color.primary}`,
    color: '#000',
    boxShadow: glow.buttonPinned,
  },
  secondary: {
    background: color.surface,
    border: `1px solid ${color.border}`,
    color: color.text,
  },
  outline: {
    background: 'transparent',
    border: `1px solid ${color.border}`,
    color: color.text,
  },
  caution: {
    background: 'transparent',
    border: `1px solid ${color.secondary}`,
    color: color.secondary,
  },
  danger: {
    background: color.error,
    border: `1px solid ${color.error}`,
    color: '#000',
  },
  dangerOutline: {
    background: 'transparent',
    border: `1px solid ${color.error}`,
    color: color.error,
  },
  disabled: {
    background: '#1E1E1E',
    border: `1px solid ${color.border}`,
    color: color.faintText,
  },
};

export function Spinner({ size = 16, track = 'rgba(0,0,0,.25)', head = '#000' }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        border: `2px solid ${track}`,
        borderTopColor: head,
        // `spin` is already defined in ../../index.css and matches the design's
        // only piece of motion: rotate(360deg), 0.8s linear infinite.
        animation: 'spin .8s linear infinite',
        display: 'inline-block',
      }}
    />
  );
}

/**
 * @param {'primary'|'pinned'|'secondary'|'outline'|'caution'|'danger'|'dangerOutline'} variant
 * @param {boolean} loading  Renders a spinner; also disables the control.
 * @param {number} height    54 for a form CTA, 56 pinned, 46-50 inline.
 */
export default function Button({
  variant = 'primary',
  disabled = false,
  loading = false,
  height = 54,
  onClick,
  children,
  style,
  ...rest
}) {
  const isOff = disabled || loading;
  const base = isOff && disabled ? VARIANTS.disabled : VARIANTS[variant] || VARIANTS.primary;
  // The handoff's loading fill is rgba(0,175,81,.45) — tint.greenSoft (.09)
  // here left the black label unreadable over a near-black button.
  const dimmed = loading ? { background: tint.greenLoading, boxShadow: 'none' } : null;

  return (
    <button
      type="button"
      disabled={isOff}
      onClick={isOff ? undefined : onClick}
      style={{
        height,
        width: '100%',
        borderRadius: radius.input,
        font: `600 16px ${font.body}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        cursor: isOff ? 'default' : 'pointer',
        padding: '0 16px',
        ...base,
        ...(loading && variant === 'primary' ? dimmed : null),
        ...style,
      }}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      <span>{children}</span>
    </button>
  );
}
