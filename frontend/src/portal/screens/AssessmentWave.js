import React, { useEffect, useState } from 'react';
import { color, font, radius } from '../tokens';
import AssessmentFrame, { useLayoutClass } from '../components/AssessmentFrame';
import Button from '../components/Button';
import CancelSheet from '../components/CancelSheet';
import StationShell from '../components/assessments/StationShell';
import EquipmentCard, { useEquipment } from '../components/assessments/EquipmentCard';
import IntakeStation from '../components/assessments/IntakeStation';
import AnthroStation from '../components/assessments/AnthroStation';
import GripStation, { gripRotation } from '../components/assessments/GripStation';
import { BackLink, Body, ErrorNotice, ScreenTitle } from '../components/Primitives';
import { useWave } from '../hooks/assessments';
import { saveAssessmentProfile, saveSection, saveWindowFields } from '../hooks/assessmentsLive';
import useSaveTracker, { dropPending, keepPending, pendingFor } from '../hooks/assessmentSaves';
import { stationsFor } from '../data/assessmentSettings';
import { shortDate } from '../data/assessmentWindows';

/**
 * The station views, in the fixed order (protocol Section 2). A station
 * without a view here is not offered yet.
 */
export const STATION_VIEWS = {
  intake: { View: IntakeStation },
  anthro: { View: AnthroStation },
  grip: { View: GripStation, rotation: gripRotation },
};

/** The save tracker's key for a kept entry: athleteId:section, athleteId:profile or athleteId:fields. */
const trackerKey = (kept) => `${kept.athleteId}:${kept.kind === 'section' ? kept.section : kept.kind}`;

/** Send one kept save (`value` is what this write carries); the device copy goes once the server has it. */
function send(kept, value = kept.value) {
  const done = (result) => {
    dropPending(kept);
    return result;
  };
  const { athleteId, windowId } = kept;
  if (kept.kind === 'section') return saveSection({ athleteId, windowId, section: kept.section, value }).then(done);
  if (kept.kind === 'fields') return saveWindowFields({ athleteId, windowId, fields: value }).then(done);
  return saveAssessmentProfile({ athleteId, patch: value }).then(done);
}

/**
 * One wave of four (spec 5): the fixed station order, each station's cue,
 * the athletes in rotation order, the equipment entered once, and every
 * entry saved as it is typed - one section per write
 * (hooks/assessmentsLive.js saveSection). What was typed lives here once the
 * wave has loaded, so nothing a background read brings back can overwrite
 * it; the save tracker says what has not reached the server yet, and
 * leaving with anything unsaved asks first (Review Focus 2). Every save is
 * also kept on this device until the server has it: a reload, or iPad
 * Safari evicting the page, loses the SDK's queued writes and ignores the
 * leave prompt, so when the wave opens again what is still kept is shown
 * and sent again.
 * `initialStation` reopens one station (the McGill block run later).
 */
