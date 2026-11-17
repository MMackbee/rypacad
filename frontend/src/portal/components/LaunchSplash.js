import React from 'react';

/*
 * The launch splash (speed work 2026-11-17): the same name and line as the
 * inline splash in public/index.html, which shows until React mounts. The
 * launch paths (the portal index, sign-in) render this while auth restores,
 * so the hand-off from the HTML splash to the first screen shows neither a
 * blank page nor a dimmed sign-in form. System fonts on purpose, like the
 * HTML one: the web fonts may not have arrived yet. Keep the two in step.
 */
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export default function LaunchSplash() {
  return (
    <div
      data-launch-splash=""
      role="status"
      aria-label="Loading RYP Academy"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        background: '#000000',
        color: '#FFFFFF',
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>RYP Academy</div>
      <div style={{ fontSize: 13, color: '#CCCCCC' }}>Reach Your Potential</div>
    </div>
  );
}
