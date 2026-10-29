import React from 'react';
import Choice from './Choice';
import FieldRow from './FieldRow';
import TrialInput from './TrialInput';
import { LETTERS } from './StartWaveSheet';
import { Body } from '../Primitives';
import { anthroFinals, gripScores } from '../../data/assessmentScoring';
import { setAt } from '../../data/assessmentInput';

export const EMPTY_GRIP = { right: [], left: [], deviceRight: null, deviceLeft: null, handlePosition: null, dominant: null };

/** The grip rotation (protocol Section 3): pairs A/B on dynamometer 1 and C/D on 2, right then left, N rounds. */
export function gripRotation(athletes, circuitMode) {
  const n = circuitMode?.trialCounts?.grip ?? 3;
  const rest = circuitMode?.gripRestSec ?? { min: 15, max: 20 };
  const pair = (list) => list.map((a) => `${LETTERS[a.position - 1]} right, ${LETTERS[a.position - 1]} left`).join(', ');
  const first = athletes.filter((a) => a.position <= 2);
  const second = athletes.filter((a) => a.position > 2);
  const devices = [first.length ? `Dynamometer 1: ${pair(first)}` : null, second.length ? `Dynamometer 2: ${pair(second)}` : null].filter(Boolean).join(' · ');
  return `${devices} - ${n} round${n === 1 ? '' : 's'}. Rest ${rest.min}-${rest.max} s between same-hand efforts (circuit rest interval).`;
}

/**
 * Station 3 - grip (protocol Section 3). Every trial per hand in kg; the
 * athlete's pair device and the handle position come from the equipment and
 * are kept on the window; the dominant hand is noted on the window and the
 * profile. Always flagged "circuit rest interval": the rest is 15-20 s, not
 * a fully rested 30 s.
 */
export default function GripStation({ athlete, equipment, circuitMode, onSave, onSaveProfile }) {
  const { athleteId, name, window: w } = athlete;
  const g = { ...EMPTY_GRIP, ...(w.grip || {}) };
  const n = circuitMode?.trialCounts?.grip ?? 3;
  const device = (athlete.position <= 2 ? equipment.dynamometer1 : equipment.dynamometer2) || null;
  const scores = gripScores(g, anthroFinals(w.anthro).mass);
  const base = () => ({ ...g, deviceRight: device ?? g.deviceRight, deviceLeft: device ?? g.deviceLeft, handlePosition: equipment.handlePosition ?? g.handlePosition });
  const save = (hand, i) => (v) => onSave(athleteId, 'grip', { ...base(), [hand]: setAt(g[hand], i, v, n) });
  const trials = (hand) => Array.from({ length: n }, (_, i) => (
    <TrialInput key={i} label={`${name} grip ${hand} ${i + 1}`} value={g[hand]?.[i] ?? null} rangeKey="grip" onCommit={save(hand, i)} width={74} />
  ));
  const best = [
    scores.bestRight != null ? `Best right ${scores.bestRight} kg` : null,
    scores.bestLeft != null ? `left ${scores.bestLeft} kg` : null,
    scores.relativeBest != null ? `${scores.relativeBest} kg/kg` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FieldRow label="Right (kg)">{trials('right')}</FieldRow>
      <FieldRow label="Left (kg)">{trials('left')}</FieldRow>
      <Choice label={`${name} dominant hand`} value={g.dominant ?? athlete.profile?.dominantHand ?? null} options={[['right', 'Right'], ['left', 'Left']]}
        onChange={(dominant) => {
          onSave(athleteId, 'grip', { ...base(), dominant });
          if (dominant) onSaveProfile(athleteId, { dominantHand: dominant });
        }} />
      <Body size={12}>Device {device || g.deviceRight || 'not set'} · handle {equipment.handlePosition || g.handlePosition || 'not set'}</Body>
      {best ? <Body size={12}>{best} (circuit rest interval)</Body> : null}
    </div>
  );
}
