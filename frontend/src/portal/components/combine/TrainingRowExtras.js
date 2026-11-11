import React from 'react';
import ParallaxTick from './ParallaxTick';
import CombineButton from './CombineButton';
import { canTickIntake } from '../../data/combine';

/**
 * What a training session's attendance row adds (spec 3 and 4): the
 * Parallax intake swings tick and the Combine button.
 *
 * `intakes` is the useParallaxIntakes result (null: no tick on this row). A
 * row whose athlete is not in the loaded data yet passes `milestone`
 * undefined, so nothing shows until its read lands. The Combine button shows
 * when `onOpenCombine` is set and the screen is not read-only.
 *
 * `name` labels the row's controls and may be the screen-only "Name
 * unavailable"; `combineName` (the raw name, null for an unreadable athlete)
 * is what `onOpenCombine` receives, so that label never becomes the Combine
 * screen's title (the ClubheadChip precedent).
 */
export default function TrainingRowExtras({ athleteId, name, combineName = null, intakes, role, readOnly, onOpenCombine }) {
  const showTick = intakes != null;
  const showCombine = Boolean(onOpenCombine) && !readOnly;
  if (!showTick && !showCombine) return null;

  const byAthlete = intakes?.data?.byAthlete;
  const milestone = byAthlete && Object.prototype.hasOwnProperty.call(byAthlete, athleteId) ? byAthlete[athleteId] : undefined;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, marginTop: 4 }}>
      {showTick ? (
        <ParallaxTick
          name={name}
          milestone={milestone}
          viewer={intakes.data?.viewer ?? null}
          canTick={canTickIntake(role, readOnly)}
          loadError={Boolean(intakes.error)}
          onTick={() => intakes.tick(athleteId)}
          onUndo={() => intakes.undo(athleteId)}
        />
      ) : null}
      {showCombine ? <CombineButton name={name} onOpen={() => onOpenCombine(athleteId, combineName ?? null)} /> : null}
    </div>
  );
}
