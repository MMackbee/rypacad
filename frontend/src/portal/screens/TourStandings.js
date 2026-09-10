import React from 'react';
import { color, font, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import MediaPlaceholder from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import { Body, Card, ErrorNotice, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import { longDayLabel } from '../data/calendar';
import * as hooks from '../hooks';

/**
 * The routing lane is adding `useTourStandings()` to hooks/index.js in
 * parallel against the Sprint 7 pin (TEAM.md, "Hook seam") - it does not
 * exist in this worktree yet. A namespace import (`* as hooks` above) plus
 * this fallback keeps the hook call below unconditional (rules of hooks) and
 * keeps this screen buildable today, matching the exact pattern Roster.js
 * already uses for useSessionAttendance. Once routing's export lands and the
 * branches merge, this fallback stops being used automatically.
 */
function useTourStandingsFallback() {
  return { data: null, loading: false, error: null };
}
const useTourStandings = hooks.useTourStandings || useTourStandingsFallback;

/**
 * RYP Tour — season standings for the weekend tournament leaderboard
 * (Sprint 7 pin, TEAM.md). Route /portal/tour, athlete tab bar's retired DNA
 * slot, parent tab bar in place of the removed Billing tab. Also reachable
 * by coach/ops/owner/mental (no bottom tab bar for those roles today — see
 * AdminDashboard/StaffRoles/NewsletterComposer, none of which render one).
 *
 * Pinned hook: useTourStandings() -> { data: { standings: [{ athleteId,
 * name, rank, points, events, wins }], events: [{ sessionId, date, label,
 * top3: [{ name, position }] }] }, loading, error }. Unlike every other hook
 * in this file it takes no options - there is no demoOpts variant to request
 * loading/error from the hook itself, so this screen's `variant` prop drives
 * the harness states locally instead (the same third-element-props escape
 * hatch StatesHarness already uses for behavior a bare variant can't
 * express). `variant='populated'` (the default, and the only variant a live
 * route ever passes) is a pure pass-through of the real hook result.
 *
 * No invented data: every name, point total and win count is exactly what
 * the hook returns. Rank ties are the hook's own math (TEAM.md: "ties share
 * a rank") - this screen renders `standing.rank` verbatim, never
 * recomputing it. An event with no real label reads "Tournament block",
 * same fallback every other screen uses for an unnamed session.
 *
 * @param {'populated'|'empty'|'loading'|'error'} variant  Harness-only demo
 *   gating - see above.
 * @param {'athlete'|'parent'|'coach'|'ops'|'owner'|'mental'} [role]
 *   Which bottom tab bar to render (only athlete and parent have one).
 * @param {() => void} [onSignOut]  Hidden when not supplied (harness/demo).
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 */
export default function TourStandings({
  variant = 'populated',
  role = 'athlete',
  bare = false,
  onSignOut,
  onRetry,
}) {
  const hookState = useTourStandings();

  const loading = variant === 'loading' || (variant === 'populated' && hookState.loading);
  const error =
    variant === 'error'
      ? new Error("The Tour standings didn't load.")
      : variant === 'populated'
      ? hookState.error
      : null;
  const data =
    variant === 'empty' ? { standings: [], events: [] } : variant === 'populated' ? hookState.data : null;

  const standings = data?.standings ?? [];
  const events = data?.events ?? [];
  const isEmpty = !loading && !error && standings.length === 0 && events.length === 0;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SectionLabel style={{ marginBottom: 4 }}>Season standings</SectionLabel>
            <ScreenTitle>RYP Tour</ScreenTitle>
          </div>
          <SignOutButton onSignOut={onSignOut} />
        </div>
      }
      footer={role === 'athlete' || role === 'parent' ? <BottomTabBar role={role} active="tour" /> : null}
    >
      {loading ? (
        <TourSkeleton />
      ) : error ? (
        <div style={{ padding: '0 22px 24px' }}>
          <ErrorNotice title="The Tour didn't load" onRetry={onRetry}>
            Standings didn't load. Check your connection and try again.
          </ErrorNotice>
        </div>
      ) : isEmpty ? (
        <div style={{ padding: '0 22px 24px' }}>
          <EmptyTour />
        </div>
      ) : (
        <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {standings.length ? <StandingsCard standings={standings} counting={data?.counting} /> : null}
          {events.length ? <RecentTournaments events={events} /> : null}
        </div>
      )}
    </PhoneFrame>
  );
}

/**
 * The loading layout in the loaded layout's geometry: a few standings rows,
 * then a recent-tournament card. No spinner - see components/Skeleton.js.
 */
function TourSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the Tour"
      style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <SkeletonCard large>
        <SkeletonBar tone="raised" width={120} height={10} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: i ? 14 : 16 }}>
            <SkeletonBar tone="raised" width={34} height={34} r="50%" />
            <div style={{ flex: 1 }}>
              <SkeletonBar tone="raised" width="55%" height={13} />
              <SkeletonBar tone="raised" width={70} height={9} style={{ marginTop: 6 }} />
            </div>
            <SkeletonBar tone="raised" width={28} height={16} />
          </div>
        ))}
      </SkeletonCard>
      <SkeletonCard large height={150} />
    </div>
  );
}

function EmptyTour() {
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
      <ScreenTitle size={17}>Nothing on the board yet</ScreenTitle>
      <Body size={12}>The Tour starts with the first Saturday tournament.</Body>
    </div>
  );
}

function StandingsCard({ standings, counting }) {
  // Drop-week transparency (data/tour.js TOUR_DROP_RATE): once drops are in
  // effect, say so — a parent comparing points-per-event against the total
  // would otherwise read the dropped weeks as a math error. Silent until the
  // season has run long enough to earn a drop.
  const showDrops = counting != null && counting.drops > 0;
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: showDrops ? 4 : 12 }}>
        Standings · {standings.length}
      </SectionLabel>
      {showDrops ? (
        <Body size={11} tone={color.textTertiary} style={{ marginBottom: 12 }}>
          Best {counting.counted} of {counting.eventsHeld} Saturdays count —{' '}
          {counting.drops === 1
            ? 'everyone drops their lowest week'
            : `everyone drops their ${counting.drops} lowest weeks`}
          , so a missed Saturday never ends a season.
        </Body>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {standings.map((s, i) => (
          <StandingsRow key={s.athleteId} standing={s} divider={i < standings.length - 1} />
        ))}
      </div>
    </Card>
  );
}

/** Rank 1 is visually celebrated with a tint + border, never a solid fill -
 * a solid green fill is reserved for tappable controls (flag 02, StatusBadge.js);
 * a leaderboard row is a status, not a button. */
function StandingsRow({ standing, divider }) {
  const { name, rank, points, events, wins } = standing;
  const celebrated = rank === 1;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 0',
        borderBottom: divider ? `1px solid ${color.rowRule}` : 'none',
      }}
    >
      <RankBadge rank={rank} celebrated={celebrated} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            font: `600 15px ${font.body}`,
            color: color.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
            {events} event{events === 1 ? '' : 's'}
          </span>
          {wins > 0 ? (
            <StatusBadge tone="green">
              {wins} win{wins === 1 ? '' : 's'}
            </StatusBadge>
          ) : null}
        </div>
      </div>
      <div style={{ flex: 'none', textAlign: 'right' }}>
        <div style={{ font: `700 18px ${font.head}`, color: celebrated ? color.primary : color.text }}>
          {points}
        </div>
        <div
          style={{
            font: `400 9px ${font.body}`,
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            color: color.textTertiary,
            marginTop: 2,
          }}
        >
          pts
        </div>
      </div>
    </div>
  );
}

/** Shared by the standings list and each event's podium - a numbered circle,
 * celebrated (tint + primary border) only for the number 1. */
function RankBadge({ rank, celebrated, size = 34 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: celebrated ? tint.green : 'transparent',
        border: `1.5px solid ${celebrated ? color.primary : color.controlBorder}`,
      }}
    >
      <span
        style={{
          font: `700 ${size >= 34 ? 14 : 11}px ${font.head}`,
          color: celebrated ? color.primary : color.textSecondary,
        }}
      >
        {rank}
      </span>
    </div>
  );
}

function RecentTournaments({ events }) {
  return (
    <div>
      <SectionLabel style={{ marginBottom: 10 }}>Recent tournaments</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map((e) => (
          <EventCard key={e.sessionId} event={e} />
        ))}
      </div>
    </div>
  );
}

function EventCard({ event }) {
  const top3 = event.top3 ?? [];
  return (
    <Card>
      <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
        {longDayLabel(event.date)}
      </div>
      <div style={{ font: `700 15px ${font.head}`, color: color.text, marginTop: 3 }}>
        {/* No invented session names — the same "Tournament block" fallback
            every other screen uses for an unlabeled session (TEAM.md). */}
        {event.label || 'Tournament block'}
      </div>
      {top3.length ? (
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          {top3.map((p) => (
            <PodiumSpot key={p.position} podium={p} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function PodiumSpot({ podium }) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
      <div style={{ margin: '0 auto 6px' }}>
        <RankBadge rank={podium.position} celebrated={podium.position === 1} size={26} />
      </div>
      <div
        style={{
          font: `500 11px ${font.body}`,
          color: color.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {podium.name}
      </div>
    </div>
  );
}
