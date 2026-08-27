import React from 'react';
import { color, font, radius } from '../tokens';
import AthleteRow, { AttendanceControls } from '../components/AthleteRow';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import TypeChip from '../components/TypeChip';
import { BackLink, ScreenTitle } from '../components/Primitives';
import useRoster from '../hooks/useRoster';
import { SESSION } from '../data/seed';

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
 * @param {'pre'|'progress'|'complete'|'noshow'} variant
 */
export default function Roster({ variant = 'pre', bare = false, onBack }) {
  const { roster, marks, mark, counts, sessionState } = useRoster({ variant });

  const started = sessionState !== 'pre';
  const completed = sessionState === 'completed';

  const statusPill = {
    pre: { tone: 'neutral', label: SESSION.startsIn },
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
            <TypeChip type={SESSION.type} />
            <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
              {SESSION.blockLabel}
            </span>
          </div>

          <ScreenTitle size={21}>{SESSION.name}</ScreenTitle>
          <div style={{ font: `400 12px ${font.body}`, color: color.textSecondary, marginTop: 5 }}>
            {SESSION.meta}
          </div>

          <CounterRow counts={counts} started={started} />
        </div>
      }
      footer={
        <RosterFooter
          sessionState={sessionState}
          unmarked={counts.unmarked}
          completed={completed}
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

function RosterFooter({ sessionState, unmarked, completed }) {
  const hint = completed
    ? 'No-shows are reported to Phil, not the coach chain.'
    : 'Tap a green or red button again to clear it.';

  let cta;
  if (sessionState === 'pre') {
    cta = (
      <Button variant="pinned" height={56}>
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
        <Button variant="caution" height={56} style={{ boxShadow: 'none' }}>
          Close block · {unmarked} unmarked
        </Button>
      ) : (
        <Button variant="pinned" height={56}>
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
