import React from 'react';
import { color, font, radius } from '../tokens';
import StatusBadge from './StatusBadge';
import { SectionLabel } from './Primitives';
import useRememberedOpen from '../hooks/rememberedOpen';

/** Where the open/closed choice lives on this device: '1' open, '0' closed. */
export const OUTSTANDING_OPEN_KEY = 'ryp.admin.outstandingOpen';
const ROWS_ID = 'outstanding-rows';

/**
 * The five kinds of row the live dashboard builds, in the order the summary
 * reads them. Fitness (owner 2026-11-13: a fitness session with no golf
 * beside it) follows Attendance.
 */
const TAG_ORDER = ['Enrollment', 'Attendance', 'Fitness', 'Contract', 'Assessment'];

/**
 * The folded card's one-line summary: each tag with rows, as `<Tag> <count>`,
 * joined with ' · ' (e.g. "Enrollment 1 · Attendance 4 · Assessment 28").
 * A tag outside the five (the seed's Billing row) follows them in the order
 * first seen, so the counts always add up to the heading's N. '' for no rows.
 */
export function outstandingSummary(items) {
  const counts = new Map(TAG_ORDER.map((tag) => [tag, 0]));
  for (const item of items ?? []) {
    const tag = item?.tag || 'Other';
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n > 0)
    .map(([tag, n]) => `${tag} ${n}`)
    .join(' · ');
}

/** SectionLabel's look on a span, since a button holds no block elements. */
const headingStyle = {
  display: 'block',
  font: `600 10px ${font.body}`,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: color.error,
};

/**
 * The named list, first - "Outstanding · N" on the Admin dashboard, for owner
 * and ops alike.
 *
 * Owner 2026-11-13: early in the season nearly every athlete has a "Baseline
 * due" row, and the list took over the screen. The card now folds to one
 * tappable line - the count, a summary by tag and a chevron - and tapping it
 * opens the rows exactly as before. It starts closed the first time, and the
 * choice is remembered on the device (hooks/rememberedOpen.js). With no rows
 * the card is today's plain label: nothing to fold.
 *
 * `items` are the rows after the screen's tier filter and contract gate, so
 * the heading, the summary and the rows always agree.
 *
 * Sprint 5 pin: athlete names become links to /portal/athlete/:id, where
 * contact info lives. Wired defensively - `item.athleteId` does not exist on
 * the seed rows yet (data/admin.js is the db lane's; OUTSTANDING only carries
 * `who` as free text, and several rows name a household or a group, not one
 * athlete) - so a row renders as a link only once an id is present, and stays
 * plain text otherwise.
 */
export default function OutstandingCard({ items, onOpenAthlete }) {
  const [open, toggle] = useRememberedOpen(OUTSTANDING_OPEN_KEY, false);
  const label = `Outstanding · ${items.length}`;

  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.error}`,
        borderRadius: radius.cardLarge,
        padding: 17,
      }}
    >
      {items.length === 0 ? (
        <SectionLabel tone={color.error} style={{ marginBottom: 6 }}>
          {label}
        </SectionLabel>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={ROWS_ID}
          style={{
            width: '100%',
            minHeight: 44,
            background: 'none',
            border: 'none',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={headingStyle}>{label}</span>
            <span
              style={{
                display: 'block',
                font: `400 11px/1.5 ${font.body}`,
                color: color.textSecondary,
                marginTop: 3,
              }}
            >
              {outstandingSummary(items)}
            </span>
          </span>
          <span aria-hidden="true" style={{ font: `500 12px ${font.body}`, color: color.textTertiary }}>
            {open ? '▴' : '▾'}
          </span>
        </button>
      )}

      {open && items.length > 0 ? (
        <div id={ROWS_ID}>
          {items.map((item, i) => (
            <OutstandingRow
              key={item.id}
              item={item}
              last={i === items.length - 1}
              onOpenAthlete={onOpenAthlete}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OutstandingRow({ item, last, onOpenAthlete }) {
  const linkable = onOpenAthlete && item.athleteId;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '13px 0',
        borderBottom: last ? 'none' : `1px solid ${color.ruleSoft}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {linkable ? (
          <button
            type="button"
            onClick={() => onOpenAthlete(item.athleteId)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              font: `600 13px ${font.body}`,
              color: color.primary,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {item.who}
          </button>
        ) : (
          <div style={{ font: `600 13px ${font.body}`, color: color.text }}>{item.who}</div>
        )}
        <div style={{ font: `400 11px/1.5 ${font.body}`, color: color.textSecondary, marginTop: 3 }}>
          {item.why}
        </div>
      </div>
      <StatusBadge tone={item.tone}>{item.tag}</StatusBadge>
    </div>
  );
}
