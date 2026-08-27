import React from 'react';
import { color, font, radius } from '../tokens';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter from '../components/ProgressMeter';
import StatusBadge from '../components/StatusBadge';
import { Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useAdminDashboard } from '../hooks';

/**
 * 15 · Admin Dashboard (Ops) - Phil's monthly-check-in-call prep surface.
 * States: Populated, Filtered by tier.
 *
 * The screen has to answer one question: who needs a conversation this week.
 * So the named list sits above the counts. Metrics are context for the list,
 * not the point of the screen - a dashboard that leads with 117 enrolled and
 * 84% fill is a dashboard that has to be read before it is useful.
 *
 * The handoff notes this screen earns a desktop treatment; it is one of two
 * Phase 1 screens where a wider table genuinely beats a phone. Built
 * phone-first here, which the layout survives.
 *
 * @param {'populated'|'filtered'} variant
 */
export default function AdminDashboard({ variant = 'populated', bare = false }) {
  const { data } = useAdminDashboard({ variant });
  const filtered = variant === 'filtered';

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
            Week of Feb 15
          </div>
          <ScreenTitle size={24} style={{ marginTop: 3 }}>
            Who needs a call
          </ScreenTitle>
          <TierFilter filter={data?.filter} active={filtered} />
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <OutstandingCard items={data?.outstanding ?? []} />
        <MetricGrid metrics={data?.metrics} />
        <EnrollmentCard rows={data?.enrollment ?? []} total={data?.metrics?.enrolled} />
        <BlockFillCard bars={data?.blockFill ?? []} />
      </div>
    </PhoneFrame>
  );
}

function TierFilter({ filter, active }) {
  if (!filter) return null;
  return (
    <div
      style={{
        height: 42,
        marginTop: 14,
        background: color.surface,
        border: `1px solid ${active ? color.primary : color.border}`,
        borderRadius: radius.control,
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 10,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          flex: 1,
          font: `500 13px ${font.body}`,
          color: active ? color.primary : color.textSecondary,
        }}
      >
        {filter.label} · {filter.count} athletes
      </span>
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRight: `1.5px solid ${color.textTertiary}`,
          borderBottom: `1.5px solid ${color.textTertiary}`,
          transform: 'rotate(45deg)',
          marginBottom: 4,
        }}
      />
    </div>
  );
}

/** The named list, first. */
function OutstandingCard({ items }) {
  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.error}`,
        borderRadius: radius.cardLarge,
        padding: 17,
      }}
    >
      <SectionLabel tone={color.error} style={{ marginBottom: 6 }}>
        Outstanding · {items.length}
      </SectionLabel>

      {items.map((item, i) => (
        <div
          key={item.id}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '13px 0',
            borderBottom: i < items.length - 1 ? `1px solid ${color.ruleSoft}` : 'none',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `600 13px ${font.body}`, color: color.text }}>{item.who}</div>
            <div
              style={{ font: `400 11px/1.5 ${font.body}`, color: color.textSecondary, marginTop: 3 }}
            >
              {item.why}
            </div>
          </div>
          <StatusBadge tone={item.tone}>{item.tag}</StatusBadge>
        </div>
      ))}
    </div>
  );
}

function MetricGrid({ metrics }) {
  if (!metrics) return null;
  const stats = [
    [metrics.enrolled, metrics.enrolledLabel],
    [metrics.fill, metrics.fillLabel],
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {stats.map(([value, label]) => (
        <Card key={label}>
          <div style={{ font: `700 26px ${font.head}`, color: color.text }}>{value}</div>
          <div style={{ font: `400 11px/1.4 ${font.body}`, color: color.textTertiary, marginTop: 5 }}>
            {label}
          </div>
        </Card>
      ))}
    </div>
  );
}

/** One labelled meter row per package, rendered from data. */
function EnrollmentCard({ rows, total }) {
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 14 }}>Enrollment by package</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {rows.map((row) => (
          <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                width: 52,
                flex: 'none',
                font: `500 12px ${font.body}`,
                color: color.textSecondary,
              }}
            >
              {row.name}
            </span>
            <ProgressMeter value={total ? (row.athletes / total) * 100 : 0} size="inline" />
            <span
              style={{
                width: 28,
                flex: 'none',
                textAlign: 'right',
                font: `600 12px ${font.body}`,
                color: color.text,
              }}
            >
              {row.athletes}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BlockFillCard({ bars }) {
  const barColor = (pct) => {
    if (pct >= 90) return color.primary;
    if (pct >= 50) return 'rgba(0,175,81,.55)';
    return color.controlBorder;
  };

  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 16 }}>Block fill this week</SectionLabel>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 68 }}>
        {bars.map((b) => (
          <div key={b.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: '100%',
                height: Math.round(b.pct * 0.62),
                background: barColor(b.pct),
                borderRadius: 3,
              }}
            />
            <span style={{ font: `400 9px ${font.body}`, color: color.disabledText }}>{b.day}</span>
          </div>
        ))}
      </div>

      {/*
        Said plainly so nobody chases it: Friday is the overflow block, so low
        fill there is the schedule working as designed.
      */}
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 14 }}>
        Friday is the overflow block — low fill there is expected, not a problem.
      </Body>
    </Card>
  );
}
