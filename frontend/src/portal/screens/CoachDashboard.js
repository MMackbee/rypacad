import React, { useState } from 'react';
import { color, font, glow, radius } from '../tokens';
import AthleteRow from '../components/AthleteRow';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import SessionCard from '../components/SessionCard';
import StatusBadge from '../components/StatusBadge';
import { Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useCoachDay } from '../hooks';

/**
 * 12 · Coach Dashboard - coach.
 * States: Sessions today, Multiple concurrent blocks, No sessions today.
 *
 * Access rule: every query is filtered by coach *assignment*, not just by role.
 * A coach sees only their own assigned athletes - no cross-family or
 * cross-coach visibility. The hook shape reflects that; the server must enforce
 * it.
 *
 * @param {'today'|'concurrent'|'none'} variant
 */
export default function CoachDashboard({ variant = 'today', bare = false, onOpenRoster }) {
  const { data } = useCoachDay({ variant });
  const [tab, setTab] = useState('overview');

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
            <StatusBadge tone={countPill.tone}>{countPill.label}</StatusBadge>
          </div>
          <TabStrip value={tab} onChange={setTab} />
        </div>
      }
      footer={<BottomTabBar role="coach" active="today" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {none ? <NoSessions outstanding={data?.outstanding ?? []} /> : null}

        {blocks.map((block) => (
          <BlockCard key={block.id} block={block} onOpenRoster={onOpenRoster} />
        ))}

        {data?.attention?.length ? <AttentionCard items={data.attention} /> : null}
      </div>
    </PhoneFrame>
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
 */
function BlockCard({ block, onOpenRoster }) {
  const [time, meridiem] = block.time.split(' ');

  const pill = {
    now: <StatusBadge tone="green">Now</StatusBadge>,
    next: <StatusBadge tone="neutral">Next</StatusBadge>,
    closed: <StatusBadge tone="muted">Closed</StatusBadge>,
  }[block.status];

  const action =
    block.status === 'now' ? (
      <Button height={50} onClick={() => onOpenRoster && onOpenRoster(block)}>
        Start roster
      </Button>
    ) : block.status === 'next' ? (
      <Button
        variant="outline"
        height={46}
        onClick={() => onOpenRoster && onOpenRoster(block)}
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
