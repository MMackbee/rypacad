import React, { useEffect, useRef, useState } from 'react';
import { color, font, glow, radius } from '../tokens';
import AthleteRow from '../components/AthleteRow';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import ContractCalendar from '../components/ContractCalendar';
import PhoneFrame from '../components/PhoneFrame';
import SessionCard from '../components/SessionCard';
import { SkeletonBar } from '../components/Skeleton';
import StatusBadge from '../components/StatusBadge';
import { Body, Card, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import { useCoachDay, useCoachRoster, useMonthSessions } from '../hooks';
// The booking screen's month-nav pieces, reused rather than reforked — the
// coach Sessions tab is the booking view pointed at rosters (owner's call,
// 2026-09-01). Pure calendar label helpers ride along per the seam rule.
import { MonthNav, shiftMonth } from './BookSession';
import { monthLabel, todayISO } from '../data/calendar';

/**
 * 12 · Coach Dashboard - coach.
 * States: Sessions today, Multiple concurrent blocks, No sessions today.
 *
 * Access rule: every query is filtered by coach *assignment*, not just by role.
 * A coach sees only their own assigned athletes - no cross-family or
 * cross-coach visibility. The hook shape reflects that; the server must enforce
 * it.
 *
 * Sprint 5 pin: Overview / Students / Sessions are three genuinely different
 * views rather than the same block list under three tab labels - today at a
 * glance, the full roster, and the upcoming session list.
 *
 * @param {'today'|'concurrent'|'none'} variant
 * @param {() => void} [onSignOut]  Hidden when not supplied (harness/demo).
 */
export default function CoachDashboard({ variant = 'today', bare = false, onOpenRoster, onSignOut }) {
  const { data } = useCoachDay({ variant });
  const [tab, setTab] = useState('overview');
  const roster = useCoachRoster();

  const blocks = data?.blocks ?? [];
  const none = blocks.length === 0;

  const countPill = none
    ? { tone: 'neutral', label: 'Off today' }
    : variant === 'concurrent'
    ? { tone: 'green', label: `${blocks.length} concurrent` }
    : { tone: 'green', label: `${blocks.filter((b) => b.status !== 'closed').length} blocks` };

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
                {data?.coach?.date}
              </div>
              <ScreenTitle style={{ marginTop: 3 }}>{data?.coach?.name}</ScreenTitle>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SignOutButton onSignOut={onSignOut} />
              <StatusBadge tone={countPill.tone}>{countPill.label}</StatusBadge>
            </div>
          </div>
          <TabStrip value={tab} onChange={setTab} />
        </div>
      }
      footer={<BottomTabBar role="coach" active="today" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tab === 'overview' ? (
          <OverviewTab data={data} blocks={blocks} none={none} onOpenRoster={onOpenRoster} />
        ) : tab === 'students' ? (
          <StudentsTab athletes={roster.data ?? []} loading={roster.loading} />
        ) : (
          <SessionsTab
            firstSessionDate={blocks[0]?.sessionId?.slice(0, 10) ?? null}
            onOpenRoster={onOpenRoster}
          />
        )}
      </div>
    </PhoneFrame>
  );
}

/** Today at a glance: quick counts, then today's blocks and who needs a call. */
function OverviewTab({ data, blocks, none, onOpenRoster }) {
  const attention = data?.attention ?? [];
  return (
    <>
      {!none ? <QuickCounts blocks={blocks} attention={attention} /> : null}

      {none ? <NoSessions outstanding={data?.outstanding ?? []} /> : null}

      {blocks.map((block, i) => (
        <BlockCard key={block.id} block={block} blockIndex={i} onOpenRoster={onOpenRoster} />
      ))}

      {attention.length ? <AttentionCard items={attention} /> : null}
    </>
  );
}

