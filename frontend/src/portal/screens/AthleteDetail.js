import React from 'react';
import { color, font, radius } from '../tokens';
import * as hooks from '../hooks';
import AthleteMembershipCard from '../components/AthleteMembershipCard';
import BottomTabBar from '../components/BottomTabBar';
import HandicapCard from '../components/HandicapCard';
import { Avatar } from '../components/MediaPlaceholder';
import ParentContractCard from '../components/ParentContractCard';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter, { meterColor } from '../components/ProgressMeter';
import { ReservedChip } from '../components/Reserved';
import { BackLink, Body, Card, ScreenTitle, SectionLabel, Tick } from '../components/Primitives';
import { useAthleteDetail } from '../hooks';
import { loginStatusLine } from '../data/billingCopy';
import { contractEnabled } from '../data/contractFlag';
import { reservedTag } from '../data/reserved';

/**
 * Sprint 10 pin C: same fallback rationale as DiagnosticCapture.js's own
 * useDiagnosticState - useDiagnostic() in this worktree takes no argument
 * and returns { athlete, sections }, not the pinned { latest, draft,
 * sections }. Called with the pinned athleteId argument regardless (the old
 * implementation just ignores it); `latest` defaults to null (honest "no
 * capture yet") until routing lands the real shape.
 */
function useLatestDiagnostic(athleteId) {
  const state = hooks.useDiagnostic(athleteId);
  // `sections` is the field catalogue the capture's `values` are keyed
  // against — it lives BESIDE `latest` in the hook payload, not inside it
  // (PM integration browser pass: the card read latest.sections, which a
  // capture doc never carries, so it rendered "No capture yet" forever).
  return {
    latest: state.data?.latest ?? null,
    sections: state.data?.sections ?? [],
    loading: state.loading,
    error: state.error,
  };
}

/**
 * 09 · Athlete Detail - parent view of one linked athlete.
 * States: Populated, Limited data.
 *
 * ACCESS BOUNDARY: a parent sees reflection *summaries* only, never full
 * transcripts. That protects the athlete's candour with Yannick, and it is
 * enforced server-side per role — the API must not return transcripts to a
 * parent account regardless of what this UI asks for. The card below states the
 * boundary rather than hiding it, so a parent understands the limit is
 * deliberate.
 *
 * @param {'populated'|'limited'} variant
 * @param {'parent'|'athlete'|'coach'|'mental'|'ops'|'owner'} [role]
 *   Sprint 11 pin E (TEAM.md): gates the new Membership card — ops/owner get
 *   the editable package pickers, coach/mental see the same facts read-only,
 *   parent/athlete get nothing here (their own view is screens/Membership.js
 *   instead — this card is staff-only, "no separate staff route"). Defaults
 *   to 'parent', matching every existing caller of this screen today; routing
 *   needs to start passing the signed-in user's real role at
 *   AthleteDetailRoute (PortalRoutes.js is not this lane's to edit — see the
 *   sprint report) now that Sprint 10 pin I already routes coach here too.
 */
