import React, { useState } from 'react';
import { color } from '../../tokens';
import Choice from './Choice';
import FieldRow from './FieldRow';
import TrialInput from './TrialInput';
import { LETTERS } from './StartWaveSheet';
import { Body } from '../Primitives';
import { anthroFinals, medballScores } from '../../data/assessmentScoring';
import { medballMassFor } from '../../data/assessmentSettings';
import { setAt } from '../../data/assessmentInput';

const METHOD_LABEL = { speed: 'radar speed', distance: 'throw distance' };

/** Station 5's order line (protocol Section 3). */
export function medballRotation(athletes, circuitMode) {
  const c = circuitMode?.trialCounts ?? {};
  const side = circuitMode?.medballSide === 'dominant' ? 'dominant side' : 'trail side';
  return `Alternate athletes (${athletes.map((a) => LETTERS[a.position - 1]).join(', ')}): ${c.medballPractice ?? 1} practice, then ${c.medballScored ?? 3} scored throws each, ${side} only. Ball starts at the back hip; feet may pivot but not step.`;
}

/**
 * Station 5 - rotational med ball (protocol Section 3). The ball is assigned
 * at the athlete's first test of the season by body mass (under 45 kg 2 kg,
 * 45-65 kg 3 kg, over 65 kg 4 kg) and kept all season; the method (radar
 * speed or throw distance) is fixed for the season too - "block mixing". The
 * first throw records both on the profile; firestore.rules refuses the other
 * method or another ball for the rest of the season.
 */
export default function MedballStation({ athlete, equipment, circuitMode, onSave, onSaveProfile }) {
  const { athleteId, name, window: w } = athlete;
  const m = w.medball || {};
  const p = athlete.profile || {};
  const sameSeason = p.season === w.season;
  const lockedMethod = sameSeason ? p.medballMethod ?? null : null;
  const lockedMass = sameSeason ? p.medballMassKg ?? null : null;
  const method = lockedMethod ?? m.method ?? equipment.radarMethod ?? 'speed';
  const suggested = medballMassFor(anthroFinals(w.anthro).mass);
  const [picked, setPicked] = useState(null);
  const mass = lockedMass ?? m.massKg ?? picked ?? suggested;
  const n = circuitMode?.trialCounts?.medballScored ?? 3;
  const side = circuitMode?.medballSide ?? 'trail';
  const unit = method === 'distance' ? 'm' : 'mph';
  const best = medballScores({ ...m, method }).best;

  const save = (i) => (v) => {
    onSave(athleteId, 'medball', { massKg: mass, side, method, throws: setAt(m.throws, i, v, n) });
    if (!lockedMethod || (mass != null && lockedMass == null)) onSaveProfile(athleteId, { medballMethod: method, medballMassKg: mass, season: w.season });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {lockedMethod && equipment.radarMethod && equipment.radarMethod !== lockedMethod ? (
        <Body size={12} tone={color.secondary}>{name}'s season method is {METHOD_LABEL[lockedMethod]}; mixing methods is blocked.</Body>
      ) : null}
      {lockedMass ? (
        <Body size={12}>Ball: {lockedMass} kg, assigned at the first test and kept all season.</Body>
      ) : (
        <>
          <Choice label={`${name} ball`} value={mass} options={[[2, '2 kg'], [3, '3 kg'], [4, '4 kg']]} onChange={setPicked} />
          <Body size={11} tone={color.textTertiary}>{suggested ? `Suggested by body mass: ${suggested} kg` : 'Measure body mass first, or pick a ball.'}</Body>
        </>
      )}
      <FieldRow label={`Scored throws (${unit})`}>
        {Array.from({ length: n }, (_, i) => (
          <TrialInput key={`${method}-${i}`} label={`${name} throw ${i + 1} (${unit})`} value={m.method === method ? m.throws?.[i] ?? null : null}
            rangeKey={method === 'distance' ? 'medballDistance' : 'medballSpeed'} onCommit={save(i)} width={78} />
        ))}
      </FieldRow>
      {best != null ? <Body size={12}>Best throw {best} {unit} · {mass ?? '?'} kg · {side} side</Body> : null}
    </div>
  );
}
