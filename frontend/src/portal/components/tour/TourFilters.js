import React from 'react';
import { color, font, radius } from '../../tokens';

/**
 * The Tour standings' two filters (owner ruling 2026-11-06: "a leaderboard
 * with filters for all of those works well"): Age, then Gender. Together they
 * pick exactly one leaderboard (data/tourBoards.js boardIdFor). These are
 * real controls, so the chosen chip takes the solid "tappable" fill (flag 02,
 * StatusBadge.js), the idiom MySchedule's Segmented control already uses.
 * Chips wrap, so the row works at 375px. `genders` null hides the Gender row
 * (10 & under, Open and a legacy board are one board each).
 */
export default function TourFilters({ ages, age, onAge, genders, gender, onGender }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ChipRow label="Age" options={ages} value={age} onChange={onAge} />
      {genders ? <ChipRow label="Gender" options={genders} value={gender} onChange={onGender} segmented /> : null}
    </div>
  );
}

function ChipRow({ label, options, value, onChange, segmented = false }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: segmented ? 6 : 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            style={{
              height: 44,
              minWidth: segmented ? 72 : 0,
              flex: segmented ? '1 1 0' : 'none',
              padding: '0 14px',
              borderRadius: radius.pill,
              border: `1px solid ${on ? color.primary : color.border}`,
              background: on ? color.primary : 'transparent',
              color: on ? '#000' : color.textSecondary,
              font: `600 13px ${font.body}`,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
