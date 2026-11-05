import React from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font, radius } from '../../tokens';
import { familyLine } from '../../data/mentalConsent';

/** The line's small action: a 44px target that never opens the card it sits on. */
export const lineButton = {
  flex: 'none', minHeight: 44, padding: '0 14px', borderRadius: radius.input, border: `1px solid ${color.border}`, background: 'transparent',
  font: `600 13px ${font.body}`, color: color.primary, cursor: 'pointer',
};

/**
 * "Mental performance consent · {text}" and its action (spec 4.1, plan Task
 * 13): Sign now, Continue, Start again, Change choices or Stop recording,
 * each opening its href; no button when this login has nothing to do. On
 * the family screen's athlete card, AthleteDetail and the athlete's home.
 * Main bundle: no form text here.
 */
export default function ConsentLine({ row, style }) {
  const navigate = useNavigate();
  if (!row) return null;
  const line = familyLine(row);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...style }}>
      <div style={{ flex: 1, minWidth: 0, font: `400 12px/1.5 ${font.body}`, color: color.textSecondary }}>
        {`Mental performance consent · ${line.text}`}
      </div>
      {line.href ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(line.href);
          }}
          style={lineButton}
        >
          {line.label}
        </button>
      ) : null}
    </div>
  );
}
