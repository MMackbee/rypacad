import React, { useEffect, useState } from 'react';
import { color, font, radius } from '../tokens';
import AssessmentFrame, { useLayoutClass } from '../components/AssessmentFrame';
import Button from '../components/Button';
import Choice from '../components/assessments/Choice';
import FieldRow from '../components/assessments/FieldRow';
import TrialInput from '../components/assessments/TrialInput';
import VersionSheet from '../components/assessments/VersionSheet';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useAssessmentSettings } from '../hooks/assessments';
import { saveAssessmentSettings } from '../hooks/assessmentsLive';
import { canEditAssessmentSettings } from '../data/assessmentAccess';
import { PROTOCOL_VERSION, TRIAL_LIMITS, procedureChanged, withDefaults } from '../data/assessmentSettings';

const COUNTS = [
  ['grip', 'Grip trials per hand'], ['cmjPractice', 'CMJ practice jumps'], ['cmjScored', 'CMJ scored jumps'],
  ['hopPractice', '10/5 practice sets'], ['hopScored', '10/5 scored sets'], ['medballPractice', 'Med ball practice throws'],
  ['medballScored', 'Med ball scored throws'], ['clubheadWarmup', 'Clubhead warm-up swings'], ['clubheadMax', 'Clubhead maximal swings'],
];
const STATION_TOGGLES = [['anthro', 'Anthropometrics'], ['grip', 'Grip'], ['cmj', 'CMJ'], ['hop', '10/5'], ['medball', 'Med ball'], ['mcgill', 'McGill'], ['segments', 'Arm and hand length']];
const THRESHOLDS = [['clubhead', 'clubhead'], ['cmj', 'CMJ'], ['hop', '10/5 RSI'], ['medball', 'med ball'], ['grip', 'grip'], ['parallax', 'Parallax']];
const ON_OFF = [[true, 'On'], [false, 'Off']];
const selectStyle = { height: 44, minWidth: 74, background: color.track, border: `1px solid ${color.border}`, borderRadius: radius.input, color: color.text, font: `600 16px ${font.body}`, padding: '0 10px' };

function NumberSelect({ label, value, min, max, disabled, onChange }) {
  return (
    <select aria-label={label} value={String(value)} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} style={selectStyle}>
      {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => <option key={n} value={String(n)}>{n}</option>)}
    </select>
  );
}

/**
 * The protocol's procedure as settings, not code (spec 2 decision 9; spec
 * 4.6). Phil and the owner edit; other assessment staff read. Saving a
 * change to the procedure (trial counts, grip rest, stations, McGill mode,
 * med ball side, golf timing, wave size) asks for a new protocol version
 * label; entry modes, waves per session, the Moore coefficients and their
 * check, and the thresholds save under the same label. Every window keeps the settings it
 * ran under, so nothing here rewrites a result already taken.
 * Readiness & intake is always on: the pain check comes first.
 */
