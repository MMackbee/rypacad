import React from 'react';
import { format, parseISO } from 'date-fns';
import { color, font } from '../../tokens';
import { Body } from '../Primitives';
import CheckinToggle from './CheckinToggle';
import WeekDots from './WeekDots';
import { OVERDUE_DAYS } from '../../data/contractBoard';
import { WEEKDAY_COUNT } from '../../data/contractRule';

/**
 * One athlete on the contract board (spec 5.4), a boardRows row
 * (data/contractBoard.js): name and requirement; this week's count and its
 * seven dots; last week and the last check-in, with the day count once it
 * is past the 14-day mark. The Checked in switch only when `canToggle`
 * (role mental; owner and ops read).
 */
export default function BoardRow({ row, canToggle = false, onToggle, style }) {
  const head = [row.age != null ? `Age ${row.age}` : null, `${row.required} min`].filter(Boolean).join(' · ');
  const history = [
    `Last week ${row.lastWeek?.metDays ?? 0}/${WEEKDAY_COUNT}`,
    row.lastCheckin ? `Last check-in ${format(parseISO(row.lastCheckin), 'MMM d')}` : 'Never checked in',
    row.daysSince != null && row.daysSince > OVERDUE_DAYS ? `${row.daysSince} days` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid ${color.rowRule}`, ...style }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ font: `600 15px ${font.body}`, color: color.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.name}
          </span>
          <span style={{ flex: 'none', font: `400 11px ${font.body}`, color: color.textTertiary }}>{head}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <span style={{ font: `500 12px ${font.body}`, color: color.textSecondary }}>
            This week {row.thisWeek?.metDays ?? 0}/{WEEKDAY_COUNT}
          </span>
          <WeekDots days={row.thisWeek?.days ?? []} />
        </div>
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 4 }}>{history}</Body>
      </div>
      {canToggle ? <CheckinToggle checked={Boolean(row.checkedInThisWeek)} onChange={onToggle} name={row.name} /> : null}
    </div>
  );
}
