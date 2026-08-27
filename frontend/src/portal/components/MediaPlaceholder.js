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
export function Avatar({ size = 44, label, style }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        ...placeholder,
        display: 'grid',
        placeItems: 'center',
        font: `400 ${Math.max(8, Math.round(size / 4))}px ${font.mono}`,
        color: color.captionText,
        ...style,
      }}
    >
      {label}
    </div>
  );
}
