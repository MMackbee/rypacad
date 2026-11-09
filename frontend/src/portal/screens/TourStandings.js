import React, { useMemo, useState } from 'react';
import { color, font, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import MediaPlaceholder from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import { Body, Card, ErrorNotice, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import TourFilters from '../components/tour/TourFilters';
import YourResults from '../components/tour/YourResults';
import { longDayLabel } from '../data/calendar';
import { TOUR_POINTS_RULE, tourEventExplainer } from '../data/tour';
import { ageFiltersFor, boardIdFor, boardLabel, defaultAgeFor, genderFiltersFor } from '../data/tourBoards';
import useAllElite from '../hooks/elite';
import { useTourViewerIds } from '../hooks/tourViewer';
import * as hooks from '../hooks';

/**
 * Namespace import plus an inert fallback, the pattern Roster.js uses: a
 * test or harness that mocks ../hooks without useTourStandings still renders.
 */
function useTourStandingsFallback() {
  return { data: null, loading: false, error: null };
}
const useTourStandings = hooks.useTourStandings || useTourStandingsFallback;

/**
 * RYP Tour — season standings (Sprint 7 pin; route /portal/tour). Athletes
 * and parents reach it from their tab bar; staff keep their own bar here
 * (Phil's set via `specialistId`), so it is no dead end.
 *
 * ONE leaderboard at a time, picked by two filters (owner ruling 2026-11-06):
 * Age (11–18 overall, the default / 10 & under / 11–14 / 15–18 / Coaches,
 * plus Open only when someone has no dob, and any legacy board) and Gender
 * (All / Boys / Girls; All / Men / Women for Coaches; hidden for a one-board
 * age). Each combination is exactly one board of useTourStandings'
 * { boards, events } (data/tourBoards.js boardIdFor), and the standings and
 * the recent events below both follow it. An athlete or parent lands on the
 * first Age filter whose board ranks them or their household (Gender All):
 * an 11-18 kid stays on Overall, a 10 & under kid opens on 10 & under. The
 * landing follows the data until the viewer taps a filter.
 *
 * No invented data: every name, score and point total is the hook's own, and
 * ranks render verbatim (ties share a rank). An event with no label reads
 * "Tour event". `variant` drives the harness states locally ('populated',
 * the default and the only one a live route passes, is a pass-through).
 * `athleteId` (athlete role) unlocks "Your results".
 */
export default function TourStandings({
  variant = 'populated',
  role = 'athlete',
  athleteId,
  specialistId,
  bare = false,
  practice = false,
  onSignOut,
  onRetry,
}) {
  const hookState = useTourStandings();
  const family = role === 'athlete' || role === 'parent';
  // `practice` (the onboarding walkthrough) reads nothing of the member's own.
  const allElite = useAllElite({ enabled: family && !practice });
  const viewerIds = useTourViewerIds({ role, athleteId, enabled: family && !practice });

  const loading = variant === 'loading' || (variant === 'populated' && hookState.loading);
  const error =
    variant === 'error'
      ? new Error("The Tour standings didn't load.")
      : variant === 'populated'
      ? hookState.error
      : null;
  const data = useMemo(
    () => (variant === 'empty' ? { boards: [], events: [] } : variant === 'populated' ? hookState.data : null),
    [variant, hookState.data]
  );
  const boards = useMemo(() => (data?.boards ?? []).filter((b) => (b.standings?.length ?? 0) > 0), [data]);
  const events = data?.events ?? [];
  const isEmpty = !loading && !error && boards.length === 0 && events.length === 0;

  const ages = useMemo(() => ageFiltersFor(boards.map((b) => b.id)), [boards]);
  const landing = defaultAgeFor(boards, viewerIds);
  const [tapped, setTapped] = useState(null); // the Age the viewer pinned by tapping either filter
  const [gender, setGender] = useState('all');
  const age = tapped && ages.some((a) => a.id === tapped) ? tapped : landing;
  // A Gender tap pins the age on screen too (review 2026-11-06): a landing
  // that arrives later (the viewer's ids, a refetch) must not move a board
  // the viewer picked.
  const pickGender = (g) => {
    setTapped(age);
    setGender(g);
  };
  // Gender carries between the kids' groups (Girls on 11–14 stays Girls on
  // 15–18) but resets to All when the Age crosses to or from Coaches, so
  // Girls never turns into an empty Coaches · Women board (2026-11-07).
  const pickAge = (next) => {
    if ((next === 'coaches') !== (age === 'coaches')) setGender('all');
    setTapped(next);
  };
  const genders = genderFiltersFor(age);
  const boardId = boardIdFor(age, genders ? gender : 'all');
  const board = boards.find((b) => b.id === boardId) ?? null;
  const boardEvents = events.filter((e) => (e.boards?.[boardId]?.length ?? 0) > 0);
  // Families only: what a Tour event is, above the board it feeds. Its token
  // sentence shows once a token athlete is known to be reading (allElite
  // false) - never to an Elite family, nor while that is still loading.
  const explainer = family ? <Body size={12}>{tourEventExplainer(allElite !== false)}</Body> : null;

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
      footer={<BottomTabBar role={role} specialistId={specialistId} active="tour" />}
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
        <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {explainer}
          <EmptyTour />
        </div>
      ) : (
        <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {explainer}
          <TourFilters ages={ages} age={age} onAge={pickAge} genders={genders} gender={gender} onGender={pickGender} />
          {board ? <StandingsCard label={board.label} standings={board.standings} /> : <NoBoardResults label={boardLabel(boardId)} />}
          {boardEvents.length ? <RecentTourEvents events={boardEvents} boardId={boardId} /> : null}
          {role === 'athlete' && athleteId ? <YourResults events={events} athleteId={athleteId} boardId={boardId} /> : null}
        </div>
      )}
    </PhoneFrame>
  );
}