export default function AssessmentWave({ bare = false, waveId, initialStation = null, onBack }) {
  const layout = useLayoutClass();
  const { data, loading, error } = useWave(waveId);
  const tracker = useSaveTracker();
  const [equipment, setEquipment] = useEquipment();
  const [windows, setWindows] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [index, setIndex] = useState(null);
  const [leaving, setLeaving] = useState(false);

  const { run } = tracker;
  useEffect(() => {
    if (windows || !data) return;
    const kept = pendingFor(data.athletes.map((a) => [a.athleteId, a.windowId]));
    const ws = Object.fromEntries(data.athletes.map((a) => [a.athleteId, a.window]));
    const ps = Object.fromEntries(data.athletes.map((a) => [a.athleteId, a.profile]));
    for (const k of kept) {
      if (k.kind === 'section') ws[k.athleteId] = { ...ws[k.athleteId], [k.section]: k.value };
      else if (k.kind === 'fields') ws[k.athleteId] = { ...ws[k.athleteId], ...k.value };
      else ps[k.athleteId] = { ...(ps[k.athleteId] || {}), ...k.value };
    }
    setWindows(ws);
    setProfiles(ps);
    for (const k of kept) run(trackerKey(k), () => send(k));
  }, [data, windows, run]);

  const athletes = data && windows ? data.athletes.map((a) => ({ ...a, window: windows[a.athleteId], profile: profiles[a.athleteId] ?? null })) : [];
  const stations = data ? stationsFor(data.circuitMode, data.athletes.map((a) => a.kind)).filter((s) => STATION_VIEWS[s.id]) : [];
  const at = index ?? Math.max(0, stations.findIndex((s) => s.id === initialStation));
  const station = stations[at] ?? null;

  const saveSectionOf = (athleteId, section, value) => {
    const windowId = windows[athleteId].id;
    setWindows((all) => ({ ...all, [athleteId]: { ...all[athleteId], [section]: value } }));
    const kept = keepPending({ kind: 'section', athleteId, windowId, section, value });
    tracker.run(`${athleteId}:${section}`, () => send(kept));
  };
  const saveProfileOf = (athleteId, patch) => {
    setProfiles((all) => ({ ...all, [athleteId]: { ...(all[athleteId] || {}), ...patch } }));
    const kept = keepPending({ kind: 'profile', athleteId, value: patch });
    tracker.run(`${athleteId}:profile`, () => send(kept, patch));
  };
  const saveFieldsOf = (athleteId, fields) => {
    const windowId = windows[athleteId].id;
    setWindows((all) => ({ ...all, [athleteId]: { ...all[athleteId], ...fields } }));
    const kept = keepPending({ kind: 'fields', athleteId, windowId, value: fields });
    tracker.run(`${athleteId}:fields`, () => send(kept, fields));
  };
  const markNotTested = (athleteId, keys, reason) => {
    const next = { ...(windows[athleteId].notTested || {}) };
    for (const k of keys) {
      if (reason) next[k] = reason;
      else delete next[k];
    }
    saveSectionOf(athleteId, 'notTested', next);
  };
  const leave = () => (tracker.unsaved ? setLeaving(true) : onBack());

  const header = (
    <div style={{ padding: '4px 22px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackLink onClick={leave}>‹ Assessments</BackLink>
        <div style={{ flex: 1 }} />
        <span style={{ font: `500 11px ${font.body}`, color: tracker.unsaved ? color.secondary : color.textTertiary }}>
          {tracker.unsaved ? `${tracker.unsaved} not saved yet` : 'All saved'}
        </span>
      </div>
      {data ? (
        <>
          <ScreenTitle size={21} style={{ marginTop: 8 }}>Wave · {shortDate(data.circuitDate)}</ScreenTitle>
          <Body size={12} style={{ marginTop: 3 }}>Protocol {data.protocolVersion} · {data.athletes.length} athlete{data.athletes.length === 1 ? '' : 's'}</Body>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {stations.map((s, i) => {
              const on = i === at;
              return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => setIndex(i)}
                  style={{ minHeight: 36, padding: '0 12px', borderRadius: radius.pill, border: `1px solid ${on ? color.primary : color.controlBorder}`, background: on ? color.primary : 'transparent', color: on ? '#000' : color.textSecondary, font: `${on ? 600 : 500} 12px ${font.body}` }}>
                  {i + 1} {s.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );

  const footer = station ? (
    <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '12px 22px 18px', display: 'flex', gap: 10 }}>
      <Button variant="outline" height={50} disabled={at === 0} style={{ boxShadow: 'none' }} onClick={() => setIndex(at - 1)}>‹ Previous station</Button>
      {at < stations.length - 1 ? (
        <Button height={50} onClick={() => setIndex(at + 1)}>Next station ›</Button>
      ) : (
        <Button height={50} onClick={leave}>Finish wave</Button>
      )}
    </div>
  ) : null;

  const View = station ? STATION_VIEWS[station.id] : null;
  return (
    <AssessmentFrame bare={bare} layout={layout} header={header} footer={footer}>
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && !windows ? <ErrorNotice>The wave didn't load. Check your connection and try again.</ErrorNotice> : null}
        {loading && !windows ? <Body size={12}>Loading the wave…</Body> : null}
        {!loading && !error && !data ? <Body size={13}>This wave was not found.</Body> : null}
        {station && View ? (
          <>
            <EquipmentCard equipment={equipment} onChange={setEquipment} />
            <StationShell
              station={station}
              athletes={athletes}
              layout={layout}
              order={View.rotation ? View.rotation(athletes, data.circuitMode) : null}
              entries={tracker.entries}
              onRetry={tracker.retry}
              onNotTested={markNotTested}
              renderAthlete={(a) => (
                <View.View athlete={a} equipment={equipment} circuitMode={data.circuitMode} onSave={saveSectionOf} onSaveProfile={saveProfileOf} onSaveFields={saveFieldsOf} />
              )}
            />
          </>
        ) : null}
      </div>
      {leaving ? (
        <CancelSheet
          title="Leave this wave?"
          summary={`${tracker.unsaved} ${tracker.unsaved === 1 ? 'entry has' : 'entries have'} not reached the server yet. If you leave now, ${tracker.unsaved === 1 ? 'it' : 'they'} may be lost.`}
          confirmLabel="Leave anyway"
          busyLabel="Leaving"
          keepLabel="Stay on the wave"
          onClose={() => setLeaving(false)}
          onConfirm={async () => {}}
          onCancelled={onBack}
        />
      ) : null}
    </AssessmentFrame>
  );
}
