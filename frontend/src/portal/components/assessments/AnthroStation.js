import React, { useState } from 'react';
import { color } from '../../tokens';
import Button from '../Button';
import FieldRow from './FieldRow';
import TrialInput from './TrialInput';
import { Body } from '../Primitives';
import { GROWTH_FLAG_CM, anthroFinals, growthCm } from '../../data/assessmentScoring';
import { setAt } from '../../data/assessmentInput';
import { shortDate } from '../../data/assessmentWindows';

export const EMPTY_ANTHRO = { standing: [], mass: [], boxHeight: null, sittingRaw: [], arm: [], hand: [] };

/** The most recent earlier window with a standing height, for the growth check. */
function priorStanding(prior) {
  for (const w of [...(prior || [])].reverse()) {
    const standing = anthroFinals(w.anthro).standing;
    if (standing != null) return { standing, date: w.circuitDate };
  }
  return null;
}

/**
 * Station 2 - anthropometrics (protocol Section 3; spec 6). Standing height
 * and body mass every window, up to three measures, the final being the mean
 * of the closest two. Sitting height (on the box from the equipment) at
 * baseline and end, a third measure asked for when the first two differ by
 * more than 0.4 cm; arm and hand when the segments setting is on. Mid-season
 * runs the growth check against the last standing height: past 3 cm the
 * sitting height on file is stale and a repeat measure is offered.
 */
export default function AnthroStation({ athlete, equipment, circuitMode, onSave }) {
  const { athleteId, name, window: w } = athlete;
  const a = { ...EMPTY_ANTHRO, ...(w.anthro || {}) };
  const full = athlete.kind !== 'mid';
  const segments = full && circuitMode?.stations?.segments === true;
  const box = a.boxHeight ?? equipment.boxHeight ?? null;
  const finals = anthroFinals({ ...a, boxHeight: box });
  const prior = priorStanding(athlete.prior);
  const growth = prior ? growthCm(finals.standing, prior.standing) : null;
  const stale = !full && growth != null && growth > GROWTH_FLAG_CM;
  const [repeatSitting, setRepeatSitting] = useState(() => (a.sittingRaw || []).some((v) => v != null));
  const save = (field, i) => (v) => onSave(athleteId, 'anthro', { ...a, boxHeight: box, [field]: setAt(a[field], i, v, 3) });
  const trio = (field, rangeKey, text) => [0, 1, 2].map((i) => (
    <TrialInput key={i} label={`${name} ${text} ${i + 1}`} value={a[field]?.[i] ?? null} rangeKey={rangeKey} onCommit={save(field, i)} width={74} />
  ));
  const summary = [
    finals.standing != null ? `Standing ${finals.standing} cm` : null,
    finals.mass != null ? `mass ${finals.mass} kg` : null,
    finals.sitting != null ? `sitting ${finals.sitting} cm` : null,
    finals.legLength != null ? `leg ${finals.legLength} cm` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FieldRow label="Standing height (cm)">{trio('standing', 'standing', 'standing height')}</FieldRow>
      <FieldRow label="Body mass (kg)">{trio('mass', 'mass', 'body mass')}</FieldRow>
      {growth != null ? (
        <Body size={12} tone={stale ? color.secondary : color.textTertiary}>
          Standing height {growth >= 0 ? '+' : ''}{growth} cm since {shortDate(prior.date)}
          {stale ? '. Over 3 cm: the sitting height on file is stale for the maturity offset.' : '.'}
        </Body>
      ) : null}
      {stale && !repeatSitting ? (
        <Button variant="outline" height={40} style={{ boxShadow: 'none' }} onClick={() => setRepeatSitting(true)}>Measure sitting height again</Button>
      ) : null}
      {full || repeatSitting ? (
        <>
          <FieldRow label="Seated height on the box (cm)">{trio('sittingRaw', 'sittingRaw', 'seated height')}</FieldRow>
          {box == null ? <Body size={12} tone={color.secondary}>Enter the sitting box height under Equipment.</Body> : null}
          {finals.needsThirdSitting ? <Body size={12} tone={color.secondary}>The first two seated measures differ by more than 0.4 cm: take a third.</Body> : null}
        </>
      ) : null}
      {segments ? (
        <>
          <FieldRow label="Arm length (cm)">{trio('arm', 'arm', 'arm length')}</FieldRow>
          <FieldRow label="Hand length (cm)">{trio('hand', 'hand', 'hand length')}</FieldRow>
        </>
      ) : null}
      <Body size={12}>{summary || 'Final values appear as measures are entered.'}</Body>
    </div>
  );
}
