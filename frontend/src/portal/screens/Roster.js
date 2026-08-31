import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import AthleteRow, { AttendanceControls } from '../components/AthleteRow';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import TypeChip from '../components/TypeChip';
import { BackLink, Body, Card, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import useRoster from '../hooks/useRoster';
import { useCoachRoster, useSession } from '../hooks';

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
 * @param {'pre'|'progress'|'complete'|'noshow'} variant
 */
export function SessionAttendance({ variant = 'pre', bare = false, onBack }) {
  const { roster, marks, mark, counts, sessionState: demoState } = useRoster({ variant });
  // The block comes out of the generated season, so the header matches what the
  // schedule says is actually running rather than a hand-written constant.
  const { data: session } = useSession();

  // Overrides the demo state the instant the coach actually starts the
  // session - real use never passes a variant, so demoState is always 'pre'
  // until this fires.
  const [localStatus, setLocalStatus] = useState(null);
  const sessionState = localStatus ?? demoState;

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
