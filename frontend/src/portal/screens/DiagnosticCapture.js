import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import AthleteRow from '../components/AthleteRow';
import Button from '../components/Button';
import MediaPlaceholder, { Avatar } from '../components/MediaPlaceholder';
import NumericField from '../components/NumericField';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter from '../components/ProgressMeter';
import { BackLink, Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useCoachRoster, useDiagnostic } from '../hooks';

/**
 * 14 · Diagnostic Capture - coach/staff.
 * States: Empty form, Upload in progress, Partially saved, Complete.
 *
 * Partial save is the default, not an explicit action. A Diagnostic runs 90
 * minutes and will be interrupted; a form that only persists on submit loses an
 * hour of a coach's work the first time someone walks over to ask a question.
 *
 * Sprint 5 pin (TEAM.md): trimmed to what is actually assessable inside the
 * indoor facility - swing video, launch monitor numbers, and putting.
 * Mobility & Stability (movement/balance work) and Short Game (30/50/70 yd
 * wedge dispersion) both need real distance or open floor space the indoor
 * bays don't have; they are DEFERRED, not faked, and are filtered out below
 * rather than removed from data/seed.js (data/ is not this lane's to edit).
 * Mental-game intake stays counted per the Blueprint - Yannick captures it
 * elsewhere, this screen only reflects it in the module count.
 *
 * @param {'empty'|'uploading'|'partial'|'complete'} variant
 */
const INDOOR_SECTION_IDS = ['launch', 'putting'];
const TOTAL_MODULES = 4; // swing video + launch + putting + mental intake (elsewhere)

export default function DiagnosticCapture({ variant = 'empty', bare = false, athlete, onCancel }) {
  const { data } = useDiagnostic();
  const [values, setValues] = useState({});
  // Who this capture is FOR comes from the picker (CaptureFlow below) in the
  // real app; the harness's direct mounts keep the seed athlete.
  const subject = athlete ?? data?.athlete;

  const sections = (data?.sections ?? []).filter((s) => INDOOR_SECTION_IDS.includes(s.id));
  const uploading = variant === 'uploading';
  const complete = variant === 'complete';
  const partial = variant === 'partial';

  const completedModules = complete ? TOTAL_MODULES : partial ? 2 : uploading ? 1 : 0;

  const saveStatus = {
    empty: { label: 'Not saved', tone: color.faintText },
    uploading: { label: 'Uploading…', tone: color.secondary },
    partial: { label: 'Draft saved 2 min ago', tone: color.textSecondary },
    complete: { label: 'All sections complete', tone: color.primary },
  }[variant];

  const setValue = (id, v) => setValues((prev) => ({ ...prev, [id]: v }));

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '4px 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <BackLink onClick={onCancel}>‹ Cancel</BackLink>
            <div style={{ flex: 1 }} />
            <span style={{ font: `400 12px ${font.body}`, color: saveStatus.tone }}>
              {saveStatus.label}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <ScreenTitle size={18}>{subject?.name}</ScreenTitle>
              <div
                style={{
                  font: `400 11px ${font.body}`,
                  color: color.textTertiary,
                  marginTop: 3,
                }}
              >
                {subject?.meta}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <ProgressMeter
              value={(completedModules / TOTAL_MODULES) * 100}
              size="thin"
            />
            <span
              style={{
                flex: 'none',
                font: `500 11px ${font.body}`,
                color: color.textSecondary,
              }}
            >
              {completedModules} of {TOTAL_MODULES}
            </span>
          </div>
        </div>
      }
      footer={
        <div
          style={{
            borderTop: `1px solid ${color.frameRule}`,
            padding: '14px 22px 22px',
          }}
        >
          {complete ? (
            <Button height={56}>Publish to Practice DNA</Button>
          ) : uploading ? (
            <Button height={56} disabled>
              Waiting on upload
            </Button>
          ) : (
            <Button variant="outline" height={56} style={{ boxShadow: 'none' }}>
              Save draft and exit
            </Button>
          )}
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <VideoSection uploading={uploading} complete={complete || partial} />

        {sections.map((section) => (
          <Card key={section.id} large>
            <SectionLabel style={{ marginBottom: 13 }}>{section.title}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {section.fields.map((f) => (
                <NumericField
                  key={f.id}
                  label={f.label}
                  unit={f.unit}
                  value={values[f.id]}
                  onChange={(v) => setValue(f.id, v)}
                />
              ))}
            </div>
          </Card>
        ))}

        <Body size={11} tone={color.textTertiary}>
          Mobility & Stability and Short Game need real distance and open floor space the indoor
          bays don't have. Deferred to the outdoor Diagnostic, not captured here.
        </Body>
      </div>
    </PhoneFrame>
  );
}

function VideoSection({ uploading, complete }) {
  const caption = complete
    ? 'SWING VIDEO — 4 angles attached'
    : 'TAP TO RECORD OR ATTACH — face-on · down-the-line · overhead · rear';

  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 13 }}>Swing video</SectionLabel>
      <MediaPlaceholder
        height={96}
        caption={caption}
        tone={uploading ? 'uploading' : 'default'}
      />
      {uploading ? (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              height: 5,
              background: color.track,
              borderRadius: radius.badge,
              overflow: 'hidden',
            }}
          >
            <div style={{ width: '64%', height: '100%', background: color.secondary }} />
          </div>
          <Body size={11} tone={color.secondary} style={{ marginTop: 8 }}>
            Uploading 3 of 4 angles · 64% · keep this screen open
          </Body>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * The real capture flow (owner's call, 2026-09-01): Capture -> roster ->
 * pick the kid -> input capture data. The picker is the coach's real
 * assigned roster; the harness keeps mounting DiagnosticCapture directly
 * with its seed athlete, so the designed states are unchanged there.
 */
export function CaptureFlow({ bare = false, onCancel }) {
  const roster = useCoachRoster();
  const [athlete, setAthlete] = useState(null);

  if (athlete) {
    return <DiagnosticCapture bare={bare} athlete={athlete} onCancel={() => setAthlete(null)} />;
  }

  const athletes = roster.data ?? [];
  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <BackLink onClick={onCancel}>Today</BackLink>
          <ScreenTitle style={{ marginTop: 8 }}>Diagnostic Capture</ScreenTitle>
          <Body size={12} style={{ marginTop: 4 }}>
            Who is this capture for?
          </Body>
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px' }}>
        <Card large>
          {roster.loading ? (
            <Body size={12}>Loading your roster…</Body>
          ) : athletes.length === 0 ? (
            <Body size={12}>No assigned athletes yet.</Body>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {athletes.map((a, i) => (
                <AthleteRow
                  key={a.id}
                  name={a.name}
                  meta={a.meta}
                  avatarSize={40}
                  nameSize={15}
                  divider={i < athletes.length - 1}
                  onClick={() => setAthlete(a)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </PhoneFrame>
  );
}
