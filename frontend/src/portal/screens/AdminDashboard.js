import React, { useState } from 'react';
import { format, startOfWeek } from 'date-fns';
import { color, font, radius } from '../tokens';
import * as hooks from '../hooks';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import { Body, Card, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import HouseholdsCard from '../components/HouseholdsCard';
import { useAdminDashboard } from '../hooks';
import { contractEnabled } from '../data/contractFlag';

/**
 * Sprint 20 (spec 7, D14): useSignups() lands with routing Task 13, the LAST
 * routing merge. /portal/admin is a day-1 route, so until that export exists
 * the Sign-ups card renders an honest empty count instead of crashing the
 * whole dashboard. Namespace-import + inert-fallback (Registration.js:27-35);
 * the hook call in SignupsCard stays unconditional (rules of hooks).
 */
function useSignupsFallback() {
  return {
    data: { rows: [], counts: { all: 0, unpaid: 0, flagged: 0, unresolved: 0 }, unresolved: [] },
    loading: false,
    error: null,
  };
}
const useSignups = hooks.useSignups || useSignupsFallback;

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
 * Sprint 20 (spec 2.4/7): the enrollment queue is retired - sign-up is
 * instant - and the SIGN-UPS card (unpaid count, flagged count, Open
 * sign-ups) takes its slot. The Membership card gains a Pending stat (spec
 * 4.4). Billing has no card on this screen already (the pin says it should
 * stay gone in live mode - there never was one to remove).
 *
 * @param {'populated'|'filtered'} variant
 * @param {'owner'|'ops'} [role]  Sprint 10 pin F: which staff tab
 *   (mental no longer lands here - spec 9)
 *   set the footer shows - the three roles that land here get different
 *   sets (owner: Admin/Sessions/Staff/Tour; ops: Admin/Sessions/Tour;
 *   mental: Sessions/Admin/Tour). Routing knows the signed-in role; this
 *   defaults to 'owner' (the superset) only for the harness/an un-wired
 *   caller - see the sprint report.
 * @param {() => void} [onSignOut]  Hidden when not supplied (harness/demo).
 * @param {object} [demoMembership]  HARNESS-ONLY (Sprint 13, contract v2.1) —
 *   overrides the Membership card's data. useAdminDashboard's seed branch
 *   does not produce a `membership` field in this worktree yet (routing
 *   lane's parallel worktree); no real caller ever passes this.
 */
export default function AdminDashboard({
  variant = 'populated',
  bare = false,
  role = 'owner',
  onSignOut,
  onOpenAthlete,
  onOpenHousehold,
  onOpenSignups,
  demoMembership,
}) {
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

  // Hidden contract (owner, 2026-09-30): no "Contract behind" rows or chips.
  const rows = (data?.outstanding ?? []).filter((o) => contractEnabled() || o.kind !== 'contract');
  const outstanding = filtered
    ? rows.filter((o) => o.packageIds == null || o.packageIds.includes(active.id))
    : rows;

  const metrics = data?.metrics
    ? filtered
      ? { ...data.metrics, enrolled: active.count, enrolledLabel: `athletes on ${active.label.replace(' only', '')}` }
      : data.metrics
    : null;

  // Real week header (Sprint 10 pin D) - the device's own wall-clock Monday,
  // via date-fns (never hand-rolled), matching todayISO()'s own "family's
  // wall-clock day" rule in data/calendar.js.
  const weekLabel = `Week of ${format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'MMMM d')}`;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
                {weekLabel}
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
      footer={<BottomTabBar role={role} active="admin" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <OutstandingCard items={outstanding} onOpenAthlete={onOpenAthlete} />
        <SignupsCard onOpenSignups={onOpenSignups} />
        <MetricGrid metrics={metrics} />
        <MembershipCard membership={demoMembership ?? data?.membership} />
        {/* Sprint 17 (contract v2.5): every household -> its staff billing
            view. Hidden when the route supplies no destination (harness). */}
        {onOpenHousehold ? <HouseholdsCard onOpenHousehold={onOpenHousehold} /> : null}
        <EnrollmentCard rows={enrollmentRows} highlight={filtered ? active.id : null} />
        <BlockFillCard bars={data?.blockFill ?? []} filtered={filtered} />
        {/* Billing card: hidden in live mode per the pin - there was never
            one on this screen to remove; billing stays parked. */}
      </div>
    </PhoneFrame>
  );
}

/** Sign-ups (spec 7): the unpaid count is the day-2 view ops works from; unmatched Calendly bookings count as flagged (D16). */
function SignupsCard({ onOpenSignups }) {
  const { data, loading, error } = useSignups();
  const unpaid = data?.counts?.unpaid ?? 0;
  const flagged = (data?.counts?.flagged ?? 0) + (data?.counts?.unresolved ?? 0);
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>Sign-ups · {loading ? '…' : `${unpaid} unpaid`}</SectionLabel>
      {error ? (
        <Body size={12} tone={color.error}>Sign-ups didn't load.</Body>
      ) : (
        <Body size={12}>{data?.counts?.all ?? 0} self-signed households · {flagged} flagged. Sign-up is instant; nothing waits for approval.</Body>
      )}
      {onOpenSignups ? (
        <Button variant="secondary" height={44} onClick={onOpenSignups} style={{ marginTop: 12, boxShadow: 'none' }}>
          Open sign-ups
        </Button>
      ) : null}
    </Card>
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
 * "Membership" card (Sprint 13 pin, contract v2.1) — active/past due/lapsed
 * counts and the lapsed households list, off `useAdminDashboard().data.
 * membership` (an EXISTING hook gaining this field — read directly, absent
 * gracefully renders nothing rather than a zeroed-out card). Lapsed
 * households carry only `{ id, name }` — no athlete/household detail route
 * is pinned for this list, so the rows are informational, not tappable
 * (never wiring a tap to a destination that doesn't exist).
 */
function MembershipCard({ membership }) {
  if (!membership) return null;
  // Sprint 20 (spec 4.4, contract 3.5): `pending` is an ATHLETE count (still
  // on checkout) beside the household counts, so this card and the sign-ups
  // report agree. Absent (routing Task 13 not merged yet) renders 0.
  const stats = [
    ['Active', membership.active, 'green'],
    ['Pending', membership.pending ?? 0, 'yellow'],
    ['Past due', membership.pastDue, 'yellow'],
    ['Lapsed', membership.lapsed, 'red'],
  ];

  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 14 }}>Membership</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
        {stats.map(([label, value, tone]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ font: `700 22px ${font.head}`, color: color.text }}>{value ?? 0}</div>
            <div style={{ marginTop: 6 }}>
              <StatusBadge tone={tone}>{label}</StatusBadge>
            </div>
          </div>
        ))}
      </div>
      {membership.lapsedHouseholds?.length ? (
        <div style={{ marginTop: 16, borderTop: `1px solid ${color.rule}`, paddingTop: 14 }}>
          <SectionLabel tone={color.error} style={{ marginBottom: 8 }}>
            Lapsed households
          </SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {membership.lapsedHouseholds.map((h) => (
              <div key={h.id} style={{ font: `500 13px ${font.body}`, color: color.text }}>
                {h.name}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
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

/**
 * Sprint 12 (TEAM.md "Sprint 12 pins — the token model", pin J): "the
 * Friday is the overflow block" footnote is deleted — Friday is a regular
 * scheduled day now (Fri 3-5 PM, 60-min blocks per the locked weekly
 * schedule), and the `overflow` field the old footnote's proxy leaned on is
 * gone from the schedule generator. Nothing replaces it; a quiet Friday now
 * reads exactly like a quiet day anywhere else in the week.
 */
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

      {filtered ? (
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 14 }}>
          Facility-wide — block fill cannot be cut by tier.
        </Body>
      ) : null}
    </Card>
  );
}
