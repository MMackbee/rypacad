import React from 'react';
import { color, font, radius, tint } from '../../tokens';
import { Tick } from '../Primitives';
import { genderChoices } from '../../data/tourSheet';

/*
 * The Tour score sheet's small parts (screens/TourScoreSheet.js and
 * ./CoachSection.js): the Boys/Girls (Men/Women) picker, the strokes field
 * and the two save notices.
 */

/**
 * Boys / Girls for a player 11 and up, Men / Women for a coach - a real
 * control, so the chosen side takes the solid "tappable" fill (flag 02,
 * StatusBadge.js); an unpicked row says so in caution yellow.
 */
export function GenderPicker({ name, coach = false, value, onChange, disabled }) {
  const choices = genderChoices(coach);
  return (
    <div
      role="group"
      aria-label={`${choices[0].label} or ${choices[1].label} for ${name}`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}
    >
      {choices.map((c) => {
        const on = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(c.id)}
            style={{
              height: 40,
              minWidth: 64,
              padding: '0 12px',
              borderRadius: radius.control,
              border: `1.5px solid ${on ? color.primary : color.controlBorder}`,
              background: on ? color.primary : 'transparent',
              color: on ? '#000' : color.textSecondary,
              font: `600 12px ${font.body}`,
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {c.label}
          </button>
        );
      })}
      {value ? null : <span style={{ font: `500 11px ${font.body}`, color: color.secondary }}>Choose one</span>}
    </div>
  );
}

/**
 * Strokes input - same visual idiom as NumericField's input (screen 14):
 * track fill, 1px border, 8px radius, right-aligned 600-weight figures.
 * Digits only, at most 3 (the max, 200, is 3 digits).
 */
export function ScoreField({ value, onChange, disabled, label }) {
  return (
    <input
      inputMode="numeric"
      aria-label={label}
      value={value}
      disabled={disabled}
      placeholder="—"
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
      style={{
        width: 64,
        height: 44,
        background: color.track,
        border: `1px solid ${color.border}`,
        borderRadius: radius.input,
        font: `600 15px ${font.body}`,
        color: disabled ? color.mutedText : color.text,
        textAlign: 'right',
        padding: '0 10px',
        outline: 'none',
      }}
    />
  );
}

/** Same green-toast idiom as NotificationPreferences' SavedToast. */
export function SavedNotice() {
  return (
    <div
      role="status"
      style={{
        background: 'rgba(0,175,81,.1)',
        border: `1px solid ${color.primary}`,
        borderRadius: 10,
        padding: '11px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: color.primary,
          display: 'grid',
          placeItems: 'center',
          flex: 'none',
        }}
      >
        <Tick size={9} />
      </span>
      <span style={{ font: `500 13px ${font.body}`, color: color.primary }}>Scores saved</span>
    </div>
  );
}

/** A save that left rows out: how many landed, who did not and why - caution yellow, never the green toast. */
export function PartlySavedNotice({ saved, lines }) {
  return (
    <div
      role="status"
      style={{
        background: tint.yellow,
        border: `1px solid ${tint.yellowBorder}`,
        borderRadius: 10,
        padding: '11px 14px',
        font: `500 13px/1.45 ${font.body}`,
        color: color.secondary,
      }}
    >
      {saved === 1 ? '1 score saved.' : `${saved} scores saved.`} Not saved yet: {lines.join(' ')} Then tap Save
      scores again.
    </div>
  );
}
