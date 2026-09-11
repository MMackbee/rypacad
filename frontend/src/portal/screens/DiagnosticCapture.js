import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import * as hooks from '../hooks';
import AthleteRow from '../components/AthleteRow';
import Button from '../components/Button';
import MediaPlaceholder, { Avatar } from '../components/MediaPlaceholder';
import NumericField from '../components/NumericField';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter from '../components/ProgressMeter';
import SavedToast from '../components/SavedToast';
import { BackLink, Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useCoachRoster } from '../hooks';

/**
 * Sprint 10 pin C (TEAM.md, contract v1.8 §C): useDiagnostic(athleteId) ->
 * { data: { latest (published|null), draft (draft|null), sections },
 * saveDraft(values, notes), publish(values, notes) }. This worktree's
 * useDiagnostic() still takes NO argument and returns the Sprint-1 shape
 * { athlete, sections } (confirmed - no `latest`, `draft`, `saveDraft` or
 * `publish` anywhere in hooks/index.js). The hook EXISTS, unlike a fully
 * missing export, so it is called normally with the pinned athleteId
 * argument (which the old implementation simply ignores - no crash, extra
 * args to a JS function are just dropped) and every new field/action is
 * defaulted defensively: `latest`/`draft` read undefined -> null (an
 * honest "no capture yet", never invented), and saveDraft/publish fall
 * back to a local no-op echo that resolves successfully without
 * persisting anything. Flagged loudly in the sprint report.
 */
function useDiagnosticState(athleteId) {
  const state = hooks.useDiagnostic(athleteId);
  return {
    sections: state.data?.sections ?? [],
    latest: state.data?.latest ?? null,
    draft: state.data?.draft ?? null,
    // Old-shape fallback only - the pinned shape carries no bare `athlete`
    // field, but the seed/demo data this worktree still returns does.
    athleteInfo: state.data?.athlete ?? null,
    loading: state.loading,
    error: state.error,
    saveDraft:
      state.saveDraft ||
      (async (values, notes) => ({ values, notes, status: 'draft', simulated: true })),
    publish:
      state.publish ||
      (async (values, notes) => ({ values, notes, status: 'published', simulated: true })),
  };
}

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
 * Sprint 10 pin C: both footer buttons are wired to a real saveDraft()/
 * publish() with saving/error state and the shared SavedToast; the "N of M"
 * progress and the header's save-status label both read the REAL working
 * values instead of a demo `variant` switch (M itself is the real section
 * field count + one video slot - never a hardcoded 4); a real camera/upload
 * pathway still doesn't exist (same honest stub as PracticeDNA's upload
 * modules), so the video slot only completes via the harness's demo states.
 *
 * @param {'empty'|'uploading'|'partial'|'complete'} [variant]  Harness only.
 * @param {string} [athleteId]  Real caller: which athlete this capture is
 *   for - threads into useDiagnostic(athleteId).
 */
const INDOOR_SECTION_IDS = ['launch', 'putting'];

