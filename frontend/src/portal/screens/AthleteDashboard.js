import React from 'react';
import { color, font, glow, radius } from '../tokens';
import AllowancePools from '../components/AllowancePools';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import MediaPlaceholder, { Avatar } from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter from '../components/ProgressMeter';
import TypeChip from '../components/TypeChip';
import { Body, Card, ScreenTitle, SectionLabel, Tick } from '../components/Primitives';
import { useAthleteDashboard } from '../hooks';

/**
 * 03 · Athlete Dashboard - athlete.
 * States: Populated, New athlete, No upcoming sessions.
 *
 * @param {'populated'|'new'|'empty'} variant
 */
export default function AthleteDashboard({ variant = 'populated', bare = false, onLog, onBook }) {
  const { data } = useAthleteDashboard({ variant });
  const athlete = data?.athlete;
  const next = data?.nextSession;
  const contract = data?.contract;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
              {athlete?.date}
            </div>
            <ScreenTitle style={{ marginTop: 3 }}>{athlete?.name}</ScreenTitle>
          </div>
          <Avatar size={40} />
        </div>
      }
      footer={<BottomTabBar role="athlete" active="home" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {variant === 'new' ? <StartHere onBook={onBook} /> : null}
        {variant === 'new' ? <OnboardingChecklist items={data?.onboarding ?? []} /> : null}
        {variant === 'new' ? (
          <MediaPlaceholder height={126} caption="WELCOME VIDEO — Luke, 60 sec — what the first week looks like" />
        ) : null}

        {next ? <NextSessionCard next={next} /> : null}
        {variant === 'empty' ? <NoSessions onBook={onBook} /> : null}

        {/*
          The contract card shows in the empty state too. Daily minutes are
          independent of scheduled blocks - an athlete with nothing booked still
          owes their contract day, and hiding it here would suggest otherwise.
        */}
        {contract ? <ContractCard contract={contract} /> : null}

        {/* Two numbers, never one - see AllowancePools. */}
        {athlete?.allowance ? (
          <Card>
            <SectionLabel style={{ marginBottom: 12 }}>Remaining this cycle</SectionLabel>
            <AllowancePools allowance={athlete.allowance} />
          </Card>
        ) : null}

        {variant === 'populated' ? <QuickActions onLog={onLog} onBook={onBook} /> : null}

        <CodeOfGrit items={data?.codeOfGrit ?? []} />
      </div>
    </PhoneFrame>
  );
}

function NextSessionCard({ next }) {
  return (
    <Card tone="green" large style={{ boxShadow: glow.emphasisCard }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <SectionLabel tone={color.primary} style={{ flex: 1 }}>
          {next.isToday ? 'Next session · today' : 'Next session'}
        </SectionLabel>
        <span style={{ font: `500 11px ${font.body}`, color: color.textSecondary }}>
          {next.dayLabel}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <TypeChip type={next.type} />
      </div>

      <div style={{ font: `700 20px ${font.head}`, color: color.text, marginTop: 8 }}>
        {next.name}
      </div>

      {/* Coach and bay are unassigned in the schedule - nothing is invented. */}
      <div style={{ display: 'flex', gap: 0, marginTop: 14 }}>
        {[
          ['Time', `${next.time} ${next.meridiem}`],
          ['Day', next.dayLabel],
          ['Type', next.type === 'tournament' ? 'Tournament' : 'Training'],
        ].map(([label, value]) => (
          <div key={label} style={{ flex: 1 }}>
            <div
              style={{
                font: `400 10px ${font.body}`,
                textTransform: 'uppercase',
                letterSpacing: '.1em',
                color: color.textTertiary,
              }}
            >
              {label}
            </div>
            <div style={{ font: `600 14px ${font.body}`, color: color.text, marginTop: 4 }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ContractCard({ contract }) {
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <SectionLabel style={{ flex: 1 }}>Commitment Contract</SectionLabel>
        <span style={{ font: `500 11px ${font.body}`, color: color.primary }}>On track</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
        <span style={{ font: `700 40px ${font.head}`, color: color.text }}>{contract.logged}</span>
        <span style={{ font: `400 14px ${font.body}`, color: color.textSecondary }}>
          of {contract.total} days · {contract.month}
        </span>
      </div>

      <ProgressMeter value={contract.pct} size="card" style={{ marginTop: 12 }} />

      <Body size={12} style={{ marginTop: 12 }}>
        {contract.line}
      </Body>
    </Card>
  );
}

function QuickActions({ onLog, onBook }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <Button onClick={onLog} height={78} style={{ borderRadius: radius.card, font: `600 14px ${font.body}` }}>
        Log today
      </Button>
      <Button
        variant="secondary"
        onClick={onBook}
        height={78}
        style={{ borderRadius: radius.card, font: `600 14px ${font.body}`, boxShadow: 'none' }}
      >
        Book a slot
      </Button>
    </div>
  );
}

function CodeOfGrit({ items }) {
  return (
    <Card>
      <SectionLabel style={{ marginBottom: 12 }}>Code of Grit</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((line) => (
          <div key={line} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
            <span
              style={{
                width: 4,
                height: 4,
                marginTop: 7,
                flex: 'none',
                background: color.primary,
                borderRadius: 2,
              }}
            />
            <span style={{ font: `400 13px/1.5 ${font.body}`, color: color.textSecondary }}>
              {line}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StartHere({ onBook }) {
  return (
    <Card tone="yellow" large>
      <SectionLabel tone={color.secondary}>Start here</SectionLabel>
      <ScreenTitle size={19} style={{ marginTop: 10 }}>
        Book your Diagnostic
      </ScreenTitle>
      <Body size={12} style={{ marginTop: 8 }}>
        Everything starts with objective data. Your baseline capture sets the Practice DNA you’ll be
        measured against — your own numbers, not a model swing.
      </Body>
      <Button height={46} onClick={onBook} style={{ marginTop: 14 }}>
        Find a time
      </Button>
    </Card>
  );
}

function OnboardingChecklist({ items }) {
  const tones = {
    done: { border: color.primary, fill: color.primary, text: color.text },
    next: { border: color.secondary, fill: 'transparent', text: color.text },
    todo: { border: '#3a3a3a', fill: 'transparent', text: color.textTertiary },
  };

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item) => {
          const t = tones[item.state];
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 20,
                  height: 20,
                  flex: 'none',
                  borderRadius: '50%',
                  border: `1.5px solid ${t.border}`,
                  background: t.fill,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {item.state === 'done' ? <Tick size={10} /> : null}
              </span>
              <span style={{ font: `400 13px ${font.body}`, color: t.text }}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function NoSessions({ onBook }) {
  return (
    <div
      style={{
        border: `1px dashed ${color.border}`,
        borderRadius: radius.cardLarge,
        padding: '30px 22px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 13,
        textAlign: 'center',
      }}
    >
      <MediaPlaceholder height={44} style={{ width: 44 }} />
      <ScreenTitle size={17}>No upcoming sessions</ScreenTitle>
      <Body size={12}>
        Your last block was Thursday. Makeup sessions are unlimited within the billing cycle —
        reschedule into any open age-appropriate block.
      </Body>
      <Button height={46} onClick={onBook} style={{ marginTop: 4 }}>
        Browse open slots
      </Button>
    </div>
  );
}