export default function AssessmentSettings({ bare = false, viewer, onBack }) {
  const layout = useLayoutClass();
  const { data, error } = useAssessmentSettings();
  const canEdit = canEditAssessmentSettings(viewer);
  const [base, setBase] = useState(null);
  const [draft, setDraft] = useState(null);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedAs, setSavedAs] = useState(null);
  useEffect(() => {
    if (!base && data) {
      setBase(withDefaults(data.settings));
      setDraft(withDefaults(data.settings));
    }
  }, [data, base]);

  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setSavedAs(null); };
  const setIn = (key, patch) => set({ [key]: { ...draft[key], ...patch } });
  const rest = draft?.gripRestSec ?? {};
  const restProblem = rest.min != null && rest.max != null && rest.min > rest.max ? "The shortest rest can't be longer than the longest." : null;
  const coefficients = draft ? [draft.coefficients.boys.a, draft.coefficients.boys.b, draft.coefficients.girls.a, draft.coefficients.girls.b] : [];
  const incomplete = draft ? rest.min == null || rest.max == null || coefficients.some((v) => v == null) : true;
  const dirty = Boolean(draft && base) && JSON.stringify(draft) !== JSON.stringify(base);

  const save = async (protocolVersion) => {
    setSaving(true);
    setSaveError(null);
    const next = { ...draft, protocolVersion };
    try {
      await saveAssessmentSettings(next);
      setBase(next);
      setDraft(next);
      setAsking(false);
      setSavedAs(protocolVersion);
    } catch (err) {
      setSaveError('The settings were not saved. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };
  const onSave = () => (procedureChanged(base, draft) ? setAsking(true) : save(base.protocolVersion));

  const header = (
    <div style={{ padding: '4px 22px 12px' }}>
      <BackLink onClick={onBack}>‹ Assessments</BackLink>
      <ScreenTitle size={21} style={{ marginTop: 8 }}>Protocol settings</ScreenTitle>
      {base ? <Body size={12} style={{ marginTop: 3 }}>Protocol {base.protocolVersion}</Body> : null}
    </div>
  );
  const footer = canEdit && draft ? (
    <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '12px 22px 18px' }}>
      <Button height={52} loading={saving && !asking} disabled={!dirty || Boolean(restProblem) || incomplete} onClick={onSave}>Save settings</Button>
    </div>
  ) : null;

  return (
    <AssessmentFrame bare={bare} layout={layout} header={header} footer={footer}>
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && !data ? <ErrorNotice>The settings didn't load. Check your connection and try again.</ErrorNotice> : null}
        {data && !data.stored ? <Body size={12}>These are the protocol {PROTOCOL_VERSION} defaults; nothing has been saved yet.</Body> : null}
        {!canEdit ? <Body size={12}>Only Phil and the owner change these settings.</Body> : null}
        {savedAs ? <Body size={12} tone={color.primary}>Saved. Protocol {savedAs}.</Body> : null}
        {saveError && !asking ? <ErrorNotice title="Not saved">{saveError}</ErrorNotice> : null}
        {draft ? (
          <>
            <Card large>
              <SectionLabel style={{ marginBottom: 10 }}>Trial counts</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {COUNTS.map(([key, label]) => (
                  <FieldRow key={key} label={label}>
                    <NumberSelect label={label} value={draft.trialCounts[key]} min={TRIAL_LIMITS[key][0]} max={TRIAL_LIMITS[key][1]} disabled={!canEdit} onChange={(v) => setIn('trialCounts', { [key]: v })} />
                  </FieldRow>
                ))}
                <FieldRow label="Grip rest (s)">
                  <TrialInput label="Grip rest shortest (s)" value={rest.min ?? null} rangeKey="restSec" width={74} disabled={!canEdit} onCommit={(v) => setIn('gripRestSec', { min: v })} />
                  <TrialInput label="Grip rest longest (s)" value={rest.max ?? null} rangeKey="restSec" width={74} disabled={!canEdit} onCommit={(v) => setIn('gripRestSec', { max: v })} />
                </FieldRow>
                {restProblem ? <Body size={12} tone={color.error}>{restProblem}</Body> : null}
              </div>
            </Card>
            <Card large>
              <SectionLabel style={{ marginBottom: 10 }}>Stations</SectionLabel>
              <Body size={12} style={{ marginBottom: 10 }}>Readiness & intake is always on: the pain check comes first.</Body>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {STATION_TOGGLES.map(([key, label]) => (
                  <Choice key={key} label={label} value={draft.stations[key] !== false} options={ON_OFF} disabled={!canEdit} onChange={(v) => setIn('stations', { [key]: v })} />
                ))}
                <Choice label="McGill" value={draft.mcgillMode} options={[['wave', 'Inside the wave'], ['separate', 'Its own block within 14 days']]} disabled={!canEdit} onChange={(v) => set({ mcgillMode: v })} />
                <Choice label="Med ball side" value={draft.medballSide} options={[['trail', 'Trail side'], ['dominant', 'Dominant side']]} disabled={!canEdit} onChange={(v) => set({ medballSide: v })} />
                <Choice label="Golf timing" value={draft.golfTiming} options={[['same-day', 'Same day as the circuit'], ['within-7', 'Within 7 days']]} disabled={!canEdit} onChange={(v) => set({ golfTiming: v })} />
                <FieldRow label="Athletes per wave">
                  <NumberSelect label="Athletes per wave" value={draft.waveSize} min={1} max={4} disabled={!canEdit} onChange={(v) => set({ waveSize: v })} />
                </FieldRow>
                <FieldRow label="Waves per session">
                  <NumberSelect label="Waves per session" value={draft.wavesPerSession} min={1} max={10} disabled={!canEdit} onChange={(v) => set({ wavesPerSession: v })} />
                </FieldRow>
              </div>
            </Card>
            <Card large>
              <SectionLabel style={{ marginBottom: 10 }}>Entry</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Choice label="10/5 entry" value={draft.hopEntry} options={[['summary', 'Per-set summary'], ['per-hop', 'Every hop']]} disabled={!canEdit} onChange={(v) => set({ hopEntry: v })} />
                <Choice label="CMJ RSImod" value={draft.rsiModEntry} options={[['typed', 'Typed from Smart2Move'], ['computed', 'Computed from height and time to take-off']]} disabled={!canEdit} onChange={(v) => set({ rsiModEntry: v })} />
              </div>
            </Card>
            <Card large>
              <SectionLabel style={{ marginBottom: 10 }}>Maturity and change markers</SectionLabel>
              <Body size={12}>
                Moore (2015) maturity offset: a + b x (age x sitting height) for boys, a + b x (age x standing height) for girls. Check them against the paper.
              </Body>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {[['boys', 'Boys'], ['girls', 'Girls']].map(([sex, label]) => (
                  <FieldRow key={sex} label={`${label} (a, b)`}>
                    <TrialInput label={`${label} coefficient a`} value={draft.coefficients[sex].a ?? null} rangeKey="coefficientA" width={120} disabled={!canEdit}
                      onCommit={(v) => setIn('coefficients', { [sex]: { ...draft.coefficients[sex], a: v } })} />
                    <TrialInput label={`${label} coefficient b`} value={draft.coefficients[sex].b ?? null} rangeKey="coefficientB" width={120} disabled={!canEdit}
                      onCommit={(v) => setIn('coefficients', { [sex]: { ...draft.coefficients[sex], b: v } })} />
                  </FieldRow>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <Choice label="Maturity coefficients" value={draft.coefficients.verified === true} options={[[false, 'Unverified'], [true, 'Checked against the paper']]} disabled={!canEdit}
                  onChange={(v) => setIn('coefficients', { verified: v })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {THRESHOLDS.map(([key, label]) => (
                  <FieldRow key={key} label={`Threshold, ${label} (%)`}>
                    <TrialInput label={`Threshold ${label} (%)`} value={draft.thresholds[key] ?? null} rangeKey="thresholdPct" width={74} disabled={!canEdit} onCommit={(v) => setIn('thresholds', { [key]: v })} />
                  </FieldRow>
                ))}
                <Body size={11} tone={color.textTertiary}>Thresholds are provisional (protocol Section 5). Blank means no marker.</Body>
              </div>
            </Card>
          </>
        ) : null}
      </div>
      {asking && base ? (
        <VersionSheet current={base.protocolVersion} saving={saving} error={saveError} onSave={save} onClose={() => { setAsking(false); setSaveError(null); }} />
      ) : null}
    </AssessmentFrame>
  );
}