export default function AthleteDetail({ variant = 'populated', bare = false, athleteId, role = 'parent', backLabel, onBack }) {
  // athleteId comes from the route (/portal/athlete/:athleteId) — dropping it
  // here was QA re-sweep #1: the hook's by-id fetch was fixed but never
  // received an id, so every child rendered as the seed athlete.
  const { data } = useAthleteDetail({ variant, athleteId });
  const athlete = data?.athlete;
  const diagnostic = useLatestDiagnostic(athleteId);
  /**
   * Sprint 11 pin H (quick win): the back link used to read the hardcoded
   * seed string "Whitfield family" regardless of whose record this actually
   * is. useAthleteDetail already carries the athlete's real household name
   * (live: the households/{id}.name doc field, null when the viewer may not
   * read it; seed: the same cast every other screen reads), so no second
   * useHousehold() load is needed just for this label (perf wave B). A
   * missing name falls back to a generic, non-invented label rather than a
   * name that cannot be true for that viewer.
   */
  // A parent's back link names their own household (derived, never a
  // hardcoded family - Sprint 11 H); staff callers pass the surface they
  // came from instead, since they have no household to name.
  const householdName = backLabel ?? (athlete?.householdName || 'Family');

  // Hidden contract (owner, 2026-09-30), for parents and staff alike: no
  // requirement in the subline, no Board stat, no contract history or
  // checklist row. There is no Start card at all since the owner's rule
  // (2026-10-28): the requirement is derived, nothing to pick.
  const showContract = contractEnabled();

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '4px 22px 14px' }}>
          <BackLink onClick={onBack}>‹ {householdName}</BackLink>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <Avatar size={48} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <ScreenTitle size={21}>{athlete?.name}</ScreenTitle>
              <div
                style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}
              >
                {athlete?.subline}
              </div>
            </div>
          </div>
        </div>
      }
      // 'home' IS the children overview since the duplicate Children tab
      // was removed; active="children" matched no tab (code review
      // 2026-09-04) and left the bar with nothing highlighted.
      footer={<BottomTabBar role={role} active={role === 'parent' ? 'home' : undefined} />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AthleteMembershipCard athleteId={athleteId} athlete={athlete} role={role} />
        {/* The handicap on file, ops and owner only: a reserved block is booked on it. */}
        <HandicapCard athleteId={athleteId} athlete={athlete} role={role} />
        {/* Sprint 20 (spec 3.2): the child-login state. Rendered only when the
            payload carries loginEmail (legacy athletes have neither field). */}
        {athlete && 'loginEmail' in athlete ? (
          <Card>
            <Body size={12}>{loginStatusLine(athlete)}</Body>
          </Card>
        ) : null}
        {/* Parents log for their kids (owner, 2026-10-28; spec 4.3): the
            child's month calendar and Log today sheet, behind the switch. */}
        {role === 'parent' && showContract ? <ParentContractCard athleteId={athleteId} athleteName={athlete?.name} /> : null}

        {data?.hasEnoughData ? (
          <>
            <StatGrid athlete={athlete} board={showContract} />
            {data.upcoming ? <UpcomingSessions upcoming={data.upcoming} /> : null}
            {showContract ? <ContractHistory history={data.history} /> : null}
            <ProgressSummary latest={diagnostic.latest} sections={diagnostic.sections} />
          </>
        ) : (
          <LimitedData checklist={(data?.checklist ?? []).filter((item) => showContract || item.id !== 'contract')} contract={showContract} />
        )}

        <ReflectionCard />
      </div>
    </PhoneFrame>
  );
}

/** `board`: the Commitment Board count, off while the contract is hidden. */
function StatGrid({ athlete, board }) {
  const stats = [
    [athlete.attendance, athlete.attendanceLabel],
    ...(board ? [[athlete.board, athlete.boardLabel]] : []),
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 10 }}>
      {stats.map(([value, label]) => (
        <Card key={label}>
          <div style={{ font: `700 26px ${font.head}`, color: color.text }}>{value}</div>
          <div style={{ font: `400 11px/1.4 ${font.body}`, color: color.textTertiary, marginTop: 5 }}>
            {label}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ContractHistory({ history }) {
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 14 }}>Contract history</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {history.map((row) => (
          <div key={row.month} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                width: 46,
                flex: 'none',
                font: `500 12px ${font.body}`,
                color: color.textSecondary,
              }}
            >
              {row.month}
            </span>
            <ProgressMeter value={row.pct} size="card" />
            <span
              style={{
                width: 40,
                flex: 'none',
                textAlign: 'right',
                font: `600 12px ${font.body}`,
                color: meterColor(row.pct),
              }}
            >
              {row.pct}%
            </span>
          </div>
        ))}
      </div>
      {/*
        Sprint 11 pin H (quick win): this caption named a specific closure
        ("Dec 23 - Jan 3") as though every history row were being explained
        by it, regardless of which months `history` actually contains or
        whether a closure landed in any of them. The general rule (closure
        days are excluded from the denominator) is always true and worth
        stating; citing December's own closure by name is not, once this
        card renders real live history instead of the fixed Nov-Feb seed
        rows the copy was written against.
      */}
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 13 }}>
        A low month can reflect an academy closure — closure days are excluded from the
        denominator, so they never count against attendance.
      </Body>
    </Card>
  );
}

/**
 * Sprint 10 pin C: the scan found this card shipping developer commentary
 * ("arrives here in a later phase") straight to a parent. It now shows the
 * latest PUBLISHED diagnostic capture's real values, grouped by section
 * exactly as they were entered, or the honest empty state when there is
 * none - never a promise about a future phase.
 */
