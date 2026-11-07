import React, { useState } from 'react';
import { color, font, radius } from '../../tokens';
import AthleteRow from '../AthleteRow';
import { Body, SectionLabel } from '../Primitives';
import { GenderPicker, ScoreField } from './SheetParts';
import { cleanCoachName, coachIdFor } from '../../data/tourSheet';

/**
 * Coaches on the Tour score sheet (owner ruling 2026-11-06: "coaches play 18
 * holes and compete too"). Each coach row is a name, Men / Women and a
 * score, saved as an ordinary tournamentResults doc: athleteId 'coach_' + a
 * slug of the name (data/tourSheet.js coachIdFor), bracket 'coaches'.
 * "Add a coach" takes a typed name, or one tap on a coach already used in an
 * earlier Tour event, so the spelling - and the slug, and so the season
 * total - stays the same week to week. A row not saved yet can be removed;
 * a saved one is corrected like any score (there is no delete).
 *
 * `coaches` [{ athleteId, name, saved }] are this sheet's rows; `quickPicks`
 * [{ athleteId, name }] the earlier coaches not on it yet.
 */
export default function CoachSection({ coaches, quickPicks, scores, genderOf, onScore, onGender, onAdd, onRemove, disabled }) {
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState(null);

  const add = (athleteId, name) => {
    if (coaches.some((c) => c.athleteId === athleteId)) {
      setNote(`${name} is already on this sheet.`);
      return;
    }
    onAdd({ athleteId, name });
    setTyped('');
    setNote(null);
  };

  const addTyped = () => {
    const name = cleanCoachName(typed);
    const id = coachIdFor(name);
    if (!id) {
      setNote('Type the coach’s name first.');
      return;
    }
    // A name that slugs to an earlier coach keeps that coach's spelling.
    const earlier = quickPicks.find((p) => p.athleteId === id);
    add(id, earlier ? earlier.name : name);
  };

  return (
    <div style={{ marginTop: 22 }}>
      <SectionLabel style={{ marginBottom: 8 }}>Coaches</SectionLabel>
      {coaches.map((c, i) => (
        <AthleteRow
          key={c.athleteId}
          name={c.name}
          meta={c.saved ? 'Coach' : 'Coach · not saved yet'}
          avatarSize={42}
          nameSize={16}
          divider={i < coaches.length - 1}
          trailing={
            // No "Coaches" badge here (2026-11-07): the section label already says
            // Coaches, and on a 375px phone the badge squeezed the name column
            // until Men and Women stacked.
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ScoreField
                label={`Strokes for ${c.name}`}
                value={scores[c.athleteId] ?? ''}
                onChange={(v) => onScore(c.athleteId, v)}
                disabled={disabled}
              />
            </div>
          }
        >
          <GenderPicker coach name={c.name} value={genderOf(c.athleteId)} onChange={(g) => onGender(c.athleteId, g)} disabled={disabled} />
          {c.saved ? null : (
            <button
              type="button"
              aria-label={`Remove ${c.name}`}
              disabled={disabled}
              onClick={() => onRemove(c.athleteId)}
              style={{ ...linkStyle, marginTop: 6 }}
            >
              Remove
            </button>
          )}
        </AthleteRow>
      ))}

      <div style={{ marginTop: coaches.length ? 14 : 0, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          aria-label="Coach name"
          placeholder="Add a coach: name"
          value={typed}
          disabled={disabled}
          maxLength={60}
          onChange={(e) => {
            setTyped(e.target.value);
            setNote(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addTyped();
          }}
          style={{
            flex: 1,
            minWidth: 0,
            height: 44,
            background: color.track,
            border: `1px solid ${color.border}`,
            borderRadius: radius.input,
            font: `500 14px ${font.body}`,
            color: color.text,
            padding: '0 12px',
            outline: 'none',
          }}
        />
        <button type="button" disabled={disabled} onClick={addTyped} style={pillStyle(true)}>
          Add a coach
        </button>
      </div>
      {quickPicks.length ? (
        <div style={{ marginTop: 10 }}>
          <Body size={11} style={{ marginBottom: 6 }}>
            Coaches from earlier Tour events:
          </Body>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {quickPicks.map((p) => (
              <button
                key={p.athleteId}
                type="button"
                aria-label={`Add coach ${p.name}`}
                disabled={disabled}
                onClick={() => add(p.athleteId, p.name)}
                style={pillStyle(false)}
              >
                + {p.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {note ? (
        <Body size={12} tone={color.secondary} style={{ marginTop: 8 }}>
          {note}
        </Body>
      ) : null}
    </div>
  );
}

const linkStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  display: 'block',
  font: `600 12px ${font.body}`,
  color: color.textSecondary,
  textDecoration: 'underline',
  cursor: 'pointer',
};

const pillStyle = (solid) => ({
  flex: 'none',
  height: 44,
  padding: '0 14px',
  borderRadius: radius.pill,
  border: `1px solid ${solid ? color.primary : color.border}`,
  background: solid ? color.primary : 'transparent',
  color: solid ? '#000' : color.textSecondary,
  font: `600 13px ${font.body}`,
  cursor: 'pointer',
});
