import React from 'react';
import { color, font, radius } from '../tokens';
import { Avatar } from './MediaPlaceholder';

/**
 * Athlete row — screens 08, 09, 12, 13, 15.
 *
 * Spec: avatar 40-44px, name at 15-16px, one line of meta. The trailing slot
 * takes a badge, an IN/OUT control pair, a progress meter, or a chevron.
 * Screen 12's "needs a conversation" list uses a 32px avatar.
 */
export default function AthleteRow({
  name,
  meta,
  metaTone,
  avatarSize = 44,
  nameSize = 16,
  trailing,
  divider = false,
  onClick,
  children,
  style,
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: divider ? '11px 0' : 0,
        borderBottom: divider ? `1px solid ${color.rowRule}` : 'none',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <Avatar size={avatarSize} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            font: `600 ${nameSize}px ${font.body}`,
            color: color.text,
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
              color: metaTone || color.textTertiary,
              marginTop: 2,
            }}
          >
            {meta}
          </div>
        ) : null}
        {children}
      </div>
      {trailing ? <div style={{ flex: 'none' }}>{trailing}</div> : null}
    </div>
  );
}

/**
 * Attendance control pair (13) — the critical measurement on the whole build.
 *
 * 64x48 per button with 7px between them: above the 44px floor with room for a
 * gloved or cold hand in a loud facility.
 *
 * Three states per athlete, not two. Unmarked must stay distinct from absent —
 * collapsing them is what produces bad no-show data. Tapping the active button
 * again clears the mark, so there is no undo bar to hunt for.
 *
 * @param {'in'|'out'|null} value
 * @param {(next: 'in'|'out'|null) => void} onChange
 */
export function AttendanceControls({ value, onChange }) {
  const base = {
    width: 64,
    height: 48,
    borderRadius: radius.control,
    font: `700 13px ${font.body}`,
    letterSpacing: '.04em',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
  };

  const styleFor = (key, activeBg) =>
    value === key
      ? { ...base, background: activeBg, border: `1.5px solid ${activeBg}`, color: '#000' }
      : {
          ...base,
          background: 'transparent',
          border: `1.5px solid ${color.controlBorder}`,
          color: color.textSecondary,
        };

  // Tapping the active button clears it back to unmarked.
  const toggle = (key) => onChange(value === key ? null : key);

  return (
    <div style={{ display: 'flex', gap: 7 }}>
      <button
        type="button"
        aria-pressed={value === 'in'}
        onClick={() => toggle('in')}
        style={styleFor('in', color.primary)}
      >
        IN
      </button>
      <button
        type="button"
        aria-pressed={value === 'out'}
        onClick={() => toggle('out')}
        style={styleFor('out', color.error)}
      >
        OUT
      </button>
    </div>
  );
}