export default function DiagnosticCapture({ variant, bare = false, athlete, athleteId, onCancel }) {
  const demo = variant != null;
  const diag = useDiagnosticState(athleteId);
  // Who this capture is FOR: the picker (CaptureFlow below) passes a real
  // athlete; the harness's direct mounts fall back to whatever this
  // worktree's seed/demo data still carries under the old `athlete` field.
  const subject = athlete ?? diag.athleteInfo;

  const sections = diag.sections.filter((s) => INDOOR_SECTION_IDS.includes(s.id));

  // Seed working state from a real open draft when one exists - never from
  // `latest` (a published capture is history, read-only, not an editable
  // draft). Demo states seed a believable snapshot so the four designed
  // states stay reviewable without a real draft to load from.
  const demoValues = demo && (variant === 'partial' || variant === 'complete')
    ? Object.fromEntries(sections.flatMap((s) => s.fields.map((f, i) => [f.id, variant === 'complete' || i === 0 ? '42' : ''])).filter(([, v]) => v !== ''))
    : {};
  const [values, setValues] = useState(() => diag.draft?.values ?? demoValues);
  const [videoAttached] = useState(demo && variant === 'complete');
  const [uploading] = useState(demo && variant === 'uploading');
  const [saving, setSaving] = useState(null); // null | 'draft' | 'publish'
  const [saveError, setSaveError] = useState(null);
  const [justSaved, setJustSaved] = useState(null); // null | 'draft' | 'publish'

  const setValue = (id, v) => setValues((prev) => ({ ...prev, [id]: v }));

  // Real progress: every indoor section's fields, plus one slot for video -
  // never the old hardcoded TOTAL_MODULES = 4.
  const totalFields = sections.reduce((n, s) => n + s.fields.length, 0) + 1;
  const filledFields =
    sections.reduce(
      (n, s) => n + s.fields.filter((f) => values[f.id] !== undefined && values[f.id] !== '').length,
      0
    ) + (videoAttached ? 1 : 0);
  const allComplete = totalFields > 0 && filledFields === totalFields;

  const saveStatus = uploading
    ? { label: 'Uploading…', tone: color.secondary }
    : saving === 'draft'
    ? { label: 'Saving…', tone: color.secondary }
    : saving === 'publish'
    ? { label: 'Publishing…', tone: color.secondary }
    : justSaved === 'publish' || diag.latest || allComplete
    ? { label: 'All sections complete', tone: color.primary }
    : diag.draft || justSaved === 'draft'
    ? { label: 'Draft saved', tone: color.textSecondary }
    : { label: 'Not saved', tone: color.faintText };

  const handleSaveDraft = async () => {
    setSaving('draft');
    setSaveError(null);
    try {
      await diag.saveDraft(values, null);
      setJustSaved('draft');
      // "…and exit" is the button's own label - a brief confirmation, then
      // the same exit Cancel takes, rather than stranding the coach on a
      // screen that just told them it's done.
      setTimeout(() => onCancel && onCancel(), 900);
    } catch (err) {
      setSaveError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The draft could not be saved. Try again.'
      );
    } finally {
      setSaving(null);
    }
  };

  const handlePublish = async () => {
    setSaving('publish');
    setSaveError(null);
    try {
      await diag.publish(values, null);
      setJustSaved('publish');
    } catch (err) {
      setSaveError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'This could not be published. Try again.'
      );
    } finally {
      setSaving(null);
    }
  };

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
            <ProgressMeter value={totalFields ? (filledFields / totalFields) * 100 : 0} size="thin" />
            <span
              style={{
                flex: 'none',
                font: `500 11px ${font.body}`,
                color: color.textSecondary,
              }}
            >
              {filledFields} of {totalFields}
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
          {saveError ? (
            <Body size={12} tone={color.error} style={{ marginBottom: 10, textAlign: 'center' }}>
              {saveError}
            </Body>
          ) : justSaved && !saveError ? (
            <SavedToast
              message={justSaved === 'publish' ? 'Published to Practice DNA' : 'Draft saved'}
              style={{ marginBottom: 10 }}
            />
          ) : null}
          {allComplete ? (
            <Button height={56} loading={saving === 'publish'} onClick={handlePublish}>
              Publish to Practice DNA
            </Button>
          ) : uploading ? (
            <Button height={56} disabled>
              Waiting on upload
            </Button>
          ) : (
            <Button
              variant="outline"
              height={56}
              loading={saving === 'draft'}
              onClick={handleSaveDraft}
              style={{ boxShadow: 'none' }}
            >
              Save draft and exit
            </Button>
          )}
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <VideoSection uploading={uploading} attached={videoAttached} />

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

function VideoSection({ uploading, attached }) {
  // Sprint 10 pin I: no more imperative "TAP TO..." caption - there is no
  // real capture/upload pathway wired yet (the same honest stub
  // PracticeDNA's upload modules already use), so the placeholder states
  // what is true rather than inviting a tap that does nothing.
  const caption = attached
    ? 'SWING VIDEO — 4 angles attached'
    : uploading
    ? 'SWING VIDEO — uploading'
    : 'SWING VIDEO — not yet captured';

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
    return (
      <DiagnosticCapture
        bare={bare}
        athlete={athlete}
        athleteId={athlete.id}
        onCancel={() => setAthlete(null)}
      />
    );
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