function ProgressSummary({ latest, sections: catalogue = [] }) {
  // A capture doc is { values: { <fieldId>: number|string }, ... }; the
  // display groups those values by the catalogue's sections and shows only
  // the sections/fields the coach actually entered (an indoor capture
  // never fills the outdoor sections, and a blank row is not a result).
  const values = latest?.values ?? null;
  const sections = values
    ? catalogue
        .map((s) => ({
          id: s.id,
          title: s.title,
          fields: (s.fields ?? [])
            .filter((f) => values[f.id] !== undefined && values[f.id] !== null && values[f.id] !== '')
            .map((f) => ({ id: f.id, label: f.label, unit: f.unit, value: values[f.id] })),
        }))
        .filter((s) => s.fields.length > 0)
    : [];
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 13 }}>Diagnostic capture</SectionLabel>
      {sections.length === 0 ? (
        <Body size={12}>No capture yet — the coach records this at a session.</Body>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sections.map((section) => (
            <div key={section.id ?? section.title}>
              <div style={{ font: `600 12px ${font.body}`, color: color.text, marginBottom: 6 }}>
                {section.title}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                {(section.fields ?? []).map((f) => (
                  <div key={f.id ?? f.label} style={{ minWidth: 70 }}>
                    <div
                      style={{
                        font: `400 9px ${font.body}`,
                        textTransform: 'uppercase',
                        letterSpacing: '.08em',
                        color: color.textTertiary,
                      }}
                    >
                      {f.label}
                    </div>
                    <div style={{ font: `600 15px ${font.body}`, color: color.text, marginTop: 2 }}>
                      {f.value ?? '—'}
                      {f.unit ? <span style={{ font: `400 11px ${font.body}` }}> {f.unit}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * The boundary is stated, not hidden - but stated for a parent reading it,
 * not for the next engineer (Sprint 10 pin C: the scan flagged the previous
 * copy, "that boundary is enforced server-side, not by hiding this card",
 * as developer commentary that leaked into a parent-facing screen). Same
 * real point, reworded: a parent gets the gist, never the transcript.
 */
function ReflectionCard() {
  return (
    <div
      style={{
        background: color.dimmed,
        border: '1px solid #282828',
        borderRadius: radius.card,
        padding: 15,
        display: 'flex',
        gap: 12,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          flex: 'none',
          marginTop: 1,
          borderRadius: 4,
          border: `1.5px solid ${color.faintText}`,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 13px ${font.body}`, color: color.textSecondary }}>
          Reflection summaries
        </div>
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 6 }}>
          You'll see a summary of Yannick's mental-game sessions here, never the full conversation.
        </Body>
      </div>
    </div>
  );
}

function LimitedData({ checklist, contract }) {
  const tones = {
    done: { border: color.primary, fill: color.primary },
    next: { border: color.secondary, fill: 'transparent' },
    todo: { border: '#3a3a3a', fill: 'transparent' },
  };

  return (
    <>
      <Card tone="yellow" large>
        <SectionLabel tone={color.secondary}>New enrollment</SectionLabel>
        <Body size={12} style={{ marginTop: 10 }}>
          Jordan enrolled Feb 8. Attendance{contract ? ', contract history,' : ''} and progress summaries need about a
          month of data before they say anything useful. This screen fills in as the season runs.
        </Body>
      </Card>

      <Card large>
        <SectionLabel style={{ marginBottom: 13 }}>Available now</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {checklist.map((item) => {
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
                <span
                  style={{
                    font: `400 13px ${font.body}`,
                    color: item.state === 'todo' ? color.textTertiary : color.text,
                  }}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

/**
 * Everything this kid has scheduled (owner's ask, 2026-09-01) — the athlete's
 * upcoming bookings, live only (the hook adds `upcoming` in its live payload;
 * seed detail predates the field and simply omits the card).
 */
function UpcomingSessions({ upcoming }) {
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 12 }}>
        Scheduled sessions · {upcoming.length}
      </SectionLabel>
      {upcoming.length === 0 ? (
        <Body size={12}>Nothing booked yet.</Body>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {upcoming.map((u, i) => (
            <div
              key={u.id}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                padding: '9px 0',
                borderBottom: i < upcoming.length - 1 ? `1px solid ${color.rule}` : 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: `600 13px ${font.body}`, color: color.text }}>
                  {u.name}
                  {/* A handicap-reserved block says so here too: this is where staff change the handicap. */}
                  <ReservedChip tag={reservedTag(u)} style={{ marginLeft: 8 }} />
                </div>
                <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
                  {u.dayLabel}
                  {u.time ? ` · ${u.time}` : ''}
                </div>
              </div>
              <span style={{ font: `500 11px ${font.body}`, color: color.textSecondary }}>
                {u.status === 'confirmed' ? 'Confirmed' : u.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
