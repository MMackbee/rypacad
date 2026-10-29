import React, { useState } from 'react';
import { color, font, radius, tint } from '../../tokens';
import Button from '../Button';
import Choice from './Choice';
import { Body, ScreenTitle } from '../Primitives';
import { startWave } from '../../hooks/assessmentsLive';
import { KIND_LABEL, circuitDateProblem, newWaveId } from '../../data/assessmentWindows';

export const LETTERS = ['A', 'B', 'C', 'D'];

/** Why startWave left an athlete out (hooks/assessmentsLive.js). */
export const SKIP_REASON = {
  complete: 'that window is already complete',
  stale: 'that window has been open more than 14 days: mark it complete first',
};

/**
 * Start a wave (spec 5): the circuit date - the academy's date today by
 * default, never a UTC date (Review Focus 1), editable within the last 14
 * days - and, for an athlete who may take either, which window this is
 * (mid-season, or end of season for a late joiner; the default is first).
 * The rotation order is the order the athletes were picked: A, B, C, D. The
 * CancelSheet idiom: it restates what is about to happen and never closes on
 * failure. An athlete the wave could not take (a window already complete,
 * or one left open past the 14-day entry window, perhaps by a second
 * tablet) is named before the wave opens, never dropped silently.
 * The overlay carries data-portal-overlay, like every sheet, so the
 * Feedback button steps aside while it is open.
 */
export default function StartWaveSheet({ rows, settings, today, onClose, onStarted }) {
  const [date, setDate] = useState(today);
  const [kinds, setKinds] = useState(() => Object.fromEntries(rows.map((r) => [r.athleteId, r.due.kind])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const problem = circuitDateProblem(date, today);
  const nameOf = (id) => rows.find((r) => r.athleteId === id)?.name ?? id;

  const start = async () => {
    if (problem || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await startWave({
        waveId: newWaveId(date),
        circuitDate: date,
        entries: rows.map((r, i) => ({ athleteId: r.athleteId, kind: kinds[r.athleteId], position: i + 1 })),
        settings,
        today,
      });
      if (result.skipped.length === 0) {
        onStarted(result);
        return;
      }
      setSaving(false);
      setDone(result);
    } catch (err) {
      setSaving(false);
      setError('The wave did not start. Check the connection and try again.');
    }
  };

  if (done) {
    return (
      <div data-portal-overlay="" onClick={onClose} style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 520, background: color.surface, borderTop: `1px solid ${color.border}`, borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`, padding: '20px 22px 26px' }}
        >
          <ScreenTitle size={19}>{done.started.length ? 'Wave started' : 'No wave started'}</ScreenTitle>
          <Body size={12} style={{ marginTop: 8 }}>
            Not in this wave: {done.skipped.map((s) => `${nameOf(s.athleteId)} (${SKIP_REASON[s.reason] ?? s.reason})`).join(', ')}.
          </Body>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {done.started.length ? (
              <Button height={50} onClick={() => onStarted(done)}>Open the wave</Button>
            ) : (
              <Button variant="outline" height={50} style={{ boxShadow: 'none' }} onClick={() => onStarted(done)}>Close</Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-portal-overlay="" onClick={saving ? undefined : onClose} style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: color.surface, borderTop: `1px solid ${color.border}`, borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`, padding: '20px 22px 26px' }}
      >
        <ScreenTitle size={19}>Start a wave</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          {rows.length} athlete{rows.length === 1 ? '' : 's'}, in rotation order. Every station runs in the fixed order.
        </Body>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, font: `500 11px ${font.body}`, color: color.textSecondary }}>
          Circuit date
          <input
            type="date"
            aria-label="Circuit date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            style={{ height: 44, background: color.track, border: `1px solid ${problem ? color.error : color.border}`, borderRadius: radius.input, color: color.text, font: `500 16px ${font.body}`, padding: '0 10px' }}
          />
        </label>
        {problem ? <Body size={12} tone={color.error} style={{ marginTop: 6 }}>{problem}</Body> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          {rows.map((r, i) => (
            <div key={r.athleteId}>
              <div style={{ font: `600 13px ${font.body}`, color: color.text }}>{LETTERS[i]} · {r.name}</div>
              {r.due.kinds.length > 1 ? (
                <Choice
                  label={`${r.name} window`}
                  value={kinds[r.athleteId]}
                  options={r.due.kinds.map((k) => [k, KIND_LABEL[k]])}
                  onChange={(k) => { if (k) setKinds((all) => ({ ...all, [r.athleteId]: k })); }}
                />
              ) : (
                <Body size={12}>{KIND_LABEL[kinds[r.athleteId]]}</Body>
              )}
            </div>
          ))}
        </div>
        {error ? <Body size={12} tone={color.error} style={{ marginTop: 12 }}>{error}</Body> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <Button height={50} loading={saving} disabled={Boolean(problem)} onClick={start}>Start wave</Button>
          <Button variant="outline" height={50} disabled={saving} style={{ boxShadow: 'none' }} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
