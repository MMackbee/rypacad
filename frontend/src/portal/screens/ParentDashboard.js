import React from 'react';
import { color, font } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter, { meterColor } from '../components/ProgressMeter';
import StatusBadge from '../components/StatusBadge';
import TypeChip from '../components/TypeChip';
import { Avatar } from '../components/MediaPlaceholder';
import AllowancePools from '../components/AllowancePools';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import { AlertGlyph, Body, Card, ErrorNotice, ScreenTitle } from '../components/Primitives';
import { useHousehold } from '../hooks';

/**
 * 08 · Parent Dashboard - parent.
 * States: One child, Three children, Payment issue flagged.
 *
 * Designed for two or three children, not one. Multi-child households are the
 * stated norm, and a layout that only looks right with a single card is the
 * wrong default.
 *
 * Sprint 5 pin (TEAM.md): "Link another athlete" moved to Settings
 * (NotificationPreferences.js) - it no longer renders here.
 *
 * @param {'one'|'three'|'payment'} variant
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 * @param {(athleteId: string) => void} [onOpenAthlete]  Each child card calls
 *   this with its own id - routing wires it to /portal/athlete/:athleteId.
 */
export default function ParentDashboard({
  variant = 'three',
  bare = false,
  onOpenAthlete,
  onRetry,
}) {
  const { data, loading, error } = useHousehold({ variant });
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
            {loading ? (
              // Sized like the date line + household name so nothing jumps.
              <>
                <SkeletonBar width={96} height={12} />
                <SkeletonBar width={168} height={24} style={{ marginTop: 8 }} />
              </>
            ) : (
              <>
                <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>{data?.date}</div>
                <ScreenTitle style={{ marginTop: 3 }}>{data?.name}</ScreenTitle>
              </>
            )}
          </div>
          <Avatar size={40} />
        </div>
      }
      footer={<BottomTabBar role="parent" active="home" />}
    >
      {loading ? (
        <HouseholdSkeleton />
      ) : error ? (
        <div style={{ padding: '0 22px 24px' }}>
          <ErrorNotice title="Family overview didn't load" onRetry={onRetry}>
            Your family's overview didn't load. Check your connection and try again.
          </ErrorNotice>
        </div>
      ) : (
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/*
          Billing is one household-level banner, not a per-child badge - the
          invoice belongs to the household, not to any one athlete. The per-child
          standing badge does flip to ON HOLD, because booking is what actually
          gets restricted.
        */}
        {flagged ? <PaymentBanner billing={billing} /> : null}

        {children.map((child) => (
          <ChildCard
            key={child.id}
            child={child}
            onHold={flagged}
            onOpen={onOpenAthlete ? () => onOpenAthlete(child.id) : undefined}
          />
        ))}
      </div>
      )}
    </PhoneFrame>
  );
}

/**
 * The loading layout in the loaded layout's geometry: two child cards at the
 * real card's 198px minimum — avatar row, rule, then the Next / Contract /
 * Left meta rows. No spinner — see components/Skeleton.js.
 */
function HouseholdSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading family overview"
      style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {[0, 1].map((i) => (
        <SkeletonCard key={i} large style={{ minHeight: 198 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SkeletonBar tone="raised" width={44} height={44} r="50%" />
            <div style={{ flex: 1 }}>
              <SkeletonBar tone="raised" width={104} height={13} />
              <SkeletonBar tone="raised" width={70} height={9} style={{ marginTop: 6 }} />
            </div>
            <SkeletonBar tone="raised" width={64} height={20} r={5} />
          </div>
          <div style={{ height: 1, background: color.rule, margin: '14px 0 13px' }} />
          {[0, 1, 2].map((row) => (
            <div key={row} style={{ display: 'flex', gap: 10, marginTop: row ? 12 : 0 }}>
              <SkeletonBar tone="raised" width={66} height={9} style={{ marginTop: 3 }} />
              <SkeletonBar tone="raised" width="55%" height={13} />
            </div>
          ))}
        </SkeletonCard>
      ))}
    </div>
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
function ChildCard({ child, onHold, onOpen }) {
  const standing = onHold
    ? { tone: 'red', label: 'On hold' }
    : child.standing;

  return (
    // The whole card opens the athlete's detail (09) - the handoff's flow has
    // 08's child cards leading there, and a card this dense has no room for a
    // separate affordance.
    <Card large onClick={onOpen} style={{ minHeight: 198 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 16px ${font.body}`, color: color.text }}>{child.name}</div>
          <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
            {child.ageLine}
          </div>
        </div>
        {/* Live cards carry honest nulls the seed never did (QA hotfix):
            no standing signal -> no badge, nothing booked -> plain copy. */}
        {standing ? (
          <StatusBadge tone={standing.tone} dashed={standing.dashed}>
            {standing.label}
          </StatusBadge>
        ) : null}
      </div>

      <div style={{ height: 1, background: color.rule, margin: '14px 0 13px' }} />

      <MetaRow label="Next">
        {child.next ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TypeChip type={child.next.type} />
              <span style={{ font: `600 13px ${font.body}`, color: color.text }}>
                {child.next.when}
              </span>
            </div>
            <div style={{ font: `400 11px ${font.body}`, color: color.textSecondary, marginTop: 4 }}>
              {child.next.meta}
            </div>
          </>
        ) : (
          <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
            Nothing booked yet
          </span>
        )}
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
        {child.allowance ? (
          <AllowancePools allowance={child.allowance} compact />
        ) : (
          <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>—</span>
        )}
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
