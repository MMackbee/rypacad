import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import Button from '../components/Button';
import MediaPlaceholder, { Avatar } from '../components/MediaPlaceholder';
import NumericField from '../components/NumericField';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter from '../components/ProgressMeter';
import { BackLink, Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useDiagnostic } from '../hooks';

/**
 * 14 · Diagnostic Capture - coach/staff.
 * States: Empty form, Upload in progress, Partially saved, Complete.
 *
 * Partial save is the default, not an explicit action. A Diagnostic runs 90
 * minutes and will be interrupted; a form that only persists on submit loses an
 * hour of a coach's work the first time someone walks over to ask a question.
 *
 * Six modules total, per the Blueprint's Diagnostic Protocol: swing video, the
 * four numeric sections here, and Yannick's mental-game intake (captured
 * elsewhere, counted here).
 *
 * @param {'empty'|'uploading'|'partial'|'complete'} variant
 */
const TOTAL_MODULES = 6;

export default function DiagnosticCapture({ variant = 'empty', bare = false, onCancel }) {
  const { data } = useDiagnostic();
  const [values, setValues] = useState({});

  const sections = data?.sections ?? [];
  const uploading = variant === 'uploading';
  const complete = variant === 'complete';
  const partial = variant === 'partial';

  const completedModules = complete ? TOTAL_MODULES : partial ? 3 : uploading ? 1 : 0;

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
              <ScreenTitle size={18}>{data?.athlete?.name}</ScreenTitle>
              <div
                style={{
                  font: `400 11px ${font.body}`,
                  color: color.textTertiary,
                  marginTop: 3,
                }}
              >
                {data?.athlete?.meta}
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
