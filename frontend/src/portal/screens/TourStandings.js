import React, { useEffect, useMemo, useState } from 'react';
import { color, font, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import MediaPlaceholder from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import { Body, Card, ErrorNotice, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import { longDayLabel } from '../data/calendar';
// Pure derived-scoring helper per the seam rule - data still travels through
// the hook below; this is the same "single knob" pointsForPosition() every
// standings/points display in the app must go through rather than
// re-deriving its own table (data/tour.js TOUR_POINTS).
import { pointsForPosition } from '../data/tour';
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

/** 1 -> '1st', 2 -> '2nd', 3 -> '3rd', 4 -> '4th', 11 -> '11th', ... */
function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

/**
 * RYP Tour — season standings for the weekend tournament leaderboard
 * (Sprint 7 pin, TEAM.md). Route /portal/tour, athlete tab bar's retired DNA
 * slot, parent tab bar in place of the removed Billing tab. Also reachable
 * by coach/ops/owner/mental (no bottom tab bar for those roles today — see
 * AdminDashboard/StaffRoles/NewsletterComposer, none of which render one).
 *
 * Sprint 8 pin (TEAM.md, contract v1.6): the leaderboard now splits into age
 * brackets. Pinned hook: useTourStandings() -> { data: { brackets: [{ id,
 * label, standings: [{ athleteId, name, rank, points, events, wins }] }],
 * events: [{ sessionId, date, label, results: [{ athleteId, name, bracket,
 * score, position }] }], counting: { eventsHeld, counted, drops } }, loading,
 * error }. Only non-empty brackets are ever returned, in BRACKETS order with
 * 'open' last (data/tour.js) - this screen still filters defensively so a
 * change on that guarantee can never surface an empty selector chip. Unlike
 * every other hook in this file it takes no options - there is no demoOpts
 * variant to request loading/error from the hook itself, so this screen's
 * `variant` prop drives the harness states locally instead (the same
 * third-element-props escape hatch StatesHarness already uses for behavior a
 * bare variant can't express). `variant='populated'` (the default, and the
 * only variant a live route ever passes) is a pure pass-through of the real
 * hook result.
 *
 * No invented data: every name, score and point total is exactly what the
 * hook returns. Rank ties are the hook's own math (TEAM.md: "ties share a
 * rank") - this screen renders `standing.rank` verbatim, never recomputing
 * it. An event with no real label reads "Tournament block", same fallback
 * every other screen uses for an unnamed session.
 *
 * `athleteId` (Sprint 8 pin) is new and optional, defaulting to undefined -
 * PortalRoutes.js (routing lane) does not thread it through this sprint, so
 * both behaviors it powers degrade gracefully with it absent: the athlete
 * default-bracket selection falls back to the first bracket, and the "Your
 * results" card simply does not render. See the sprint report.
 *
 * @param {'populated'|'empty'|'loading'|'error'} variant  Harness-only demo
 *   gating - see above.
 * @param {'athlete'|'parent'|'coach'|'ops'|'owner'|'mental'} [role]
 *   Which bottom tab bar to render (only athlete and parent have one); also
 *   gates the athlete-only own-bracket default and "Your results" card.
 * @param {string} [athleteId]  The signed-in athlete's id (athlete role
 *   only) - used to default-select their own bracket and to filter their
 *   personal results log. Undefined renders both features off.
 * @param {() => void} [onSignOut]  Hidden when not supplied (harness/demo).
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 */
export default function TourStandings({
  variant = 'populated',
  role = 'athlete',
  athleteId,
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
    variant === 'empty' ? { brackets: [], events: [] } : variant === 'populated' ? hookState.data : null;

  // Only non-empty brackets ever reach the selector - see the hook's own
  // contract above; filtering again here is a defensive no-op against it,
  // never a second source of truth.
  const brackets = useMemo(() => (data?.brackets ?? []).filter((b) => (b.standings?.length ?? 0) > 0), [data]);
  const events = data?.events ?? [];
  const isEmpty = !loading && !error && brackets.length === 0 && events.length === 0;

  // Selection is local state (Sprint 8 pin) - once set it survives a data
  // refresh (the effect below leaves a still-valid selection alone). Default:
  // the athlete's own bracket when the viewer is an athlete who appears in
  // exactly one bracket's standings; the first bracket otherwise, including
  // every non-athlete role and every athlete for whom `athleteId` is absent
  // (PortalRoutes.js does not thread it through this sprint - see the
  // component doc comment).
  const [selectedBracketId, setSelectedBracketId] = useState(null);
  useEffect(() => {
    if (!brackets.length) return;
    if (selectedBracketId && brackets.some((b) => b.id === selectedBracketId)) return;
    let defaultId = brackets[0].id;
    if (role === 'athlete' && athleteId) {
      const owning = brackets.filter((b) => b.standings.some((s) => s.athleteId === athleteId));
      if (owning.length === 1) defaultId = owning[0].id;
    }
    setSelectedBracketId(defaultId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brackets, role, athleteId]);

  const selected = brackets.find((b) => b.id === selectedBracketId) ?? brackets[0] ?? null;

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
          {brackets.length ? (
            <BracketSelector brackets={brackets} selectedId={selected?.id} onSelect={setSelectedBracketId} />
          ) : null}
          {selected ? (
            selected.standings.length ? (
              <StandingsCard standings={selected.standings} counting={data?.counting} />
            ) : (
              <NoBracketResults />
            )
          ) : null}
          {events.length && selected ? <RecentTournaments events={events} bracketId={selected.id} /> : null}
          {role === 'athlete' && athleteId ? <YourResults events={events} athleteId={athleteId} /> : null}
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

/**
 * Defensive-only (Sprint 8 pin): brackets reaching this screen are always
 * non-empty by construction (see the hook's own contract and this screen's
 * own filter above), so in practice `selected.standings` is never empty.
 * Kept as a real state rather than a silent blank list purely because the
 * pin calls it out by name - "update the empty state only if the bracket
 * filter needs one ('No results in this bracket yet')".
 */
function NoBracketResults() {
  return (
    <div
      style={{
        border: `1px dashed ${color.border}`,
        borderRadius: radius.card,
        padding: '22px 16px',
        textAlign: 'center',
      }}
    >
      <Body size={12}>No results in this bracket yet.</Body>
    </div>
  );
}

/**
 * Age-bracket selector chips (Sprint 8 pin, TEAM.md, contract v1.6) - one
 * per non-empty bracket, in the hook's own order (BRACKETS order, 'open'
 * last). This is a real control the viewer taps to switch which bracket the
 * standings/podiums/results below describe, so per flag 02 (StatusBadge.js)
 * the active chip carries the solid-fill "tappable" treatment - the same
 * selected/unselected idiom MySchedule's Segmented control and
 * AdminDashboard's tier filter already use - rather than StatusBadge's
 * outline/tint (reserved for status, not a control).
 */
function BracketSelector({ brackets, selectedId, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {brackets.map((b) => {
        const active = b.id === selectedId;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            style={{
              height: 44,
              padding: '0 16px',
              borderRadius: radius.pill,
              border: `1px solid ${active ? color.primary : color.border}`,
              background: active ? color.primary : 'transparent',
              color: active ? '#000' : color.textSecondary,
              font: `600 13px ${font.body}`,
              cursor: 'pointer',
            }}
          >
            {b.label || b.id}
          </button>
        );
      })}
    </div>
  );
}

function StandingsCard({ standings, counting }) {
  // Drop-week transparency (data/tour.js TOUR_DROP_RATE): once drops are in
  // effect, say so — a parent comparing points-per-event against the total
  // would otherwise read the dropped weeks as a math error. Silent until the
  // season has run long enough to earn a drop. `counting` stays global
  // across brackets (TEAM.md: "eventsHeld stays global") even though the
  // standings list itself is now the selected bracket's.
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

function RecentTournaments({ events, bracketId }) {
  return (
    <div>
      <SectionLabel style={{ marginBottom: 10 }}>Recent tournaments</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map((e) => (
          <EventCard key={e.sessionId} event={e} bracketId={bracketId} />
        ))}
      </div>
    </div>
  );
}

/**
 * One event's card, podium narrowed to the selected bracket (Sprint 8 pin).
 * `event.results` carries every bracket's rows, already sorted bracket order
 * then position (TEAM.md, contract v1.6) - filtering to one bracket id
 * preserves that ascending position order, so no re-sort is needed here. A
 * row's `bracket` is the raw write-time snapshot ('10U'|'11-13'|'14+'|null);
 * null groups under the 'open' bracket id, matching how the standings side
 * groups it.
 */
function EventCard({ event, bracketId }) {
  const podium = (event.results ?? []).filter((r) => (r.bracket ?? 'open') === bracketId).slice(0, 3);
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
      {podium.length ? (
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          {podium.map((p) => (
            <PodiumSpot key={p.position} podium={p} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/** Podium spot, now with the score (Sprint 8 pin) - strokes, exactly what
 * the coach entered, never invented or recomputed. */
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
        {podium.score ?? '—'}
      </div>
    </div>
  );
}

/**
 * "Your results" (Sprint 8 pin, TEAM.md, contract v1.6) - athlete-only,
 * needs no new hook: `events[].results` already carries every bracket's
 * rows, so this is a pure client-side filter by `athleteId`. `events` is
 * already sorted date desc (the hook's own contract) and this only removes
 * rows, so the result stays most-recent-first with no extra sort. Renders
 * nothing when the athlete has no results yet, or (per the component doc
 * comment) when `athleteId` was never supplied.
 */
function YourResults({ events, athleteId }) {
  const rows = events.flatMap((e) =>
    (e.results ?? [])
      .filter((r) => r.athleteId === athleteId)
      .map((r) => ({ ...r, date: e.date, sessionId: e.sessionId }))
  );
  if (!rows.length) return null;
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 12 }}>Your results</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, i) => (
          <YourResultRow key={r.sessionId} row={r} divider={i < rows.length - 1} />
        ))}
      </div>
    </Card>
  );
}

function YourResultRow({ row, divider }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '11px 0',
        borderBottom: divider ? `1px solid ${color.rowRule}` : 'none',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{longDayLabel(row.date)}</div>
        <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>
          {row.score} strokes · {ordinal(row.position)} in bracket
        </div>
      </div>
      <div style={{ flex: 'none', textAlign: 'right' }}>
        <div style={{ font: `700 16px ${font.head}`, color: color.text }}>{pointsForPosition(row.position)}</div>
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
