import React from 'react';
import { color, font } from '../tokens';
import { Tick } from './Primitives';

/**
 * The shared "saved" confirmation toast (Sprint 10 pin F, TEAM.md: "a shared
 * components/SavedToast.js used by every save above").
 *
 * Lifted verbatim from Notification Preferences' own local SavedToast (the
 * only place this idiom existed before this sprint) rather than redrawn —
 * same green-tinted banner, same tick badge, same 13px/500 label. Every
 * screen that persists a real write (contract logging, diagnostic capture,
 * notification prefs, session notes, contract tier) renders this the same
 * way: mount it once the write settles, on a short timer or until the next
 * interaction — this component itself is stateless and always visible while
 * mounted, so the CALLER owns show/hide timing (matching how the original
 * NotificationPreferences toast was driven by `data.saved`).
 *
 * @param {string} [message]  Defaults to "Saved" — pass the specific copy
 *   ("Preferences saved", "Draft saved", "Note saved") a screen's own state
 *   change already describes.
 */
export default function SavedToast({ message = 'Saved', style }) {
  return (
    <div
      role="status"
      style={{
        background: 'rgba(0,175,81,.1)',
        border: `1px solid ${color.primary}`,
        borderRadius: 10,
        padding: '11px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        ...style,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: color.primary,
          display: 'grid',
          placeItems: 'center',
          flex: 'none',
        }}
      >
        <Tick size={9} />
      </span>
      <span style={{ font: `500 13px ${font.body}`, color: color.primary }}>{message}</span>
    </div>
  );
}
