import React, { useMemo, useState } from 'react';
import { color, font, radius } from '../tokens';
import AthleteRow, { AttendanceControls } from '../components/AthleteRow';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import TypeChip from '../components/TypeChip';
import { BackLink, Body, Card, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import useRoster from '../hooks/useRoster';
import * as hooks from '../hooks';
import { useCoachRoster, useSession } from '../hooks';
import { isLive } from '../hooks/live';

/**
 * The routing lane is adding `useSessionAttendance(sessionId)` to hooks/index.js
 * in parallel against the Sprint 6 pin (TEAM.md) - it does not exist in this
 * worktree yet. A namespace import (`* as hooks` above) plus this fallback
 * keeps the hook call below unconditional (rules of hooks) and keeps this
 * screen buildable today; `hooks.useSessionAttendance` is resolved once per
 * module load, never mid-render, so which function runs cannot flip across
 * renders of a mounted screen. Once routing's export lands and the branches
 * merge, this fallback stops being used automatically - nothing here needs
 * to change.
 */
function useSessionAttendanceFallback() {
  return { data: null, loading: false, error: null, mark: () => {} };
}
const useSessionAttendance = hooks.useSessionAttendance || useSessionAttendanceFallback;

/**
 * Roster - coach. The coach's full assigned roster, not one session's
 * attendance (Sprint 5 pin, TEAM.md) - this is the bottom tab bar's "Roster"
 * destination, reached with no session context, so it shows the team rather
 * than jumping into whichever block happens to be running.
 *
 * The session-by-session IN/OUT attendance screen (handoff screen 13, the
 * ⭐ in-session working screen) still exists in full below as
 * `SessionAttendance` - it is what "Start roster" / "View roster" on a
 * Coach Dashboard block card should open. PortalRoutes.js (routing lane,
 * not this lane's file) currently points both that action and this tab at
 * the same /portal/roster route; see the sprint report for the routing
 * follow-up this split needs.
 */
export default function Roster({ bare = false, onSignOut }) {
  const rosterState = useCoachRoster();
  const athletes = rosterState.data ?? [];

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <ScreenTitle style={{ flex: 1 }}>Roster</ScreenTitle>
          <SignOutButton onSignOut={onSignOut} />
        </div>
      }
      footer={<BottomTabBar role="coach" active="roster" />}
    >
      <div style={{ padding: '0 22px 24px' }}>
        {rosterState.loading ? (
          <Card large>
            <Body size={12}>Loading your roster…</Body>
          </Card>
        ) : athletes.length ? (
          <Card large>
            <SectionLabel style={{ marginBottom: 6 }}>Your athletes · {athletes.length}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {athletes.map((a, i) => (
                <AthleteRow
                  key={a.id}
                  name={a.name}
                  meta={a.meta}
                  avatarSize={44}
                  nameSize={16}
                  divider={i < athletes.length - 1}
                />
              ))}
            </div>
          </Card>
        ) : (
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
        )}
      </div>
    </PhoneFrame>
  );
}

/**
 * 13 · Session Roster & Attendance - coach.
 * States: Pre-session, In progress, Completed, No-shows flagged.
 *
 * The in-session working screen. Used on a phone or tablet while standing in a
 * loud facility, so: IN/OUT are 64x48 with 7px between them, no typing is
 * required to complete the core task, notes are optional chips rather than
 * required fields, and the header is sticky so the counters stay visible while
 * scrolling a long roster.
 *
 * See useRoster for the unimplemented offline path, which is the highest-risk
 * gap in this screen.
 *
 * Sprint 5 pin (TEAM.md): session start is never time-gated - the button is
 * always tappable, with no window check anywhere in this file - and the
 * reported bug (tapping "Start session" did nothing) was that the button had
 * no onClick at all; `useRoster`'s `sessionState` is driven purely by the
 * demo `variant` prop, with no real transition. `localStatus` below is the
 * fix: a component-local override the coach's own tap sets, the same pattern
 * CommitmentContract uses for its practice-mode overlay.
 *
 * Sprint 6 pin (TEAM.md, QA #6/#7): wired to the routing lane's pinned
 * `useSessionAttendance(sessionId)` -> { data: [{ bookingId, athleteId, name,
 * status }], loading, error, mark(bookingId, status) } when live and a real
 * `sessionId` reaches this screen - IN marks 'attended', OUT marks 'noshow',
 * clearing a mark returns it to 'confirmed'. `useRoster`'s demo/harness path
 * is preserved exactly (unchanged when not live, or when no sessionId is
 * passed) - both hooks are called unconditionally every render and this
 * screen picks which result to use, the same split-on-a-stable-condition
 * pattern PortalRoutes.js already uses for isLive().
 *
 * `sessionId` is meant to reach this screen as a prop from PortalRoutes.js
 * (routing lane, not this lane's file) once the Coach Dashboard's "Start
 * roster"/"View roster" tap threads a real session id through - it does not
 * today (see CoachDashboard.js's BlockCard and the sprint report). Without
 * it this screen falls back to the exact pre-Sprint-6 demo/seed behavior, so
 * nothing regresses while that routing work lands; `blockIndex`, if passed,
 * at least lets a seed-mode caller pick which of today's generated blocks the
 * header describes (COACH_BLOCKS and the season's daily blocks share the same
 * chronological order), closing QA #6 for the part this lane owns.
 *
 * @param {'pre'|'progress'|'complete'|'noshow'} variant
 * @param {string} [sessionId]   Real Firestore session id - live mode only.
 * @param {number} [blockIndex]  Which of today's blocks (0-based) - seed mode.
 */
