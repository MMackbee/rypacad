import React from 'react';
import { color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import MediaPlaceholder, { Avatar } from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter, { meterColor } from '../components/ProgressMeter';
import { BackLink, Body, Card, ScreenTitle, SectionLabel, Tick } from '../components/Primitives';
import { useAthleteDetail } from '../hooks';

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
 */
export default function AthleteDetail({ variant = 'populated', bare = false, athleteId, onBack }) {
  // athleteId comes from the route (/portal/athlete/:athleteId) — dropping it
  // here was QA re-sweep #1: the hook's by-id fetch was fixed but never
  // received an id, so every child rendered as the seed athlete.
  const { data } = useAthleteDetail({ variant, athleteId });
  const athlete = data?.athlete;

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
      footer={<BottomTabBar role="parent" active="children" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data?.hasEnoughData ? (
          <>
            <StatGrid athlete={athlete} />
            <ContractHistory history={data.history} />
            <ProgressSummary />
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

function ProgressSummary() {
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 13 }}>Progress summary</SectionLabel>
      <MediaPlaceholder height={96} caption="COACH SUMMARY — written before Phil's monthly call" />
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 12 }}>
        Practice and course-performance data arrives here in a later phase, read-only from the
        ecosystem database.
      </Body>
    </Card>
  );
}

/**
 * The boundary is stated, not hidden. A parent who can see the card and read
 * why it is limited is less likely to ask for the transcript than one who finds
 * an unexplained gap.
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
          Summary level only. Full transcripts are never shown to a parent account — that boundary
          is enforced server-side, not by hiding this card.
        </Body>
      </div>
    </div>
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
