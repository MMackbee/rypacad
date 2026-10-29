import React from 'react';
import { color, font } from '../../tokens';
import { MARKER_TONE } from './WindowCard';
import { MARKER_TEXT, TABLE_ROWS } from '../../data/assessmentResults';
import { shortDate } from '../../data/assessmentWindows';

const ARROW = { gain: '↑', within: '=', drop: '↓' };
const cell = { padding: '7px 10px', borderBottom: `1px solid ${color.rowRule}`, font: `400 12px ${font.body}`, color: color.textSecondary, textAlign: 'left' };

/** Desktop (> 1100 px): every window side by side, newest first, one row per score with its change marker (spec 5). */
export default function ResultsTable({ windows }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div role="table" aria-label="Results by window" style={{ display: 'table', width: '100%', borderCollapse: 'collapse' }}>
        <div role="row" style={{ display: 'table-row' }}>
          <div role="columnheader" style={{ ...cell, display: 'table-cell', font: `600 11px ${font.body}`, color: color.textTertiary }}>Measure</div>
          {windows.map((r) => (
            <div key={r.id} role="columnheader" style={{ ...cell, display: 'table-cell', font: `600 11px ${font.body}`, color: color.text }}>{r.kindLabel} · {shortDate(r.circuitDate)}</div>
          ))}
        </div>
        {TABLE_ROWS.filter((row) => windows.some((r) => row.value(r) != null)).map((row) => (
          <div key={row.label} role="row" style={{ display: 'table-row' }}>
            <div role="rowheader" style={{ ...cell, display: 'table-cell' }}>{row.label}</div>
            {windows.map((r) => {
              const marker = row.marker && r.markers ? r.markers[row.marker] : null;
              const value = row.value(r);
              return (
                <div key={r.id} role="cell" style={{ ...cell, display: 'table-cell', color: color.text }}>
                  {value ?? '-'}
                  {marker ? <span title={MARKER_TEXT[marker]} aria-label={MARKER_TEXT[marker]} style={{ marginLeft: 6, color: MARKER_TONE[marker] }}>{ARROW[marker]}</span> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
