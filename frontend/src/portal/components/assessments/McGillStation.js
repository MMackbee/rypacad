import React from 'react';
import { color } from '../../tokens';
import Button from '../Button';
import FieldRow from './FieldRow';
import HoldTimer from './HoldTimer';
import { LETTERS } from './StartWaveSheet';
import { Body } from '../Primitives';
import { mcgillScores } from '../../data/assessmentScoring';
import { MCGILL_WINDOW_DAYS, daysBetween, shortDate, toISODate } from '../../data/assessmentWindows';

export const EMPTY_MCGILL = { flexorSec: null, extensorSec: null, sideRightSec: null, sideLeftSec: null, skippedBackPain: false };

/** The four holds in the protocol's order (Section 3). */
export const HOLDS = [['flexorSec', 'trunk flexor'], ['extensorSec', 'trunk extensor'], ['sideRightSec', 'right side bridge'], ['sideLeftSec', 'left side bridge']];

/** Station 6's order line; a circuit set to run McGill as its own block says so. */
export function mcgillRotation(athletes, circuitMode) {
  const order = athletes.map((a) => LETTERS[a.position - 1]).join(', ');
  const block = circuitMode?.mcgillMode === 'separate'
    ? ` This circuit runs McGill as its own block within ${MCGILL_WINDOW_DAYS} days; enter it here on the day it runs.`
    : '';
  return `Each athlete in turn (${order}): ${HOLDS.map(([, n]) => n).join(', ')}.${block}`;
}

const ratioText = (label, r) => (r ? `${label} ${r.value}${r.capped ? ' (capped)' : r.flagged ? ' - flag' : ''}` : null);

/**
 * Station 6 - McGill endurance holds (protocol Section 3), baseline and end
 * of season only. One timer per hold, capped at 300 s; back pain skips the
 * whole test. The first hold saved dates the McGill (`mcgillDate`, the
 * academy date), so a block run later is timed from the day it ran; more
 * than 14 days after the circuit is warned here and flagged in the results,
 * never refused.
 */
export default function McGillStation({ athlete, onSave, onSaveFields }) {
  const { athleteId, name, window: w } = athlete;
  if (athlete.kind === 'mid') return <Body size={13}>McGill runs at baseline and end of season only.</Body>;
  const m = { ...EMPTY_MCGILL, ...(w.mcgill || {}) };
  const today = toISODate(Date.now());
  const after = daysBetween(w.circuitDate, w.mcgillDate ?? today);
  const save = (next) => {
    onSave(athleteId, 'mcgill', next);
    if (!w.mcgillDate) onSaveFields(athleteId, { mcgillDate: today });
  };
  const s = mcgillScores(m);
  const ratios = [
    ratioText('Flexion:extension', s.flexExt),
    ratioText('Right:left', s.rightLeft),
    ratioText('Right side:extension', s.sideRightExt),
    ratioText('Left side:extension', s.sideLeftExt),
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {after != null && after > MCGILL_WINDOW_DAYS ? (
        <Body size={12} tone={color.secondary}>
          {after} days after the circuit ({shortDate(w.circuitDate)}). McGill is due within {MCGILL_WINDOW_DAYS} days; this result will be flagged.
        </Body>
      ) : null}
      {m.skippedBackPain ? (
        <>
          <Body size={13}>Skipped: back pain. No holds are taken.</Body>
          <Button variant="outline" height={40} style={{ boxShadow: 'none' }} onClick={() => save({ ...m, skippedBackPain: false })}>Undo skip</Button>
        </>
      ) : (
        <>
          {HOLDS.map(([key, hold]) => (
            <FieldRow key={key} label={hold[0].toUpperCase() + hold.slice(1)}>
              <HoldTimer label={`${name} ${hold}`} value={m[key]} onCommit={(v) => save({ ...m, [key]: v })} />
            </FieldRow>
          ))}
          {ratios ? <Body size={12}>{ratios}</Body> : null}
          <Button variant="outline" height={40} aria-label={`${name}: skip, back pain`} style={{ boxShadow: 'none' }} onClick={() => save({ ...m, skippedBackPain: true })}>
            Skip - back pain
          </Button>
        </>
      )}
    </div>
  );
}
