import React from 'react';
import { color, font, glow, radius } from '../tokens';
import AllowancePools from '../components/AllowancePools';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import MediaPlaceholder, { Avatar } from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter from '../components/ProgressMeter';
import TypeChip from '../components/TypeChip';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import { Body, Card, ErrorNotice, ScreenTitle, SectionLabel, SignOutButton, Tick } from '../components/Primitives';
import { useAthleteDashboard } from '../hooks';

/**
 * 03 · Athlete Dashboard - athlete.
 * States: Populated, New athlete, No upcoming sessions.
 *
 * Sprint 6 pin (TEAM.md, QA #4): useAthleteDashboard's allowance and next
 * session are live-wired this sprint - a real athlete with nothing booked
 * reaches this screen as `variant: 'populated'` (the only variant a live
 * caller ever passes) with `nextSession: null`, which is a state the demo
 * harness never previously exercised outside `variant === 'empty'`. The
 * designed empty state now renders whenever there is no next session,
 * regardless of variant, so a live null and the demo 'empty' state are the
 * same condition rather than two that could drift apart.
 *
 * @param {'populated'|'new'|'empty'} variant
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 * @param {() => void} [onSignOut]  Sprint 5 pin: hidden when not supplied
 *   (harness/demo mode); routing wires useAuthSession().signOut() to it.
 */
export default function AthleteDashboard({ variant = 'populated', bare = false, onLog, onBook, onRetry, onSignOut }) {
  const { data, loading, error } = useAthleteDashboard({ variant });
  const athlete = data?.athlete;
  const next = data?.nextSession;
  const contract = data?.contract;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              // Sized like the date line + name so the header holds its height.
              <>
                <SkeletonBar width={96} height={12} />
                <SkeletonBar width={150} height={24} style={{ marginTop: 8 }} />
              </>
            ) : (
              <>
                <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
                  {athlete?.date}
                </div>
                <ScreenTitle style={{ marginTop: 3 }}>{athlete?.name}</ScreenTitle>
              </>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Avatar size={40} />
            <SignOutButton onSignOut={onSignOut} />
          </div>
        </div>
      }
      footer={<BottomTabBar role="athlete" active="home" />}
    >
      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <div style={{ padding: '0 22px 24px' }}>
          <ErrorNotice title="Dashboard didn't load" onRetry={onRetry}>
            Your dashboard didn't load. Check your connection and try again.
          </ErrorNotice>
        </div>
      ) : (
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {variant === 'new' ? <StartHere onBook={onBook} /> : null}
        {variant === 'new' ? <OnboardingChecklist items={data?.onboarding ?? []} /> : null}
        {variant === 'new' ? (
          <MediaPlaceholder height={126} caption="WELCOME VIDEO — Luke, 60 sec — what the first week looks like" />
        ) : null}

        {next ? (
          <NextSessionCard next={next} />
        ) : variant !== 'new' ? (
          // No invented session: null is the honest shape once live-wired
          // (QA #4) - the same empty state the demo 'empty' variant already
          // used, not a separate state to keep in sync by hand. Suppressed
          // only for 'new', whose own "Start here" messaging already fills
          // this space.
          <NoSessions onBook={onBook} />
        ) : null}

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
      </div>
      )}
    </PhoneFrame>
  );
}

/**
 * The loading layout in the loaded layout's geometry: the next-session card,
 * the contract card, the allowance card, then the quick-action pair. No
 * spinner — see components/Skeleton.js.
 */
function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading dashboard"
      style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {/* Next session: label row, chip, 20px name, three meta columns. */}
      <SkeletonCard large>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <SkeletonBar tone="raised" width={118} height={10} />
          <SkeletonBar tone="raised" width={56} height={10} />
        </div>
        <SkeletonBar tone="raised" width={72} height={17} r={5} style={{ marginTop: 12 }} />
        <SkeletonBar tone="raised" width="58%" height={17} style={{ marginTop: 10 }} />
        <div style={{ display: 'flex', marginTop: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: 1 }}>
              <SkeletonBar tone="raised" width={30} height={9} />
              <SkeletonBar tone="raised" width={54} height={12} style={{ marginTop: 6 }} />
            </div>
          ))}
        </div>
      </SkeletonCard>

      {/* Contract: label row, the 40px number, meter, a line of copy. */}
      <SkeletonCard large>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <SkeletonBar tone="raised" width={140} height={10} />
          <SkeletonBar tone="raised" width={48} height={10} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 12 }}>
          <SkeletonBar tone="raised" width={46} height={34} />
          <SkeletonBar tone="raised" width={130} height={12} style={{ marginBottom: 4 }} />
        </div>
        <SkeletonBar tone="raised" height={5} r={3} style={{ marginTop: 14 }} />
        <SkeletonBar tone="raised" width="86%" height={9} style={{ marginTop: 14 }} />
      </SkeletonCard>

      {/* Allowance: label + the two pools. */}
      <SkeletonCard>
        <SkeletonBar tone="raised" width={132} height={10} />
        {[0, 1].map((i) => (
          <div key={i} style={{ marginTop: i ? 11 : 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <SkeletonBar tone="raised" width={64} height={11} />
              <SkeletonBar tone="raised" width={90} height={11} />
            </div>
            <SkeletonBar tone="raised" height={6} r={3} />
          </div>
        ))}
      </SkeletonCard>

      {/* Quick actions: two 78px tiles. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SkeletonCard height={78} />
        <SkeletonCard height={78} />
      </div>
    </div>
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
