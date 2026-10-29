import React from 'react';
import { color } from '../../tokens';
import { weekDaysOf } from '../../data/contractRule';

const LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FILL = {
  met: { background: color.primary, border: `1px solid ${color.primary}` },
  short: { background: color.errorMid, border: `1px solid ${color.errorMid}` },
  none: { background: color.track, border: `1px solid ${color.border}` },
  weekend: { background: color.dimmed, border: '1px solid transparent' },
};

/**
 * One week as seven 10 px dots, Mon..Sun (spec 5.4). The five contract days
 * carry their state (met, short, none); Saturday and Sunday are never
 * contract days and draw muted. `days` is weekSummary's five weekday entries
 * (data/contractRule.js); a missing day reads as none.
 */
export default function WeekDots({ days = [], style }) {
  const dates = days.length ? weekDaysOf(days[0].date) : LABELS.map(() => null);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, ...style }}>
      {dates.map((date, i) => {
        const state = i < 5 ? days[i]?.state ?? 'none' : 'weekend';
        return (
          <span
            key={date ?? i}
            role="img"
            data-dot={state}
            aria-label={`${LABELS[i]} ${state}`}
            title={date ?? undefined}
            style={{ width: 10, height: 10, borderRadius: '50%', boxSizing: 'border-box', flex: 'none', ...(FILL[state] || FILL.none) }}
          />
        );
      })}
    </div>
  );
}
