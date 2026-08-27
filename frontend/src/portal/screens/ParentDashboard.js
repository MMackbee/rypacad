import React from 'react';
import { color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter, { meterColor } from '../components/ProgressMeter';
import StatusBadge from '../components/StatusBadge';
import TypeChip from '../components/TypeChip';
import { Avatar } from '../components/MediaPlaceholder';
import AllowancePools from '../components/AllowancePools';
import { AlertGlyph, Body, Card, ScreenTitle } from '../components/Primitives';
import { useHousehold } from '../hooks';
import { TODAY } from '../data/seed';

/**
 * 08 · Parent Dashboard - parent.
 * States: One child, Three children, Payment issue flagged.
 *
 * Designed for two or three children, not one. Multi-child households are the
 * stated norm, and a layout that only looks right with a single card is the
 * wrong default.
 *
 * @param {'one'|'three'|'payment'} variant
 */
export default function ParentDashboard({ variant = 'three', bare = false, onLinkAthlete }) {
  const { data } = useHousehold({ variant });
  const children = data?.children ?? [];
  const billing = data?.billing;
  const flagged = billing?.status === 'failed';

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div
          style={{
            padding: '8px 22px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>{TODAY}</div>
            <ScreenTitle style={{ marginTop: 3 }}>{data?.name}</ScreenTitle>
          </div>
          <Avatar size={40} />
        </div>
      }
      footer={<BottomTabBar role="parent" active="home" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/*
          Billing is one household-level banner, not a per-child badge - the
          invoice belongs to the household, not to any one athlete. The per-child
          standing badge does flip to ON HOLD, because booking is what actually
          gets restricted.
        */}
        {flagged ? <PaymentBanner billing={billing} /> : null}

        {children.map((child) => (
          <ChildCard key={child.id} child={child} onHold={flagged} />
        ))}

        {/* Hidden while billing is flagged - adding an athlete to a household
            that cannot pay for the ones it has is not the next step. */}
        {flagged ? null : (
          <button
            type="button"
            onClick={onLinkAthlete}
            style={{
              border: `1px dashed ${color.border}`,
              background: 'transparent',
              borderRadius: radius.card,
              padding: '15px 0',
              font: `500 13px ${font.body}`,
              color: color.primary,
              cursor: 'pointer',
            }}
          >
            + Link another athlete
          </button>
        )}
      </div>
    </PhoneFrame>
  );
}

function PaymentBanner({ billing }) {
  return (
    <div
      style={{
        background: 'rgba(255,68,68,.08)',
        border: `1px solid ${color.error}`,
        borderRadius: 14,
        padding: 15,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <AlertGlyph size={20} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 14px ${font.body}`, color: color.error }}>{billing.title}</div>
          <Body size={12} style={{ marginTop: 5 }}>
            {billing.body}
          </Body>
        </div>
      </div>
      <Button variant="danger" height={46} style={{ marginTop: 13 }}>
        Update payment method
      </Button>
    </div>
  );
}

/**
 * Fixed height regardless of how much data the child has, so a household scans a
 * consistent rhythm - next session, contract, standing - rather than three
 * differently shaped blocks. Nico has no contract data and the card still holds
 * its shape.
 */
function ChildCard({ child, onHold }) {
  const standing = onHold
    ? { tone: 'red', label: 'On hold' }
    : child.standing;

  return (
    <Card large style={{ minHeight: 198 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 16px ${font.body}`, color: color.text }}>{child.name}</div>
          <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
            {child.ageLine}
          </div>
        </div>
        <StatusBadge tone={standing.tone} dashed={standing.dashed}>
          {standing.label}
        </StatusBadge>
      </div>

      <div style={{ height: 1, background: color.rule, margin: '14px 0 13px' }} />

      <MetaRow label="Next">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TypeChip type={child.next.type} />
          <span style={{ font: `600 13px ${font.body}`, color: color.text }}>
            {child.next.when}
          </span>
        </div>
        <div style={{ font: `400 11px ${font.body}`, color: color.textSecondary, marginTop: 4 }}>
          {child.next.meta}
        </div>
      </MetaRow>

      <MetaRow label="Contract" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ProgressMeter value={child.contract} size="inline" />
          <span
            style={{
              width: 38,
              flex: 'none',
              textAlign: 'right',
              font: `600 12px ${font.body}`,
              color: meterColor(child.contract),
            }}
          >
            {child.contract == null ? '—' : `${child.contract}%`}
          </span>
        </div>
      </MetaRow>

      {/*
        Two numbers per child, not one. Reese is the case that makes this
        necessary: she has training sessions left but no tournament entries, and
        her next session is a tournament. A single balance would have read "2
        left" and hidden the conflict entirely.
      */}
      <MetaRow label="Left" style={{ marginTop: 12 }}>
        <AllowancePools allowance={child.allowance} compact />
      </MetaRow>
    </Card>
  );
}

function MetaRow({ label, children, style }) {
  return (
    <div style={{ display: 'flex', gap: 10, ...style }}>
      <div
        style={{
          width: 66,
          flex: 'none',
          font: `400 10px ${font.body}`,
          textTransform: 'uppercase',
          letterSpacing: '.1em',
          color: color.textTertiary,
          paddingTop: 3,
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
