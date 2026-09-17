import React from 'react';
import { color, font } from '../tokens';
import StatusBadge from './StatusBadge';
import { Body, Card, SectionLabel } from './Primitives';
import { useHouseholdsDirectory } from '../hooks/billing';

/**
 * "Households" on the Admin dashboard (contract v2.5, Sprint 17): every
 * household with its Stripe standing and its athletes' packages, each row
 * opening the staff view of that household's Billing hub — the same page
 * the parent sees, so a support call and the parent's screen never
 * disagree. Standing comes from households.membership (absent == active).
 */
const STANDING = {
  active: { tone: 'green', label: 'Active' },
  past_due: { tone: 'yellow', label: 'Past due' },
  lapsed: { tone: 'red', label: 'Lapsed' },
};

function Row({ household, last, onOpen }) {
  const standing = STANDING[household.status] || STANDING.active;
  const kids = household.athletes.length
    ? household.athletes.map((a) => `${a.name}${a.packageName ? ` · ${a.packageName}` : ''}`).join(', ')
    : 'No athletes linked';
  return (
    <button
      type="button"
      onClick={() => onOpen(household.id)}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: last ? 'none' : `1px solid ${color.ruleSoft}`,
        padding: '11px 2px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 13px ${font.body}`, color: color.text }}>{household.name || household.id}</div>
        <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>{kids}</div>
      </div>
      <StatusBadge tone={standing.tone}>{standing.label}</StatusBadge>
      <span aria-hidden="true" style={{ color: color.textTertiary }}>
        ›
      </span>
    </button>
  );
}

export default function HouseholdsCard({ onOpenHousehold }) {
  const { data, loading, error } = useHouseholdsDirectory();
  const rows = data ?? [];
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>Households · {loading ? '…' : rows.length}</SectionLabel>
      {error ? (
        <Body size={12} tone={color.error}>
          Households didn't load. Check your connection and try again.
        </Body>
      ) : loading ? (
        <Body size={12}>Loading…</Body>
      ) : rows.length === 0 ? (
        <Body size={12} tone={color.textTertiary}>
          No households yet.
        </Body>
      ) : (
        rows.map((h, i) => <Row key={h.id} household={h} last={i === rows.length - 1} onOpen={onOpenHousehold} />)
      )}
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 10 }}>
        Tap a household for its billing view — the same tokens and standing the parent sees.
      </Body>
    </Card>
  );
}
