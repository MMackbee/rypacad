import React, { useState } from 'react';
import { TOUCH_MIN, color, font } from '../../tokens';
import Button from '../Button';
import StatusBadge from '../StatusBadge';
import { Body, Card } from '../Primitives';
import {
  COMBINE_DELETE_ERROR, COMBINE_EMPTY, DELETE_PROMPT, canDeleteScore, distanceLabel, formatScore, roleWord, shortDay,
} from '../../data/combine';

const textButton = {
  background: 'none',
  border: 'none',
  padding: '0 0 0 12px',
  minHeight: TOUCH_MIN,
  font: `500 12px ${font.body}`,
  color: color.error,
  cursor: 'pointer',
  flex: 'none',
};

/**
 * Every combine score of one athlete, newest first (spec 4): the date, the
 * distance, the score as typed ("1000"), who entered it as a role word and a
 * Best mark on each distance's best. Rows the viewer may delete (their own;
 * every row for the owner) carry Delete, which asks inline, never through a
 * browser dialog. `onDelete(id)` returns a Promise.
 */
export default function CombineHistory({ rows, best, viewer, onDelete }) {
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState(null);

  if (!rows.length) {
    return <Body size={13} tone={color.textTertiary}>{COMBINE_EMPTY}</Body>;
  }

  const confirmDelete = async (id) => {
    if (busy) return;
    setBusy(id);
    setFailed(null);
    try {
      await onDelete(id);
      setAsking(null);
    } catch (err) {
      setFailed(id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ padding: '4px 15px' }}>
      {rows.map((row, i) => {
        const label = distanceLabel(row.distance);
        const day = shortDay(row.date);
        const deletable = canDeleteScore(row, viewer);
        return (
          <div key={row.id} data-score-id={row.id} style={{ borderTop: i ? `1px solid ${color.rule}` : 'none', padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: TOUCH_MIN - 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Body size={13} tone={color.text}>{day} · {label}</Body>
                <Body size={11} tone={color.textTertiary}>{roleWord(row.enteredRole)}</Body>
              </div>
              {best.includes(row.id) ? <StatusBadge tone="green">Best</StatusBadge> : null}
              <span style={{ font: `600 16px ${font.body}`, color: color.text, minWidth: 40, textAlign: 'right' }}>{formatScore(row.score)}</span>
              {deletable && asking !== row.id ? (
                <button
                  type="button"
                  aria-label={`Delete ${formatScore(row.score)} · ${label} · ${day}`}
                  onClick={() => { setAsking(row.id); setFailed(null); }}
                  style={textButton}
                >
                  Delete
                </button>
              ) : null}
            </div>
            {asking === row.id ? (
              <div style={{ marginTop: 6 }}>
                <Body size={12} tone={color.text}>{DELETE_PROMPT}</Body>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Button variant="dangerOutline" height={TOUCH_MIN} loading={busy === row.id} aria-label="Delete this score"
                    onClick={() => confirmDelete(row.id)} style={{ font: `600 14px ${font.body}` }}>
                    Delete
                  </Button>
                  <Button variant="outline" height={TOUCH_MIN} disabled={busy === row.id} onClick={() => setAsking(null)}
                    style={{ font: `600 14px ${font.body}` }}>
                    Keep
                  </Button>
                </div>
              </div>
            ) : null}
            {failed === row.id ? <div role="alert"><Body size={12} tone={color.error} style={{ marginTop: 6 }}>{COMBINE_DELETE_ERROR}</Body></div> : null}
          </div>
        );
      })}
    </Card>
  );
}
