import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import { Body, Card, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
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
 * Sprint 5 pin (TEAM.md): the "All tiers" filter button was dead - it had no
 * onClick at all, so tapping it did nothing regardless of the underlying
 * filter data (which already matched correctly).
 *
 * Sprint 6 pin (TEAM.md, QA #10): the button only ever toggled All <-> "8 + 3
 * only" - `useAdminDashboard`'s `variant` param only distinguishes those two
 * (`TIER_FILTERS` in data/admin.js has just those two entries). Cycling
 * through every real tier needs a per-tier filter the hook doesn't expose, so
 * this screen now fetches the full unfiltered payload once and does the
 * cycling/filtering itself from `data.enrollment` - the same real,
 * hook-provided per-package counts (ENROLLMENT_BY_PACKAGE) the "Enrollment by
 * package" card already renders, so nothing here is invented and a future
 * tier added to that catalogue extends the cycle with no screen edit. The
 * outstanding-list filter mirrors the hook's own `matches()` predicate
 * exactly (packageIds match, or the row is org-wide with packageIds: null).
 *
 * @param {'populated'|'filtered'} variant
 * @param {() => void} [onSignOut]  Hidden when not supplied (harness/demo).
 */
export default function AdminDashboard({ variant = 'populated', bare = false, onSignOut, onOpenAthlete }) {
  const { data } = useAdminDashboard();
  const enrollmentRows = data?.enrollment ?? [];
  // All -> every real package row, in the catalogue's own order (4+2, 8+3,
  // 12+4, 16+4, Elite per ENROLLMENT_BY_PACKAGE) -> back to All.
  const cycle = [
    { id: 'all', label: 'All tiers', count: data?.metrics?.enrolled ?? null },
    ...enrollmentRows.map((r) => ({ id: r.id, label: `${r.name} only`, count: r.athletes })),
  ];
  // The harness's "Filtered by tier" demo state previously always meant
  // "8 + 3 only" (TIER_FILTERS[1]) - index 2 in this cycle (All, 4+2, 8+3,
  // 12+4, 16+4, Elite) preserves that exact starting point.
  const [filterIndex, setFilterIndex] = useState(variant === 'filtered' ? 2 : 0);
  const active = cycle[Math.min(filterIndex, cycle.length - 1)];
  const filtered = active.id !== 'all';

  const outstanding = filtered
    ? (data?.outstanding ?? []).filter((o) => o.packageIds == null || o.packageIds.includes(active.id))
    : data?.outstanding ?? [];

  const metrics = data?.metrics
    ? filtered
      ? { ...data.metrics, enrolled: active.count, enrolledLabel: `athletes on ${active.label.replace(' only', '')}` }
      : data.metrics
    : null;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
                Week of Feb 15
              </div>
              <ScreenTitle size={24} style={{ marginTop: 3 }}>
                Who needs a call
              </ScreenTitle>
            </div>
            <SignOutButton onSignOut={onSignOut} />
          </div>
          <TierFilter
            active={active}
            filtered={filtered}
            onToggle={() => setFilterIndex((i) => (i + 1) % (cycle.length || 1))}
          />
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <OutstandingCard items={outstanding} onOpenAthlete={onOpenAthlete} />
        <MetricGrid metrics={metrics} />
        <EnrollmentCard rows={enrollmentRows} highlight={filtered ? active.id : null} />
        <BlockFillCard bars={data?.blockFill ?? []} filtered={filtered} />
      </div>
    </PhoneFrame>
  );
}

/** Cycles through every real tier on tap - All -> 4+2 -> 8+3 -> 12+4 -> 16+4 -> Elite -> All. */
function TierFilter({ active, filtered, onToggle }) {
  if (!active) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: '100%',
        height: 42,
        marginTop: 14,
        background: color.surface,
        border: `1px solid ${filtered ? color.primary : color.border}`,
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
          textAlign: 'left',
          font: `500 13px ${font.body}`,
          color: filtered ? color.primary : color.textSecondary,
        }}
      >
        {active.label} · {active.count != null ? active.count : '—'} athletes
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
    </button>
  );
}

/**
 * The named list, first.
 *
 * Sprint 5 pin: athlete names become links to /portal/athlete/:id, where
 * contact info lives. Wired defensively - `item.athleteId` does not exist on
 * the seed rows yet (data/admin.js is the db lane's; OUTSTANDING only carries
 * `who` as free text, and several rows name a household or a group, not one
 * athlete) - so a row renders as a link only once an id is present, and stays
 * plain text otherwise. See the sprint report for the data-lane follow-up.
 */
function OutstandingCard({ items, onOpenAthlete }) {
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

      {items.map((item, i) => {
        const linkable = onOpenAthlete && item.athleteId;
        return (
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
              <div
                style={{ font: `400 11px/1.5 ${font.body}`, color: color.textSecondary, marginTop: 3 }}
              >
                {item.why}
              </div>
            </div>
            <StatusBadge tone={item.tone}>{item.tag}</StatusBadge>
          </div>
        );
      })}
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

/**
 * One labelled share bar per package, rendered from data.
 *
 * Deliberately not <ProgressMeter>: that component's colour scale means
 * contract completion (green on-track / yellow behind / grey no-data), and a
 * package holding 32% of enrollment is not "behind" anything. A share is
 * neutral, so every bar is the same colour and scaled against the largest
 * package rather than a percentage-of-total that would render every bar short.
 */
function EnrollmentCard({ rows, highlight }) {
  const max = Math.max(1, ...rows.map((r) => r.athletes));

  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 14 }}>Enrollment by package</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {rows.map((row) => {
          const dimmed = highlight && row.id !== highlight;
          return (
            <div
              key={row.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: dimmed ? 0.45 : 1 }}
            >
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
              <div style={{ flex: 1, height: 6, background: color.track, borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(row.athletes / max) * 100}%`,
                    height: '100%',
                    background: color.primary,
                    borderRadius: 3,
                  }}
                />
              </div>
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
          );
        })}
      </div>
    </Card>
  );
}

function BlockFillCard({ bars, filtered }) {
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
        {filtered
          ? 'Facility-wide — block fill cannot be cut by tier. '
          : ''}
        Friday is the overflow block — low fill there is expected, not a problem.
      </Body>
    </Card>
  );
}
