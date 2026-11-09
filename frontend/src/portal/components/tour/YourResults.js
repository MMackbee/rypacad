import React from 'react';
import { color, font } from '../../tokens';
import { Card, SectionLabel } from '../Primitives';
import { longDayLabel } from '../../data/calendar';
import { boardLabel } from '../../data/tourBoards';

/** 1 -> '1st', 2 -> '2nd', 3 -> '3rd', 4 -> '4th', 11 -> '11th', ... */
export function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

/**
 * The athlete's own Saturdays, most recent first, on the board picked
 * by `boardId` when they are on it that day, else on their home board (the
 * age board events[].results lists them under) - so a 10 & under kid browsing
 * Overall still sees their own places. -> [{ date, score, position, points, board }]
 */
export function yourRows(events, athleteId, boardId) {
  return (events || []).flatMap((e) => {
    const onBoard = e.boards?.[boardId]?.find((r) => r.athleteId === athleteId);
    if (onBoard) return [{ date: e.date, score: onBoard.score, position: onBoard.position, points: onBoard.points, board: boardId }];
    const home = (e.results ?? []).find((r) => r.athleteId === athleteId);
    return home ? [{ date: e.date, score: home.score, position: home.position, points: home.points, board: home.board }] : [];
  });
}

/**
 * "Your results" (Sprint 8 pin) - athlete-only, a client-side filter of the
 * events the standings already carry; no hook of its own. Renders nothing
 * when the athlete has no results yet.
 */
export default function YourResults({ events, athleteId, boardId }) {
  const rows = yourRows(events, athleteId, boardId);
  if (!rows.length) return null;
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 12 }}>Your results</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* One row per Saturday (v1.6.1 weekly merge): the date is unique. */}
        {rows.map((r, i) => (
          <YourResultRow key={r.date} row={r} divider={i < rows.length - 1} />
        ))}
      </div>
    </Card>
  );
}

function YourResultRow({ row, divider }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '11px 0',
        borderBottom: divider ? `1px solid ${color.rowRule}` : 'none',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{longDayLabel(row.date)}</div>
        <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>
          {row.score} strokes · {ordinal(row.position)} · {boardLabel(row.board)}
        </div>
      </div>
      <div style={{ flex: 'none', textAlign: 'right' }}>
        <div style={{ font: `700 16px ${font.head}`, color: color.text }}>{row.points}</div>
        <div
          style={{
            font: `400 9px ${font.body}`,
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            color: color.textTertiary,
            marginTop: 2,
          }}
        >
          pts
        </div>
      </div>
    </div>
  );
}
