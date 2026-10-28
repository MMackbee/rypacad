import React from 'react';
import { color } from '../../tokens';
import FieldRow from './FieldRow';
import TrialInput from './TrialInput';
import { LETTERS } from './StartWaveSheet';
import { Body, SectionLabel } from '../Primitives';
import { anthroFinals, cmjScores, hopScores } from '../../data/assessmentScoring';
import { setAt } from '../../data/assessmentInput';

export const EMPTY_CMJ = { trials: [], software: null, samplingHz: null };
export const EMPTY_TRIAL = { heightCm: null, rsiMod: null, timeToTakeoffMs: null, peakPowerW: null, peakPowerWkg: null, asymmetryPct: null };
const HOPS = 10;

/** Station 4's order line (protocol Section 3). */
export function jumpRotation(athletes, circuitMode) {
  const c = circuitMode?.trialCounts ?? {};
  const order = athletes.map((a) => LETTERS[a.position - 1]).join(', ');
  return `CMJ: ${c.cmjPractice ?? 1} practice, then ${c.cmjScored ?? 2} scored, in rotation (${order}) - everyone jumps before anyone repeats. 10/5: ${c.hopPractice ?? 1} practice set, then ${c.hopScored ?? 2} scored sets of 10.`;
}

/**
 * Station 4 - CMJ, then 10/5, on the force plates (protocol Section 3). The
 * values Smart2Move shows are typed per scored trial (spec decision 3); the
 * practice jump and set are not recorded. RSImod is typed, or computed from
 * height and time to take-off (the rsiModEntry setting); the 10/5 set is the
 * per-set summary or every hop (the hopEntry setting). A set whose contact
 * time is over 250 ms is flagged and not reported. Asymmetry and contact time
 * are coach-only values. A circuit with the CMJ or the 10/5 switched off in
 * settings shows only the other.
 */
export default function JumpStation({ athlete, equipment, circuitMode, onSave }) {
  const { athleteId, name, window: w } = athlete;
  const cmj = { ...EMPTY_CMJ, ...(w.cmj || {}) };
  const hop = { sets: [], ...(w.hop || {}) };
  const scored = circuitMode?.trialCounts?.cmjScored ?? 2;
  const setCount = circuitMode?.trialCounts?.hopScored ?? 2;
  const computed = circuitMode?.rsiModEntry === 'computed';
  const everyHop = circuitMode?.hopEntry === 'per-hop';
  const showCmj = circuitMode?.stations?.cmj !== false;
  const showHop = circuitMode?.stations?.hop !== false;
  const cmjBest = cmjScores(cmj, { rsiModEntry: circuitMode?.rsiModEntry, massKg: anthroFinals(w.anthro).mass });
  const hopBest = hopScores(hop, { hopEntry: circuitMode?.hopEntry });

  const fields = [
    ['heightCm', 'cmjHeight', 'height (cm)'],
    computed ? ['timeToTakeoffMs', 'timeToTakeoffMs', 'time to take-off (ms)'] : ['rsiMod', 'rsiMod', 'RSImod'],
    ['peakPowerW', 'peakPowerW', 'peak power (W)'],
    ['peakPowerWkg', 'peakPowerWkg', 'peak power (W/kg)'],
    ['asymmetryPct', 'asymmetryPct', 'L/R asymmetry (%)'],
  ];
  const saveTrial = (i, field) => (v) => {
    const trial = { ...EMPTY_TRIAL, ...(cmj.trials[i] || {}), [field]: v };
    onSave(athleteId, 'cmj', { trials: setAt(cmj.trials, i, trial, scored), software: equipment.plateSoftware ?? cmj.software, samplingHz: equipment.samplingHz ?? cmj.samplingHz });
  };
  const saveSet = (s, next) => onSave(athleteId, 'hop', { sets: setAt(hop.sets, s, next, setCount) });
  const summaryOf = (s) => (hop.sets[s] && !Array.isArray(hop.sets[s].hopRsi) ? hop.sets[s] : {});
  const hopsOf = (s) => (hop.sets[s] && Array.isArray(hop.sets[s].hopRsi) ? hop.sets[s] : { hopRsi: [], hopGctMs: [] });

  const cmjLine = [
    cmjBest.bestHeight != null ? `Best CMJ ${cmjBest.bestHeight} cm` : null,
    cmjBest.bestRsiMod != null ? `RSImod ${cmjBest.bestRsiMod}` : null,
    cmjBest.bestPeakW != null ? `${cmjBest.bestPeakW} W` : null,
    cmjBest.bestPeakWkg != null ? `${cmjBest.bestPeakWkg} W/kg` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {showCmj ? <SectionLabel>CMJ</SectionLabel> : null}
      {showCmj && Array.from({ length: scored }, (_, i) => (
        <FieldRow key={i} label={`Jump ${i + 1}`}>
          {fields.map(([field, rangeKey, text]) => (
            <TrialInput key={field} label={`${name} CMJ ${i + 1} ${text}`} value={cmj.trials[i]?.[field] ?? null} rangeKey={rangeKey} onCommit={saveTrial(i, field)} width={78} />
          ))}
        </FieldRow>
      ))}
      {showCmj && cmjLine ? <Body size={12}>{cmjLine}</Body> : null}
      {showHop ? <SectionLabel style={{ marginTop: 6 }}>10/5 repeated hop</SectionLabel> : null}
      {showHop && Array.from({ length: setCount }, (_, s) => (
        <div key={s} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {everyHop ? (
            Array.from({ length: HOPS }, (__, h) => (
              <FieldRow key={h} label={`Set ${s + 1}, hop ${h + 1}`}>
                {[['hopRsi', 'rsi', 'RSI'], ['hopGctMs', 'gctMs', 'contact time (ms)']].map(([field, rangeKey, text]) => (
                  <TrialInput key={field} label={`${name} 10/5 set ${s + 1} hop ${h + 1} ${text}`} value={hopsOf(s)[field]?.[h] ?? null} rangeKey={rangeKey} width={78}
                    onCommit={(v) => { const cur = hopsOf(s); saveSet(s, { hopRsi: cur.hopRsi ?? [], hopGctMs: cur.hopGctMs ?? [], [field]: setAt(cur[field], h, v, HOPS) }); }} />
                ))}
              </FieldRow>
            ))
          ) : (
            <FieldRow label={`Set ${s + 1}`}>
              {[['rsiBest5', 'rsi', 'RSI best 5'], ['gctMs', 'gctMs', 'contact time (ms)']].map(([field, rangeKey, text]) => (
                <TrialInput key={field} label={`${name} 10/5 set ${s + 1} ${text}`} value={summaryOf(s)[field] ?? null} rangeKey={rangeKey} width={78}
                  onCommit={(v) => { const cur = summaryOf(s); saveSet(s, { rsiBest5: cur.rsiBest5 ?? null, gctMs: cur.gctMs ?? null, [field]: v }); }} />
              ))}
            </FieldRow>
          )}
          {hopBest.sets[s]?.flagged ? (
            <Body size={12} tone={color.secondary}>Set {s + 1}: contact time {hopBest.sets[s].gctMs} ms is over 250 ms. Coach the pattern; this set is not reported.</Body>
          ) : null}
        </div>
      ))}
      {showHop && hopBest.best != null ? <Body size={12}>Best 10/5 RSI {hopBest.best}</Body> : null}
    </div>
  );
}