function QuickCounts({ blocks, attention }) {
  const running = blocks.filter((b) => b.status !== 'closed').length;
  const cells = [
    [running, running === 1 ? 'block today' : 'blocks today'],
    [attention.length, 'need a conversation'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {cells.map(([value, label]) => (
        <Card key={label}>
          <div style={{ font: `700 24px ${font.head}`, color: color.text }}>{value}</div>
          <div style={{ font: `400 11px/1.4 ${font.body}`, color: color.textTertiary, marginTop: 4 }}>
            {label}
          </div>
        </Card>
      ))}
    </div>
  );
}

/** The coach's full assigned roster - every athlete, not one session's attendance. */
function StudentsTab({ athletes, loading }) {
  if (loading) {
    return (
      <Card large>
        <Body size={12}>Loading your roster…</Body>
      </Card>
    );
  }
  if (!athletes.length) {
    return (
      <div
        style={{
          border: `1px dashed ${color.border}`,
          borderRadius: radius.cardLarge,
          padding: '30px 22px',
          textAlign: 'center',
        }}
      >
        <ScreenTitle size={17}>No assigned athletes</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          Athletes assigned to you will show up here.
        </Body>
      </div>
    );
  }
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>Your athletes · {athletes.length}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {athletes.map((a, i) => (
          <AthleteRow
            key={a.id}
            name={a.name}
            meta={a.meta}
            avatarSize={40}
            nameSize={15}
            divider={i < athletes.length - 1}
          />
        ))}
      </div>
    </Card>
  );
}

/**
 * Sessions tab: the booking view pointed at rosters (owner's call,
 * 2026-09-01) — the same month calendar the athlete books from, but tapping
 * a session opens ITS roster/attendance instead of reserving a spot. Runs
 * on the same useMonthSessions feed, so what the coach browses is exactly
 * what families can book.
 */
function SessionsTab({ firstSessionDate, onOpenRoster }) {
  const [monthISO, setMonthISO] = useState(() => `${todayISO().slice(0, 7)}-01`);
  const [selectedDate, setSelectedDate] = useState(null);
  const monthState = useMonthSessions(monthISO);

  // Same pre-season courtesy as BookSession: open on the first month that
  // has sessions until the coach navigates themselves.
  const monthTouched = useRef(false);
  useEffect(() => {
    if (monthTouched.current || !firstSessionDate) return;
    const opening = `${firstSessionDate.slice(0, 7)}-01`;
    setMonthISO((cur) => (opening > cur ? opening : cur));
  }, [firstSessionDate]);
  const changeMonth = (next) => {
    monthTouched.current = true;
    setSelectedDate(null);
    setMonthISO(next);
  };

  const days = monthState.data?.days ?? [];
  const dayStates = {};
  const sessionsByDate = {};
  for (const d of days) {
    sessionsByDate[d.date] = d.sessions;
    dayStates[d.date] = d.sessions.length ? 'available' : 'open';
  }
  const monthHasSessions = days.some((d) => d.sessions.length > 0);
  const selectedSessions = selectedDate ? sessionsByDate[selectedDate] ?? [] : [];

  return (
    <>
      <Card large>
        <MonthNav
          label={monthLabel(monthISO)}
          onPrev={() => changeMonth(shiftMonth(monthISO, -1))}
          onNext={() => changeMonth(shiftMonth(monthISO, 1))}
        />
        {monthState.loading ? (
          <SkeletonBar height={220} style={{ marginTop: 14 }} />
        ) : (
          <div style={{ marginTop: 10 }}>
            <ContractCalendar
              key={monthISO}
              start={monthISO}
              dayStates={dayStates}
              variant="booking"
              selected={selectedDate}
              onSelectDay={(day) => setSelectedDate(day.iso)}
            />
          </div>
        )}
        {!monthState.loading && !monthHasSessions ? (
          <Body size={12} style={{ marginTop: 14, textAlign: 'center' }}>
            No sessions are scheduled this month.
          </Body>
        ) : (
          <Body size={11} tone={color.textTertiary} style={{ marginTop: 13 }}>
            Days marked green have sessions — tap one, then tap a session for its roster.
          </Body>
        )}
      </Card>

      {selectedDate ? (
        selectedSessions.length === 0 ? (
          <Body size={12} style={{ textAlign: 'center' }}>
            No sessions on this day.
          </Body>
        ) : (
          selectedSessions.map((session) => {
            const [time, meridiem] = String(session.time).split(' ');
            return (
              <SessionCard
                key={session.id}
                time={time}
                meridiem={meridiem}
                type={session.type}
                name={session.name}
                meta={`${session.booked ?? 0} of ${session.capacity ?? '—'} booked`}
                nameSize={15}
                gutter={56}
                ruleHeight={44}
                onClick={() => onOpenRoster && onOpenRoster({ sessionId: session.id })}
              />
            );
          })
        )
      ) : null}
    </>
  );
}

