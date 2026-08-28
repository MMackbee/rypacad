import React from 'react';
import { color, font, glow, radius } from '../tokens';

/**
 * Global chrome — 390pt x 812px. Content area scrolls; header and bottom tab
 * bar are fixed.
 *
 * The frame is the review harness, not the shipping shell: on a real device the
 * app fills the viewport. `bare` renders the same layout without the device
 * bezel so a screen can be dropped straight into a full-viewport route.
 */
export default function PhoneFrame({
  width = 390,
  height = 812,
  bare = false,
  header,
  footer,
  children,
  style,
}) {
  // Bare mode is the shipping shell: the app fills the viewport. It sizes to
  // the dynamic viewport rather than 100% because the ancestors (.App, body)
  // have auto height — 100% against those collapses instead of filling, and
  // dvh also accounts for mobile browser chrome showing and hiding.
  //
  // Capped at a phone-ish column on wide viewports: these screens are
  // phone-native by intent (the handoff is explicit that 07 and 13 must not be
  // re-laid-out for desktop), and unconstrained they stretch a month grid
  // across 1400px, which is how the contract calendar ended up with
  // 190px-square day cells in desktop testing.
  const frame = bare
    ? {
        width: '100%',
        maxWidth: 430,
        margin: '0 auto',
        height: '100dvh',
        minHeight: '100vh',
        background: color.bg,
      }
    : {
        width,
        height,
        background: color.bg,
        border: `1px solid ${color.border}`,
        borderRadius: radius.frame,
        boxShadow: glow.heroCard,
      };

  return (
    <div style={{ ...frame, overflow: 'hidden', display: 'flex', flexDirection: 'column', ...style }}>
      {bare ? null : <StatusBar />}
      {header ? <div style={{ flex: 'none' }}>{header}</div> : null}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          scrollbarWidth: 'thin',
          scrollbarColor: `${color.rule} transparent`,
        }}
      >
        {children}
      </div>
      {footer ? <div style={{ flex: 'none' }}>{footer}</div> : null}
    </div>
  );
}

/** Time at left, placeholder glyphs at right. Cosmetic — review harness only. */
export function StatusBar({ time = '9:41' }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '13px 22px 4px',
        font: `500 12px ${font.body}`,
        color: color.text,
        flex: 'none',
      }}
    >
      <span>{time}</span>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <div style={{ width: 15, height: 8, border: `1px solid ${color.mutedText}`, borderRadius: 2 }} />
      </div>
    </div>
  );
}
