import React, { useState } from 'react';
import { BLOCKS, BLOCK_DAYS, color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import MediaPlaceholder from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import SessionCard from '../components/SessionCard';
import StatusBadge from '../components/StatusBadge';
import AllowancePools from '../components/AllowancePools';
import { Banner, Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useSchedule } from '../hooks';

/**
 * 04 · My Schedule - athlete.
 * States: Upcoming, Empty, Cancelled session shown.
 *
 * @param {'upcoming'|'empty'|'cancelled'} variant
 */
export default function MySchedule({ variant = 'upcoming', bare = false, onBook }) {
  const { data } = useSchedule({ variant });
  const [tab, setTab] = useState('upcoming');

  const past = tab === 'past';
  const sessions = (past ? data?.past : data?.sessions) ?? [];
  // The cancellation notice belongs to the upcoming view - it is a claim about
  // a session that will not run, not a record of one that did.
  const cancelled = past ? null : data?.cancelled ?? null;
  const allowance = data?.allowance ?? null;

  // Group by day header so a day is announced once, not per card.
  const days = sessions.reduce((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.label === s.dayLabel) last.items.push(s);
    else acc.push({ label: s.dayLabel, isToday: s.isToday, items: [s] });
    return acc;
  }, []);

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 16px' }}>
          <ScreenTitle>My Schedule</ScreenTitle>
        </div>
      }
      footer={<BottomTabBar role="athlete" active="schedule" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Segmented value={tab} onChange={setTab} />

        {/*
          Two numbers, never one. Training and tournament entitlements are
          separate pools, so a single "N bookings left" would be wrong for every
          athlete who has spent one and not the other.
        */}
        {allowance ? (
          <Card>
            <SectionLabel style={{ marginBottom: 12 }}>Remaining this cycle</SectionLabel>
            <AllowancePools allowance={allowance} />
            <Body size={11} tone={color.textTertiary} style={{ marginTop: 12 }}>
              Both reset {allowance.resetsOn}. A cancelled or rescheduled block does not count
              against either.
            </Body>
          </Card>
        ) : null}

        {cancelled ? (
          <Banner
            tone="red"
            title={cancelled.banner.title}
            action={
              <Button variant="dangerOutline" height={46} style={{ font: `600 14px ${font.body}` }}>
                Reschedule as makeup
              </Button>
            }
          >
            {cancelled.banner.body}
          </Banner>
        ) : null}

        {cancelled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <SectionLabel tone={color.textTertiary}>{cancelled.dayLabel}</SectionLabel>
            <SessionCard
              time={cancelled.time}
              meridiem={cancelled.meridiem}
              type="cancelled"
              name={cancelled.name}
              meta={cancelled.meta}
              variant="cancelled"
            />
          </div>
        ) : null}

        {sessions.length === 0 && !cancelled ? (
          past ? (
            <Body size={12} tone={color.textTertiary} style={{ textAlign: 'center', padding: '20px 0' }}>
              Nothing attended yet this season.
            </Body>
          ) : (
            <EmptyState onBook={onBook} />
          )
        ) : null}

        {days.map((day) => (
          <div key={day.label} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <SectionLabel tone={day.isToday ? color.primary : color.textTertiary}>
              {day.label}
            </SectionLabel>
            {day.items.map((s) => (
              <SessionCard
                key={s.id}
                time={s.time}
                meridiem={s.meridiem}
                type={s.type}
                name={s.name}
                meta={s.meta}
                variant={s.isToday ? 'live' : 'default'}
                trailing={
                  s.badge ? (
                    <StatusBadge tone={s.badge.tone}>{s.badge.label}</StatusBadge>
                  ) : null
                }
              />
            ))}
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

function Segmented({ value, onChange }) {
  const options = [
    ['upcoming', 'Upcoming'],
    ['past', 'Past'],
  ];

  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.control,
        padding: 3,
        display: 'flex',
      }}
    >
      {options.map(([key, label]) => {
        const on = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            style={{
              flex: 1,
              height: 38,
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

function EmptyState({ onBook }) {
  // Built from the BLOCKS constant so flag 07 stays single-source: if the real
  // block times differ, this copy changes with them rather than drifting.
  const blockList = `${BLOCKS.slice(0, -1).join(', ')}, and ${BLOCKS[BLOCKS.length - 1]}`;
  const dayRange = `${BLOCK_DAYS[0]} through ${BLOCK_DAYS[BLOCK_DAYS.length - 1]}`;

  return (
    <div
      style={{
        border: `1px dashed ${color.border}`,
        borderRadius: radius.cardLarge,
        padding: '34px 22px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        textAlign: 'center',
      }}
    >
      <MediaPlaceholder height={56} style={{ width: 56 }} />
      <ScreenTitle size={18}>Nothing scheduled</ScreenTitle>
      <Body size={12}>
        Training blocks run {blockList}, {dayRange}. Saturdays alternate training and tournament.
      </Body>
      <Button height={46} onClick={onBook} style={{ marginTop: 6 }}>
        Book a session
      </Button>
    </div>
  );
}
