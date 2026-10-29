import React from 'react';
import Choice from './Choice';
import FieldRow from './FieldRow';
import TrialInput, { TextEntry } from './TrialInput';
import { SectionLabel } from '../Primitives';
import { NOT_TESTED_REASONS } from '../../data/assessmentSettings';

export const EMPTY_READINESS = { status: null, reason: null, hoursSinceHardSession: null, golfToday: null, notes: null };
export const EMPTY_LOG = { location: null, externalContent: null, weeklyHours: null, rypSessionsSincePrior: null, golfVolume: null, competitiveLevel: null, otherSport: null, otherSportHours: null };
const YES_NO = [[true, 'Yes'], [false, 'No']];

/**
 * Station 1 - readiness & intake (protocol Sections 2 and 5): the pain
 * check (pass, or not tested with a reason), hours since the last hard
 * session, golf played today, low back pain (McGill flexor and extensor are
 * then skipped), sex - entered by the coach (spec decision 8) - and the
 * training and location log. Each answer saves as it is given.
 */
export default function IntakeStation({ athlete, onSave, onSaveProfile }) {
  const { athleteId, name, window: w } = athlete;
  const r = { ...EMPTY_READINESS, ...(w.readiness || {}) };
  const log = { ...EMPTY_LOG, ...(w.log || {}) };
  const setR = (patch) => onSave(athleteId, 'readiness', { ...r, ...patch });
  const setLog = (patch) => onSave(athleteId, 'log', { ...log, ...patch });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Choice label={`${name} readiness`} value={r.status} options={[['pass', 'Pass'], ['not-tested', 'Not tested']]}
        onChange={(status) => setR({ status, reason: status === 'not-tested' ? r.reason : null })} />
      {r.status === 'not-tested' ? (
        <Choice label={`${name} reason`} value={r.reason} options={NOT_TESTED_REASONS} onChange={(reason) => setR({ reason })} />
      ) : null}
      <FieldRow label="Hours since a hard session">
        <TrialInput label={`${name} hours since a hard session`} value={r.hoursSinceHardSession} rangeKey="hoursSinceHard" onCommit={(v) => setR({ hoursSinceHardSession: v })} />
      </FieldRow>
      <Choice label={`${name} golf today`} value={r.golfToday} options={YES_NO} onChange={(golfToday) => setR({ golfToday })} />
      {athlete.kind !== 'mid' ? (
        <Choice label={`${name} low back pain now`} value={w.mcgill?.skippedBackPain ?? null} options={YES_NO}
          onChange={(v) => onSave(athleteId, 'mcgill', { ...(w.mcgill || {}), skippedBackPain: v })} />
      ) : null}
      <Choice label={`${name} sex`} value={athlete.profile?.sex ?? null} options={[['male', 'Male'], ['female', 'Female']]}
        onChange={(sex) => { if (sex) onSaveProfile(athleteId, { sex }); }} />
      <FieldRow label="Readiness notes">
        <TextEntry label={`${name} readiness notes`} value={r.notes} max={500} onCommit={(notes) => setR({ notes })} />
      </FieldRow>
      <SectionLabel style={{ marginTop: 6 }}>Training & location</SectionLabel>
      <Choice label={`${name} training location`} value={log.location} options={[['ryp', 'RYP'], ['external', 'External'], ['none', 'None']]}
        onChange={(location) => setLog({ location, externalContent: location === 'external' ? log.externalContent : null })} />
      {log.location === 'external' ? (
        <Choice label={`${name} external training`} value={log.externalContent}
          options={[['machines', 'Machines / barbells'], ['bodyweight', 'Bodyweight / bands / cable'], ['class', 'General fitness class']]}
          onChange={(externalContent) => setLog({ externalContent })} />
      ) : null}
      <FieldRow label="Weekly training hours">
        <TrialInput label={`${name} weekly training hours`} value={log.weeklyHours} rangeKey="weeklyHours" onCommit={(v) => setLog({ weeklyHours: v })} />
      </FieldRow>
      <FieldRow label="RYP sessions since the last window">
        <TrialInput label={`${name} RYP sessions since the last window`} value={log.rypSessionsSincePrior} rangeKey="sessions" onCommit={(v) => setLog({ rypSessionsSincePrior: v })} />
      </FieldRow>
      <FieldRow label="Golf practice and competition">
        <TextEntry label={`${name} golf volume`} value={log.golfVolume} max={80} onCommit={(golfVolume) => setLog({ golfVolume })} />
      </FieldRow>
      <FieldRow label="Competitive level">
        <TextEntry label={`${name} competitive level`} value={log.competitiveLevel} max={80} onCommit={(competitiveLevel) => setLog({ competitiveLevel })} />
      </FieldRow>
      <FieldRow label="Other organized sport">
        <TextEntry label={`${name} other sport`} value={log.otherSport} max={40} onCommit={(otherSport) => setLog({ otherSport })} />
      </FieldRow>
      {log.otherSport ? (
        <FieldRow label="Other sport hours a week">
          <TrialInput label={`${name} other sport hours`} value={log.otherSportHours} rangeKey="otherSportHours" onCommit={(v) => setLog({ otherSportHours: v })} />
        </FieldRow>
      ) : null}
    </div>
  );
}