/** Carried forward from the 2025 build's coach dashboard IA. */
function TabStrip({ value, onChange }) {
  const tabs = [
    ['overview', 'Overview'],
    ['students', 'Students'],
    ['sessions', 'Sessions'],
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        marginTop: 14,
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.control,
        padding: 3,
      }}
    >
      {tabs.map(([key, label]) => {
        const on = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            style={{
              flex: 1,
              height: 36,
              border: 'none',
              borderRadius: radius.pill,
              background: on ? color.primary : 'transparent',
              font: `${on ? 600 : 500} 13px ${font.body}`,
              color: on ? '#000' : color.textTertiary,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Concurrent blocks stay as two peer cards, each with its own Start roster
 * button, rather than a combined floor view. A coach running two groups needs
 * two separate attendance records, not one merged list.
 *
 * QA #6 fix (Sprint 6, TEAM.md): each row's action must open ITS OWN block's
 * roster, never whichever block happened to render first. This card already
 * closes over its own `block` prop per iteration - the bug a reviewer sees
 * (View roster under 5:00 PM opening the 4:00 PM roster) is downstream of
 * PortalRoutes.js's onOpenRoster, which today is `go('/portal/attendance')` -
 * a zero-arg navigate that drops whatever is passed to it, so every row lands
 * on Roster.js's default block regardless of which one was tapped. This
 * screen's fix is to stop being ambiguous about which block a tap means:
 * `blockIndex` (this block's position among today's blocks) travels alongside
 * it so a route/prop that does carry it through can resolve the exact same
 * block Roster.js/SessionAttendance would pick via useSession({ blockIndex }).
 * See the sprint report for the PortalRoutes follow-up this still needs.
 */
function BlockCard({ block, blockIndex, onOpenRoster }) {
  const [time, meridiem] = block.time.split(' ');
  const openThisRoster = () => onOpenRoster && onOpenRoster({ ...block, blockIndex });

  const pill = {
    now: <StatusBadge tone="green">Now</StatusBadge>,
    next: <StatusBadge tone="neutral">Next</StatusBadge>,
    closed: <StatusBadge tone="muted">Closed</StatusBadge>,
  }[block.status];

  const action =
    block.status === 'now' ? (
      <Button height={50} onClick={openThisRoster}>
        Start roster
      </Button>
    ) : block.status === 'next' ? (
      <Button
        variant="outline"
        height={46}
        onClick={openThisRoster}
        style={{ font: `600 14px ${font.body}` }}
      >
        View roster
      </Button>
    ) : null;

  return (
    <SessionCard
      time={time}
      meridiem={meridiem}
      type={block.type}
      name={block.name}
      meta={block.meta}
      nameSize={15}
      gutter={56}
      ruleHeight={44}
      variant={block.status === 'now' ? 'live' : block.status === 'closed' ? 'closed' : 'default'}
      style={block.status === 'now' ? { boxShadow: glow.nowCard } : undefined}
      trailing={pill}
      footnote={
        block.footnote ? (
          <span style={{ color: color.secondary }}>{block.footnote}</span>
        ) : null
      }
      action={action}
    />
  );
}

function AttentionCard({ items }) {
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 13 }}>Needs a conversation</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((item, i) => (
          <AthleteRow
            key={item.id}
            name={item.name}
            meta={item.meta}
            metaTone={item.tone === 'red' ? color.error : color.secondary}
            avatarSize={32}
            nameSize={15}
            divider={i < items.length - 1}
          />
        ))}
      </div>
    </Card>
  );
}

function NoSessions({ outstanding }) {
  return (
    <>
      <div
        style={{
          border: `1px dashed ${color.border}`,
          borderRadius: radius.cardLarge,
          padding: '30px 22px',
          textAlign: 'center',
        }}
      >
        <ScreenTitle size={17}>No sessions today</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          Your next assigned block is Mon Feb 22, 5:00 PM.
        </Body>
      </div>

      {outstanding.length ? (
        <Card tone="yellow" large>
          <SectionLabel tone={color.secondary} style={{ marginBottom: 12 }}>
            Outstanding
          </SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {outstanding.map((o) => (
              <div
                key={o.id}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}
              >
                <span style={{ font: `500 13px ${font.body}`, color: color.text }}>{o.label}</span>
                <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
                  {o.detail}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}
