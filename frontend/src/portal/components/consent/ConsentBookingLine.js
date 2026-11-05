import React from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../../tokens';
import { bookingLineFor } from '../../data/mentalConsent';

/** "Consent needed · Sign" (a link to the flow) or "Consent needed · <why not here>" under a 1:1 (spec 4.1). */
export default function ConsentBookingLine({ line }) {
  const navigate = useNavigate();
  if (!line) return null;
  const [lead, ...rest] = line.text.split(' · ');
  return (
    <span style={{ color: color.secondary }}>
      {line.href ? (
        <>
          {`${lead} · `}
          <button
            type="button"
            onClick={() => navigate(line.href)}
            style={{ background: 'none', border: 'none', padding: '16px 6px', margin: '-16px -6px', font: `600 11px ${font.body}`, color: color.primary, cursor: 'pointer' }}
          >
            {rest.join(' · ')}
          </button>
        </>
      ) : line.text}
    </span>
  );
}

/**
 * A SessionCard footnote for a booking row (plan Task 13): only a confirmed,
 * upcoming mental 1:1 whose athlete is not signed. Null otherwise, so the
 * screens keep their own footnote expression for every other row.
 */
export function consentBookingFootnote({ item, row, past }) {
  if (past || item?.type !== 'mental' || item?.status !== 'confirmed') return null;
  const line = bookingLineFor(row);
  return line ? <ConsentBookingLine line={line} /> : null;
}
