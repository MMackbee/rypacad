import React, { useState } from 'react';
import { color, font, glow, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import { DayGrid, DayGridLegend } from '../components/DayGridCell';
import { Body, Card, ScreenTitle } from '../components/Primitives';
import { useContract } from '../hooks';

/**
 * 07 · Commitment Contract - athlete. ⭐
 * States: On track, Behind, Month complete, No contract selected.
 *
 * The most-used screen in the app, and the one the handoff singles out for
 * extra attention. The shape follows from that: Log Today is pinned to the
 * bottom at 56px inside thumb reach and never scrolls away, so the daily task
 * is one tap from a cold open with no scrolling and no typing.
 *
 * The month grid is read-only. Tapping a past day opens a sheet rather than
 * editing inline, because a mis-tap while walking must not silently change a
 * record.
 *
 * Flag 02 lives on this screen: the progress meter and the Log Today button sit
 * inches apart and would both be green. The rule is that solid green fill means
 * tap - so the meter is a bar, not a button, and only the CTA is filled.
 *
 * @param {'ontrack'|'behind'|'complete'|'none'} variant
 */
export default function CommitmentContract({ variant = 'ontrack', bare = false, onLog }) {
  const { data } = useContract({ variant });
  const [sheetDay, setSheetDay] = useState(null);

  if (variant === 'none') return <NoContract bare={bare} data={data} />;

  const state = data?.state;
  const behind = variant === 'behind';
  const complete = variant === 'complete';

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
              {data?.month?.label}
            </div>
            <ScreenTitle size={24} style={{ marginTop: 3 }}>
              {data?.tierMinutes} min tier
            </ScreenTitle>
          </div>
          <StatusPill badge={state?.badge} />
        </div>
      }
      footer={<ContractFooter complete={complete} hint={state?.hint} onLog={onLog} minutes={data?.tierMinutes} />}
    >
      <div style={{ padding: '0 22px 20px', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
        <HeroCard state={state} total={data?.totalDays} behind={behind} complete={complete} />

        <Card large>
          <DayGrid days={data?.grid ?? []} onSelectDay={setSheetDay} />
          <Body size={11} tone={color.textTertiary} style={{ marginTop: 13 }}>
            Weekends are not contract days. Feb 15 was a Presidents’ Day closure and does not count
            against you.
          </Body>
          <div style={{ marginTop: 12 }}>
            <DayGridLegend />
          </div>
        </Card>

        <StatsRow state={state} />
      </div>

      {sheetDay ? <DaySheet day={sheetDay} onClose={() => setSheetDay(null)} /> : null}
    </PhoneFrame>
  );
}

function StatusPill({ badge }) {
  if (!badge) return null;
  const tones = {
    green: { bg: 'rgba(0,175,81,.14)', fg: color.primary },
    red: { bg: 'rgba(255,68,68,.1)', fg: color.error },
    yellow: { bg: 'rgba(244,238,25,.12)', fg: color.secondary },
  };
  const t = tones[badge.tone] || tones.green;

  return (
    <span
      style={{
        borderRadius: radius.round,
        padding: '6px 12px',
        background: t.bg,
        color: t.fg,
        font: `600 10px ${font.body}`,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        flex: 'none',
      }}
    >
      {badge.label}
    </span>
  );
}

function HeroCard({ state, total, behind, complete }) {
  const border = behind ? color.error : complete ? color.secondary : color.primary;
  const pct = total ? Math.round((state.logged / total) * 100) : 0;

  return (
    <div
      style={{
        borderRadius: radius.cardLarge,
        padding: 19,
        background: color.surface,
        border: `1px solid ${border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 11 }}>
        <span
          style={{
            font: `700 54px ${font.head}`,
            lineHeight: 1,
            color: behind ? color.error : color.text,
          }}
        >
          {state.logged}
        </span>
        <span style={{ font: `400 15px ${font.body}`, color: color.textSecondary }}>
          of {total} contract days
        </span>
      </div>

      {/*
        A bar, not a control. Flag 02: solid green fill means tap on this
        screen, and the Log Today button below is the only thing that is one.
      */}
      <div
        style={{
          height: 10,
          background: '#0d0d0d',
          borderRadius: 5,
          overflow: 'hidden',
          marginTop: 16,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: behind ? color.error : color.primary,
            borderRadius: 5,
          }}
        />
      </div>

      <Body size={13} style={{ marginTop: 14 }}>
        {state.line}
      </Body>
    </div>
  );
}

function StatsRow({ state }) {
  const stats = [
    [state.streak, 'day streak'],
    [state.minutes, 'minutes logged'],
    [state.daysLeft, 'days left'],
  ];

  return (
    <div style={{ display: 'flex' }}>
      {stats.map(([value, label], i) => (
        <div
          key={label}
          style={{
            flex: 1,
            textAlign: 'center',
            borderLeft: i === 0 ? 'none' : `1px solid ${color.ruleFaint}`,
          }}
        >
          <div style={{ font: `700 22px ${font.head}`, color: color.text }}>{value}</div>
          <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 4 }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Pinned, 56px, inside thumb reach, and it never scrolls away. The daily task
 * is one tap from a cold open.
 */
function ContractFooter({ complete, hint, onLog, minutes }) {
  return (
    <>
      <div
        style={{
          borderTop: `1px solid ${color.frameRule}`,
          background: color.bg,
          padding: '13px 22px 14px',
        }}
      >
        {complete ? (
          <Button variant="outline" height={56} style={{ borderRadius: 10, boxShadow: 'none' }}>
            View Commitment Board
          </Button>
        ) : (
          <Button
            height={56}
            onClick={onLog}
            style={{ borderRadius: 10, font: `600 17px ${font.body}`, boxShadow: glow.buttonPinned }}
          >
            Log today · {minutes} min
          </Button>
        )}
        <div
          style={{
            font: `400 11px ${font.body}`,
            color: color.textTertiary,
            textAlign: 'center',
            marginTop: 10,
          }}
        >
          {hint}
        </div>
      </div>
      <BottomTabBar role="athlete" active="contract" />
    </>
  );
}

/** Read-only grid: a past day opens this rather than toggling in place. */
function DaySheet({ day, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: tint.overlay,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: color.surface,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`,
          padding: '20px 22px 26px',
        }}
      >
        <ScreenTitle size={19}>February {day.day}</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          {day.state === 'logged'
            ? 'Logged. Tap below to remove this entry if it was recorded by mistake.'
            : 'Not logged. A late entry is allowed until the month closes.'}
        </Body>
        <Button
          variant={day.state === 'logged' ? 'outline' : 'primary'}
          height={50}
          onClick={onClose}
          style={{ marginTop: 16, boxShadow: 'none' }}
        >
          {day.state === 'logged' ? 'Remove entry' : 'Add late entry'}
        </Button>
      </div>
    </div>
  );
}

function NoContract({ bare, data }) {
  const [selected, setSelected] = useState(null);

  return (
    <PhoneFrame
      bare={bare}
      footer={
        <>
          <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '13px 22px 14px' }}>
            <Button height={56} disabled={!selected} style={{ borderRadius: 10 }}>
              {selected ? `Start the ${selected} min contract` : 'Select a tier to continue'}
            </Button>
          </div>
          <BottomTabBar role="athlete" active="contract" />
        </>
      }
    >
      <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        <ScreenTitle size={24}>Pick your daily investment</ScreenTitle>
        <Body size={13}>
          Five days a week, every week. Complete the month and you go on the Commitment Board.
        </Body>

        {(data?.tiers ?? []).map((tier) => (
          <TierChoice
            key={tier.minutes}
            tier={tier}
            selected={selected === tier.minutes}
            onSelect={() => setSelected(tier.minutes)}
          />
        ))}

        <Body size={11} tone={color.textTertiary}>
          Both a physical and a digital signature are required. Your coach countersigns at your next
          block.
        </Body>
      </div>
    </PhoneFrame>
  );
}

function TierChoice({ tier, selected, onSelect }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        background: color.surface,
        border: `1px solid ${selected ? color.primary : color.border}`,
        borderRadius: radius.cardLarge,
        padding: 17,
        display: 'flex',
        gap: 13,
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 26,
          height: 26,
          flex: 'none',
          marginTop: 2,
          borderRadius: '50%',
          border: `1.5px solid ${selected ? color.primary : color.faintText}`,
          background: selected ? color.primary : 'transparent',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {selected ? (
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#000' }} />
        ) : null}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ font: `700 30px ${font.head}`, color: color.text }}>{tier.minutes}</span>
          <span style={{ font: `500 14px ${font.body}`, color: color.textSecondary }}>min / day</span>
        </div>
        <Body size={12} style={{ marginTop: 6 }}>
          {tier.description}
        </Body>
        {tier.footnote ? (
          <div
            style={{
              font: `500 10px ${font.body}`,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: color.secondary,
              marginTop: 9,
            }}
          >
            {tier.footnote}
          </div>
        ) : null}
      </div>
    </div>
  );
}
