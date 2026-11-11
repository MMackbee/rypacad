import React, { useRef, useState } from 'react';
import { color, font, radius } from '../../tokens';
import Button from '../Button';
import { Body, Card, SectionLabel } from '../Primitives';
import {
  COMBINE_SAVE_ERROR, NO_SCORE, combineDateFloor, combineDateProblem, formatScore, parseScore, shortDay,
} from '../../data/combine';

const fieldStyle = (bad) => ({
  height: 44,
  minWidth: 0,
  boxSizing: 'border-box',
  background: color.track,
  border: `1px solid ${bad ? color.error : color.border}`,
  borderRadius: radius.input,
  color: color.text,
  font: `500 16px ${font.body}`,
  padding: '0 10px',
});

const line = (word, row) => `${word} ${formatScore(row.score)} · ${shortDay(row.date)}`;

/**
 * One combine distance (spec 4): the best and latest score with their dates
 * and, for a viewer who enters scores, a score field, a date field (today,
 * Chicago, back to 60 days) and Save. The block owns what is typed in it, so
 * a reload after another block's save never resets it (Review Focus 2).
 * Save is off while its save runs, so a double tap stores one score
 * (Review Focus 1). `onSave(distanceId, score, date)` returns a Promise.
 */
export default function CombineDistanceBlock({ distance, best, latest, canEnter, today, onSave }) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { field: 'score'|'date'|null, text }
  const running = useRef(false);

  const submit = async () => {
    if (running.current) return;
    const parsed = parseScore(text);
    const dateProblem = combineDateProblem(date, today);
    if (parsed.error || dateProblem) {
      setError(parsed.error ? { field: 'score', text: parsed.error } : { field: 'date', text: dateProblem });
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSave(distance.id, parsed.score, date);
      setText('');
    } catch (err) {
      setError({ field: null, text: COMBINE_SAVE_ERROR });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <Card large>
      <SectionLabel>{distance.label}</SectionLabel>
      {latest ? (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', columnGap: 16, rowGap: 2 }}>
          {best ? <Body size={13} tone={color.text}>{line('Best', best)}</Body> : null}
          <Body size={13}>{line('Latest', latest)}</Body>
        </div>
      ) : (
        <Body size={13} tone={color.textTertiary} style={{ marginTop: 8 }}>{NO_SCORE}</Body>
      )}
      {canEnter ? (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            inputMode="numeric"
            aria-label={`${distance.label} score`}
            placeholder="0 to 1000"
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            style={{ ...fieldStyle(error?.field === 'score'), width: 96, flex: '0 0 96px' }}
          />
          <input
            type="date"
            aria-label={`${distance.label} date`}
            value={date}
            min={combineDateFloor(today)}
            max={today}
            onChange={(e) => { setDate(e.target.value); setError(null); }}
            style={{ ...fieldStyle(error?.field === 'date'), flex: '1 1 128px' }}
          />
          <Button
            height={44}
            loading={busy}
            onClick={submit}
            aria-label={`Save ${distance.label}`}
            style={{ width: 'auto', flex: '0 0 auto', minWidth: 80, font: `600 14px ${font.body}` }}
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      ) : null}
      {error ? <div role="alert"><Body size={12} tone={color.error} style={{ marginTop: 8 }}>{error.text}</Body></div> : null}
    </Card>
  );
}
