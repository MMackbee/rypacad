import React from 'react';
import { color, font } from '../tokens';
import Button from './Button';
import { Body, Card, SectionLabel } from './Primitives';
import { SEASON_LINK, whatsNextFor } from '../data/whatsNext';

/**
 * "What's next" under "Payment received" (owner decision 2026-09-30),
 * rendered by PaymentConfirming in its confirmed state only, for the paid
 * athlete. Nothing is stored: it lives until the page is left. The words and
 * the choice are data/whatsNext.js; this only lays them out. Book and the
 * season link hide when the screen has nowhere to send them.
 */
export default function WhatsNextCard({ packageId, product, athlete, self = false, selfManaged = false, facilityDue = false, onBook, onSeason, style }) {
  const host = typeof window !== 'undefined' ? window.location.host : '';
  const next = whatsNextFor({ packageId, product, athlete, self, selfManaged, host, facilityDue });
  if (!next) return null;
  return (
    <Card tone="green" style={style}>
      <SectionLabel tone={color.primary}>{next.title}</SectionLabel>
      {next.lines.map((line) => (
        <Body key={line} size={13} tone={color.text} style={{ marginTop: 6 }}>
          {line}
        </Body>
      ))}
      {next.book && onBook ? (
        <Button height={46} style={{ marginTop: 14 }} onClick={onBook}>
          {next.book}
        </Button>
      ) : null}
      {next.season && onSeason ? (
        <button
          type="button"
          onClick={onSeason}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            marginTop: 12,
            font: `500 13px ${font.body}`,
            color: color.primary,
            cursor: 'pointer',
          }}
        >
          {SEASON_LINK} ›
        </button>
      ) : null}
    </Card>
  );
}
