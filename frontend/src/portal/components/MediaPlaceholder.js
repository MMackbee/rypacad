import React from 'react';
import { color, font, placeholder, radius } from '../tokens';

/**
 * Marks where real content lands — swing video, avatars, photography, the
 * newsletter body editor, the Stripe Elements iframe.
 *
 * The handoff is explicit that the striped treatment is a placeholder and must
 * not survive into production: "Do not recreate this. It marks where real
 * content goes." It is kept here so the scaffold is honest about what is
 * missing, and so every such gap is greppable by this one component name.
 */
export default function MediaPlaceholder({
  height = 96,
  caption,
  tone = 'default',
  round = false,
  style,
}) {
  const borderColor = tone === 'uploading' ? color.secondary : color.border;

  return (
    <div
      style={{
        height,
        width: '100%',
        ...placeholder,
        border: `1px dashed ${borderColor}`,
        borderRadius: round ? '50%' : radius.input,
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        padding: '0 12px',
        flex: 'none',
        ...style,
      }}
    >
      {caption ? (
        <div
          style={{
            font: `400 9px/1.4 ${font.mono}`,
            letterSpacing: '.06em',
            color: color.captionText,
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
}

/** Athlete avatar. Sizes used across the artboards: 32-48px. */
/**
 * The avatar slot. There are no profile photos yet, so this is a plain
 * circle with the initials when a name is given (2026-09-30: the striped
 * placeholder was showing on the live home screens), never the stripes.
 */
export function Avatar({ size = 44, label, name, style }) {
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        background: color.surface,
        border: `1px solid ${color.border}`,
        display: 'grid',
        placeItems: 'center',
        font: `600 ${Math.max(10, Math.round(size / 2.6))}px ${font.body}`,
        color: color.textTertiary,
        ...style,
      }}
    >
      {label ?? initials}
    </div>
  );
}