/**
 * The loading layout in the loaded layout's geometry: a few standings rows,
 * then a recent-event card. No spinner - see components/Skeleton.js.
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
      <Body size={12}>The RYP Tour starts with the first Tour event.</Body>
    </div>
  );
}

/** A filter combination nobody has a score on yet (15–18 Girls before anyone plays, say). */
function NoBoardResults({ label }) {
  return (
    <div
      style={{
        border: `1px dashed ${color.border}`,
        borderRadius: radius.card,
        padding: '22px 16px',
        textAlign: 'center',
      }}
    >
      <Body size={12}>No scores on the {label} leaderboard yet.</Body>
    </div>
  );
}

function StandingsCard({ label, standings }) {
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 4 }}>
        {label} · {standings.length}
      </SectionLabel>
      <Body size={11} tone={color.textTertiary} style={{ marginBottom: 12 }}>
        {TOUR_POINTS_RULE}
      </Body>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {standings.map((s, i) => (
          <StandingsRow key={s.athleteId} standing={s} divider={i < standings.length - 1} />
        ))}
      </div>
    </Card>
  );
}

/** Rank 1 is celebrated with a tint + border, never a solid fill - a solid
 * green fill is reserved for tappable controls (flag 02, StatusBadge.js). */
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

function RecentTourEvents({ events, boardId }) {
  return (
    <div>
      <SectionLabel style={{ marginBottom: 10 }}>Recent Tour events</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* v1.6.1: an event is a DATE (all of one Saturday's blocks merged). */}
        {events.map((e) => (
          <EventCard key={e.date} event={e} boardId={boardId} />
        ))}
      </div>
    </div>
  );
}

/** One Saturday on the selected board: its top three by derived place, with scores and points. */
function EventCard({ event, boardId }) {
  const podium = (event.boards?.[boardId] ?? []).slice(0, 3);
  return (
    <Card>
      <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>{longDayLabel(event.date)}</div>
      <div style={{ font: `700 15px ${font.head}`, color: color.text, marginTop: 3 }}>
        {/* No invented session names — the same "Tour event" fallback every other screen uses. */}
        {event.label || 'Tour event'}
      </div>
      {podium.length ? (
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          {podium.map((p) => (
            <PodiumSpot key={p.athleteId} podium={p} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/** Podium spot - strokes exactly as the coach entered them, and the points that place earned. */
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
      <div style={{ font: `600 10px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
        {podium.score ?? '—'} · {podium.points} pts
      </div>
    </div>
  );
}
