import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import * as hooks from '../hooks';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import { Avatar } from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter, { meterColor } from '../components/ProgressMeter';
import SavedToast from '../components/SavedToast';
import { BackLink, Body, Card, ScreenTitle, SectionLabel, Tick } from '../components/Primitives';
import { useAthleteDetail } from '../hooks';

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

/** The pinned contract tier set (contract v1.8 §B) - not invented. */
const TIER_MINUTES = [20, 45, 95];

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
 * @param {boolean} [noTier]  Sprint 10 pin B, harness/PM override: force the
 *   "Start a contract" card on regardless of the subline heuristic below -
 *   see that card's own doc comment for why a real signal doesn't exist yet.
 */
export default function AthleteDetail({ variant = 'populated', bare = false, athleteId, noTier, onBack }) {
  // athleteId comes from the route (/portal/athlete/:athleteId) — dropping it
  // here was QA re-sweep #1: the hook's by-id fetch was fixed but never
  // received an id, so every child rendered as the seed athlete.
  const { data } = useAthleteDetail({ variant, athleteId });
  const athlete = data?.athlete;
  const diagnostic = useLatestDiagnostic(athleteId);

  /**
   * Sprint 10 pin B: whether this kid has no contract tier yet. useAthleteDetail's
   * payload carries no explicit contractMinutes/tier field to check directly
   * (confirmed: neither the seed ATHLETE_DETAIL nor the live payload in
   * hooks/index.js expose one) - only a human-readable `subline` that
   * INCLUDES "N min tier" when a tier is set. Absent a real boolean, this
   * falls back to parsing that string, which is fragile and flagged loudly
   * in the sprint report as a real data-shape gap for routing to close
   * (expose athlete.contractMinutes, or a `hasTier` boolean, from
   * useAthleteDetail). The `noTier` prop lets a caller (or the harness)
   * override the heuristic outright once/while that gap exists.
   */
  // useAthleteDetail's live payload now carries `contractMinutes` (routing
  // lane, v1.8 B); the subline regex only remains as the seed-mode fallback.
  const hasNoTier =
    noTier ??
    (athlete && 'contractMinutes' in athlete
      ? athlete.contractMinutes == null
      : Boolean(athlete) && !/min tier/i.test(athlete?.subline || ''));

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '4px 22px 14px' }}>
          <BackLink onClick={onBack}>‹ Whitfield family</BackLink>
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
      footer={<BottomTabBar role="parent" active="home" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {hasNoTier ? <StartContractCard athleteId={athleteId} athleteName={athlete?.name} /> : null}

        {data?.hasEnoughData ? (
          <>
            <StatGrid athlete={athlete} />
            {data.upcoming ? <UpcomingSessions upcoming={data.upcoming} /> : null}
            <ContractHistory history={data.history} />
            <ProgressSummary latest={diagnostic.latest} sections={diagnostic.sections} />
          </>
        ) : (
          <LimitedData checklist={data?.checklist ?? []} />
        )}

        <ReflectionCard />
      </div>
    </PhoneFrame>
  );
}

function StatGrid({ athlete }) {
  const stats = [
    [athlete.attendance, athlete.attendanceLabel],
    [athlete.board, athlete.boardLabel],
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
        Naming the reason matters: a parent seeing December low without this
        reads it as their child slipping, not as the academy being shut.
      */}
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 13 }}>
        Dec sits low because of the Dec 23 – Jan 3 closure. Closure days are excluded from the
        denominator.
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

/**
 * Sprint 10 pin B (contract v1.8 §B): a parent's move for a kid with no
 * contract tier yet. FALLBACK FLAG: `useContract` (hooks/index.js) resolves
 * the SIGNED-IN user's OWN athlete record (liveAthleteIdentity throws for a
 * parent, who has no athleteId of their own) - it has no path to "set the
 * tier for THIS athleteId" for any caller, parent or staff, in this
 * worktree. That is a different gap than a missing export, but the same
 * shape of problem, so it gets the same treatment: `setTier` below is a
 * local, athleteId-scoped no-op echo rather than a mis-wired call into the
 * wrong identity. Flagged loudly in the sprint report - routing needs an
 * athleteId-aware tier-set mutation for the parent/staff case.
 */
function StartContractCard({ athleteId, athleteName }) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // The athleteId-aware tier write the routing seam now provides
  // (useAthleteTier, PM integration) — the household parent's own path.
  const tier = hooks.useAthleteTier();
  const setTier = (minutes) => tier.setTier(athleteId, minutes);

  const handleStart = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await setTier(selected);
      setSaved(true);
    } catch (err) {
      setError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The contract could not be started. Try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return <SavedToast message={`Contract started — ${selected} min / day`} />;
  }

  return (
    <Card tone="yellow" large>
      <SectionLabel tone={color.secondary} style={{ marginBottom: 8 }}>
        Start a contract
      </SectionLabel>
      <Body size={12} style={{ marginBottom: 12 }}>
        {athleteName || 'This athlete'} doesn't have a Commitment Contract tier yet. Pick a daily
        minimum to get started — your coach countersigns at the next block.
      </Body>
      <div style={{ display: 'flex', gap: 8 }}>
        {TIER_MINUTES.map((m) => {
          const on = selected === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => setSelected(on ? null : m)}
              style={{
                flex: 1,
                height: 50,
                borderRadius: radius.card,
                border: `1px solid ${on ? color.primary : color.border}`,
                background: on ? 'rgba(0,175,81,.12)' : color.surface,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <span style={{ font: `700 16px ${font.head}`, color: on ? color.primary : color.text }}>{m}</span>
              <span style={{ font: `400 9px ${font.body}`, color: color.textTertiary }}>min/day</span>
            </button>
          );
        })}
      </div>
      {error ? (
        <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
          {error}
        </Body>
      ) : null}
      <Button
        height={44}
        disabled={!selected}
        loading={saving}
        onClick={handleStart}
        style={{ marginTop: 13 }}
      >
        {selected ? `Start the ${selected} min contract` : 'Select a tier to continue'}
      </Button>
    </Card>
  );
}

function LimitedData({ checklist }) {
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
          Jordan enrolled Feb 8. Attendance, contract history, and progress summaries need about a
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
                <div style={{ font: `600 13px ${font.body}`, color: color.text }}>{u.name}</div>
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