export function SessionAttendance({ variant = 'pre', bare = false, onBack, sessionId, blockIndex }) {
  const { roster: demoRoster, marks: demoMarks, mark: demoMark, counts: demoCounts, sessionState: demoState } =
    useRoster({ variant });
  // The block comes out of the generated season, so the header matches what the
  // schedule says is actually running rather than a hand-written constant.
  // blockIndex (from CoachDashboard's tapped block, seed mode) narrows it to
  // the exact block that was tapped instead of always the default.
  const { data: session } = useSession(blockIndex != null ? { blockIndex } : undefined);

  // Live attendance rows for a real session, always called (rules of hooks) -
  // only used when `live` below is true.
  const liveAttendance = useSessionAttendance(sessionId);
  const live = isLive() && sessionId != null;

  const bookingByAthlete = useMemo(() => {
    if (!liveAttendance.data) return new Map();
    return new Map(liveAttendance.data.map((r) => [r.athleteId, r.bookingId]));
  }, [liveAttendance.data]);

  // bookings.status -> the roster's three-state mark (Sprint 6 pin: IN ->
  // 'attended', OUT -> 'noshow', clearing a mark -> 'confirmed'/unmarked).
  const roster = live
    ? (liveAttendance.data ?? []).map((r) => ({ id: r.athleteId, name: r.name, meta: null }))
    : demoRoster;
  const marks = live
    ? Object.fromEntries(
        (liveAttendance.data ?? [])
          .map((r) => [r.athleteId, r.status === 'attended' ? 'in' : r.status === 'noshow' ? 'out' : null])
          .filter(([, v]) => v != null)
      )
    : demoMarks;
  const counts = live
    ? {
        in: roster.filter((a) => marks[a.id] === 'in').length,
        out: roster.filter((a) => marks[a.id] === 'out').length,
        unmarked: roster.filter((a) => marks[a.id] == null).length,
      }
    : demoCounts;
  const mark = live
    ? (athleteId, next) => {
        const bookingId = bookingByAthlete.get(athleteId);
        if (!bookingId) return;
        liveAttendance.mark(bookingId, next === 'in' ? 'attended' : next === 'out' ? 'noshow' : 'confirmed');
      }
    : demoMark;

  // Overrides the demo state the instant the coach actually starts the
  // session - real use never passes a variant, so demoState is always 'pre'
  // until this fires. Live mode has no persisted "session in progress" concept
  // yet (only the attendance marks persist, per the Sprint 6 pin), so it
  // starts 'pre' the same way and is driven by the same local override.
  const [localStatus, setLocalStatus] = useState(null);
  const sessionState = localStatus ?? (live ? 'pre' : demoState);

  const started = sessionState !== 'pre';
  const completed = sessionState === 'completed';

  const statusPill = {
    pre: { tone: 'neutral', label: session?.startsIn },
    progress: { tone: 'green', label: 'In progress' },
    completed:
      counts.out > 0
        ? { tone: 'red', label: `${counts.out} no-shows` }
        : { tone: 'green', label: 'Completed' },
  }[sessionState];

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '4px 22px 14px', background: color.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <BackLink onClick={onBack}>‹ Today</BackLink>
            <div style={{ flex: 1 }} />
            <StatusBadge tone={statusPill.tone}>{statusPill.label}</StatusBadge>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <TypeChip type={session?.type} />
            <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
              {session?.blockLabel}
            </span>
          </div>

          <ScreenTitle size={21}>{session?.name}</ScreenTitle>
          <div style={{ font: `400 12px ${font.body}`, color: color.textSecondary, marginTop: 5 }}>
            {session?.meta}
          </div>

          <CounterRow counts={counts} started={started} />
        </div>
      }
      footer={
        <RosterFooter
          sessionState={sessionState}
          unmarked={counts.unmarked}
          completed={completed}
          onStart={() => setLocalStatus('progress')}
          onClose={() => setLocalStatus('completed')}
        />
      }
    >
      <div style={{ padding: '0 22px 20px' }}>
        {roster.map((athlete, i) => {
          const value = marks[athlete.id] ?? null;
          const noShow = value === 'out';

          return (
            <div key={athlete.id}>
              <AthleteRow
                name={athlete.name}
                meta={athlete.meta}
                avatarSize={42}
                nameSize={16}
                divider={i < roster.length - 1 && !noShow}
                trailing={
                  <AttendanceControls
                    value={value}
                    onChange={(next) => mark(athlete.id, next)}
                  />
                }
              />
              {/* Optional note chip, indented to align under the name. Never a
                  required field - a required note is how attendance stops
                  getting marked at all. */}
              {noShow ? (
                <div
                  style={{
                    marginLeft: 54,
                    marginBottom: 11,
                    paddingBottom: 11,
                    borderBottom:
                      i < roster.length - 1 ? `1px solid ${color.rowRule}` : 'none',
                  }}
                >
                  <NoteChip noShow />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

/**
 * Three counters, and unmarked is a first-class one. Closing a block with
 * unmarked athletes is what produces bad no-show data, so the count has to be
 * visible the whole time rather than discovered at the footer.
 */
function CounterRow({ counts, started }) {
  const cells = [
    { key: 'in', label: 'In', value: counts.in, tone: color.primary },
    { key: 'out', label: 'Out', value: counts.out, tone: color.error },
    {
      key: 'unmarked',
      label: 'Unmarked',
      value: counts.unmarked,
      // Unmarked only goes yellow once the session has actually started -
      // before that, everyone being unmarked is simply the starting position.
      tone: started ? color.secondary : null,
    },
  ];

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      {cells.map((c) => {
        const active = c.value > 0 && c.tone;
        return (
          <div
            key={c.key}
            style={{
              flex: 1,
              borderRadius: radius.counter,
              padding: '10px 0',
              textAlign: 'center',
              background: active ? 'transparent' : color.dimmed,
              border: `1px solid ${active ? c.tone : color.rule}`,
            }}
          >
            <div
              style={{
                font: `700 22px ${font.head}`,
                color: active ? c.tone : color.disabledText,
              }}
            >
              {c.value}
            </div>
            <div
              style={{
                font: `400 9px ${font.body}`,
                textTransform: 'uppercase',
                letterSpacing: '.1em',
                color: active ? c.tone : color.disabledText,
                opacity: 0.75,
                marginTop: 2,
              }}
            >
              {c.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RosterFooter({ sessionState, unmarked, completed, onStart, onClose }) {
  const hint = completed
    ? 'No-shows are reported to Phil, not the coach chain.'
    : 'Tap a green or red button again to clear it.';

  let cta;
  if (sessionState === 'pre') {
    // Never time-gated - always tappable, with no window check anywhere in
    // this screen. This onClick is the fix: the button previously had none.
    cta = (
      <Button variant="pinned" height={56} onClick={onStart}>
        Start session
      </Button>
    );
  } else if (completed) {
    cta = (
      <Button variant="outline" height={56} style={{ boxShadow: 'none' }}>
        Add a session note
      </Button>
    );
  } else {
    // The gate on unmarked athletes is soft: the button still works and states
    // the count, because a coach may legitimately need to close with a gap.
    // Blocking it outright would just get attendance abandoned mid-session.
    cta =
      unmarked > 0 ? (
        <Button variant="caution" height={56} style={{ boxShadow: 'none' }} onClick={onClose}>
          Close block · {unmarked} unmarked
        </Button>
      ) : (
        <Button variant="pinned" height={56} onClick={onClose}>
          Close block
        </Button>
      );
  }

  return (
    <div
      style={{
        borderTop: `1px solid ${color.frameRule}`,
        padding: '14px 22px 22px',
        background: color.bg,
      }}
    >
      {cta}
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
  );
}

function NoteChip({ noShow }) {
  return (
    <button
      type="button"
      style={{
        background: noShow ? 'rgba(255,68,68,.08)' : '#161616',
        border: `1px solid ${noShow ? 'rgba(255,68,68,.4)' : color.rule}`,
        borderRadius: radius.badge,
        padding: '6px 10px',
        font: `500 11px ${font.body}`,
        color: noShow ? color.error : color.textTertiary,
        cursor: 'pointer',
      }}
    >
      {noShow ? '+ Add a reason (optional)' : '+ Add a note'}
    </button>
  );
}
