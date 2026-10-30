import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { color, font, radius } from '../../tokens';
import { Body } from '../Primitives';
import CheckinToggle from './CheckinToggle';
import WeekDots from './WeekDots';
import { CHECKIN_NOTE_MAX, OVERDUE_DAYS, visitText } from '../../data/contractBoard';
import { WEEKDAY_COUNT } from '../../data/contractRule';
import { familyHint } from '../../data/athleteLabel';

const textButton = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  font: `600 11px ${font.body}`,
  color: color.primary,
  cursor: 'pointer',
};

/**
 * The check-in note composer under a row (Yannick, 2026-10-30: "prompt
 * with a note for the check in"). Opens with the stored note, if any;
 * Save hands the text up and stays open until the parent closes it (a
 * failed save keeps the words on screen); Skip closes without saving.
 */
function NoteComposer({ name, note, onSave, onClose }) {
  const [draft, setDraft] = useState(note || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(note || ''); }, [note]);
  const save = async () => {
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); }
  };
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        aria-label={`Check-in note · ${name}`}
        value={draft}
        maxLength={CHECKIN_NOTE_MAX}
        rows={2}
        placeholder="What did you talk about? (optional)"
        onChange={(e) => setDraft(e.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: `1px solid ${color.controlBorder}`,
          borderRadius: radius.control,
          padding: '8px 10px',
          font: `400 13px/1.4 ${font.body}`,
          color: color.text,
          background: color.surface,
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          type="button"
          aria-label={`Save note · ${name}`}
          disabled={saving}
          onClick={save}
          style={{
            height: 36,
            padding: '0 14px',
            border: 'none',
            borderRadius: radius.control,
            background: color.primary,
            font: `600 13px ${font.body}`,
            color: '#000',
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save note'}
        </button>
        <button type="button" aria-label={`Skip note · ${name}`} onClick={onClose} style={{ ...textButton, color: color.textSecondary, font: `500 13px ${font.body}` }}>
          Skip
        </button>
      </div>
    </div>
  );
}

/**
 * One athlete on the contract board (spec 5.4), a boardRows row
 * (data/contractBoard.js): name and requirement (the family name beside a
 * first-name-only athlete); this week's count and its seven dots; last
 * week and the last check-in, with the day count once it is past the
 * 14-day mark; where the athlete is at the academy that week (`visits`);
 * the week's check-in note, if any. The Checked in tick only when
 * `canToggle` (role mental on a current or past week; owner, ops and a
 * future week read). `weekLabel` and `priorLabel` name the displayed week
 * and the one before it: 'This week' and 'Last week' only when the board
 * shows the current week (MentalContract passes the rest). `noteOpen`
 * shows the note composer; `onSaveNote(text)` and `onCloseNote()` are its
 * two ways out, `onEditNote()` reopens it from a stored note.
 */
export default function BoardRow({
  row, canToggle = false, onToggle, style, weekLabel = 'This week', priorLabel = 'Last week',
  noteOpen = false, onSaveNote, onCloseNote, onEditNote,
}) {
  const head = [familyHint(row.name, row.familyName), row.age != null ? `Age ${row.age}` : null, `${row.required} min`].filter(Boolean).join(' · ');
  const history = [
    `${priorLabel} ${row.lastWeek?.metDays ?? 0}/${WEEKDAY_COUNT}`,
    row.lastCheckin ? `Last check-in ${format(parseISO(row.lastCheckin), 'MMM d')}` : 'Never checked in',
    row.daysSince != null && row.daysSince > OVERDUE_DAYS ? `${row.daysSince} days` : null,
  ].filter(Boolean).join(' · ');
  const visits = visitText(row.visits);
  const composer = Boolean(noteOpen && canToggle);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderBottom: `1px solid ${color.rowRule}`, ...style }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ font: `600 15px ${font.body}`, color: color.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.name}
          </span>
          <span style={{ flex: 'none', font: `400 11px ${font.body}`, color: color.textTertiary }}>{head}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <span style={{ font: `500 12px ${font.body}`, color: color.textSecondary }}>
            {weekLabel} {row.thisWeek?.metDays ?? 0}/{WEEKDAY_COUNT}
          </span>
          <WeekDots days={row.thisWeek?.days ?? []} />
        </div>
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 4 }}>{history}</Body>
        <div data-visits={visits ? 'some' : 'none'} style={{ marginTop: 2, font: `400 11px/1.55 ${font.body}`, color: visits ? color.textSecondary : color.textTertiary }}>
          {visits ? `At RYP: ${visits}` : 'At RYP: not booked'}
        </div>
        {row.note && !composer ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <Body size={11} tone={color.textSecondary} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>Note: {row.note}</Body>
            {canToggle && onEditNote ? (
              <button type="button" aria-label={`Edit note · ${row.name}`} onClick={onEditNote} style={{ ...textButton, flex: 'none' }}>
                Edit
              </button>
            ) : null}
          </div>
        ) : null}
        {composer ? <NoteComposer name={row.name} note={row.note} onSave={onSaveNote} onClose={onCloseNote} /> : null}
      </div>
      {canToggle ? <CheckinToggle checked={Boolean(row.checkedInThisWeek)} onChange={onToggle} name={row.name} /> : null}
    </div>
  );
}
